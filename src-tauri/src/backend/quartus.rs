use crate::backend::{BackendError, BackendResult, FpgaBackend, DetectedVersion};
use crate::types::*;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Distinguishes Quartus Prime Standard/Lite from Quartus Prime Pro.
/// They are separate installations with different supported device families.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum QuartusEdition {
    Standard,
    Pro,
}

/// Intel Quartus Prime backend — drives quartus_sh, quartus_syn, quartus_map,
/// quartus_fit, quartus_asm, quartus_sta (TCL shell and individual tool flow).
pub struct QuartusBackend {
    edition: QuartusEdition,
    version: String,
    install_dir: Option<PathBuf>,
    deferred: bool,
}

impl QuartusBackend {
    /// Create a Quartus Prime Standard/Lite backend with full detection.
    pub fn new() -> Self {
        let (version, install_dir) = Self::detect_installation(QuartusEdition::Standard);
        Self {
            edition: QuartusEdition::Standard,
            version,
            install_dir,
            deferred: false,
        }
    }

    /// Create a Quartus Prime Pro backend with full detection.
    pub fn new_pro() -> Self {
        let (version, install_dir) = Self::detect_installation(QuartusEdition::Pro);
        Self {
            edition: QuartusEdition::Pro,
            version,
            install_dir,
            deferred: false,
        }
    }

    /// Create a deferred Quartus Prime Standard/Lite backend (no filesystem I/O).
    pub fn new_deferred() -> Self {
        Self {
            edition: QuartusEdition::Standard,
            version: String::new(),
            install_dir: None,
            deferred: true,
        }
    }

    /// Create a deferred Quartus Prime Pro backend (no filesystem I/O).
    pub fn new_pro_deferred() -> Self {
        Self {
            edition: QuartusEdition::Pro,
            version: String::new(),
            install_dir: None,
            deferred: true,
        }
    }

    /// Verify a candidate install dir has a quartus/ subdirectory.
    fn verify_install(install: &Path) -> bool {
        install.join("quartus").exists()
    }

