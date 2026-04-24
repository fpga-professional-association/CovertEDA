//! Cocotb test discovery + runner.
//!
//! The CovertEDA-Examples submodule ships a `tb/<vendor>/<project>/` tree
//! where each leaf holds a Makefile + test_*.py that drives cocotb through
//! Icarus Verilog. This module surfaces that to the UI: the Simulation
//! page walks the tree, lists available tests, and can run one (or all)
//! via `make`.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CocotbTest {
    pub vendor: String,
    pub project: String,
    /// Absolute path to the directory holding Makefile + test_*.py
    pub dir: String,
    /// Path to the makefile, if different from <dir>/Makefile.
    pub makefile: String,
    /// Best-guess list of `test_*.py` filenames found next to the Makefile.
    pub test_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CocotbResult {
    pub vendor: String,
    pub project: String,
    pub dir: String,
    pub passed: bool,
    /// Wall-clock duration of the `make` invocation.
    pub duration_sec: f64,
    /// stdout + stderr merged.
    pub output: String,
    /// Number of cocotb test cases reported by the run (best-effort parsed
    /// from a "FAILED=N" / "TESTS=N" line in the summary).
    pub test_count: u32,
}

/// Walk the project dir looking for cocotb test directories. Accepts either:
///   <project>/tb/<vendor>/<project>/Makefile
///   <project>/examples/tb/<vendor>/<project>/Makefile  (submodule layout)
///   <project>/Makefile  (when project_dir itself is a testbench)
pub fn discover_tests(project_dir: &Path) -> Vec<CocotbTest> {
    let mut tb_roots: Vec<PathBuf> = Vec::new();
    for rel in &["tb", "examples/tb"] {
        let candidate = project_dir.join(rel);
        if candidate.is_dir() {
            tb_roots.push(candidate);
        }
    }
    // If caller points directly at a testbench dir, treat it as a singleton.
    if project_dir.join("Makefile").exists()
        && project_dir
            .read_dir()
            .map(|it| it.filter_map(|e| e.ok()).any(|e| {
                e.file_name().to_string_lossy().starts_with("test_")
                    && e.path().extension().map(|x| x == "py").unwrap_or(false)
            }))
            .unwrap_or(false)
    {
        tb_roots.push(project_dir.to_path_buf());
    }

    let mut results = Vec::new();
    for root in tb_roots {
        collect_from(&root, &mut results);
    }
    results.sort_by(|a, b| (a.vendor.clone(), a.project.clone()).cmp(&(b.vendor.clone(), b.project.clone())));
    results
}

fn collect_from(root: &Path, out: &mut Vec<CocotbTest>) {
    // Two common layouts: tb/<vendor>/<project>/Makefile, or a flat Makefile at root.
    if root.join("Makefile").exists() {
        let (vendor, project) = split_vendor_project(root);
        if let Some(t) = make_test(root, &vendor, &project) {
            out.push(t);
        }
        return;
    }
    // Walk two levels deep.
    let Ok(level1) = std::fs::read_dir(root) else { return };
    for v_entry in level1.flatten() {
        if !v_entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
            continue;
        }
        let vendor = v_entry.file_name().to_string_lossy().to_string();
        // Skip shared helpers.
        if matches!(vendor.as_str(), "common" | "stubs" | "__pycache__") {
            continue;
        }
        let Ok(level2) = std::fs::read_dir(v_entry.path()) else { continue };
        for p_entry in level2.flatten() {
            if !p_entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                continue;
            }
            let project = p_entry.file_name().to_string_lossy().to_string();
            let dir = p_entry.path();
            if dir.join("Makefile").exists() {
                if let Some(t) = make_test(&dir, &vendor, &project) {
                    out.push(t);
                }
            }
        }
    }
}

fn split_vendor_project(dir: &Path) -> (String, String) {
    let parts: Vec<String> = dir
        .components()
        .rev()
        .take(3)
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect();
    // parts is reversed: [project, vendor, "tb", ...]
    let project = parts.first().cloned().unwrap_or_default();
    let vendor = parts.get(1).cloned().unwrap_or_default();
    (vendor, project)
}

fn make_test(dir: &Path, vendor: &str, project: &str) -> Option<CocotbTest> {
    let makefile = dir.join("Makefile");
    if !makefile.exists() {
        return None;
    }
    let mut test_files = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if name.starts_with("test_") && name.ends_with(".py") {
                test_files.push(name);
            }
        }
    }
    test_files.sort();
    Some(CocotbTest {
        vendor: vendor.to_string(),
        project: project.to_string(),
        dir: dir.display().to_string(),
        makefile: makefile.display().to_string(),
        test_files,
    })
}

/// Run `make` in a test directory with SIM=icarus (the repo default).
/// Returns pass/fail + combined output + duration.
pub fn run_test(test_dir: &Path, timeout_secs: u64) -> Result<CocotbResult, String> {
    if !test_dir.is_dir() {
        return Err(format!("test directory does not exist: {}", test_dir.display()));
    }
    let makefile = test_dir.join("Makefile");
    if !makefile.exists() {
        return Err(format!("no Makefile in {}", test_dir.display()));
    }

    let (vendor, project) = split_vendor_project(test_dir);

    // Pick `make`. On Windows we fall back to GNU make via WSL if available,
    // because cocotb needs a real UNIX toolchain.
    let (program, args) = if cfg!(target_os = "windows") {
        ("wsl", vec!["make"])
    } else {
        ("make", vec![])
    };

    let mut cmd = std::process::Command::new(program);
    cmd.args(&args).current_dir(test_dir).env("SIM", "icarus");

    // On Windows suppress the flash of a cmd window.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let _ = timeout_secs; // reserved for future use; run synchronously for now
    let t0 = Instant::now();
    let output = match cmd.output() {
        Ok(o) => o,
        Err(e) => {
            return Ok(CocotbResult {
                vendor,
                project,
                dir: test_dir.display().to_string(),
                passed: false,
                duration_sec: t0.elapsed().as_secs_f64(),
                output: format!("spawn failure: {e}"),
                test_count: 0,
            });
        }
    };
    let dt = t0.elapsed().as_secs_f64();

    let combined = String::from_utf8_lossy(&output.stdout).to_string()
        + "\n--- stderr ---\n"
        + &String::from_utf8_lossy(&output.stderr).to_string();

    let passed = output.status.success()
        && !combined.contains("FAIL=")
        && !combined.to_lowercase().contains("assertion error");

    // Best-effort test-count parse: cocotb prints "** TEST SUMMARY  TESTS=N"
    let test_count = parse_test_count(&combined);

    Ok(CocotbResult {
        vendor,
        project,
        dir: test_dir.display().to_string(),
        passed,
        duration_sec: dt,
        output: combined,
        test_count,
    })
}

fn parse_test_count(output: &str) -> u32 {
    for line in output.lines().rev().take(50) {
        if let Some(idx) = line.find("TESTS=") {
            let rest = &line[idx + 6..];
            let n: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
            if let Ok(v) = n.parse() {
                return v;
            }
        }
    }
    0
}
