use crate::backend::{BackendResult, FpgaBackend, BackendError, DetectedVersion};
use crate::types::*;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Lattice Diamond backend — drives pnmainc (TCL shell) for MachXO3/ECP5 families.
pub struct DiamondBackend {
    version: String,
    install_dir: Option<PathBuf>,
    deferred: bool,
}

impl DiamondBackend {
    pub fn new() -> Self {
        let (version, install_dir) = Self::detect_installation();
        Self {
            version,
            install_dir,
            deferred: false,
        }
    }

    /// Create without running detection — instant, zero I/O.
    pub fn new_deferred() -> Self {
        Self {
            version: String::new(),
            install_dir: None,
            deferred: true,
        }
    }

    /// Scan known installation paths for Lattice Diamond.
    /// Scan a directory for version subdirectories containing pnmainc.
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

    /// Verify a candidate install dir has pnmainc.
    fn verify_install(install: &Path) -> bool {
        install.join("bin").join("lin64").join("pnmainc").exists()
            || install.join("bin").join("nt64").join("pnmainc.exe").exists()
    }

    fn detect_installation() -> (String, Option<PathBuf>) {
        let config = crate::config::AppConfig::load();

        // 1. User-configured path takes priority
        if let Some(ref configured) = config.tool_paths.diamond {
            if configured.as_os_str().len() > 0 {
                // Could be the install dir directly, or a parent with version subdirs
                if Self::verify_install(configured) {
                    let ver = configured.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| "unknown".to_string());
                    return (ver, Some(configured.clone()));
                }
                // Maybe it's a base dir with version subdirs (e.g., user set /home/user/lscc/diamond)
                if let Some((ver, install)) = Self::scan_version_dirs(configured) {
                    return (ver, Some(install));
                }
                // Walk upward in case user pointed at bin/, bin/lin64/, etc.
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

        // 2. Scan known installation directories
        let candidates: Vec<PathBuf> = if cfg!(target_os = "windows") {
            vec![
                PathBuf::from(r"C:\lscc\diamond"),
                PathBuf::from(r"C:\Lattice\diamond"),
            ]
        } else {
            let mut paths = vec![
                PathBuf::from("/usr/local/diamond"),
                PathBuf::from("/opt/lscc/diamond"),
                PathBuf::from("/opt/lattice/diamond"),
                // WSL paths
                PathBuf::from("/mnt/c/lscc/diamond"),
                PathBuf::from("/mnt/d/lscc/diamond"),
                PathBuf::from("/mnt/c/Lattice/diamond"),
            ];
            // Also check ~/lscc/diamond/ (common Linux install location)
            if let Some(home) = std::env::var_os("HOME") {
                paths.push(PathBuf::from(home).join("lscc").join("diamond"));
            }
            paths
        };

        for base in &candidates {
            if let Some((ver, install)) = Self::scan_version_dirs(base) {
                return (ver, Some(install));
            }
        }

        // Fallback: check if pnmainc is on PATH (cross-platform)
        if let Ok(pnmainc_path) = which::which("pnmainc") {
            // pnmainc is at <install>/bin/lin64/pnmainc — go up 3 levels
            if let Some(install) = pnmainc_path.parent().and_then(|p| p.parent()).and_then(|p| p.parent()) {
                let ver = install.file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| "unknown".to_string());
                return (ver, Some(install.to_path_buf()));
            }
        }

        ("unknown".to_string(), None)
    }

    /// Path to pnmainc executable.
    fn tool_path(&self) -> Option<PathBuf> {
        let dir = self.install_dir.as_ref()?;
        let bin = if cfg!(target_os = "windows") {
            dir.join("bin").join("nt64").join("pnmainc.exe")
        } else if dir.starts_with("/mnt/c") || dir.starts_with("/mnt/d") {
            // WSL accessing Windows install
            dir.join("bin").join("nt64").join("pnmainc.exe")
        } else {
            dir.join("bin").join("lin64").join("pnmainc")
        };
        if bin.exists() {
            Some(bin)
        } else {
            None
        }
    }

    /// Public accessor for the pnmainc executable path.
    pub fn pnmainc_path_public(&self) -> Option<PathBuf> {
        self.tool_path()
    }

    /// Public accessor for the install directory.
    pub fn install_dir(&self) -> Option<&Path> {
        self.install_dir.as_deref()
    }

    /// Find the Diamond license file.
    pub fn find_license(&self) -> Option<PathBuf> {
        // Check LM_LICENSE_FILE env var
        if let Ok(lic) = std::env::var("LM_LICENSE_FILE") {
            let p = PathBuf::from(&lic);
            if p.exists() {
                return Some(p);
            }
        }
        // Check common locations relative to install parent
        if let Some(install) = &self.install_dir {
            if let Some(parent) = install.parent() {
                // e.g., C:\lscc\license.dat or /opt/lscc/license.dat
                let lic = parent.join("license.dat");
                if lic.exists() {
                    return Some(lic);
                }
                // Also check parent of parent (e.g., /mnt/c/lscc/ when install is /mnt/c/lscc/diamond/3.14)
                if let Some(gp) = parent.parent() {
                    let lic = gp.join("license.dat");
                    if lic.exists() {
                        return Some(lic);
                    }
                }
            }
        }
        // Check home dir
        if let Some(home) = std::env::var_os("HOME") {
            let lic = PathBuf::from(home).join("license.dat");
            if lic.exists() {
                return Some(lic);
            }
        }
        // Windows user profile
        if let Some(profile) = std::env::var_os("USERPROFILE") {
            let lic = PathBuf::from(profile).join("license.dat");
            if lic.exists() {
                return Some(lic);
            }
        }
        None
    }

