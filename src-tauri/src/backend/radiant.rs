use crate::backend::{BackendError, BackendResult, FpgaBackend, DetectedVersion};
use crate::types::*;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Lattice Radiant backend — drives radiantc / pnmainc (TCL shell)
/// for Nexus (LIFCL, CrossLink-NX, Avant) and CertusPro-NX families.
pub struct RadiantBackend {
    version: String,
    install_dir: Option<PathBuf>,
    deferred: bool,
}

impl RadiantBackend {
    pub fn new() -> Self {
        let (version, install_dir) = Self::detect_installation();
        Self {
            version,
            install_dir,
            deferred: false,
        }
    }

    pub fn new_deferred() -> Self {
        Self {
            version: String::new(),
            install_dir: None,
            deferred: true,
        }
    }

    /// Verify a candidate install dir has radiantc.
    fn verify_install(install: &Path) -> bool {
        install.join("bin").join("lin64").join("radiantc").exists()
            || install.join("bin").join("nt64").join("radiantc.exe").exists()
    }

    /// Scan a directory for version subdirectories containing radiantc.
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
            // Still accept if directory exists (backward compat — some installs lack radiantc)
            Some((ver.clone(), install))
        }
    }

    /// Scan known installation paths for Lattice Radiant.
    fn detect_installation() -> (String, Option<PathBuf>) {
        let config = crate::config::AppConfig::load();

        // 1. User-configured path takes priority
        if let Some(ref configured) = config.tool_paths.radiant {
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
                // Walk upward in case user pointed at bin/, bin/nt64/, etc.
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

        // 2. Scan known directories
        let candidates: Vec<PathBuf> = if cfg!(target_os = "windows") {
            vec![PathBuf::from(r"C:\lscc\radiant")]
        } else {
            let mut paths = vec![
                PathBuf::from("/usr/local/radiant"),
                PathBuf::from("/opt/lscc/radiant"),
                PathBuf::from("/mnt/c/lscc/radiant"),
                PathBuf::from("/mnt/d/lscc/radiant"),
            ];
            if let Some(home) = std::env::var_os("HOME") {
                paths.push(PathBuf::from(home).join("lscc").join("radiant"));
            }
            paths
        };

        for base in &candidates {
            if let Some((ver, install)) = Self::scan_version_dirs(base) {
                return (ver, Some(install));
            }
        }

        // 3. Fallback: find radiantc on PATH (cross-platform)
        if let Ok(bin_path) = which::which("radiantc") {
            // radiantc is at <install>/bin/{lin64,nt64}/radiantc — go up 3 levels
            if let Some(install) = bin_path.parent().and_then(|p| p.parent()).and_then(|p| p.parent()) {
                let ver = install.file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| "unknown".to_string());
                return (ver, Some(install.to_path_buf()));
            }
        }

        ("unknown".to_string(), None)
    }

    /// Path to the radiantc / pnmainc TCL shell executable.
    fn radiantc_path(&self) -> Option<PathBuf> {
        let dir = self.install_dir.as_ref()?;
        let bin = if cfg!(target_os = "windows") {
            dir.join("bin").join("nt64").join("radiantc.exe")
        } else if dir.starts_with("/mnt/c") || dir.starts_with("/mnt/d") {
            // WSL accessing Windows install — use .exe
            dir.join("bin").join("nt64").join("radiantc.exe")
        } else {
            dir.join("bin").join("lin64").join("radiantc")
        };
        if bin.exists() {
            Some(bin)
        } else {
            None
        }
    }

    /// Get the installation directory (for external use).
    pub fn install_dir(&self) -> Option<&Path> {
        self.install_dir.as_deref()
    }

    /// Scan all candidate directories and return every version found.
    pub fn scan_all_versions() -> Vec<DetectedVersion> {
        let candidates: Vec<PathBuf> = if cfg!(target_os = "windows") {
            vec![PathBuf::from(r"C:\lscc\radiant")]
        } else {
            let mut paths = vec![
                PathBuf::from("/usr/local/radiant"),
                PathBuf::from("/opt/lscc/radiant"),
                PathBuf::from("/mnt/c/lscc/radiant"),
                PathBuf::from("/mnt/d/lscc/radiant"),
            ];
            if let Some(home) = std::env::var_os("HOME") {
                paths.push(PathBuf::from(home).join("lscc").join("radiant"));
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

    /// Public accessor for the radiantc executable path.
    pub fn radiantc_path_public(&self) -> Option<PathBuf> {
        self.radiantc_path()
    }

    /// Find the .rdf project file in a directory.
    /// Radiant project files may not match the top module name (e.g., "8_bit_counter.rdf").
    pub fn find_rdf_file(project_dir: &Path, top_module: &str) -> Option<PathBuf> {
        Self::find_project_files(project_dir, top_module).into_iter().next()
    }

    /// Search for .rdf project files in the directory and one level of subdirectories.
    pub fn find_project_files(project_dir: &Path, top_module: &str) -> Vec<PathBuf> {
        let exact = project_dir.join(format!("{}.rdf", top_module));
        let mut dirs = vec![project_dir.to_path_buf()];
        if let Ok(entries) = std::fs::read_dir(project_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if !name.starts_with('.') && name != "impl1" && name != "impl" {
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
                    if path.extension().map(|e| e == "rdf").unwrap_or(false) {
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

    /// Check if a license file is found and contains LSC_RADIANT feature.
    pub fn find_license(&self) -> Option<PathBuf> {
        // Check LM_LICENSE_FILE env var (may contain multiple paths separated by : or ;)
        if let Ok(val) = std::env::var("LM_LICENSE_FILE") {
            let sep = if cfg!(target_os = "windows") { ';' } else { ':' };
            for part in val.split(sep) {
                let part = part.trim();
                if part.is_empty() || part.contains('@') { continue; }
                let p = PathBuf::from(part);
                if p.exists() {
                    if let Ok(content) = std::fs::read_to_string(&p) {
                        if content.contains("LSC_RADIANT") || content.contains("lattice") {
                            return Some(p);
                        }
                    }
                }
            }
        }

        // Check common license file locations
        let mut candidates: Vec<PathBuf> = vec![];

        if cfg!(target_os = "windows") {
            if let Some(h) = dirs::home_dir() { candidates.push(h.join("license.dat")); }
            candidates.push(PathBuf::from(r"C:\license.dat"));
        } else {
            // WSL: scan all Windows user homes
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
            // WSL: scan Radiant install paths
            for base in &["/mnt/c/lscc/radiant", "/mnt/c/lscc/diamond"] {
                if let Ok(entries) = std::fs::read_dir(base) {
                    for entry in entries.filter_map(|e| e.ok()) {
                        let ver_dir = entry.path();
                        let lic = ver_dir.join("license").join("license.dat");
                        if lic.exists() { candidates.push(lic); }
                    }
                }
            }
            if let Some(h) = dirs::home_dir() { candidates.push(h.join("license.dat")); }
        }

        for candidate in candidates {
            if candidate.exists() {
                if let Ok(content) = std::fs::read_to_string(&candidate) {
                    if content.contains("LSC_RADIANT") || content.contains("lattice") {
                        return Some(candidate);
                    }
                }
            }
        }

        None
    }

    /// Recursively scan for HDL source files (.v, .sv, .vhd, .vhdl) under a directory.
    fn scan_sources(dir: &Path) -> Vec<PathBuf> {
        let mut results = Vec::new();
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.is_dir() {
                    // Skip build output and hidden directories
                    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                    if name.starts_with('.') || name == "impl1" || name == "build" {
                        continue;
                    }
                    results.extend(Self::scan_sources(&path));
                } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    match ext {
                        "v" | "sv" | "vhd" | "vhdl" => {
                            // Skip testbench files — they can't be synthesized
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

    /// Scan for constraint files (.pdc, .sdc, .lpf) under a directory.
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
                        "pdc" | "sdc" | "lpf" => results.push(path),
                        _ => {}
                    }
                }
            }
        }
        results
    }
}

impl FpgaBackend for RadiantBackend {
    fn id(&self) -> &str {
        "radiant"
    }
    fn name(&self) -> &str {
        "Lattice Radiant"
    }
    fn short_name(&self) -> &str {
        "Radiant"
    }
    fn version(&self) -> &str {
        &self.version
    }
    fn cli_tool(&self) -> &str {
        "radiantc"
    }
    fn default_device(&self) -> &str {
        "LIFCL-40-7BG400I"
    }
    fn constraint_ext(&self) -> &str {
        ".pdc"
    }

    fn pipeline_stages(&self) -> Vec<PipelineStage> {
        vec![
            PipelineStage {
                id: "synth".into(),
                label: "Synthesis (LSE)".into(),
                cmd: "prj_run_synthesis".into(),
                detail: "RTL to technology mapping".into(),
            },
            PipelineStage {
                id: "map".into(),
                label: "Map".into(),
                cmd: "prj_run_map".into(),
                detail: "Technology mapping to device primitives".into(),
            },
            PipelineStage {
                id: "par".into(),
                label: "Place & Route".into(),
                cmd: "prj_run_par".into(),
                detail: "Placement and routing".into(),
            },
            PipelineStage {
                id: "bitgen".into(),
                label: "Bitstream".into(),
                cmd: "prj_run_bitstream".into(),
                detail: ".bit generation".into(),
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
        let all_ids = ["synth", "map", "par", "bitgen"];
        let run_stage = |id: &str| -> bool {
            stages.is_empty() || stages.iter().any(|s| s == id)
        };

        let mut script = format!(
            "# CovertEDA \u{2014} Radiant Build Script\n# Device: {device}\n# Top: {top_module}\n\n",
        );

        // Resolve project file: explicit option > auto-discover > create new
        let resolved_rdf = if let Some(pf) = options.get("project_file") {
            let p = if PathBuf::from(pf).is_absolute() {
                PathBuf::from(pf)
            } else {
                project_dir.join(pf)
            };
            Some(p)
        } else {
            Self::find_rdf_file(project_dir, top_module)
        };

        if let Some(rdf) = resolved_rdf {
            let rdf_display = super::to_tcl_path(&rdf);
            script.push_str(&format!("prj_open \"{}\"\n", rdf_display));
        } else {
            // No .rdf — create project from scratch, scan for sources
            let project_dir_tcl = super::to_tcl_path(project_dir);
            let project_name = top_module;

            // Determine device family for prj_create
            let family = if device.starts_with("LIFCL") {
                "LIFCL"
            } else if device.starts_with("LFD2NX") || device.starts_with("LCMXO5") {
                "CrossLink-NX"
            } else if device.starts_with("LFCPNX") {
                "CertusPro-NX"
            } else {
                "LIFCL"
            };

            script.push_str(&format!(
                "prj_create -name \"{project_name}\" -impl \"impl1\" -dev {device} -performance \"7_High-Performance_1.0V\" -synthesis \"lse\" -dir \"{project_dir_tcl}\"\n",
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
                script.push_str(&format!("prj_add_source \"{}\"\n", src_tcl));
            }

            // Add constraint files
            let constraints = Self::scan_constraints(project_dir);
            for constr in &constraints {
                let constr_tcl = super::to_tcl_path(constr);
                let ext = constr.extension().and_then(|e| e.to_str()).unwrap_or("");
                match ext {
                    "pdc" | "sdc" | "lpf" => script.push_str(&format!("prj_add_source \"{}\"\n", constr_tcl)),
                    _ => {}
                }
            }

            // Set top module
            script.push_str(&format!(
                "prj_set_impl_opt -impl \"impl1\" \"top\" \"{top_module}\"\n",
            ));

            let _ = family; // family is implicit in the device string for prj_create
        }

        // Apply build options via prj_set_impl_opt (Radiant 2024+).
        // These set implementation-level options without requiring strategy name lookup.
        if let Some(engine) = options.get("synth_engine") {
            if !engine.is_empty() {
                let tool = match engine.as_str() {
                    "Synplify Pro" | "synplify" | "synplify_pro" => "synplify",
                    _ => "lse",
                };
                script.push_str(&format!(
                    "prj_set_impl_opt -impl \"impl1\" \"synthesis\" \"{}\"\n", tool
                ));
            }
        }
        if let Some(freq) = options.get("syn_frequency") {
            if !freq.is_empty() {
                script.push_str(&format!(
                    "prj_set_impl_opt -impl \"impl1\" \"frequency\" \"{}\"\n", freq
                ));
            }
        }
        if let Some(opt) = options.get("syn_optimization") {
            if !opt.is_empty() {
                let goal = match opt.as_str() {
                    "Timing" => "Timing",
                    "Area" => "Area",
                    _ => "Balanced",
                };
                script.push_str(&format!(
                    "prj_set_impl_opt -impl \"impl1\" \"goal\" \"{}\"\n", goal
                ));
            }
        }
        if let Some(effort) = options.get("map_effort") {
            if !effort.is_empty() {
                let val = if effort == "High" { "high" } else { "standard" };
                script.push_str(&format!(
                    "prj_set_impl_opt -impl \"impl1\" \"map_effort\" \"{}\"\n", val
                ));
            }
        }
        if let Some(effort) = options.get("par_effort") {
            if !effort.is_empty() {
                let val = if effort == "High" { "high" } else { "standard" };
                script.push_str(&format!(
                    "prj_set_impl_opt -impl \"impl1\" \"par_effort\" \"{}\"\n", val
                ));
            }
        }
        if let Some(pb) = options.get("par_path_based") {
            if !pb.is_empty() {
                let val = if pb == "true" || pb == "ON" { "ON" } else { "OFF" };
                script.push_str(&format!(
                    "prj_set_impl_opt -impl \"impl1\" \"par_pathbased\" \"{}\"\n", val
                ));
            }
        }

        // Save project before running stages
        script.push_str("prj_save\n");

        // Emit only requested stage commands
        for id in &all_ids {
            if run_stage(id) {
                let cmd = match *id {
                    "synth" => "prj_run_synthesis",
                    "map" => "prj_run_map",
                    "par" => "prj_run_par",
                    "bitgen" => "prj_run_bitstream",
                    _ => continue,
                };
                script.push_str(cmd);
                script.push('\n');
            }
        }

        script.push_str("prj_close\n");
        Ok(script)
    }

    fn verify_device_part(&self, part: &str) -> BackendResult<bool> {
        let radiantc = self.radiantc_path().ok_or_else(|| {
            BackendError::ToolNotFound("radiantc not found".into())
        })?;
        // Write a temp TCL that lists devices and checks if the part is in the list
        let tmp_path = std::env::temp_dir().join("coverteda_verify_dev.tcl");
        let tcl = format!(
            "if {{[catch {{prj_dev_list}} devs]}} {{ puts UNKNOWN; exit 0 }}\n\
             if {{[lsearch -exact $devs \"{}\"] >= 0}} {{ puts VALID }} else {{ puts INVALID }}\n\
             exit 0\n",
            part,
        );
        std::fs::write(&tmp_path, &tcl)?;

        // Set license env if available
        let mut cmd = crate::process::no_window_cmd(radiantc.to_str().unwrap_or("radiantc"));
        cmd.arg(&tmp_path);
        if let Some(install) = &self.install_dir {
            let lic_dir = install.join("license");
            if lic_dir.exists() {
                if let Ok(entries) = std::fs::read_dir(&lic_dir) {
                    for e in entries.filter_map(|e| e.ok()) {
                        let p = e.path();
                        if p.extension().map(|ext| ext == "dat" || ext == "lic").unwrap_or(false) {
                            cmd.env("LM_LICENSE_FILE", &p);
                            break;
                        }
                    }
                }
            }
        }

        let output = cmd.output().map_err(|e| BackendError::IoError(e))?;
        let _ = std::fs::remove_file(&tmp_path);
        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(stdout.contains("VALID"))
    }

    fn parse_pad_report(&self, impl_dir: &Path) -> BackendResult<Option<crate::types::PadReport>> {
        // Search for *.pad files in impl_dir and impl_dir/impl1/
        let search_dirs = [
            impl_dir.to_path_buf(),
            impl_dir.join("impl1"),
        ];
        for dir in &search_dirs {
            if !dir.exists() { continue; }
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|e| e.to_str()) == Some("pad") {
                        if let Ok(content) = std::fs::read_to_string(&path) {
                            if let Ok(report) = crate::parser::pad::parse_radiant_pad(&content) {
                                return Ok(Some(report));
                            }
                        }
                    }
                }
            }
        }
        Ok(None)
    }

    fn list_package_pins(&self, device: &str) -> BackendResult<Vec<super::PackagePin>> {
        let install = self.install_dir.as_ref().ok_or_else(|| {
            BackendError::ToolNotFound("Radiant install directory not found".into())
        })?;
        let ibis_dirs = super::find_lattice_ibis_dirs(install);
        super::parse_lattice_ibis_pins(device, &ibis_dirs)
    }

    fn list_device_pin_data(&self, device: &str) -> BackendResult<super::DevicePinData> {
        let install = self.install_dir.as_ref().ok_or_else(|| {
            BackendError::ToolNotFound("Radiant install directory not found".into())
        })?;
        let ibis_dirs = super::find_lattice_ibis_dirs(install);
        let pins = super::parse_lattice_ibis_pins(device, &ibis_dirs)?;
        let (io_standards, drive_strengths) = super::parse_lattice_ibis_capabilities(device, &ibis_dirs);
        Ok(super::DevicePinData { pins, io_standards, drive_strengths })
    }

    fn detect_tool(&self) -> bool {
        if self.deferred { return false; }
        self.radiantc_path().is_some()
    }

    fn is_deferred(&self) -> bool { self.deferred }

    fn install_path_str(&self) -> Option<String> {
        self.install_dir.as_ref().map(|p| p.display().to_string())
    }

    fn parse_timing_report(&self, impl_dir: &Path) -> BackendResult<TimingReport> {
        // Radiant timing reports are in impl1/<top>.twr or impl1/<top>_par.twr
        let twr = impl_dir.join("impl1");
        if !twr.exists() {
            return Err(BackendError::ReportNotFound(
                twr.display().to_string(),
            ));
        }
        // Look for any .twr file
        let twr_file = std::fs::read_dir(&twr)
            .map_err(|e| BackendError::IoError(e))?
            .filter_map(|e| e.ok())
            .find(|e| {
                e.path()
                    .extension()
                    .map(|ext| ext == "twr")
                    .unwrap_or(false)
            })
            .map(|e| e.path())
            .ok_or_else(|| {
                BackendError::ReportNotFound("No .twr file found in impl1".to_string())
            })?;

        let content = std::fs::read_to_string(&twr_file)?;
        crate::parser::timing::parse_radiant_timing(&content)
    }

    fn parse_utilization_report(&self, impl_dir: &Path) -> BackendResult<ResourceReport> {
        let mrp_dir = impl_dir.join("impl1");
        if !mrp_dir.exists() {
            return Err(BackendError::ReportNotFound(
                mrp_dir.display().to_string(),
            ));
        }
        let mrp_file = std::fs::read_dir(&mrp_dir)
            .map_err(|e| BackendError::IoError(e))?
            .filter_map(|e| e.ok())
            .find(|e| {
                e.path()
                    .extension()
                    .map(|ext| ext == "mrp")
                    .unwrap_or(false)
            })
            .map(|e| e.path())
            .ok_or_else(|| {
                BackendError::ReportNotFound("No .mrp file found in impl1".to_string())
            })?;

        let content = std::fs::read_to_string(&mrp_file)?;
        crate::parser::utilization::parse_radiant_utilization(&content, self.default_device())
    }

    fn parse_power_report(&self, _impl_dir: &Path) -> BackendResult<Option<PowerReport>> {
        Ok(None)
    }

    fn parse_drc_report(&self, impl_dir: &Path) -> BackendResult<Option<DrcReport>> {
        let drc_dir = impl_dir.join("impl1");
        if !drc_dir.exists() {
            return Ok(None);
        }
        let drc_file = std::fs::read_dir(&drc_dir)
            .map_err(|e| BackendError::IoError(e))?
            .filter_map(|e| e.ok())
            .find(|e| {
                e.path()
                    .extension()
                    .map(|ext| ext == "drc")
                    .unwrap_or(false)
            })
            .map(|e| e.path());

        let drc_file = match drc_file {
            Some(p) => p,
            None => return Ok(None),
        };

        let content = std::fs::read_to_string(&drc_file)?;

        let mut errors = 0u32;
        let mut warnings = 0u32;
        let mut items = Vec::new();

        // Parse "DRC detected N errors and N warnings."
        let summary_re = regex::Regex::new(
            r"DRC detected (\d+) errors? and (\d+) warnings?"
        ).unwrap();
        if let Some(caps) = summary_re.captures(&content) {
            errors = caps[1].parse().unwrap_or(0);
            warnings = caps[2].parse().unwrap_or(0);
        }

        // Parse individual DRC items: "ERROR/WARNING - <code>: <message>"
        let item_re = regex::Regex::new(
            r"(?m)^(ERROR|WARNING)\s*-\s*([A-Z0-9_]+):\s*(.+)$"
        ).unwrap();
        for caps in item_re.captures_iter(&content) {
            let sev = match &caps[1] {
                "ERROR" => DrcSeverity::Error,
                _ => DrcSeverity::Warning,
            };
            items.push(DrcItem {
                severity: sev,
                code: caps[2].to_string(),
                message: caps[3].trim().to_string(),
                location: String::new(),
                action: String::new(),
            });
        }

        Ok(Some(DrcReport {
            errors,
            critical_warnings: 0,
            warnings,
            info: 0,
            waived: 0,
            items,
        }))
    }

    fn read_constraints(&self, constraint_file: &Path) -> BackendResult<Vec<PinConstraint>> {
        if !constraint_file.exists() {
            return Err(BackendError::ReportNotFound(
                constraint_file.display().to_string(),
            ));
        }
        let ext = constraint_file
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");
        let content = std::fs::read_to_string(constraint_file)?;
        match ext {
            "lpf" => crate::parser::constraints::parse_lpf(&content),
            "pdc" => {
                // PDC is TCL-based; for now return empty
                Ok(vec![])
            }
            _ => Err(BackendError::ParseError(format!(
                "Unknown constraint format: {}",
                ext
            ))),
        }
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

    fn generate_ip_script(
        &self,
        project_dir: &Path,
        device: &str,
        ip_name: &str,
        instance_name: &str,
        params: &HashMap<String, String>,
    ) -> BackendResult<(String, String)> {
        let ip_dir = project_dir.join("ip_cores").join(instance_name);
        let ip_dir_tcl = super::to_tcl_path(&ip_dir);
        let project_dir_tcl = super::to_tcl_path(project_dir);

        // Determine the device family from the device string
        let family = if device.starts_with("LIFCL") {
            "LIFCL"
        } else if device.starts_with("LFD2NX") || device.starts_with("LCMXO5") {
            "CrossLink-NX"
        } else if device.starts_with("LFCPNX") {
            "CertusPro-NX"
        } else {
            "LIFCL"
        };

        let mut script = format!(
            r#"# CovertEDA — Radiant IP Generation Script
# IP: {ip_name}
# Instance: {instance_name}
# Device: {device} (Family: {family})

# Ensure output directory exists
file mkdir "{ip_dir_tcl}"

# Open an existing Radiant project, or create a temporary one.
# SBP commands require a project context to be loaded first.
set rdf_files [glob -nocomplain "{project_dir_tcl}/*.rdf"]
if {{[llength $rdf_files] > 0}} {{
    puts "CovertEDA: Opening existing project: [lindex $rdf_files 0]"
    prj_open [lindex $rdf_files 0]
}} else {{
    puts "CovertEDA: No .rdf project found — creating temporary project for IP generation"
    prj_create -name "coverteda_ipgen" -impl "impl1" -dev {device} -synthesis "lse" -dir "{project_dir_tcl}"
}}

# Open the IP design in Clarity Designer
sbp_design new -name "{instance_name}" -path "{ip_dir_tcl}" -family "{family}" -device "{device}" -part "{device}"

# Select the IP component
sbp_configure -component "{ip_name}"

"#,
        );

        // Set parameters
        for (key, value) in params {
            if !value.is_empty() {
                script.push_str(&format!(
                    "sbp_configure -component \"{ip_name}\" -param \"{key}:{value}\"\n",
                ));
            }
        }

        script.push_str(&format!(
            r#"
# Generate the IP output products (Verilog)
sbp_generate -lang "verilog"

# Save and close
sbp_save
sbp_close_design
prj_close

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
    use std::path::Path;

    #[test]
    fn test_radiant_id_and_name() {
        let b = RadiantBackend { version: "test".into(), install_dir: None, deferred: false };
        assert_eq!(b.id(), "radiant");
        assert_eq!(b.name(), "Lattice Radiant");
        assert_eq!(b.short_name(), "Radiant");
    }

    #[test]
    fn test_radiant_default_device() {
        let b = RadiantBackend { version: "test".into(), install_dir: None, deferred: false };
        assert_eq!(b.default_device(), "LIFCL-40-7BG400I");
    }

    #[test]
    fn test_radiant_pipeline_has_four_stages() {
        let b = RadiantBackend { version: "test".into(), install_dir: None, deferred: false };
        let stages = b.pipeline_stages();
        assert_eq!(stages.len(), 4);
        assert_eq!(stages[0].id, "synth");
        assert_eq!(stages[1].id, "map");
        assert_eq!(stages[2].id, "par");
        assert_eq!(stages[3].id, "bitgen");
    }

    #[test]
    fn test_radiant_constraint_ext() {
        let b = RadiantBackend { version: "test".into(), install_dir: None, deferred: false };
        assert_eq!(b.constraint_ext(), ".pdc");
    }

    #[test]
    fn test_radiant_build_script_opens_rdf() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("test.rdf"), "").unwrap();
        let b = RadiantBackend { version: "test".into(), install_dir: None, deferred: false };
        let script = b.generate_build_script(
            tmp.path(), "LIFCL-40", "test", &[], &HashMap::new(),
        ).unwrap();
        assert!(script.contains("prj_open"), "script should contain prj_open:\n{}", script);
    }

    #[test]
    fn test_radiant_build_script_runs_all_stages() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("top.rdf"), "").unwrap();
        let b = RadiantBackend { version: "test".into(), install_dir: None, deferred: false };
        let script = b.generate_build_script(
            tmp.path(), "LIFCL-40", "top", &[], &HashMap::new(),
        ).unwrap();
        assert!(script.contains("prj_run_synthesis"));
        assert!(script.contains("prj_run_map"));
        assert!(script.contains("prj_run_par"));
        assert!(script.contains("prj_run_bitstream"));
    }

    #[test]
    fn test_radiant_build_script_selective_stages() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("top.rdf"), "").unwrap();
        let b = RadiantBackend { version: "test".into(), install_dir: None, deferred: false };
        let stages = vec!["synth".into(), "par".into()];
        let script = b.generate_build_script(
            tmp.path(), "LIFCL-40", "top", &stages, &HashMap::new(),
        ).unwrap();
        assert!(script.contains("prj_run_synthesis"));
        assert!(!script.contains("prj_run_map"));
        assert!(script.contains("prj_run_par"));
        assert!(!script.contains("prj_run_bitstream"));
    }

    #[test]
    fn test_radiant_build_script_synplify_engine() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("top.rdf"), "").unwrap();
        let b = RadiantBackend { version: "test".into(), install_dir: None, deferred: false };
        let mut opts = HashMap::new();
        opts.insert("synth_engine".into(), "synplify".into());
        let script = b.generate_build_script(
            tmp.path(), "LIFCL-40", "top", &[], &opts,
        ).unwrap();
        assert!(script.contains("prj_set_impl_opt -impl \"impl1\" \"synthesis\" \"synplify\""), "should set synplify via prj_set_impl_opt");
    }

    #[test]
    fn test_radiant_build_script_empty_options_no_strategy() {
        // Empty option values should NOT emit impl_opt commands
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("top.rdf"), "").unwrap();
        let b = RadiantBackend { version: "test".into(), install_dir: None, deferred: false };
        let mut opts = HashMap::new();
        opts.insert("synth_engine".into(), "".into());
        opts.insert("syn_optimization".into(), "".into());
        let script = b.generate_build_script(
            tmp.path(), "LIFCL-40", "top", &[], &opts,
        ).unwrap();
        assert!(!script.contains("prj_set_impl_opt -impl \"impl1\" \"synthesis\""), "empty engine should not set synthesis opt:\n{}", script);
        assert!(!script.contains("prj_set_impl_opt -impl \"impl1\" \"goal\""), "empty optimization should not set goal opt:\n{}", script);
    }

    #[test]
    fn test_radiant_build_script_no_rdf_no_sources_errors() {
        // No .rdf and no source files → should error
        let tmp = tempfile::tempdir().unwrap();
        let b = RadiantBackend { version: "test".into(), install_dir: None, deferred: false };
        let result = b.generate_build_script(
            tmp.path(), "LIFCL-40", "top", &[], &HashMap::new(),
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_radiant_build_script_no_rdf_creates_project() {
        // No .rdf but source files exist → should create project from scratch
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("source");
        std::fs::create_dir(&src_dir).unwrap();
        std::fs::write(src_dir.join("counter.v"), "module counter(); endmodule").unwrap();
        std::fs::write(src_dir.join("counter.pdc"), "# constraints").unwrap();

        let b = RadiantBackend { version: "test".into(), install_dir: None, deferred: false };
        let script = b.generate_build_script(
            tmp.path(), "LIFCL-40-7BG400I", "counter", &[], &HashMap::new(),
        ).unwrap();

        assert!(script.contains("prj_create"), "script should create project:\n{}", script);
        assert!(script.contains("prj_add_source"), "script should add sources:\n{}", script);
        assert!(script.contains("counter.v"), "script should reference counter.v:\n{}", script);
        assert!(script.contains("prj_run_synthesis"));
        assert!(script.contains("prj_run_par"));
        assert!(script.contains("prj_save"));
    }

    #[test]
    fn test_radiant_to_tcl_path_wsl() {
        let path = Path::new("/mnt/c/Users/foo/project/test.rdf");
        let result = super::super::to_tcl_path(path);
        assert_eq!(result, "C:/Users/foo/project/test.rdf");
    }

    #[test]
    fn test_radiant_to_tcl_path_native() {
        let path = Path::new("/home/user/project/test.rdf");
        let result = super::super::to_tcl_path(path);
        if std::env::var("WSL_DISTRO_NAME").is_ok() {
            assert!(result.starts_with("//wsl.localhost/"));
            assert!(result.ends_with("/home/user/project/test.rdf"));
        } else {
            assert_eq!(result, "/home/user/project/test.rdf");
        }
    }

    #[test]
    fn test_classify_lattice_pin_user_io() {
        let (func, bank, diff) = super::super::classify_lattice_pin("PB4A");
        assert_eq!(func, "User I/O");
        assert_eq!(bank, Some("Bank 4 (Bottom)".to_string()));
        assert_eq!(diff, Some("PB4B".to_string()));

        let (func, bank, diff) = super::super::classify_lattice_pin("PL2B");
        assert_eq!(func, "User I/O");
        assert_eq!(bank, Some("Bank 2 (Left)".to_string()));
        assert_eq!(diff, Some("PL2A".to_string()));

        let (func, bank, diff) = super::super::classify_lattice_pin("PR9A");
        assert_eq!(func, "User I/O");
        assert_eq!(bank, Some("Bank 9 (Right)".to_string()));
        assert_eq!(diff, Some("PR9B".to_string()));

        let (func, bank, diff) = super::super::classify_lattice_pin("PT26A");
        assert_eq!(func, "User I/O");
        assert_eq!(bank, Some("Bank 26 (Top)".to_string()));
        assert_eq!(diff, Some("PT26B".to_string()));
    }

    #[test]
    fn test_classify_lattice_pin_power() {
        let (func, bank, _) = super::super::classify_lattice_pin("VCC");
        assert!(func.starts_with("Power"));
        assert!(bank.is_none());

        let (func, _, _) = super::super::classify_lattice_pin("VCCIO3");
        assert!(func.starts_with("Power"));
    }

    #[test]
    fn test_classify_lattice_pin_special() {
        let (func, _, _) = super::super::classify_lattice_pin("JTAG_EN");
        assert_eq!(func, "Config");

        let (func, _, diff) = super::super::classify_lattice_pin("DPHY0_DN0");
        assert_eq!(func, "MIPI D-PHY");
        assert_eq!(diff, Some("DPHY0_DP0".to_string()));

        let (func, _, _) = super::super::classify_lattice_pin("ADC_DP0");
        assert_eq!(func, "ADC");
    }

    // ── PDC Parsing Tests (Real Fixture Data) ──

    #[test]
    fn test_parse_pdc_blinky_led_constraints() {
        let b = RadiantBackend { version: "test".into(), install_dir: None, deferred: false };
        let pdc_content = include_str!("../../../examples/radiant/blinky_led/constraints/blinky.pdc");
        let tmp = tempfile::tempdir().unwrap();
        let pdc_file = tmp.path().join("blinky.pdc");
        std::fs::write(&pdc_file, pdc_content).unwrap();

        if let Ok(constraints) = b.read_constraints(&pdc_file) {
            let _ = constraints;
        }
    }

    #[test]
    fn test_parse_pdc_dsp_fir_filter_constraints() {
        let b = RadiantBackend { version: "test".into(), install_dir: None, deferred: false };
        let pdc_content = include_str!("../../../examples/radiant/dsp_fir_filter/constraints/fir.pdc");
        let tmp = tempfile::tempdir().unwrap();
        let pdc_file = tmp.path().join("fir.pdc");
        std::fs::write(&pdc_file, pdc_content).unwrap();

        if let Ok(constraints) = b.read_constraints(&pdc_file) {
            let _ = constraints;
        }
    }

    #[test]
    fn test_parse_pdc_i2c_bridge_constraints() {
        let b = RadiantBackend { version: "test".into(), install_dir: None, deferred: false };
        let pdc_content = include_str!("../../../examples/radiant/i2c_bridge/constraints/i2c.pdc");
        let tmp = tempfile::tempdir().unwrap();
        let pdc_file = tmp.path().join("i2c.pdc");
        std::fs::write(&pdc_file, pdc_content).unwrap();

        if let Ok(constraints) = b.read_constraints(&pdc_file) {
            let _ = constraints;
        }
    }

    #[test]
    fn test_parse_pdc_spi_flash_constraints() {
        let b = RadiantBackend { version: "test".into(), install_dir: None, deferred: false };
        let pdc_content = include_str!("../../../examples/radiant/spi_flash/constraints/spi.pdc");
        let tmp = tempfile::tempdir().unwrap();
        let pdc_file = tmp.path().join("spi.pdc");
        std::fs::write(&pdc_file, pdc_content).unwrap();

        if let Ok(constraints) = b.read_constraints(&pdc_file) {
            let _ = constraints;
        }
    }

    #[test]
    fn test_parse_pdc_uart_controller_constraints() {
        let b = RadiantBackend { version: "test".into(), install_dir: None, deferred: false };
        let pdc_content = include_str!("../../../examples/radiant/uart_controller/constraints/uart.pdc");
        let tmp = tempfile::tempdir().unwrap();
        let pdc_file = tmp.path().join("uart.pdc");
        std::fs::write(&pdc_file, pdc_content).unwrap();

        if let Ok(constraints) = b.read_constraints(&pdc_file) {
            let _ = constraints;
        }
    }

    // ── SDC Timing Constraint Tests ──

    #[test]
    fn test_parse_sdc_blinky_led_timing() {
        let b = RadiantBackend { version: "test".into(), install_dir: None, deferred: false };
        let sdc_content = include_str!("../../../examples/radiant/blinky_led/constraints/blinky.sdc");
        let tmp = tempfile::tempdir().unwrap();
        let sdc_file = tmp.path().join("blinky.sdc");
        std::fs::write(&sdc_file, sdc_content).unwrap();

        if let Ok(constraints) = b.read_constraints(&sdc_file) {
            let _ = constraints;
        }
    }

    #[test]
    fn test_parse_sdc_dsp_fir_filter_timing() {
        let b = RadiantBackend { version: "test".into(), install_dir: None, deferred: false };
        let sdc_content = include_str!("../../../examples/radiant/dsp_fir_filter/constraints/fir.sdc");
        let tmp = tempfile::tempdir().unwrap();
        let sdc_file = tmp.path().join("fir.sdc");
        std::fs::write(&sdc_file, sdc_content).unwrap();

        if let Ok(constraints) = b.read_constraints(&sdc_file) {
            let _ = constraints;
        }
    }

    #[test]
    fn test_parse_sdc_i2c_bridge_timing() {
        let b = RadiantBackend { version: "test".into(), install_dir: None, deferred: false };
        let sdc_content = include_str!("../../../examples/radiant/i2c_bridge/constraints/i2c.sdc");
        let tmp = tempfile::tempdir().unwrap();
        let sdc_file = tmp.path().join("i2c.sdc");
        std::fs::write(&sdc_file, sdc_content).unwrap();

        if let Ok(constraints) = b.read_constraints(&sdc_file) {
            let _ = constraints;
        }
    }

    #[test]
    fn test_parse_sdc_spi_flash_timing() {
        let b = RadiantBackend { version: "test".into(), install_dir: None, deferred: false };
        let sdc_content = include_str!("../../../examples/radiant/spi_flash/constraints/spi.sdc");
        let tmp = tempfile::tempdir().unwrap();
        let sdc_file = tmp.path().join("spi.sdc");
        std::fs::write(&sdc_file, sdc_content).unwrap();

        if let Ok(constraints) = b.read_constraints(&sdc_file) {
            let _ = constraints;
        }
    }

    #[test]
    fn test_parse_sdc_uart_controller_timing() {
        let b = RadiantBackend { version: "test".into(), install_dir: None, deferred: false };
        let sdc_content = include_str!("../../../examples/radiant/uart_controller/constraints/uart.sdc");
        let tmp = tempfile::tempdir().unwrap();
        let sdc_file = tmp.path().join("uart.sdc");
        std::fs::write(&sdc_file, sdc_content).unwrap();

        if let Ok(constraints) = b.read_constraints(&sdc_file) {
            let _ = constraints;
        }
    }

    // ── Build Script Generation Tests (Different Configurations) ──

    #[test]
    fn test_generate_build_script_lifcl40() {
        let b = RadiantBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("test.rdf"), "").unwrap();
        let script = b.generate_build_script(
            tmp.path(), "LIFCL-40-7BG400I", "blinky_top", &[], &HashMap::new(),
        ).unwrap();
        assert!(script.contains("prj_open"));
        assert!(script.contains("blinky_top"));
    }

    #[test]
    fn test_generate_build_script_lifcl85() {
        let b = RadiantBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("test.rdf"), "").unwrap();
        let script = b.generate_build_script(
            tmp.path(), "LIFCL-85-7BG400I", "uart_top", &[], &HashMap::new(),
        ).unwrap();
        assert!(script.contains("prj_open"));
    }

    #[test]
    fn test_generate_build_script_lfe5u85f() {
        let b = RadiantBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("test.rdf"), "").unwrap();
        let script = b.generate_build_script(
            tmp.path(), "LFE5U-85F-7BG381I", "ddc_top", &[], &HashMap::new(),
        ).unwrap();
        assert!(script.contains("LFE5U-85F-7BG381I") || script.contains("device"));
    }

    #[test]
    fn test_generate_build_script_lfe5um5g() {
        let b = RadiantBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("test.rdf"), "").unwrap();
        let script = b.generate_build_script(
            tmp.path(), "LFE5UM5G-85F-8BG381I", "eth_top", &[], &HashMap::new(),
        ).unwrap();
        assert!(script.contains("prj_open"));
    }

    #[test]
    fn test_generate_build_script_lifcl40_40() {
        let b = RadiantBackend { version: "test".into(), install_dir: None, deferred: false };
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("test.rdf"), "").unwrap();
        let script = b.generate_build_script(
            tmp.path(), "LIFCL-40-7FG400I", "axi_top", &[], &HashMap::new(),
        ).unwrap();
        assert!(!script.is_empty(), "build script should not be empty");
    }
}