    /// Scan a directory for version subdirectories containing quartus.
    fn scan_version_dirs(base: &Path) -> Option<(String, PathBuf)> {
        let entries = std::fs::read_dir(base).ok()?;
        let mut versions: Vec<String> = entries
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
            .filter_map(|e| {
                let name = e.file_name().to_string_lossy().to_string();
                if name.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
                    Some(name)
                } else {
                    None
                }
            })
            .collect();
        versions.sort();
        let ver = versions.last()?;
        let install = base.join(ver);
        if Self::verify_install(&install) {
            Some((ver.clone(), install))
        } else {
            None
        }
    }

    /// Return the candidate installation directories for a given edition.
    fn candidate_paths(edition: QuartusEdition) -> Vec<PathBuf> {
        match edition {
            QuartusEdition::Standard => {
                if cfg!(target_os = "windows") {
                    vec![
                        PathBuf::from(r"C:\intelFPGA"),
                        PathBuf::from(r"C:\intelFPGA_lite"),
                        PathBuf::from(r"C:\altera"),
                    ]
                } else {
                    vec![
                        PathBuf::from("/mnt/c/intelFPGA"),
                        PathBuf::from("/mnt/c/intelFPGA_lite"),
                        PathBuf::from("/mnt/c/altera"),
                        PathBuf::from("/mnt/d/intelFPGA"),
                        PathBuf::from("/mnt/d/intelFPGA_lite"),
                        PathBuf::from("/mnt/d/altera"),
                        PathBuf::from("/opt/intelFPGA"),
                        PathBuf::from("/opt/intelFPGA_lite"),
                        PathBuf::from("/opt/altera"),
                    ]
                }
            }
            QuartusEdition::Pro => {
                if cfg!(target_os = "windows") {
                    vec![
                        PathBuf::from(r"C:\intelFPGA_pro"),
                        PathBuf::from(r"C:\altera_pro"),
                    ]
                } else {
                    vec![
                        PathBuf::from("/mnt/c/intelFPGA_pro"),
                        PathBuf::from("/mnt/c/altera_pro"),
                        PathBuf::from("/mnt/d/intelFPGA_pro"),
                        PathBuf::from("/mnt/d/altera_pro"),
                        PathBuf::from("/opt/intelFPGA_pro"),
                        PathBuf::from("/opt/altera_pro"),
                    ]
                }
            }
        }
    }

    /// Scan known installation paths for Intel Quartus Prime.
    fn detect_installation(edition: QuartusEdition) -> (String, Option<PathBuf>) {
        let config = crate::config::AppConfig::load();

        // 1. User-configured path takes priority
        let configured_path = match edition {
            QuartusEdition::Standard => &config.tool_paths.quartus,
            QuartusEdition::Pro => &config.tool_paths.quartus_pro,
        };
        if let Some(ref configured) = configured_path {
            if configured.as_os_str().len() > 0 {
                if Self::verify_install(configured) {
                    let ver = configured.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| "unknown".to_string());
                    return (ver, Some(configured.clone()));
                }
                if let Some((ver, install)) = Self::scan_version_dirs(configured) {
                    return (ver, Some(install));
                }
                // Walk upward in case user pointed at quartus/bin64/, etc.
                let mut ancestor = configured.as_path();
                for _ in 0..3 {
                    if let Some(parent) = ancestor.parent() {
                        if Self::verify_install(parent) {
                            let ver = parent.file_name()
                                .map(|n| n.to_string_lossy().to_string())
                                .unwrap_or_else(|| "unknown".to_string());
                            return (ver, Some(parent.to_path_buf()));
                        }
                        if let Some((ver, install)) = Self::scan_version_dirs(parent) {
                            return (ver, Some(install));
                        }
                        ancestor = parent;
                    } else {
                        break;
                    }
                }
            }
        }

        // 2. Scan known directories for this edition
        let candidates = Self::candidate_paths(edition);

        for base in &candidates {
            if let Some((ver, install)) = Self::scan_version_dirs(base) {
                return (ver, Some(install));
            }
        }

        // 3. Fallback: find quartus_sh on PATH (cross-platform)
        // Only match if the resolved path matches the requested edition:
        // Pro installs live under directories containing "pro" (e.g. intelFPGA_pro, altera_pro)
        if let Ok(bin_path) = which::which("quartus_sh") {
            // quartus_sh is at <install>/quartus/bin64/quartus_sh — go up 3 levels
            if let Some(install) = bin_path.parent().and_then(|p| p.parent()).and_then(|p| p.parent()) {
                let path_lower = install.to_string_lossy().to_lowercase();
                let is_pro_path = path_lower.contains("_pro") || path_lower.contains("pro/");
                let edition_matches = match edition {
                    QuartusEdition::Pro => is_pro_path,
                    QuartusEdition::Standard => !is_pro_path,
                };
                if edition_matches {
                    let ver = install.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| "unknown".to_string());
                    return (ver, Some(install.to_path_buf()));
                }
            }
        }

        ("unknown".to_string(), None)
    }

    /// Path to quartus_sh executable.
    fn quartus_sh_path(&self) -> Option<PathBuf> {
        let dir = self.install_dir.as_ref()?;
        let bin = if cfg!(target_os = "windows") {
            dir.join("quartus").join("bin64").join("quartus_sh.exe")
        } else if dir.starts_with("/mnt/c") || dir.starts_with("/mnt/d") {
            // WSL accessing Windows install
            dir.join("quartus").join("bin64").join("quartus_sh.exe")
        } else {
            dir.join("quartus").join("bin").join("quartus_sh")
        };
        if bin.exists() {
            Some(bin)
        } else {
            None
        }
    }

    /// Public accessor for the quartus_sh executable path.
    pub fn quartus_sh_path_public(&self) -> Option<PathBuf> {
        self.quartus_sh_path()
    }

    /// Get the installation directory.
    pub fn install_dir(&self) -> Option<&Path> {
        self.install_dir.as_deref()
    }

    /// Scan all candidate directories and return every verified version found.
    pub fn scan_all_versions(edition: QuartusEdition) -> Vec<DetectedVersion> {
        let candidates = Self::candidate_paths(edition);

        let mut results = Vec::new();
        for base in &candidates {
            if let Ok(entries) = std::fs::read_dir(base) {
                for entry in entries.filter_map(|e| e.ok()) {
                    if !entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                        continue;
                    }
                    let name = entry.file_name().to_string_lossy().to_string();
                    if !name.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
                        continue;
                    }
                    let install = base.join(&name);
                    let verified = Self::verify_install(&install);
                    results.push(DetectedVersion {
                        version: name,
                        install_path: install.display().to_string(),
                        verified,
                    });
                }
            }
        }
        results.sort_by(|a, b| a.version.cmp(&b.version));
        results
    }

    /// Search for a Quartus/Intel FlexLM license file.
    pub fn find_license(&self) -> Option<PathBuf> {
        // Helper: split FlexLM env var by path separator and check each entry
        let check_env_paths = |var: &str| -> Option<PathBuf> {
            if let Ok(val) = std::env::var(var) {
                let sep = if cfg!(target_os = "windows") { ';' } else { ':' };
                for part in val.split(sep) {
                    let part = part.trim();
                    if part.is_empty() || part.contains('@') {
                        continue; // skip port@host server specs
                    }
                    let p = PathBuf::from(part);
                    if p.exists() {
                        if let Ok(content) = std::fs::read_to_string(&p) {
                            if Self::looks_like_quartus_license(&content) {
                                return Some(p);
                            }
                        }
                    }
                }
            }
            None
        };

        // 1. Intel-specific env vars
        if let Some(p) = check_env_paths("QUARTUS_LICENSE_FILE") { return Some(p); }
        if let Some(p) = check_env_paths("ALTERAD_LICENSE_FILE") { return Some(p); }

        // 2. Generic FlexLM env var (may contain multiple paths)
        if let Some(p) = check_env_paths("LM_LICENSE_FILE") { return Some(p); }

        // 3. Check inside the Quartus installation directory
        if let Some(install) = &self.install_dir {
            let lic_dir = install.join("licenses");
            if lic_dir.exists() {
                if let Ok(entries) = std::fs::read_dir(&lic_dir) {
                    for entry in entries.filter_map(|e| e.ok()) {
                        let path = entry.path();
                        if path.extension().map(|e| e == "dat" || e == "lic").unwrap_or(false) {
                            if let Ok(content) = std::fs::read_to_string(&path) {
                                if Self::looks_like_quartus_license(&content) {
                                    return Some(path);
                                }
                            }
                        }
                    }
                }
            }
            // Also check parent directory (e.g. /mnt/c/altera_pro/25.3/licenses/)
            if let Some(parent) = install.parent() {
                let parent_lic = parent.join("licenses");
                if parent_lic.exists() {
                    if let Ok(entries) = std::fs::read_dir(&parent_lic) {
                        for entry in entries.filter_map(|e| e.ok()) {
                            let path = entry.path();
                            if path.extension().map(|e| e == "dat" || e == "lic").unwrap_or(false) {
                                if let Ok(content) = std::fs::read_to_string(&path) {
                                    if Self::looks_like_quartus_license(&content) {
                                        return Some(path);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // 4. Common license file locations
        let mut candidates: Vec<PathBuf> = vec![];

        if cfg!(target_os = "windows") {
            if let Some(h) = dirs::home_dir() { candidates.push(h.join("license.dat")); }
            candidates.push(PathBuf::from(r"C:\license.dat"));
            candidates.push(PathBuf::from(r"C:\flexlm\license.dat"));
        } else {
            // WSL: scan all Windows user homes for license files
            if let Ok(entries) = std::fs::read_dir("/mnt/c/Users") {
                for entry in entries.filter_map(|e| e.ok()) {
                    let name = entry.file_name();
                    let n = name.to_str().unwrap_or("");
                    if n == "Public" || n == "Default" || n == "Default User" || n == "All Users" {
                        continue;
                    }
                    if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                        candidates.push(entry.path().join("license.dat"));
                    }
                }
            }
            // WSL: scan common Quartus install paths
            for base in &["/mnt/c/intelFPGA_pro", "/mnt/c/intelFPGA", "/mnt/c/altera_pro", "/mnt/c/altera"] {
                if let Ok(entries) = std::fs::read_dir(base) {
                    for entry in entries.filter_map(|e| e.ok()) {
                        let ver_dir = entry.path();
                        let lic_dir = ver_dir.join("licenses");
                        if lic_dir.exists() {
                            if let Ok(lic_entries) = std::fs::read_dir(&lic_dir) {
                                for le in lic_entries.filter_map(|e| e.ok()) {
                                    let p = le.path();
                                    if p.extension().map(|e| e == "dat" || e == "lic").unwrap_or(false) {
                                        candidates.push(p);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if let Some(h) = dirs::home_dir() { candidates.push(h.join("license.dat")); }
            candidates.push(PathBuf::from("/opt/flexlm/license.dat"));
        }

        for candidate in candidates {
            if candidate.exists() {
                if let Ok(content) = std::fs::read_to_string(&candidate) {
                    if Self::looks_like_quartus_license(&content) {
                        return Some(candidate);
                    }
                }
            }
        }

        None
    }

    /// Check if a license file content looks like it contains Quartus/Intel features.
    fn looks_like_quartus_license(content: &str) -> bool {
        let lower = content.to_lowercase();
        lower.contains("quartus") || lower.contains("altera") || lower.contains("intel")
    }

    /// Find the .qpf (Quartus Project File) in a directory.
    pub fn find_qpf_file(project_dir: &Path, top_module: &str) -> Option<PathBuf> {
        Self::find_project_files(project_dir, top_module).into_iter().next()
    }

    /// Search for .qpf files in the directory and one level of subdirectories.
    pub fn find_project_files(project_dir: &Path, top_module: &str) -> Vec<PathBuf> {
        let exact = project_dir.join(format!("{}.qpf", top_module));
        let mut dirs = vec![project_dir.to_path_buf()];
        if let Ok(entries) = std::fs::read_dir(project_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if !name.starts_with('.') && name != "db" && name != "incremental_db" && name != "output_files" {
                        dirs.push(entry.path());
                    }
                }
            }
        }
        let mut results = Vec::new();
        for dir in &dirs {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.filter_map(|e| e.ok()) {
                    let path = entry.path();
                    if path.extension().map(|e| e == "qpf").unwrap_or(false) {
                        results.push(path);
                    }
                }
            }
        }
        results.sort();
        if let Some(pos) = results.iter().position(|p| p == &exact) {
            results.swap(0, pos);
        }
        results
    }

    /// Recursively scan for HDL source files (.v, .sv, .vhd, .vhdl) under a directory.
    fn scan_sources(dir: &Path) -> Vec<PathBuf> {
        let mut results = Vec::new();
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.is_dir() {
                    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                    if name.starts_with('.')
                        || name == "output_files"
                        || name == "db"
                        || name == "incremental_db"
                        || name == "qdb"
                        || name == "dni"
                    {
                        continue;
                    }
                    results.extend(Self::scan_sources(&path));
                } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    match ext {
                        "v" | "sv" | "svh" | "vhd" | "vhdl" => {
                            // Skip testbench files
                            let stem = path.file_stem()
                                .and_then(|s| s.to_str())
                                .unwrap_or("")
                                .to_lowercase();
                            if stem.ends_with("_tb")
                                || stem.ends_with("_test")
                                || stem.ends_with("_testbench")
                                || stem.starts_with("tb_")
                                || stem.starts_with("test_")
                                || stem == "testbench"
                            {
                                continue;
                            }
                            results.push(path);
                        }
                        _ => {}
                    }
                }
            }
        }
        results
    }

    /// Recursively scan for constraint files (.sdc) under a directory.
    fn scan_constraints(dir: &Path) -> Vec<PathBuf> {
        let mut results = Vec::new();
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.is_dir() {
                    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                    if name.starts_with('.')
                        || name == "output_files"
                        || name == "db"
                        || name == "incremental_db"
                    {
                        continue;
                    }
                    results.extend(Self::scan_constraints(&path));
                } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    if ext == "sdc" {
                        results.push(path);
                    }
                }
            }
        }
        results
    }
}

impl FpgaBackend for QuartusBackend {
    fn id(&self) -> &str {
        match self.edition {
            QuartusEdition::Standard => "quartus",
            QuartusEdition::Pro => "quartus_pro",
        }
    }
    fn name(&self) -> &str {
        match self.edition {
            QuartusEdition::Standard => "Intel Quartus Prime",
            QuartusEdition::Pro => "Intel Quartus Prime Pro",
        }
    }
    fn short_name(&self) -> &str {
        match self.edition {
            QuartusEdition::Standard => "Quartus",
            QuartusEdition::Pro => "Quartus Pro",
        }
    }
    fn version(&self) -> &str {
        &self.version
    }
    fn cli_tool(&self) -> &str {
        "quartus_sh"
    }
    fn default_device(&self) -> &str {
        match self.edition {
            QuartusEdition::Standard => "5CSEMA5F31C6",
            QuartusEdition::Pro => "1SG280LU3F50E2VG",
        }
    }
    fn constraint_ext(&self) -> &str {
        ".sdc"
    }

    fn pipeline_stages(&self) -> Vec<PipelineStage> {
        vec![
            PipelineStage {
                id: "synth".into(),
                label: "Synthesis".into(),
                cmd: "quartus_syn".into(),
                detail: "RTL synthesis to ALMs/LEs".into(),
            },
            PipelineStage {
                id: "fit".into(),
                label: "Fitter (Place & Route)".into(),
                cmd: "quartus_fit".into(),
                detail: "Placement and routing".into(),
            },
            PipelineStage {
                id: "sta".into(),
                label: "Timing Analysis".into(),
                cmd: "quartus_sta".into(),
                detail: "Static timing analysis".into(),
            },
            PipelineStage {
                id: "asm".into(),
                label: "Assembler".into(),
                cmd: "quartus_asm".into(),
                detail: "Generate .sof bitstream".into(),
            },
        ]
    }

    fn generate_build_script(
        &self,
        project_dir: &Path,
        device: &str,
        top_module: &str,
        stages: &[String],
        options: &HashMap<String, String>,
    ) -> BackendResult<String> {
        let project_path_tcl = super::to_tcl_path(project_dir);

        let _all_ids = ["synth", "fit", "sta", "asm"];
        let run_stage = |id: &str| -> bool {
            stages.is_empty() || stages.iter().any(|s| s == id)
        };

        // Resolve project file: explicit option > auto-discover > convention
        let project_open_tcl = if let Some(pf) = options.get("project_file") {
            let p = if PathBuf::from(pf).is_absolute() {
                PathBuf::from(pf)
            } else {
                project_dir.join(pf)
            };
            let qpf_tcl = super::to_tcl_path(&p);
            // Strip .qpf extension for project_open
            let stem = qpf_tcl.trim_end_matches(".qpf");
            format!(
                "project_open {stem}"
            )
        } else if let Some(qpf) = Self::find_qpf_file(project_dir, top_module) {
            let qpf_tcl = super::to_tcl_path(&qpf);
            let stem = qpf_tcl.trim_end_matches(".qpf");
            format!(
                "project_open {stem}"
            )
        } else {
            format!(
                "if {{[file exists {project_path_tcl}/{top_module}.qpf]}} {{\n\
                 \tproject_open {project_path_tcl}/{top_module}\n\
                 }} else {{\n\
                 \tproject_new {project_path_tcl}/{top_module}\n\
                 }}"
            )
        };

        let mut script = format!(
            r#"# CovertEDA — Quartus Prime Build Script
# Device: {device}
# Top: {top_module}

# Open existing project or create new
{project_open_tcl}

# Set device and top-level
set_global_assignment -name DEVICE {device}
set_global_assignment -name TOP_LEVEL_ENTITY {top_module}
"#,
        );

        // Add source files — scan recursively with correct file type assignments
        let sources = Self::scan_sources(project_dir);
        if !sources.is_empty() {
            script.push_str("\n# Source files\n");
            for src in &sources {
                let src_tcl = super::to_tcl_path(src);
                let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("");
                let assignment = match ext {
                    "vhd" | "vhdl" => "VHDL_FILE",
                    "sv" | "svh" => "SYSTEMVERILOG_FILE",
                    _ => "VERILOG_FILE",
                };
                script.push_str(&format!(
                    "set_global_assignment -name {} \"{}\"\n", assignment, src_tcl
                ));
            }
        }

        // Add constraint files (or generate default clock constraints if none found)
        let sdc_files = Self::scan_constraints(project_dir);
        if !sdc_files.is_empty() {
            script.push_str("\n# Constraint files\n");
            for sdc in &sdc_files {
                let sdc_tcl = super::to_tcl_path(sdc);
                script.push_str(&format!(
                    "set_global_assignment -name SDC_FILE \"{}\"\n", sdc_tcl
                ));
            }
        } else {
            script.push_str(&format!(
                r#"
# No .sdc files found - using auto-derived clock constraints
set default_sdc "{project_path_tcl}/.coverteda_default.sdc"
set fh [open $default_sdc w]
puts $fh {{# Auto-generated by CovertEDA - default clock constraints}}
puts $fh {{# Replace with a proper .sdc file for accurate timing analysis}}
puts $fh {{derive_clocks -period "10.000"}}
puts $fh {{derive_pll_clocks}}
close $fh
set_global_assignment -name SDC_FILE $default_sdc
puts "CovertEDA: No .sdc files found - using auto-derived 100 MHz clock constraints"
"#,
            ));
        }

        // Apply options
        if let Some(effort) = options.get("fit_effort") {
            if !effort.is_empty() {
                script.push_str(&format!(
                    "set_global_assignment -name FITTER_EFFORT \"{}\"\n", effort
                ));
            }
        }
        if let Some(opt_mode) = options.get("optimization_mode") {
            if !opt_mode.is_empty() {
                script.push_str(&format!(
                    "set_global_assignment -name OPTIMIZATION_MODE \"{}\"\n", opt_mode
                ));
            }
        }

        script.push('\n');

        // Run requested stages. Use execute_module with error reporting that
        // reads the actual report file for details on failure.
        let stage_tools: &[(&str, &str)] = &[
            ("synth", "syn"),
            ("fit", "fit"),
            ("sta", "sta"),
            ("asm", "asm"),
        ];
        for (stage_id, tool_name) in stage_tools {
            if run_stage(stage_id) {
                script.push_str(&format!(
                    concat!(
                        "if {{[catch {{execute_module -tool {tool}}} err]}} {{\n",
                        "    puts \"ERROR: Stage '{stage}' failed: $err\"\n",
                        "    # Print report file contents for diagnostics\n",
                        "    foreach rpt [glob -nocomplain *.{tool}.rpt *_{tool}.rpt] {{\n",
                        "        puts \"--- Report: $rpt ---\"\n",
                        "        if {{[catch {{set f [open $rpt r]; puts [read $f]; close $f}}]}} {{}}\n",
                        "    }}\n",
                        "    project_close\n",
                        "    exit 1\n",
                        "}}\n",
                    ),
                    tool = tool_name,
                    stage = stage_id,
                ));
            }
        }

        script.push_str("\nproject_close\n");
        Ok(script)
    }

    fn detect_tool(&self) -> bool {
        if self.deferred { return false; }
        self.quartus_sh_path().is_some()
    }

    fn is_deferred(&self) -> bool { self.deferred }

    fn install_path_str(&self) -> Option<String> {
        self.install_dir.as_ref().map(|p| p.display().to_string())
    }

    fn parse_timing_report(&self, impl_dir: &Path) -> BackendResult<TimingReport> {
        // Quartus Pro puts reports in output_files/<project>.sta.rpt
        let out_dir = impl_dir.join("output_files");
        let search_dir = if out_dir.exists() { &out_dir } else { impl_dir };

        let sta_file = std::fs::read_dir(search_dir)
            .map_err(|e| BackendError::IoError(e))?
            .filter_map(|e| e.ok())
            .find(|e| {
                e.path().to_str().map(|s| s.ends_with(".sta.rpt")).unwrap_or(false)
            })
            .map(|e| e.path())
            .ok_or_else(|| {
                BackendError::ReportNotFound("No .sta.rpt file found".to_string())
            })?;

        let content = std::fs::read_to_string(&sta_file)?;
        crate::parser::timing::parse_quartus_timing(&content)
    }

    fn parse_utilization_report(&self, impl_dir: &Path) -> BackendResult<ResourceReport> {
        let out_dir = impl_dir.join("output_files");
        let search_dir = if out_dir.exists() { &out_dir } else { impl_dir };

        let fit_file = std::fs::read_dir(search_dir)
            .map_err(|e| BackendError::IoError(e))?
            .filter_map(|e| e.ok())
            .find(|e| {
                e.path().to_str().map(|s| s.ends_with(".fit.rpt")).unwrap_or(false)
            })
            .map(|e| e.path())
            .ok_or_else(|| {
                BackendError::ReportNotFound("No .fit.rpt file found".to_string())
            })?;

        let content = std::fs::read_to_string(&fit_file)?;
        crate::parser::utilization::parse_quartus_utilization(&content, self.default_device())
    }

    fn parse_power_report(&self, _impl_dir: &Path) -> BackendResult<Option<PowerReport>> {
        Ok(None)
    }

    fn parse_drc_report(&self, _impl_dir: &Path) -> BackendResult<Option<DrcReport>> {
        Ok(None)
    }

    fn read_constraints(&self, constraint_file: &Path) -> BackendResult<Vec<PinConstraint>> {
        if !constraint_file.exists() {
            return Err(BackendError::ReportNotFound(
                constraint_file.display().to_string(),
            ));
        }
        let content = std::fs::read_to_string(constraint_file)?;
        crate::parser::constraints::parse_sdc(&content)
    }

    fn write_constraints(
        &self,
        constraints: &[PinConstraint],
        output_file: &Path,
    ) -> BackendResult<()> {
        let content = crate::parser::constraints::write_sdc_pins(constraints);
        std::fs::write(output_file, content)?;
        Ok(())
    }

    fn verify_device_part(&self, part: &str) -> BackendResult<bool> {
        let sh = self.quartus_sh_path().ok_or_else(|| {
            BackendError::ToolNotFound("quartus_sh not found".into())
        })?;
        // Use quartus_sh --tcl_eval to check if part appears in get_part_list
        let tcl = format!(
            "if {{[lsearch -exact [get_part_list] \"{}\"] >= 0}} {{ puts VALID }} else {{ puts INVALID }}",
            part,
        );
        let output = crate::process::no_window_cmd(sh.to_str().unwrap_or("quartus_sh"))
            .args(["--tcl_eval", &tcl])
            .output()
            .map_err(|e| BackendError::IoError(e))?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(stdout.contains("VALID"))
    }

    fn list_package_pins(&self, device: &str) -> BackendResult<Vec<super::PackagePin>> {
        let sh = self.quartus_sh_path().ok_or_else(|| {
            BackendError::ToolNotFound("quartus_sh not found".into())
        })?;
        // TCL script to enumerate package pins
        let tcl = format!(
            r#"package require ::quartus::device
set pins [get_pkg_pin_names -device "{}"]
foreach p $pins {{
  set func [get_pad_data STRING_ID -pin $p -device "{}"]
  set bank ""
  catch {{ set bank [get_pad_data STRING_USER_IO_BANK -pin $p -device "{}"] }}
  set diff ""
  catch {{ set diff [get_pad_data STRING_DIFF_PAD_ID -pin $p -device "{}"] }}
  puts "$p|$bank|$func|$diff"
}}
"#,
            device, device, device, device
        );

        let tmp_dir = std::env::temp_dir();
        let tcl_file = tmp_dir.join(".coverteda_pins.tcl");
        std::fs::write(&tcl_file, &tcl)
            .map_err(|e| BackendError::IoError(e))?;

        let output = crate::process::no_window_cmd(sh.to_str().unwrap_or("quartus_sh"))
            .args(["-t", &tcl_file.display().to_string()])
            .output()
            .map_err(|e| BackendError::IoError(e))?;

        let _ = std::fs::remove_file(&tcl_file);

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut pins = Vec::new();
        for line in stdout.lines() {
            let parts: Vec<&str> = line.split('|').collect();
            if parts.len() >= 3 {
                pins.push(super::PackagePin {
                    pin: parts[0].trim().to_string(),
                    bank: if parts[1].trim().is_empty() { None } else { Some(parts[1].trim().to_string()) },
                    function: parts[2].trim().to_string(),
                    diff_pair: parts.get(3).and_then(|s| {
                        let s = s.trim();
                        if s.is_empty() { None } else { Some(s.to_string()) }
                    }),
                    r_ohms: None,
                    l_nh: None,
                    c_pf: None,
                });
            }
        }
        if pins.is_empty() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(BackendError::ConfigError(format!(
                "No pins returned for device '{}'. {}",
                device,
                if !stderr.is_empty() { stderr.to_string() } else { "Check device part number.".to_string() }
            )));
        }
        Ok(pins)
    }

    fn generate_ip_script(
        &self,
        project_dir: &Path,
        device: &str,
        ip_name: &str,
        instance_name: &str,
        params: &HashMap<String, String>,
    ) -> BackendResult<(String, String)> {
        let ip_dir = project_dir.join("ip").join(instance_name);
        let ip_dir_tcl = super::to_tcl_path(&ip_dir);
        let _project_tcl = super::to_tcl_path(project_dir);

        // Determine the device family
        let family = if device.starts_with("5C") {
            "Cyclone V"
        } else if device.starts_with("10C") {
            "Cyclone 10 GX"
        } else if device.starts_with("10A") {
            "Arria 10"
        } else if device.starts_with("1S") {
            "Stratix 10"
        } else if device.starts_with("AG") {
            "Agilex"
        } else {
            "Cyclone V"
        };

        // Map common CovertEDA IP names to Quartus megafunction/IP names
        let quartus_ip_name = match ip_name {
            "RAM: 1-PORT" => "altsyncram",
            "RAM: 2-PORT" => "altsyncram",
            "FIFO" => "scfifo",
            "DCFIFO" => "dcfifo",
            "ROM: 1-PORT" => "altsyncram",
            "LPM_MULT" => "lpm_mult",
            "LPM_DIVIDE" => "lpm_divide",
            "ALTPLL" => "altpll",
            "ALTDDIO_IN" => "altddio_in",
            "ALTDDIO_OUT" => "altddio_out",
            _ => ip_name,
        };

        let mut script = format!(
            r#"# CovertEDA — Quartus Prime IP Generation Script
# IP: {ip_name} ({quartus_ip_name})
# Instance: {instance_name}
# Device: {device} (Family: {family})

package require -exact qsys 1.0

# Ensure output directory exists
file mkdir "{ip_dir_tcl}"

# Create a new Qsys system for this IP
create_system "{instance_name}"

set_project_property DEVICE_FAMILY "{family}"
set_project_property DEVICE "{device}"

# Add the IP instance
add_instance {instance_name} {quartus_ip_name}

"#,
        );

        // Set parameters
        for (key, value) in params {
            if !value.is_empty() {
                script.push_str(&format!(
                    "set_instance_parameter_value {instance_name} {key} \"{value}\"\n",
                ));
            }
        }

        script.push_str(&format!(
            r#"
# Save the system
save_system "{ip_dir_tcl}/{instance_name}.qsys"

# Generate the IP (HDL + synthesis files)
generate_system -hdl_language VERILOG -synthesis VERILOG

puts "CovertEDA: IP generation complete for {instance_name}"
puts "CovertEDA: Output directory: {ip_dir_tcl}"
"#,
        ));

        Ok((script, ip_dir_tcl))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn make_backend() -> QuartusBackend {
        QuartusBackend { edition: QuartusEdition::Standard, version: "test".into(), install_dir: None, deferred: false }
    }

    fn make_pro_backend() -> QuartusBackend {
        QuartusBackend { edition: QuartusEdition::Pro, version: "test".into(), install_dir: None, deferred: false }
    }

    #[test]
    fn test_quartus_id_and_name() {
        let b = make_backend();
        assert_eq!(b.id(), "quartus");
        assert_eq!(b.name(), "Intel Quartus Prime");
    }

    #[test]
    fn test_quartus_pro_id_and_name() {
        let b = make_pro_backend();
        assert_eq!(b.id(), "quartus_pro");
        assert_eq!(b.name(), "Intel Quartus Prime Pro");
        assert_eq!(b.short_name(), "Quartus Pro");
        assert_eq!(b.default_device(), "1SG280LU3F50E2VG");
    }

    #[test]
    fn test_quartus_pipeline_has_four_stages() {
        let b = make_backend();
        let stages = b.pipeline_stages();
        assert_eq!(stages.len(), 4);
        assert_eq!(stages[0].id, "synth");
        assert_eq!(stages[1].id, "fit");
        assert_eq!(stages[2].id, "sta");
        assert_eq!(stages[3].id, "asm");
    }

    #[test]
    fn test_quartus_build_script_sets_device() {
        let b = make_backend();
        let tmp = tempfile::tempdir().unwrap();
        let script = b.generate_build_script(
            tmp.path(), "10CX220YF780I5G", "top", &[], &HashMap::new(),
        ).unwrap();
        assert!(script.contains("set_global_assignment -name DEVICE 10CX220YF780I5G"));
    }

    #[test]
    fn test_quartus_build_script_selective_stages() {
        let b = make_backend();
        let tmp = tempfile::tempdir().unwrap();
        let stages = vec!["synth".into(), "sta".into()];
        let script = b.generate_build_script(
            tmp.path(), "10CX220YF780I5G", "top", &stages, &HashMap::new(),
        ).unwrap();
        assert!(script.contains("execute_module -tool syn"));
        assert!(!script.contains("execute_module -tool fit"));
        assert!(script.contains("execute_module -tool sta"));
        assert!(!script.contains("execute_module -tool asm"));
    }

    #[test]
    fn test_quartus_build_script_fit_effort() {
        let b = make_backend();
        let tmp = tempfile::tempdir().unwrap();
        let mut opts = HashMap::new();
        opts.insert("fit_effort".into(), "STANDARD FIT".into());
        let script = b.generate_build_script(
            tmp.path(), "10CX220YF780I5G", "top", &[], &opts,
        ).unwrap();
        assert!(script.contains("FITTER_EFFORT"));
    }

    #[test]
    fn test_quartus_to_tcl_path_wsl() {
        let result = super::super::to_tcl_path(Path::new("/mnt/c/intelFPGA/project"));
        assert_eq!(result, "C:/intelFPGA/project");
    }
}