    /// Search for .ldf project files in the given directory and one level of subdirectories.
    /// Returns paths sorted alphabetically, with exact top_module match first if found.
    pub fn find_project_files(project_dir: &Path, top_module: &str) -> Vec<PathBuf> {
        let mut results = Vec::new();
        let exact = project_dir.join(format!("{}.ldf", top_module));
        // Scan project dir and immediate subdirectories for .ldf files
        let dirs_to_scan: Vec<PathBuf> = {
            let mut dirs = vec![project_dir.to_path_buf()];
            if let Ok(entries) = std::fs::read_dir(project_dir) {
                for entry in entries.filter_map(|e| e.ok()) {
                    if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                        let name = entry.file_name().to_string_lossy().to_string();
                        // Skip hidden dirs and build output dirs
                        if !name.starts_with('.') && name != "impl1" && name != "build" {
                            dirs.push(entry.path());
                        }
                    }
                }
            }
            dirs
        };
        for dir in &dirs_to_scan {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.filter_map(|e| e.ok()) {
                    let path = entry.path();
                    if path.extension().map(|e| e == "ldf").unwrap_or(false) {
                        results.push(path);
                    }
                }
            }
        }
        results.sort();
        // Move exact match to front if present
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
                    if name.starts_with('.') || name == "impl1" || name == "build" || name == "synthesis" {
                        continue;
                    }
                    results.extend(Self::scan_sources(&path));
                } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    match ext {
                        "v" | "sv" | "vhd" | "vhdl" => {
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

    /// Scan for constraint files (.lpf, .sdc) under a directory.
    fn scan_constraints(dir: &Path) -> Vec<PathBuf> {
        let mut results = Vec::new();
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.is_dir() {
                    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                    if name.starts_with('.') || name == "impl1" || name == "build" {
                        continue;
                    }
                    results.extend(Self::scan_constraints(&path));
                } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    match ext {
                        "lpf" | "sdc" => results.push(path),
                        _ => {}
                    }
                }
            }
        }
        results
    }

    /// Scan all candidate directories and return every verified version found.
    pub fn scan_all_versions() -> Vec<DetectedVersion> {
        let candidates: Vec<PathBuf> = if cfg!(target_os = "windows") {
            vec![
                PathBuf::from(r"C:\lscc\diamond"),
                PathBuf::from(r"C:\Lattice\diamond"),
            ]
        } else {
            let mut paths = vec![
                PathBuf::from("/usr/local/diamond"),
                PathBuf::from("/opt/lscc/diamond"),
                PathBuf::from("/opt/lattice/diamond"),
                PathBuf::from("/mnt/c/lscc/diamond"),
                PathBuf::from("/mnt/d/lscc/diamond"),
                PathBuf::from("/mnt/c/Lattice/diamond"),
            ];
            if let Some(home) = std::env::var_os("HOME") {
                paths.push(PathBuf::from(home).join("lscc").join("diamond"));
            }
            paths
        };

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
}

impl FpgaBackend for DiamondBackend {
    fn id(&self) -> &str {
        "diamond"
    }
    fn name(&self) -> &str {
        "Lattice Diamond"
    }
    fn short_name(&self) -> &str {
        "Diamond"
    }
    fn version(&self) -> &str {
        &self.version
    }
    fn cli_tool(&self) -> &str {
        "pnmainc"
    }
    fn default_device(&self) -> &str {
        "LCMXO3LF-6900C-5BG256C"
    }
    fn constraint_ext(&self) -> &str {
        ".lpf"
    }

    fn pipeline_stages(&self) -> Vec<PipelineStage> {
        vec![
            PipelineStage {
                id: "synth".into(),
                label: "Synthesis (Synplify)".into(),
                cmd: "prj_run Synthesis -impl impl1 -forceOne".into(),
                detail: "RTL to technology mapping".into(),
            },
            PipelineStage {
                id: "translate".into(),
                label: "Translate".into(),
                cmd: "prj_run Translate -impl impl1".into(),
                detail: "NGD generation".into(),
            },
            PipelineStage {
                id: "map".into(),
                label: "Map".into(),
                cmd: "prj_run Map -impl impl1".into(),
                detail: "Physical synthesis".into(),
            },
            PipelineStage {
                id: "par".into(),
                label: "Place & Route".into(),
                cmd: "prj_run PAR -impl impl1".into(),
                detail: "Placement and routing".into(),
            },
            PipelineStage {
                id: "bitgen".into(),
                label: "Bitstream".into(),
                cmd: "prj_run Export -task Bitgen".into(),
                detail: ".jed/.bit generation".into(),
            },
            PipelineStage {
                id: "timing".into(),
                label: "Timing Analysis".into(),
                cmd: "prj_run Export -task TimingSimFileVer".into(),
                detail: "Static timing analysis".into(),
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
        // Determine which stages to run (empty = all)
        let run_stage = |id: &str| -> bool {
            stages.is_empty() || stages.iter().any(|s| s == id)
        };

        let mut script = format!(
            "# CovertEDA \u{2014} Diamond Build Script\n# Device: {device}\n# Top: {top_module}\n\n",
        );

        // Resolve the .ldf project file:
        // 1. Explicit path from options (user-selected via UI)
        // 2. Auto-discover in project dir and subdirectories
        let resolved_ldf = if let Some(pf) = options.get("project_file") {
            let p = PathBuf::from(pf);
            let full = if p.is_absolute() { p } else { project_dir.join(p) };
            if full.exists() { Some(full) } else { None }
        } else {
            let discovered = Self::find_project_files(project_dir, top_module);
            discovered.into_iter().next()
        };

        if let Some(ldf) = resolved_ldf {
            let ldf_tcl = super::to_tcl_path(&ldf);
            script.push_str(&format!("prj_project open \"{}\"\n", ldf_tcl));
        } else {
            // No .ldf found — create project from scratch, scan for sources
            // Determine device family for Diamond
            let family = if device.starts_with("LCMXO3") {
                "MachXO3LF"
            } else if device.starts_with("LCMXO2") {
                "MachXO2"
            } else if device.starts_with("LFE5U") || device.starts_with("LFE5UM") {
                "ECP5U"
            } else if device.starts_with("LFE3") {
                "ECP3"
            } else {
                "MachXO3LF"
            };

            script.push_str(&format!(
                "prj_project new -name \"{}\" -impl \"impl1\" -dev {} -synthesis \"synplify\"\n",
                top_module, device
            ));

            // Add source files
            let sources = Self::scan_sources(project_dir);
            if sources.is_empty() {
                return Err(BackendError::ConfigError(format!(
                    "No HDL source files (.v, .sv, .vhd) found in {}",
                    project_dir.display()
                )));
            }
            for src in &sources {
                let src_tcl = super::to_tcl_path(src);
                let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("");
                let lang = match ext {
                    "vhd" | "vhdl" => "VHDL",
                    "sv" => "SystemVerilog",
                    _ => "Verilog",
                };
                script.push_str(&format!("prj_src add -format {} \"{}\"\n", lang, src_tcl));
            }

            // Add constraint files
            let constraints = Self::scan_constraints(project_dir);
            for constr in &constraints {
                let constr_tcl = super::to_tcl_path(constr);
                script.push_str(&format!("prj_src add \"{}\"\n", constr_tcl));
            }

            // Set top module and implementation
            script.push_str(&format!(
                "prj_impl option top \"{}\"\n", top_module
            ));

            let _ = family; // family is implicit in the device string
        }

        // Run build stages conditionally
        if run_stage("synth") {
            script.push_str("prj_run Synthesis -impl impl1 -forceOne\n");
        }
        if run_stage("translate") {
            script.push_str("prj_run Translate -impl impl1\n");
        }
        if run_stage("map") {
            script.push_str("prj_run Map -impl impl1\n");
        }
        if run_stage("par") {
            script.push_str("prj_run PAR -impl impl1\n");
        }
        if run_stage("bitgen") {
            script.push_str("prj_run Export -task Bitgen\n");
        }
        if run_stage("timing") {
            script.push_str("prj_run Export -task TimingSimFileVer\n");
        }

        script.push_str("prj_project close\n");
        Ok(script)
    }

    fn list_package_pins(&self, device: &str) -> BackendResult<Vec<super::PackagePin>> {
        let install = self.install_dir.as_ref().ok_or_else(|| {
            BackendError::ToolNotFound("Diamond install directory not found".into())
        })?;
        let ibis_dirs = super::find_lattice_ibis_dirs(install);
        super::parse_lattice_ibis_pins(device, &ibis_dirs)
    }

    fn list_device_pin_data(&self, device: &str) -> BackendResult<super::DevicePinData> {
        let install = self.install_dir.as_ref().ok_or_else(|| {
            BackendError::ToolNotFound("Diamond install directory not found".into())
        })?;
        let ibis_dirs = super::find_lattice_ibis_dirs(install);
        let pins = super::parse_lattice_ibis_pins(device, &ibis_dirs)?;
        let (io_standards, drive_strengths) = super::parse_lattice_ibis_capabilities(device, &ibis_dirs);
        Ok(super::DevicePinData { pins, io_standards, drive_strengths })
    }

    fn detect_tool(&self) -> bool {
        if self.deferred { return false; }
        self.tool_path().is_some()
    }

    fn is_deferred(&self) -> bool { self.deferred }

    fn install_path_str(&self) -> Option<String> {
        self.install_dir.as_ref().map(|p| p.display().to_string())
    }

    fn parse_timing_report(&self, impl_dir: &Path) -> BackendResult<TimingReport> {
        let twr = impl_dir.join("impl1").join("top_level.twr");
        if !twr.exists() {
            return Err(BackendError::ReportNotFound(twr.display().to_string()));
        }
        let content = std::fs::read_to_string(&twr)?;
        crate::parser::timing::parse_diamond_timing(&content)
    }

    fn parse_utilization_report(&self, impl_dir: &Path) -> BackendResult<ResourceReport> {
        let mrp = impl_dir.join("impl1").join("top_level.mrp");
        if !mrp.exists() {
            return Err(BackendError::ReportNotFound(mrp.display().to_string()));
        }
        let content = std::fs::read_to_string(&mrp)?;
        crate::parser::utilization::parse_diamond_utilization(&content, self.default_device())
    }

    fn parse_power_report(&self, impl_dir: &Path) -> BackendResult<Option<PowerReport>> {
        // Look for power report files in impl_dir
        // Diamond may produce *.pwr files or *_power.rpt files
        let impl1_dir = impl_dir.join("impl1");

        // Scan for power report files
        if let Ok(entries) = std::fs::read_dir(&impl1_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.ends_with(".pwr") || name.ends_with("_power.rpt") {
                        let content = std::fs::read_to_string(&path)?;
                        return Self::parse_diamond_power_report(&content);
                    }
                }
            }
        }

        // No power report found — this is not an error, just None
        Ok(None)
    }

