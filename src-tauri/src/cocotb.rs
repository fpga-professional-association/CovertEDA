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
/// Plus any caller-supplied `extra_dirs` (absolute or relative to project_dir),
/// scanned with the same rules.
pub fn discover_tests(project_dir: &Path, extra_dirs: &[String]) -> Vec<CocotbTest> {
    let mut tb_roots: Vec<PathBuf> = Vec::new();
    for rel in &["tb", "examples/tb"] {
        let candidate = project_dir.join(rel);
        if candidate.is_dir() {
            tb_roots.push(candidate);
        }
    }
    for extra in extra_dirs {
        let p = PathBuf::from(extra);
        let resolved = if p.is_absolute() { p } else { project_dir.join(p) };
        if resolved.is_dir() && !tb_roots.iter().any(|r| r == &resolved) {
            tb_roots.push(resolved);
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
    let mut seen_dirs = std::collections::HashSet::new();
    for root in tb_roots {
        let mut found = Vec::new();
        collect_from(&root, &mut found);
        for t in found {
            if seen_dirs.insert(t.dir.clone()) {
                results.push(t);
            }
        }
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

/// Walk parents of `test_dir` looking for a `.venv/` (or `venv/`) directory.
/// Returns the absolute path to the venv root if found.
fn find_project_venv(test_dir: &Path) -> Option<PathBuf> {
    let mut cur = test_dir;
    loop {
        for name in &[".venv", "venv"] {
            let candidate = cur.join(name);
            if candidate.is_dir() && candidate.join("bin").is_dir() {
                return Some(candidate);
            }
            if candidate.is_dir() && candidate.join("Scripts").is_dir() {
                return Some(candidate);
            }
        }
        match cur.parent() {
            Some(p) => cur = p,
            None => return None,
        }
    }
}

/// Convert a Windows path like `C:\Users\foo` to a WSL path like `/mnt/c/Users/foo`.
#[cfg(windows)]
fn to_wsl_path(p: &Path) -> String {
    let s = p.to_string_lossy().replace('\\', "/");
    // Strip the drive letter and prefix /mnt/<lower>
    if let Some(rest) = s.strip_prefix(|c: char| c.is_ascii_alphabetic()) {
        if rest.starts_with(':') {
            let drive = s.chars().next().unwrap().to_ascii_lowercase();
            return format!("/mnt/{}{}", drive, &rest[1..]);
        }
    }
    s
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
    let venv = find_project_venv(test_dir);

    // Build a small banner so the user always knows what was attempted.
    let mut banner = String::new();
    banner.push_str(&format!("$ cd {}\n", test_dir.display()));
    if let Some(v) = &venv {
        banner.push_str(&format!("# venv: {}\n", v.display()));
    }
    banner.push_str(&format!("$ {} make SIM=icarus\n",
        if cfg!(target_os = "windows") { "wsl -e bash -lc" } else { "" }));
    banner.push_str("--- stdout ---\n");

    let t0 = Instant::now();
    let output = if cfg!(target_os = "windows") {
        // WSL needs a bash shell so the venv activate script and PATH lookups
        // (icarus, python, cocotb-config) work. We translate the Windows
        // current dir + venv to /mnt/c paths and run `make` there.
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            let dir_wsl = to_wsl_path(test_dir);
            let venv_activate = venv.as_ref().map(|v| {
                // Prefer the Linux-style activate script under bin/.
                let bin_activate = v.join("bin").join("activate");
                if bin_activate.exists() {
                    to_wsl_path(&bin_activate)
                } else {
                    String::new()
                }
            });
            let mut script = format!("cd '{}' && ", dir_wsl);
            if let Some(activate) = venv_activate.as_ref() {
                if !activate.is_empty() {
                    script.push_str(&format!(". '{}' && ", activate));
                }
            }
            script.push_str("make SIM=icarus");

            let mut cmd = std::process::Command::new("wsl");
            cmd.args(["-e", "bash", "-lc", &script]);
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
            cmd.output()
        }
        #[cfg(not(windows))]
        unreachable!()
    } else {
        let mut cmd = std::process::Command::new("make");
        cmd.current_dir(test_dir).env("SIM", "icarus");
        if let Some(v) = &venv {
            // Prepend venv/bin to PATH so Python/cocotb-config resolve.
            if let Ok(path) = std::env::var("PATH") {
                let bin = v.join("bin");
                let sep = if cfg!(target_os = "windows") { ";" } else { ":" };
                cmd.env("PATH", format!("{}{}{}", bin.display(), sep, path));
            }
        }
        cmd.output()
    };

    let output = match output {
        Ok(o) => o,
        Err(e) => {
            return Ok(CocotbResult {
                vendor,
                project,
                dir: test_dir.display().to_string(),
                passed: false,
                duration_sec: t0.elapsed().as_secs_f64(),
                output: format!("{banner}\nspawn failure: {e}\n\nHint: on Windows the runner uses WSL — check that `wsl` is on PATH and `make`, `iverilog`, and `cocotb` are installed inside WSL."),
                test_count: 0,
            });
        }
    };
    let dt = t0.elapsed().as_secs_f64();

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let mut combined = banner;
    combined.push_str(&stdout);
    combined.push_str("\n--- stderr ---\n");
    combined.push_str(&stderr);
    combined.push_str(&format!("\n--- exit ---\nstatus: {}\n", output.status));

    if stdout.trim().is_empty() && stderr.trim().is_empty() {
        combined.push_str(
            "\n[runner] No output captured. On Windows the runner shells out to WSL — \
             confirm WSL is installed and that `iverilog`, `make`, and `cocotb` are reachable inside WSL.\n",
        );
    }

    // Best-effort test-count parse: cocotb prints "** TEST SUMMARY  TESTS=N"
    let test_count = parse_test_count(&combined);
    // Cocotb summary line is always "FAIL=N" (with N=0 on success) — check
    // the value, not just presence. Fall back to assertion-error scan for
    // bare-make / pytest-style runs that don't print the cocotb summary.
    let fail_count = parse_fail_count(&combined);
    let passed = output.status.success()
        && fail_count == 0
        && !combined.to_lowercase().contains("assertion error");

    let _ = timeout_secs; // reserved for future use; run synchronously for now
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

/// Pull the failure count out of cocotb's summary line ("FAIL=N").
/// Returns the largest value seen, so that mid-run "FAIL=0" lines never
/// overwrite a real "FAIL=2" later in the log.
fn parse_fail_count(output: &str) -> u32 {
    let mut max_fail = 0u32;
    let mut found_any = false;
    for line in output.lines() {
        if let Some(idx) = line.find("FAIL=") {
            let rest = &line[idx + 5..];
            let n: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
            if let Ok(v) = n.parse::<u32>() {
                found_any = true;
                if v > max_fail {
                    max_fail = v;
                }
            }
        }
    }
    // If we never found a "FAIL=N" line, fall back to a conservative 0 —
    // status code is the authoritative signal in that case.
    if !found_any { 0 } else { max_fail }
}