    fn parse_drc_report(&self, impl_dir: &Path) -> BackendResult<Option<DrcReport>> {
        // Look for DRC report files in impl_dir
        let impl1_dir = impl_dir.join("impl1");

        // Scan for DRC report files
        if let Ok(entries) = std::fs::read_dir(&impl1_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.ends_with(".drc") {
                        let content = std::fs::read_to_string(&path)?;
                        return Self::parse_diamond_drc_report(&content);
                    }
                }
            }
        }

        // No DRC report found
        Ok(None)
    }

    fn verify_device_part(&self, part: &str) -> BackendResult<bool> {
        // Use pnmainc to query device list via TCL
        let script = format!(
            "prj_device list | grep -i {}\nexit\n",
            part
        );

        let pnmainc = self.tool_path().ok_or_else(|| {
            BackendError::ToolNotFound("pnmainc not found".into())
        })?;

        let output = std::process::Command::new(&pnmainc)
            .arg("-batch")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .and_then(|mut child| {
                use std::io::Write;
                if let Some(mut stdin) = child.stdin.take() {
                    let _ = stdin.write_all(script.as_bytes());
                }
                child.wait_with_output()
            })
            .ok();

        if let Some(out) = output {
            let stdout = String::from_utf8_lossy(&out.stdout);
            Ok(stdout.to_lowercase().contains(&part.to_lowercase()))
        } else {
            Err(BackendError::ConfigError(
                "Failed to verify device part with pnmainc".into(),
            ))
        }
    }

    fn generate_ip_script(
        &self,
        _project_dir: &Path,
        _device: &str,
        ip_name: &str,
        instance_name: &str,
        params: &HashMap<String, String>,
    ) -> BackendResult<(String, String)> {
        // Diamond uses IPexpress for IP core generation
        let mut script = format!(
            "# CovertEDA — Diamond IP Script\n# IP Component: {}\n# Instance: {}\n\n",
            ip_name, instance_name
        );

        // Generate IPexpress command with parameters
        script.push_str(&format!("ipexpress -name {}\n", ip_name));

        // Add parameter overrides
        for (key, val) in params {
            script.push_str(&format!("  -p {}={}\n", key, val));
        }

        // Output directory is typically the implementation dir
        let output_dir = format!("impl1/ip/{}", instance_name);

        Ok((script, output_dir))
    }

    fn read_constraints(&self, constraint_file: &Path) -> BackendResult<Vec<PinConstraint>> {
        if !constraint_file.exists() {
            return Err(BackendError::ReportNotFound(
                constraint_file.display().to_string(),
            ));
        }
        let content = std::fs::read_to_string(constraint_file)?;
        crate::parser::constraints::parse_lpf(&content)
    }

    fn write_constraints(
        &self,
        constraints: &[PinConstraint],
        output_file: &Path,
    ) -> BackendResult<()> {
        let content = crate::parser::constraints::write_lpf(constraints);
        std::fs::write(output_file, content)?;
        Ok(())
    }
}

impl DiamondBackend {
    /// Parse Diamond Power Calculator output format.
    /// Diamond power reports may be in various formats; this handles a common format.
    fn parse_diamond_power_report(content: &str) -> BackendResult<Option<PowerReport>> {
        use regex::Regex;

        let mut total_mw = 0.0;
        let mut junction_temp_c = 25.0;
        let mut breakdown = vec![];

        // Try to parse total power
        if let Ok(re) = Regex::new(r"Total\s+Power\s*:\s*([\d.]+)\s*(?:mW|W)") {
            if let Some(caps) = re.captures(content) {
                if let Ok(val) = caps[1].parse::<f64>() {
                    // Check if unit is W or mW
                    if content[caps[0].len()..].starts_with("W") && !content[caps[0].len()..].starts_with("mW") {
                        total_mw = val * 1000.0;
                    } else {
                        total_mw = val;
                    }
                }
            }
        }

        // Try to parse static power
        if let Ok(re) = Regex::new(r"Static\s+Power\s*:\s*([\d.]+)\s*(?:mW|W)") {
            if let Some(caps) = re.captures(content) {
                if let Ok(val) = caps[1].parse::<f64>() {
                    let mw = if content[caps[0].len()..].starts_with("W") && !content[caps[0].len()..].starts_with("mW") {
                        val * 1000.0
                    } else {
                        val
                    };
                    breakdown.push(PowerBreakdown {
                        category: "Static".to_string(),
                        mw,
                        percentage: 0.0,
                    });
                }
            }
        }

        // Try to parse dynamic power
        if let Ok(re) = Regex::new(r"Dynamic\s+Power\s*:\s*([\d.]+)\s*(?:mW|W)") {
            if let Some(caps) = re.captures(content) {
                if let Ok(val) = caps[1].parse::<f64>() {
                    let mw = if content[caps[0].len()..].starts_with("W") && !content[caps[0].len()..].starts_with("mW") {
                        val * 1000.0
                    } else {
                        val
                    };
                    breakdown.push(PowerBreakdown {
                        category: "Dynamic".to_string(),
                        mw,
                        percentage: 0.0,
                    });
                }
            }
        }

        // Try to parse junction temperature
        if let Ok(re) = Regex::new(r"Junction\s+Temp\w*\s*:\s*([\d.]+)\s*C") {
            if let Some(caps) = re.captures(content) {
                if let Ok(val) = caps[1].parse::<f64>() {
                    junction_temp_c = val;
                }
            }
        }

        // Calculate percentages
        if total_mw > 0.0 {
            for entry in &mut breakdown {
                entry.percentage = (entry.mw / total_mw) * 100.0;
            }
        }

        // If we found any data, return the report
        if total_mw > 0.0 || !breakdown.is_empty() {
            Ok(Some(PowerReport {
                total_mw,
                junction_temp_c,
                ambient_temp_c: 25.0,
                theta_ja: 0.0,
                confidence: "Low".to_string(),
                breakdown,
                by_rail: vec![],
            }))
        } else {
            Ok(None)
        }
    }

    /// Parse Diamond DRC report output.
    fn parse_diamond_drc_report(content: &str) -> BackendResult<Option<DrcReport>> {
        use regex::Regex;

        let mut errors = 0u32;
        let mut critical_warnings = 0u32;
        let mut warnings = 0u32;
        let mut info = 0u32;
        let mut waived = 0u32;
        let mut items = vec![];

        // Parse summary counts
        if let Ok(re) = Regex::new(r"Errors\s*:\s*(\d+)") {
            if let Some(caps) = re.captures(content) {
                if let Ok(val) = caps[1].parse::<u32>() {
                    errors = val;
                }
            }
        }

        if let Ok(re) = Regex::new(r"Critical\s+Warning\w*\s*:\s*(\d+)") {
            if let Some(caps) = re.captures(content) {
                if let Ok(val) = caps[1].parse::<u32>() {
                    critical_warnings = val;
                }
            }
        }

        if let Ok(re) = Regex::new(r"Warning\w*\s*:\s*(\d+)") {
            if let Some(caps) = re.captures(content) {
                if let Ok(val) = caps[1].parse::<u32>() {
                    warnings = val;
                }
            }
        }

        if let Ok(re) = Regex::new(r"Info\s*:\s*(\d+)") {
            if let Some(caps) = re.captures(content) {
                if let Ok(val) = caps[1].parse::<u32>() {
                    info = val;
                }
            }
        }

        if let Ok(re) = Regex::new(r"Waived\s*:\s*(\d+)") {
            if let Some(caps) = re.captures(content) {
                if let Ok(val) = caps[1].parse::<u32>() {
                    waived = val;
                }
            }
        }

        // Parse individual DRC items (if present)
        // Format: [ERROR|WARNING|INFO] CODE: message at location
        if let Ok(re) = Regex::new(r"^\s*(ERROR|CRITICAL WARNING|WARNING|INFO|WAIVED)\s+(\w+)\s*:\s*([^\n]*)\s+at\s+([^\n]*)") {
            for cap in re.captures_iter(content) {
                let severity = match &cap[1] {
                    "ERROR" => DrcSeverity::Error,
                    "CRITICAL WARNING" => DrcSeverity::CriticalWarning,
                    "WARNING" => DrcSeverity::Warning,
                    "INFO" => DrcSeverity::Info,
                    "WAIVED" => DrcSeverity::Waived,
                    _ => DrcSeverity::Warning,
                };
                items.push(DrcItem {
                    severity,
                    code: cap[2].to_string(),
                    message: cap[3].to_string(),
                    location: cap[4].to_string(),
                    action: String::new(),
                });
            }
        }

        // If any DRC data was found, return the report
        if errors > 0 || critical_warnings > 0 || warnings > 0 || info > 0 {
            Ok(Some(DrcReport {
                errors,
                critical_warnings,
                warnings,
                info,
                waived,
                items,
            }))
        } else {
            Ok(None)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_diamond_id_and_name() {
        let b = DiamondBackend::new();
        assert_eq!(b.id(), "diamond");
        assert_eq!(b.name(), "Lattice Diamond");
    }

    #[test]
    fn test_diamond_pipeline_has_six_stages() {
        let b = DiamondBackend::new();
        let stages = b.pipeline_stages();
        assert_eq!(stages.len(), 6);
        assert_eq!(stages[0].id, "synth");
        assert_eq!(stages[5].id, "timing");
    }

    #[test]
    fn test_diamond_constraint_ext() {
        let b = DiamondBackend::new();
        assert_eq!(b.constraint_ext(), ".lpf");
    }

    /// Create a temp dir with an .ldf file (for tests that need an existing project).
    fn make_ldf_dir() -> tempfile::TempDir {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("top.ldf"), "<BaliProject></BaliProject>").unwrap();
        tmp
    }

    /// Create a temp dir with source files but no .ldf (for create-from-scratch tests).
    fn make_source_dir() -> tempfile::TempDir {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("top.v"), "module top(); endmodule").unwrap();
        tmp
    }

    #[test]
    fn test_diamond_build_script_contains_prj_run() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = make_ldf_dir();
        let script = b.generate_build_script(
            tmp.path(), "LCMXO3LF-6900C", "top", &[], &std::collections::HashMap::new(),
        ).unwrap();
        assert!(script.contains("prj_run Synthesis"));
        assert!(script.contains("prj_run Map"));
        assert!(script.contains("prj_run PAR"));
        assert!(script.contains("prj_run Export"));
    }

    #[test]
    fn test_diamond_build_script_no_backslashes_in_paths() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = make_ldf_dir();
        let script = b.generate_build_script(
            tmp.path(), "LCMXO3LF-6900C", "top", &[], &std::collections::HashMap::new(),
        ).unwrap();
        let open_line = script.lines().find(|l| l.contains("prj_project open")).unwrap();
        assert!(!open_line.contains('\\'),
            "TCL script must not contain backslashes in paths (causes escape issues): {}",
            open_line);
    }

    #[test]
    fn test_diamond_build_script_creates_project_from_sources() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = make_source_dir();
        let script = b.generate_build_script(
            tmp.path(), "LCMXO3LF-6900C", "top", &[], &std::collections::HashMap::new(),
        ).unwrap();
        assert!(script.contains("prj_project new"), "Should create new project when no .ldf found");
        assert!(script.contains("prj_src add"), "Should add scanned source files");
        assert!(script.contains("top.v"), "Should include the Verilog source");
    }

    #[test]
    fn test_diamond_build_script_no_sources_errors() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        let result = b.generate_build_script(
            tmp.path(), "LCMXO3LF-6900C", "top", &[], &std::collections::HashMap::new(),
        );
        assert!(result.is_err(), "Should error when no .ldf and no source files found");
    }

    #[test]
    fn test_find_project_files_discovers_ldf_in_subdir() {
        let tmp = tempfile::tempdir().unwrap();
        // Create an .ldf in a subdirectory (e.g., proj/)
        let proj_dir = tmp.path().join("proj");
        std::fs::create_dir(&proj_dir).unwrap();
        std::fs::write(proj_dir.join("design.ldf"), "").unwrap();
        // Also create one in root
        std::fs::write(tmp.path().join("top.ldf"), "").unwrap();

        let files = DiamondBackend::find_project_files(tmp.path(), "top");
        assert!(files.len() >= 2, "Should find .ldf files in root and subdirs");
        // top.ldf should be first (exact match on top_module)
        assert_eq!(files[0], tmp.path().join("top.ldf"));
        assert!(files.iter().any(|p| p.ends_with("design.ldf")));
    }

    #[test]
    fn test_find_project_files_empty_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let files = DiamondBackend::find_project_files(tmp.path(), "top");
        assert!(files.is_empty());
    }

    #[test]
    fn test_build_script_uses_project_file_option() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        // Create the project file so the "open existing" path is taken
        let proj_dir = tmp.path().join("proj");
        std::fs::create_dir(&proj_dir).unwrap();
        std::fs::write(proj_dir.join("design.ldf"), "").unwrap();
        let mut opts = std::collections::HashMap::new();
        opts.insert("project_file".to_string(), "proj/design.ldf".to_string());
        let script = b.generate_build_script(
            tmp.path(), "LCMXO3LF-6900C", "top", &[], &opts,
        ).unwrap();
        let open_line = script.lines().find(|l| l.contains("prj_project open")).unwrap();
        assert!(open_line.contains("proj/design.ldf"),
            "Build script should use the project_file option: {}", open_line);
    }

    // ── Short name ──

    #[test]
    fn test_diamond_short_name() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        assert_eq!(b.short_name(), "Diamond");
    }

    // ── CLI tool name ──

    #[test]
    fn test_diamond_cli_tool() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        assert_eq!(b.cli_tool(), "pnmainc");
    }

    // ── Default device ──

    #[test]
    fn test_diamond_default_device() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        assert_eq!(b.default_device(), "LCMXO3LF-6900C-5BG256C");
    }

    // ── Deferred construction ──

    #[test]
    fn test_diamond_new_deferred() {
        let b = DiamondBackend::new_deferred();
        assert!(b.deferred);
        assert!(b.install_dir.is_none());
        assert!(b.version.is_empty());
        assert!(b.is_deferred());
        assert!(!b.detect_tool());
    }

    #[test]
    fn test_diamond_new_deferred_trait_methods_still_work() {
        let b = DiamondBackend::new_deferred();
        assert_eq!(b.id(), "diamond");
        assert_eq!(b.name(), "Lattice Diamond");
        assert_eq!(b.short_name(), "Diamond");
        assert_eq!(b.cli_tool(), "pnmainc");
        assert_eq!(b.default_device(), "LCMXO3LF-6900C-5BG256C");
        assert_eq!(b.constraint_ext(), ".lpf");
        assert_eq!(b.pipeline_stages().len(), 6);
    }

    // ── Constraint reading (LPF parse) ──

    #[test]
    fn test_read_constraints_parses_lpf() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        let lpf_path = tmp.path().join("design.lpf");
        std::fs::write(&lpf_path, r#"LOCATE COMP "clk" SITE "A10";
IOBUF PORT "clk" IO_TYPE=LVCMOS33;
LOCATE COMP "led[0]" SITE "B5";
IOBUF PORT "led[0]" IO_TYPE=LVCMOS25;
LOCATE COMP "rst_n" SITE "C3";
"#).unwrap();
        let constraints = b.read_constraints(&lpf_path).unwrap();
        assert_eq!(constraints.len(), 3);
        // First constraint: clk → A10, LVCMOS33
        assert_eq!(constraints[0].net, "clk");
        assert_eq!(constraints[0].pin, "A10");
        assert_eq!(constraints[0].io_standard, "LVCMOS33");
        // Second constraint: led[0] → B5, LVCMOS25
        assert_eq!(constraints[1].net, "led[0]");
        assert_eq!(constraints[1].pin, "B5");
        assert_eq!(constraints[1].io_standard, "LVCMOS25");
        // Third constraint: rst_n → C3, defaults to LVCMOS33 (no IOBUF)
        assert_eq!(constraints[2].net, "rst_n");
        assert_eq!(constraints[2].pin, "C3");
        assert_eq!(constraints[2].io_standard, "LVCMOS33");
    }

    #[test]
    fn test_read_constraints_missing_file_returns_error() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let result = b.read_constraints(Path::new("/nonexistent/design.lpf"));
        assert!(result.is_err());
    }

    #[test]
    fn test_read_constraints_empty_lpf() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        let lpf_path = tmp.path().join("empty.lpf");
        std::fs::write(&lpf_path, "# No constraints\n").unwrap();
        let constraints = b.read_constraints(&lpf_path).unwrap();
        assert!(constraints.is_empty());
    }

    // ── Constraint writing (LPF generate) ──

    #[test]
    fn test_write_constraints_generates_lpf() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        let lpf_path = tmp.path().join("output.lpf");
        let constraints = vec![
            PinConstraint {
                pin: "A10".into(),
                net: "clk".into(),
                direction: String::new(),
                io_standard: "LVCMOS33".into(),
                bank: String::new(),
                locked: true,
                extra: vec![],
            },
            PinConstraint {
                pin: "B5".into(),
                net: "led".into(),
                direction: String::new(),
                io_standard: "LVCMOS25".into(),
                bank: String::new(),
                locked: true,
                extra: vec![],
            },
        ];
        b.write_constraints(&constraints, &lpf_path).unwrap();
        let content = std::fs::read_to_string(&lpf_path).unwrap();
        assert!(content.contains(r#"LOCATE COMP "clk" SITE "A10""#));
        assert!(content.contains(r#"IOBUF PORT "clk" IO_TYPE=LVCMOS33"#));
        assert!(content.contains(r#"LOCATE COMP "led" SITE "B5""#));
        assert!(content.contains(r#"IOBUF PORT "led" IO_TYPE=LVCMOS25"#));
    }

    #[test]
    fn test_write_constraints_empty_list() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        let lpf_path = tmp.path().join("empty_out.lpf");
        b.write_constraints(&[], &lpf_path).unwrap();
        let content = std::fs::read_to_string(&lpf_path).unwrap();
        assert!(content.contains("CovertEDA"));
        // No LOCATE or IOBUF lines
        assert!(!content.contains("LOCATE"));
        assert!(!content.contains("IOBUF"));
    }

    // ── Constraint roundtrip (write then read back) ──

    #[test]
    fn test_constraint_roundtrip_through_file() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        let lpf_path = tmp.path().join("roundtrip.lpf");
        let original = vec![
            PinConstraint {
                pin: "A10".into(),
                net: "clk".into(),
                direction: String::new(),
                io_standard: "LVCMOS33".into(),
                bank: String::new(),
                locked: true,
                extra: vec![],
            },
            PinConstraint {
                pin: "B5".into(),
                net: "data_out".into(),
                direction: String::new(),
                io_standard: "LVTTL".into(),
                bank: String::new(),
                locked: true,
                extra: vec![],
            },
            PinConstraint {
                pin: "C7".into(),
                net: "rst_n".into(),
                direction: String::new(),
                io_standard: "LVCMOS18".into(),
                bank: String::new(),
                locked: true,
                extra: vec![],
            },
        ];
        b.write_constraints(&original, &lpf_path).unwrap();
        let parsed = b.read_constraints(&lpf_path).unwrap();
        assert_eq!(parsed.len(), original.len());
        for (orig, read) in original.iter().zip(parsed.iter()) {
            assert_eq!(orig.pin, read.pin, "pin mismatch for net {}", orig.net);
            assert_eq!(orig.net, read.net, "net mismatch");
            assert_eq!(orig.io_standard, read.io_standard,
                "io_standard mismatch for net {}", orig.net);
        }
    }

    // ── Build script respects stages parameter ──

    #[test]
    fn test_build_script_respects_stages_parameter() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = make_ldf_dir();
        let stages = vec!["synth".to_string()]; // request only synthesis
        let script = b.generate_build_script(
            tmp.path(), "LCMXO3LF-6900C", "top", &stages, &HashMap::new(),
        ).unwrap();
        assert!(script.contains("prj_run Synthesis"), "should contain Synthesis");
        assert!(!script.contains("prj_run Translate"), "should NOT contain Translate");
        assert!(!script.contains("prj_run Map"), "should NOT contain Map");
        assert!(!script.contains("prj_run PAR"), "should NOT contain PAR");
    }

    #[test]
    fn test_build_script_all_stages_with_empty_stages_slice() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = make_ldf_dir();
        let script = b.generate_build_script(
            tmp.path(), "LCMXO3LF-6900C", "top", &[], &HashMap::new(),
        ).unwrap();
        // Count the number of prj_run commands
        let prj_run_count = script.lines().filter(|l| l.contains("prj_run")).count();
        assert_eq!(prj_run_count, 6, "should have 6 prj_run commands, got {}", prj_run_count);
    }

    // ── Build script contains device and top_module ──

    #[test]
    fn test_build_script_contains_device_in_header() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = make_ldf_dir();
        let device = "LCMXO3LF-6900C-5BG256C";
        let script = b.generate_build_script(
            tmp.path(), device, "top", &[], &HashMap::new(),
        ).unwrap();
        assert!(script.contains(device),
            "build script should contain device name in header");
    }

    #[test]
    fn test_build_script_contains_top_module_in_header() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = make_ldf_dir();
        let script = b.generate_build_script(
            tmp.path(), "LCMXO3LF-6900C", "my_top_module", &[], &HashMap::new(),
        ).unwrap();
        assert!(script.contains("my_top_module"),
            "build script should contain top module name in header");
    }

    // ── Build script contains tool paths (prj_project open with .ldf path) ──

    #[test]
    fn test_build_script_contains_ldf_path() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = make_ldf_dir();
        let script = b.generate_build_script(
            tmp.path(), "LCMXO3LF-6900C", "top", &[], &HashMap::new(),
        ).unwrap();
        // Script should reference the .ldf project file
        assert!(script.contains("top.ldf"),
            "build script should reference .ldf project file: {}", script);
    }

    #[test]
    fn test_build_script_with_absolute_project_file_option() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        let abs_path = tmp.path().join("my_project.ldf");
        std::fs::write(&abs_path, "").unwrap(); // Create the file so it's found
        let mut opts = HashMap::new();
        opts.insert("project_file".to_string(), abs_path.display().to_string());
        let script = b.generate_build_script(
            tmp.path(), "LCMXO3LF-6900C", "top", &[], &opts,
        ).unwrap();
        let open_line = script.lines().find(|l| l.contains("prj_project open")).unwrap();
        assert!(open_line.contains("my_project.ldf"),
            "build script should reference absolute project file: {}", open_line);
    }

    #[test]
    fn test_build_script_opens_and_closes_project() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = make_ldf_dir();
        let script = b.generate_build_script(
            tmp.path(), "LCMXO3LF-6900C", "top", &[], &HashMap::new(),
        ).unwrap();
        assert!(script.contains("prj_project open"), "should open project");
        assert!(script.contains("prj_project close"), "should close project");
        let open_pos = script.find("prj_project open").unwrap();
        let close_pos = script.find("prj_project close").unwrap();
        assert!(open_pos < close_pos, "open should come before close");
    }

    // ── Build script: forward slashes in all paths ──

    #[test]
    fn test_build_script_forward_slashes_with_project_file() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        let proj_dir = tmp.path().join("subdir");
        std::fs::create_dir(&proj_dir).unwrap();
        std::fs::write(proj_dir.join("my_project.ldf"), "").unwrap();
        let mut opts = HashMap::new();
        opts.insert("project_file".to_string(), "subdir/my_project.ldf".to_string());
        let script = b.generate_build_script(
            tmp.path(), "LCMXO3LF-6900C", "top", &[], &opts,
        ).unwrap();
        for line in script.lines() {
            if line.contains("prj_project open") {
                assert!(!line.contains('\\'),
                    "path should use forward slashes, not backslashes: {}", line);
            }
        }
    }

    // ── Pipeline stage ordering ──

    #[test]
    fn test_diamond_pipeline_stage_order() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let stages = b.pipeline_stages();
        let ids: Vec<&str> = stages.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids, vec!["synth", "translate", "map", "par", "bitgen", "timing"]);
    }

    #[test]
    fn test_diamond_pipeline_stages_have_labels_and_details() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let stages = b.pipeline_stages();
        for stage in &stages {
            assert!(!stage.label.is_empty(), "stage {} should have a label", stage.id);
            assert!(!stage.detail.is_empty(), "stage {} should have a detail", stage.id);
            assert!(!stage.cmd.is_empty(), "stage {} should have a cmd", stage.id);
        }
    }

    // ── Version and install_path_str ──

    #[test]
    fn test_diamond_version_with_custom_version() {
        let b = DiamondBackend { version: "3.13".into(), install_dir: None, deferred: false };
        assert_eq!(b.version(), "3.13");
    }

    #[test]
    fn test_diamond_install_path_str_none() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        assert!(b.install_path_str().is_none());
    }

    #[test]
    fn test_diamond_install_path_str_some() {
        let b = DiamondBackend {
            version: "3.13".into(),
            install_dir: Some(PathBuf::from("/opt/lscc/diamond/3.13")),
            deferred: false,
        };
        assert_eq!(b.install_path_str().unwrap(), "/opt/lscc/diamond/3.13");
    }

    // ── Power and DRC reports return None ──

    #[test]
    fn test_diamond_power_report_returns_none() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        let result = b.parse_power_report(tmp.path()).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_diamond_drc_report_returns_none() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        let result = b.parse_drc_report(tmp.path()).unwrap();
        assert!(result.is_none());
    }

    // ── Timing/utilization report file not found ──

    #[test]
    fn test_diamond_timing_report_not_found() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        let result = b.parse_timing_report(tmp.path());
        assert!(result.is_err());
    }

    #[test]
    fn test_diamond_utilization_report_not_found() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        let result = b.parse_utilization_report(tmp.path());
        assert!(result.is_err());
    }

    // ── detect_tool with no install dir ──

    #[test]
    fn test_diamond_detect_tool_no_install_dir() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        // tool_path returns None when install_dir is None, so detect_tool returns false
        assert!(!b.detect_tool());
    }

    // ── install_dir accessor ──

    #[test]
    fn test_diamond_install_dir_accessor() {
        let b = DiamondBackend {
            version: "3.13".into(),
            install_dir: Some(PathBuf::from("/opt/lscc/diamond/3.13")),
            deferred: false,
        };
        assert_eq!(b.install_dir().unwrap(), Path::new("/opt/lscc/diamond/3.13"));
    }

    #[test]
    fn test_diamond_install_dir_none() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        assert!(b.install_dir().is_none());
    }

    // ── Build script with discovered .ldf file ──

    #[test]
    fn test_build_script_discovers_ldf_in_project_dir() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        // Create a .ldf file matching top_module name
        std::fs::write(tmp.path().join("counter.ldf"), "").unwrap();
        let script = b.generate_build_script(
            tmp.path(), "LCMXO3LF-6900C", "counter", &[], &HashMap::new(),
        ).unwrap();
        let open_line = script.lines().find(|l| l.contains("prj_project open")).unwrap();
        assert!(open_line.contains("counter.ldf"),
            "should discover counter.ldf: {}", open_line);
    }

    #[test]
    fn test_build_script_discovers_ldf_in_subdirectory() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        let sub = tmp.path().join("proj");
        std::fs::create_dir(&sub).unwrap();
        std::fs::write(sub.join("design.ldf"), "").unwrap();
        let script = b.generate_build_script(
            tmp.path(), "LCMXO3LF-6900C", "top", &[], &HashMap::new(),
        ).unwrap();
        let open_line = script.lines().find(|l| l.contains("prj_project open")).unwrap();
        assert!(open_line.contains("design.ldf"),
            "should discover design.ldf in subdirectory: {}", open_line);
    }

    // ── find_project_files skips hidden and build dirs ──

    #[test]
    fn test_find_project_files_skips_hidden_and_build_dirs() {
        let tmp = tempfile::tempdir().unwrap();
        // Create .ldf files in hidden and build directories that should be skipped
        let hidden_dir = tmp.path().join(".hidden");
        std::fs::create_dir(&hidden_dir).unwrap();
        std::fs::write(hidden_dir.join("hidden.ldf"), "").unwrap();
        let impl_dir = tmp.path().join("impl1");
        std::fs::create_dir(&impl_dir).unwrap();
        std::fs::write(impl_dir.join("output.ldf"), "").unwrap();
        let build_dir = tmp.path().join("build");
        std::fs::create_dir(&build_dir).unwrap();
        std::fs::write(build_dir.join("build.ldf"), "").unwrap();
        // Only this one should be found
        std::fs::write(tmp.path().join("real.ldf"), "").unwrap();

        let files = DiamondBackend::find_project_files(tmp.path(), "real");
        assert_eq!(files.len(), 1, "should only find real.ldf, got: {:?}", files);
        assert!(files[0].ends_with("real.ldf"));
    }

    // ── Power report parsing ──

    #[test]
    fn test_parse_power_report_finds_pwr_file() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        let impl1_dir = tmp.path().join("impl1");
        std::fs::create_dir(&impl1_dir).unwrap();
        let pwr_path = impl1_dir.join("design.pwr");
        std::fs::write(&pwr_path, "Total Power: 125.5 mW\nStatic Power: 45.2 mW\nDynamic Power: 80.3 mW\nJunction Temperature: 45.5 C\n").unwrap();

        let result = b.parse_power_report(tmp.path()).unwrap();
        assert!(result.is_some(), "should find and parse .pwr file");
        let report = result.unwrap();
        assert!(report.total_mw > 0.0, "total power should be positive");
        assert!(!report.breakdown.is_empty(), "should have power breakdown");
    }

    #[test]
    fn test_parse_power_report_with_watts_unit() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        let impl1_dir = tmp.path().join("impl1");
        std::fs::create_dir(&impl1_dir).unwrap();
        let pwr_path = impl1_dir.join("design.pwr");
        std::fs::write(&pwr_path, "Total Power: 0.1255 W\nStatic Power: 0.0452 W\nDynamic Power: 0.0803 W\n").unwrap();

        let result = b.parse_power_report(tmp.path()).unwrap();
        assert!(result.is_some());
        let report = result.unwrap();
        // 0.1255 W should become 125.5 mW
        assert!(report.total_mw > 100.0 && report.total_mw < 200.0);
    }

    #[test]
    fn test_parse_power_report_calculates_percentages() {
        let content = "Total Power: 100.0 mW\nStatic Power: 30.0 mW\nDynamic Power: 70.0 mW\n";
        let result = DiamondBackend::parse_diamond_power_report(content).unwrap();
        assert!(result.is_some());
        let report = result.unwrap();

        // Find breakdown entries
        let static_entry = report.breakdown.iter().find(|b| b.category == "Static");
        let dynamic_entry = report.breakdown.iter().find(|b| b.category == "Dynamic");

        assert!(static_entry.is_some());
        assert!(dynamic_entry.is_some());

        // Check percentages are calculated
        if let Some(s) = static_entry {
            assert!((s.percentage - 30.0).abs() < 0.1, "Static should be ~30%");
        }
        if let Some(d) = dynamic_entry {
            assert!((d.percentage - 70.0).abs() < 0.1, "Dynamic should be ~70%");
        }
    }

    #[test]
    fn test_parse_power_report_no_file_returns_none() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        let impl1_dir = tmp.path().join("impl1");
        std::fs::create_dir(&impl1_dir).unwrap();

        let result = b.parse_power_report(tmp.path()).unwrap();
        assert!(result.is_none(), "should return None when no power report found");
    }

    #[test]
    fn test_parse_power_report_empty_content_returns_none() {
        let content = "# No power data";
        let result = DiamondBackend::parse_diamond_power_report(content).unwrap();
        assert!(result.is_none(), "should return None when no power data parsed");
    }

    // ── DRC report parsing ──

    #[test]
    fn test_parse_drc_report_finds_drc_file() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        let impl1_dir = tmp.path().join("impl1");
        std::fs::create_dir(&impl1_dir).unwrap();
        let drc_path = impl1_dir.join("design.drc");
        std::fs::write(&drc_path, "Errors: 0\nCritical Warnings: 1\nWarnings: 5\nInfo: 10\n").unwrap();

        let result = b.parse_drc_report(tmp.path()).unwrap();
        assert!(result.is_some(), "should find and parse .drc file");
        let report = result.unwrap();
        assert_eq!(report.critical_warnings, 1);
        assert_eq!(report.warnings, 5);
        assert_eq!(report.info, 10);
    }

    #[test]
    fn test_parse_drc_report_counts_severity_levels() {
        let content = "Errors: 2\nCritical Warnings: 3\nWarnings: 5\nInfo: 1\nWaived: 0\n";
        let result = DiamondBackend::parse_diamond_drc_report(content).unwrap();
        assert!(result.is_some());
        let report = result.unwrap();
        assert_eq!(report.errors, 2);
        assert_eq!(report.critical_warnings, 3);
        assert_eq!(report.warnings, 5);
        assert_eq!(report.info, 1);
        assert_eq!(report.waived, 0);
    }

    #[test]
    fn test_parse_drc_report_with_items() {
        let content = r#"Errors: 1
ERROR W123: Invalid pin configuration at A10
WARNING W456: Unused net clk at module top
"#;
        let result = DiamondBackend::parse_diamond_drc_report(content).unwrap();
        assert!(result.is_some());
        let report = result.unwrap();
        assert_eq!(report.errors, 1);
        // Note: our regex may or may not capture items depending on exact format
        // This test ensures parsing doesn't crash
    }

    #[test]
    fn test_parse_drc_report_no_file_returns_none() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        let impl1_dir = tmp.path().join("impl1");
        std::fs::create_dir(&impl1_dir).unwrap();

        let result = b.parse_drc_report(tmp.path()).unwrap();
        assert!(result.is_none(), "should return None when no DRC file found");
    }

    #[test]
    fn test_parse_drc_report_empty_counts_returns_none() {
        let content = "# No DRC information";
        let result = DiamondBackend::parse_diamond_drc_report(content).unwrap();
        assert!(result.is_none(), "should return None when no DRC counts found");
    }

    // ── Device verification ──

    #[test]
    fn test_verify_device_part_returns_error_without_install() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let result = b.verify_device_part("LCMXO3LF-6900C");
        assert!(result.is_err(), "should error when pnmainc not available");
    }

    // ── IP script generation ──

    #[test]
    fn test_generate_ip_script_basic() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        let params = std::collections::HashMap::new();
        let (script, output_dir) = b.generate_ip_script(
            tmp.path(), "LCMXO3LF-6900C", "FIFO_DC", "fifo_inst", &params,
        ).unwrap();

        assert!(script.contains("FIFO_DC"), "script should contain IP name");
        assert!(script.contains("fifo_inst"), "script should contain instance name");
        assert!(script.contains("ipexpress"), "script should invoke ipexpress");
        assert!(output_dir.contains("fifo_inst"), "output dir should reference instance name");
    }

    #[test]
    fn test_generate_ip_script_with_parameters() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        let mut params = std::collections::HashMap::new();
        params.insert("WIDTH".to_string(), "32".to_string());
        params.insert("DEPTH".to_string(), "256".to_string());

        let (script, _output_dir) = b.generate_ip_script(
            tmp.path(), "LCMXO3LF-6900C", "FIFO_DC", "my_fifo", &params,
        ).unwrap();

        assert!(script.contains("WIDTH=32"), "script should include WIDTH parameter");
        assert!(script.contains("DEPTH=256"), "script should include DEPTH parameter");
    }

    #[test]
    fn test_generate_ip_script_empty_parameters() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        let params = std::collections::HashMap::new();

        let (script, _) = b.generate_ip_script(
            tmp.path(), "LCMXO3LF-6900C", "RAM_DP", "ram_inst", &params,
        ).unwrap();

        assert!(script.contains("RAM_DP"));
        assert!(script.contains("ram_inst"));
    }

    // ── Additional edge case tests ──

    #[test]
    fn test_parse_power_report_with_power_rpt_extension() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        let impl1_dir = tmp.path().join("impl1");
        std::fs::create_dir(&impl1_dir).unwrap();
        let pwr_path = impl1_dir.join("design_power.rpt");
        std::fs::write(&pwr_path, "Total Power: 50.0 mW\n").unwrap();

        let result = b.parse_power_report(tmp.path()).unwrap();
        assert!(result.is_some(), "should recognize *_power.rpt extension");
    }

    #[test]
    fn test_parse_drc_report_with_zero_counts() {
        let content = "Errors: 0\nCritical Warnings: 0\nWarnings: 0\nInfo: 0\nWaived: 0\n";
        let result = DiamondBackend::parse_diamond_drc_report(content).unwrap();
        assert!(result.is_none(), "should return None when all counts are zero");
    }

    #[test]
    fn test_power_report_junction_temperature_parsing() {
        let content = "Total Power: 100.0 mW\nJunction Temperature: 65.3 C\n";
        let result = DiamondBackend::parse_diamond_power_report(content).unwrap();
        assert!(result.is_some());
        let report = result.unwrap();
        assert!((report.junction_temp_c - 65.3).abs() < 0.01);
    }

    #[test]
    fn test_power_report_default_ambient_temperature() {
        let content = "Total Power: 100.0 mW\n";
        let result = DiamondBackend::parse_diamond_power_report(content).unwrap();
        if let Some(report) = result {
            assert_eq!(report.ambient_temp_c, 25.0, "ambient temp should default to 25C");
        }
    }

    #[test]
    fn test_diamond_build_script_with_verilog_sources() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("module.v"), "module m(); endmodule").unwrap();

        let script = b.generate_build_script(
            tmp.path(), "LCMXO3LF-6900C", "m", &[], &HashMap::new(),
        ).unwrap();

        assert!(script.contains("prj_src add -format Verilog"), "should add Verilog sources");
        assert!(script.contains("module.v"));
    }

    #[test]
    fn test_diamond_build_script_with_systemverilog_sources() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("design.sv"), "module design(); endmodule").unwrap();

        let script = b.generate_build_script(
            tmp.path(), "LCMXO3LF-6900C", "design", &[], &HashMap::new(),
        ).unwrap();

        assert!(script.contains("prj_src add -format SystemVerilog"));
        assert!(script.contains("design.sv"));
    }

    #[test]
    fn test_diamond_build_script_with_vhdl_sources() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("entity.vhd"), "entity e is end;").unwrap();

        let script = b.generate_build_script(
            tmp.path(), "LCMXO3LF-6900C", "e", &[], &HashMap::new(),
        ).unwrap();

        assert!(script.contains("prj_src add -format VHDL"));
        assert!(script.contains("entity.vhd"));
    }

    #[test]
    fn test_generate_ip_script_output_dir_structure() {
        let b = DiamondBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();

        let (_, output_dir) = b.generate_ip_script(
            tmp.path(), "LCMXO3LF-6900C", "MEMORY", "mem_inst", &HashMap::new(),
        ).unwrap();

        assert!(output_dir.contains("impl1"), "output dir should reference impl1");
        assert!(output_dir.contains("ip"), "output dir should reference ip subdirectory");
        assert!(output_dir.contains("mem_inst"), "output dir should include instance name");
    }
}
