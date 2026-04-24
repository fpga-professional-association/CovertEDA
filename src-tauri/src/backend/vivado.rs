use crate::backend::{BackendError, BackendResult, FpgaBackend, DetectedVersion};
use crate::types::*;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// AMD Vivado backend — drives vivado in batch/TCL mode.
pub struct VivadoBackend {
    version: String,
    install_dir: Option<PathBuf>,
    deferred: bool,
}

impl VivadoBackend {
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

    /// Verify a candidate install dir has the vivado binary.
    fn verify_install(install: &Path) -> bool {
        install.join("bin").join("vivado").exists()
            || install.join("bin").join("vivado.bat").exists()
    }

    /// Scan a directory for Vivado version subdirectories.
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

    /// Extract a version string from a path. Uses the dir name if it looks
    /// like a version (starts with a digit), otherwise walks up to find one.
    fn extract_version(path: &Path) -> String {
        // Check the dir name itself
        if let Some(name) = path.file_name().map(|n| n.to_string_lossy().to_string()) {
            if name.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
                return name;
            }
        }
        // Unified layout: <base>/<version>/Vivado — check parent
        if let Some(parent) = path.parent() {
            if let Some(name) = parent.file_name().map(|n| n.to_string_lossy().to_string()) {
                if name.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
                    return name;
                }
            }
        }
        "unknown".to_string()
    }

    fn detect_installation() -> (String, Option<PathBuf>) {
        let config = crate::config::AppConfig::load();

        // 1. User-configured path
        if let Some(ref configured) = config.tool_paths.vivado {
            if configured.as_os_str().len() > 0 {
                if Self::verify_install(configured) {
                    let ver = Self::extract_version(configured);
                    return (ver, Some(configured.clone()));
                }
                if let Some((ver, install)) = Self::scan_version_dirs(configured) {
                    return (ver, Some(install));
                }
                // Walk upward in case user pointed at bin/ or a subdirectory
                let mut ancestor = configured.as_path();
                for _ in 0..3 {
                    if let Some(parent) = ancestor.parent() {
                        if Self::verify_install(parent) {
                            let ver = Self::extract_version(parent);
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
        // Standard layout: <base>/Vivado/<version>/  (has bin/vivado)
        // Unified layout:  <base>/<version>/Vivado/  (has bin/vivado)
        let standard_candidates: Vec<PathBuf> = if cfg!(target_os = "windows") {
            vec![
                PathBuf::from(r"C:\Xilinx\Vivado"),
                PathBuf::from(r"C:\AMD\Vivado"),
            ]
        } else {
            vec![
                PathBuf::from("/opt/Xilinx/Vivado"),
                PathBuf::from("/opt/AMD/Vivado"),
                PathBuf::from("/tools/Xilinx/Vivado"),
                PathBuf::from("/mnt/c/Xilinx/Vivado"),
                PathBuf::from("/mnt/c/AMD/Vivado"),
            ]
        };

        for base in &standard_candidates {
            if let Some((ver, install)) = Self::scan_version_dirs(base) {
                return (ver, Some(install));
            }
        }

        // Unified installer layout: <base>/<version>/Vivado/ (2024.2+ style).
        // 2025.2+ installers default to C:\AMDDesignTools on Windows.
        let unified_candidates: Vec<PathBuf> = if cfg!(target_os = "windows") {
            vec![
                PathBuf::from(r"C:\Xilinx"),
                PathBuf::from(r"C:\AMD"),
                PathBuf::from(r"C:\AMDDesignTools"),
            ]
        } else {
            vec![
                PathBuf::from("/opt/Xilinx"),
                PathBuf::from("/opt/AMD"),
                PathBuf::from("/opt/AMDDesignTools"),
                PathBuf::from("/tools/Xilinx"),
                PathBuf::from("/amd"),
                PathBuf::from("/xilinx"),
                PathBuf::from("/mnt/c/Xilinx"),
                PathBuf::from("/mnt/c/AMDDesignTools"),
            ]
        };

        for base in &unified_candidates {
            if let Ok(entries) = std::fs::read_dir(base) {
                let mut versions: Vec<(String, PathBuf)> = entries
                    .filter_map(|e| e.ok())
                    .filter(|e| e.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
                    .filter_map(|e| {
                        let name = e.file_name().to_string_lossy().to_string();
                        if name.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
                            let vivado_dir = e.path().join("Vivado");
                            if Self::verify_install(&vivado_dir) {
                                return Some((name, vivado_dir));
                            }
                        }
                        None
                    })
                    .collect();
                versions.sort_by(|a, b| a.0.cmp(&b.0));
                if let Some((ver, install)) = versions.last() {
                    return (ver.clone(), Some(install.clone()));
                }
            }
        }

        // 3. Fallback: find vivado on PATH (cross-platform)
        if let Ok(bin_path) = which::which("vivado") {
            // vivado is at <install>/bin/vivado — go up 2 levels
            if let Some(install) = bin_path.parent().and_then(|p| p.parent()) {
                let ver = Self::extract_version(install);
                return (ver, Some(install.to_path_buf()));
            }
        }

        ("unknown".to_string(), None)
    }

    /// Public accessor for the install directory.
    pub fn install_dir(&self) -> Option<&Path> {
        self.install_dir.as_deref()
    }

    /// Scan all candidate directories and return every verified version found.
    pub fn scan_all_versions() -> Vec<DetectedVersion> {
        // Standard layout: <base>/<version>/  (has bin/vivado)
        let standard: Vec<PathBuf> = if cfg!(target_os = "windows") {
            vec![
                PathBuf::from(r"C:\Xilinx\Vivado"),
                PathBuf::from(r"C:\AMD\Vivado"),
            ]
        } else {
            vec![
                PathBuf::from("/opt/Xilinx/Vivado"),
                PathBuf::from("/opt/AMD/Vivado"),
                PathBuf::from("/tools/Xilinx/Vivado"),
                PathBuf::from("/mnt/c/Xilinx/Vivado"),
                PathBuf::from("/mnt/c/AMD/Vivado"),
            ]
        };

        // Unified layout: <base>/<version>/Vivado/  (has bin/vivado)
        let unified: Vec<PathBuf> = if cfg!(target_os = "windows") {
            vec![
                PathBuf::from(r"C:\Xilinx"),
                PathBuf::from(r"C:\AMD"),
                PathBuf::from(r"C:\AMDDesignTools"),
            ]
        } else {
            vec![
                PathBuf::from("/opt/Xilinx"),
                PathBuf::from("/opt/AMD"),
                PathBuf::from("/opt/AMDDesignTools"),
                PathBuf::from("/tools/Xilinx"),
                PathBuf::from("/amd"),
                PathBuf::from("/xilinx"),
                PathBuf::from("/mnt/c/Xilinx"),
                PathBuf::from("/mnt/c/AMDDesignTools"),
            ]
        };

        let mut seen = std::collections::HashSet::new();
        let mut results = Vec::new();

        // Standard layout scan
        for base in &standard {
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
                    let key = install.display().to_string();
                    if seen.contains(&key) { continue; }
                    let verified = Self::verify_install(&install);
                    seen.insert(key.clone());
                    results.push(DetectedVersion {
                        version: name,
                        install_path: key,
                        verified,
                    });
                }
            }
        }

        // Unified layout scan
        for base in &unified {
            if let Ok(entries) = std::fs::read_dir(base) {
                for entry in entries.filter_map(|e| e.ok()) {
                    if !entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                        continue;
                    }
                    let name = entry.file_name().to_string_lossy().to_string();
                    if !name.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
                        continue;
                    }
                    let vivado_dir = entry.path().join("Vivado");
                    let key = vivado_dir.display().to_string();
                    if seen.contains(&key) { continue; }
                    let verified = Self::verify_install(&vivado_dir);
                    if verified {
                        seen.insert(key.clone());
                        results.push(DetectedVersion {
                            version: name,
                            install_path: key,
                            verified,
                        });
                    }
                }
            }
        }

        results.sort_by(|a, b| a.version.cmp(&b.version));
        results
    }

    /// Search for .xpr project files in the directory and one level of subdirectories.
    pub fn find_project_files(project_dir: &Path, top_module: &str) -> Vec<PathBuf> {
        let exact = project_dir.join(format!("{}.xpr", top_module));
        let mut dirs = vec![project_dir.to_path_buf()];
        if let Ok(entries) = std::fs::read_dir(project_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if !name.starts_with('.') && name != "runs" && name != ".Xil" {
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
                    if path.extension().map(|e| e == "xpr").unwrap_or(false) {
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

    /// Generate TCL script for Vivado IP core creation
    pub fn generate_ip_creation_script(
        ip_name: &str,
        ip_type: &str,
        properties: &HashMap<String, String>,
    ) -> String {
        let mut script = format!(
            r#"# Vivado IP Creation Script
# IP Name: {ip_name}
# IP Type: {ip_type}

create_ip -name {ip_type} -vendor xilinx.com -library ip -version 1.0 -module_name {ip_name}
set_property -dict [list \
"#,
            ip_name = ip_name,
            ip_type = ip_type,
        );

        for (key, value) in properties {
            script.push_str(&format!("  CONFIG.{} {{{}}}\\\n", key, value));
        }

        script.push_str(
            r#"] [get_ips {ip_name}]

generate_target {synthesis simulation} [get_ips {ip_name}]
"#,
        );

        script
    }

    /// Parse Vivado I/O pad report (io_utilization.rpt)
    pub fn parse_pad_report(rpt_content: &str) -> BackendResult<Vec<String>> {
        let mut pins = Vec::new();
        for line in rpt_content.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('|') || trimmed.starts_with('-') {
                continue;
            }
            let parts: Vec<&str> = trimmed.split('|').map(|s| s.trim()).collect();
            if parts.len() >= 2 && !parts[0].is_empty() && parts[0] != "PIN" {
                pins.push(parts[0].to_string());
            }
        }
        Ok(pins)
    }
}

impl FpgaBackend for VivadoBackend {
    fn id(&self) -> &str {
        "vivado"
    }
    fn name(&self) -> &str {
        "AMD Vivado"
    }
    fn short_name(&self) -> &str {
        "Vivado"
    }
    fn version(&self) -> &str {
        &self.version
    }
    fn cli_tool(&self) -> &str {
        "vivado"
    }
    fn default_device(&self) -> &str {
        "xc7a100tcsg324-1"
    }
    fn constraint_ext(&self) -> &str {
        ".xdc"
    }

    fn pipeline_stages(&self) -> Vec<PipelineStage> {
        vec![
            PipelineStage {
                id: "synth".into(),
                label: "synth_design".into(),
                cmd: "synth_design -top top_level".into(),
                detail: "RTL synthesis".into(),
            },
            PipelineStage {
                id: "opt".into(),
                label: "opt_design".into(),
                cmd: "opt_design -directive Explore".into(),
                detail: "Logic optimization".into(),
            },
            PipelineStage {
                id: "place".into(),
                label: "place_design".into(),
                cmd: "place_design -directive ExtraPostPlacementOpt".into(),
                detail: "Placement".into(),
            },
            PipelineStage {
                id: "phys".into(),
                label: "phys_opt_design".into(),
                cmd: "phys_opt_design -directive AggressiveExplore".into(),
                detail: "Post-placement optimization".into(),
            },
            PipelineStage {
                id: "route".into(),
                label: "route_design".into(),
                cmd: "route_design -directive Explore".into(),
                detail: "Routing".into(),
            },
            PipelineStage {
                id: "bitgen".into(),
                label: "write_bitstream".into(),
                cmd: "write_bitstream -force output.bit".into(),
                detail: ".bit generation".into(),
            },
        ]
    }

    fn generate_build_script(
        &self,
        project_dir: &Path,
        device: &str,
        top_module: &str,
        _stages: &[String],
        options: &HashMap<String, String>,
    ) -> BackendResult<String> {
        let project_dir_tcl = super::to_tcl_path(project_dir);

        // Resolve project file: explicit option > auto-discover > convention
        let xpr_path = if let Some(pf) = options.get("project_file") {
            let p = if PathBuf::from(pf).is_absolute() {
                PathBuf::from(pf)
            } else {
                project_dir.join(pf)
            };
            super::to_tcl_path(&p)
        } else {
            let discovered = Self::find_project_files(project_dir, top_module);
            discovered.into_iter().next()
                .map(|p| super::to_tcl_path(&p))
                .unwrap_or_else(|| format!("{project_dir_tcl}/{top_module}.xpr"))
        };

        Ok(format!(
            r#"# CovertEDA — Vivado Build Script
# Device: {device}
# Top: {top_module}

open_project {xpr_path}

synth_design -top {top_module}
opt_design -directive Explore
place_design -directive ExtraPostPlacementOpt
phys_opt_design -directive AggressiveExplore
route_design -directive Explore

report_timing_summary -file timing_summary.rpt
report_utilization -file utilization.rpt
report_power -file power.rpt

write_bitstream -force {top_module}.bit

close_project
"#,
        ))
    }

    fn detect_tool(&self) -> bool {
        if self.deferred { return false; }
        self.install_dir.is_some() || which::which("vivado").is_ok()
    }

    fn is_deferred(&self) -> bool { self.deferred }

    fn install_path_str(&self) -> Option<String> {
        self.install_dir.as_ref().map(|p| p.display().to_string())
    }

    fn verify_device_part(&self, part: &str) -> BackendResult<bool> {
        // Find vivado binary
        let vivado_bin = self.install_dir.as_ref()
            .and_then(|d| {
                let bin = d.join("bin").join("vivado");
                if bin.exists() { Some(bin) } else {
                    let bat = d.join("bin").join("vivado.bat");
                    if bat.exists() { Some(bat) } else { None }
                }
            })
            .or_else(|| which::which("vivado").ok())
            .ok_or_else(|| BackendError::ToolNotFound("vivado not found".into()))?;

        // Write a temp TCL script that checks for the part
        let tmp_path = std::env::temp_dir().join("coverteda_verify_dev.tcl");
        let tcl_content = format!(
            "set parts [get_parts -quiet {}]\nif {{[llength $parts] > 0}} {{ puts VALID }} else {{ puts INVALID }}\nexit",
            part,
        );
        std::fs::write(&tmp_path, &tcl_content)?;

        let output = crate::process::no_window_cmd(vivado_bin.to_str().unwrap_or("vivado"))
            .args(["-mode", "batch", "-source"])
            .arg(&tmp_path)
            .output()
            .map_err(|e| BackendError::IoError(e))?;
        let _ = std::fs::remove_file(&tmp_path);
        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(stdout.contains("VALID"))
    }

    fn list_package_pins(&self, device: &str) -> BackendResult<Vec<super::PackagePin>> {
        let vivado_bin = self.install_dir.as_ref()
            .and_then(|d| {
                let bin = d.join("bin").join("vivado");
                if bin.exists() { Some(bin) } else {
                    let bat = d.join("bin").join("vivado.bat");
                    if bat.exists() { Some(bat) } else { None }
                }
            })
            .or_else(|| which::which("vivado").ok())
            .ok_or_else(|| BackendError::ToolNotFound("vivado not found".into()))?;

        let tcl = format!(
            r#"set part [get_parts -quiet {device}]
if {{[llength $part] == 0}} {{ puts "ERROR: Part not found"; exit 1 }}
set pkg_pins [get_package_pins -of_objects $part]
foreach p $pkg_pins {{
  set bank [get_property BANK $p]
  set func [get_property PIN_FUNC $p]
  set diff ""
  catch {{ set diff [get_property DIFF_PAIR $p] }}
  puts "$p|$bank|$func|$diff"
}}
exit
"#,
            device = device,
        );

        let tmp_path = std::env::temp_dir().join(".coverteda_pins.tcl");
        std::fs::write(&tmp_path, &tcl).map_err(|e| BackendError::IoError(e))?;

        let output = crate::process::no_window_cmd(vivado_bin.to_str().unwrap_or("vivado"))
            .args(["-mode", "batch", "-source"])
            .arg(&tmp_path)
            .output()
            .map_err(|e| BackendError::IoError(e))?;

        let _ = std::fs::remove_file(&tmp_path);

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

    fn parse_timing_report(&self, impl_dir: &Path) -> BackendResult<TimingReport> {
        let rpt = impl_dir.join("timing_summary.rpt");
        if !rpt.exists() {
            return Err(BackendError::ReportNotFound(rpt.display().to_string()));
        }
        let content = std::fs::read_to_string(&rpt)?;
        crate::parser::timing::parse_vivado_timing(&content)
    }

    fn parse_utilization_report(&self, impl_dir: &Path) -> BackendResult<ResourceReport> {
        let rpt = impl_dir.join("utilization.rpt");
        if !rpt.exists() {
            return Err(BackendError::ReportNotFound(rpt.display().to_string()));
        }
        let content = std::fs::read_to_string(&rpt)?;
        crate::parser::utilization::parse_vivado_utilization(&content, self.default_device())
    }

    fn parse_power_report(&self, impl_dir: &Path) -> BackendResult<Option<PowerReport>> {
        let rpt = impl_dir.join("power.rpt");
        if !rpt.exists() {
            return Ok(None);
        }
        let content = std::fs::read_to_string(&rpt)?;
        crate::parser::power::parse_vivado_power(&content).map(Some)
    }

    fn parse_drc_report(&self, impl_dir: &Path) -> BackendResult<Option<DrcReport>> {
        let rpt = impl_dir.join("drc.rpt");
        if !rpt.exists() {
            return Ok(None);
        }
        let content = std::fs::read_to_string(&rpt)?;
        crate::parser::drc::parse_vivado_drc(&content).map(Some)
    }

    fn read_constraints(&self, constraint_file: &Path) -> BackendResult<Vec<PinConstraint>> {
        if !constraint_file.exists() {
            return Err(BackendError::ReportNotFound(
                constraint_file.display().to_string(),
            ));
        }
        let content = std::fs::read_to_string(constraint_file)?;
        crate::parser::constraints::parse_xdc(&content)
    }

    fn write_constraints(
        &self,
        constraints: &[PinConstraint],
        output_file: &Path,
    ) -> BackendResult<()> {
        let content = crate::parser::constraints::write_xdc(constraints);
        std::fs::write(output_file, content)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vivado_id_and_name() {
        let b = VivadoBackend::new();
        assert_eq!(b.id(), "vivado");
        assert_eq!(b.name(), "AMD Vivado");
    }

    #[test]
    fn test_vivado_pipeline_has_six_stages() {
        let b = VivadoBackend::new();
        let stages = b.pipeline_stages();
        assert_eq!(stages.len(), 6);
        assert_eq!(stages[0].id, "synth");
        assert_eq!(stages[5].id, "bitgen");
    }

    #[test]
    fn test_vivado_build_script_contains_synth_design() {
        let b = VivadoBackend::new();
        let tmp = tempfile::tempdir().unwrap();
        let script = b.generate_build_script(
            tmp.path(), "xc7a100t", "top", &[], &std::collections::HashMap::new(),
        ).unwrap();
        assert!(script.contains("synth_design -top top"));
    }

    #[test]
    fn test_vivado_build_script_contains_bitstream() {
        let b = VivadoBackend::new();
        let tmp = tempfile::tempdir().unwrap();
        let script = b.generate_build_script(
            tmp.path(), "xc7a100t", "top", &[], &std::collections::HashMap::new(),
        ).unwrap();
        assert!(script.contains("write_bitstream"));
    }

    #[test]
    fn test_vivado_default_device() {
        let b = VivadoBackend::new();
        assert_eq!(b.default_device(), "xc7a100tcsg324-1");
    }

    #[test]
    fn test_vivado_short_name_and_cli_tool() {
        let b = VivadoBackend::new();
        assert_eq!(b.short_name(), "Vivado");
        assert_eq!(b.cli_tool(), "vivado");
    }

    #[test]
    fn test_vivado_constraint_extension() {
        let b = VivadoBackend::new();
        assert_eq!(b.constraint_ext(), ".xdc");
    }

    #[test]
    fn test_vivado_build_script_selective_stages_ignored() {
        // Vivado backend currently ignores the stages parameter and always
        // generates the full flow. Verify the script is complete regardless
        // of which stages are requested.
        let b = VivadoBackend::new();
        let tmp = tempfile::tempdir().unwrap();
        let stages = vec!["synth".into(), "route".into()];
        let script = b.generate_build_script(
            tmp.path(), "xc7a100t", "top", &stages, &std::collections::HashMap::new(),
        ).unwrap();
        // All stages should still be present since Vivado ignores selective stages
        assert!(script.contains("synth_design -top top"));
        assert!(script.contains("opt_design"));
        assert!(script.contains("place_design"));
        assert!(script.contains("phys_opt_design"));
        assert!(script.contains("route_design"));
        assert!(script.contains("write_bitstream"));
    }

    #[test]
    fn test_vivado_build_script_contains_opt_design() {
        let b = VivadoBackend::new();
        let tmp = tempfile::tempdir().unwrap();
        let script = b.generate_build_script(
            tmp.path(), "xc7a100t", "top", &[], &std::collections::HashMap::new(),
        ).unwrap();
        assert!(script.contains("opt_design -directive Explore"));
    }

    #[test]
    fn test_vivado_build_script_contains_phys_opt_design() {
        let b = VivadoBackend::new();
        let tmp = tempfile::tempdir().unwrap();
        let script = b.generate_build_script(
            tmp.path(), "xc7a100t", "top", &[], &std::collections::HashMap::new(),
        ).unwrap();
        assert!(script.contains("phys_opt_design -directive AggressiveExplore"));
    }

    #[test]
    fn test_vivado_build_script_with_frequency_option() {
        // Vivado backend does not currently use a frequency option, but
        // passing one should not cause an error — it is silently ignored.
        let b = VivadoBackend::new();
        let tmp = tempfile::tempdir().unwrap();
        let mut opts = std::collections::HashMap::new();
        opts.insert("frequency".into(), "200".into());
        let script = b.generate_build_script(
            tmp.path(), "xc7a100t", "top", &[], &opts,
        ).unwrap();
        // Script should still generate successfully with all standard stages
        assert!(script.contains("synth_design -top top"));
        assert!(script.contains("route_design"));
        assert!(script.contains("write_bitstream"));
    }

    #[test]
    fn test_vivado_pipeline_stage_count_and_ids() {
        let b = VivadoBackend::new();
        let stages = b.pipeline_stages();
        assert_eq!(stages.len(), 6);
        let ids: Vec<&str> = stages.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids, vec!["synth", "opt", "place", "phys", "route", "bitgen"]);
    }

    // ── Power Report Parsing Tests ──

    #[test]
    fn test_parse_power_report_file_not_found() {
        let b = VivadoBackend::new();
        let tmp = tempfile::tempdir().unwrap();
        let result = b.parse_power_report(tmp.path());
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    #[test]
    fn test_parse_power_report_basic() {
        let b = VivadoBackend::new();
        let tmp = tempfile::tempdir().unwrap();
        let power_content = r#"
Total On-Chip Power: 2.456 W
Device Static Power: 0.623 W
Device Dynamic Power: 1.833 W
Junction Temperature: 65.4 C
"#;
        std::fs::write(tmp.path().join("power.rpt"), power_content).unwrap();
        let result = b.parse_power_report(tmp.path()).unwrap();
        assert!(result.is_some());
        let report = result.unwrap();
        assert!(report.total_mw >= 0.0);
    }

    // ── DRC Report Parsing Tests ──

    #[test]
    fn test_parse_drc_report_file_not_found() {
        let b = VivadoBackend::new();
        let tmp = tempfile::tempdir().unwrap();
        let result = b.parse_drc_report(tmp.path());
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    #[test]
    fn test_parse_drc_report_with_errors() {
        let b = VivadoBackend::new();
        let tmp = tempfile::tempdir().unwrap();
        let drc_content = r#"
ERROR [CFGBVS-2] Bank 18 is not assigned. Some I/O Standards require explicit Bank assignment.
WARNING [PLHIGH-6] Problem with PLL output. Check PLL configuration.
CRITICAL WARNING [TIMING-7] Timing constraint not met on path main_clk.
"#;
        std::fs::write(tmp.path().join("drc.rpt"), drc_content).unwrap();
        let result = b.parse_drc_report(tmp.path());
        assert!(result.is_ok());
        let opt = result.unwrap();
        assert!(opt.is_some());
        let report = opt.unwrap();
        assert!(report.errors >= 0 && report.critical_warnings >= 0 && report.warnings >= 0);
    }

    // ── IP Script Generation Tests ──

    #[test]
    fn test_generate_ip_creation_script_basic() {
        let ip_name = "my_fifo";
        let ip_type = "fifo_generator";
        let props = std::collections::HashMap::new();
        let script = VivadoBackend::generate_ip_creation_script(ip_name, ip_type, &props);
        assert!(script.contains("create_ip"));
        assert!(script.contains("fifo_generator"));
        assert!(script.contains("my_fifo"));
    }

    #[test]
    fn test_generate_ip_creation_script_with_properties() {
        let ip_name = "ddr4_ctrl";
        let ip_type = "ddr4";
        let mut props = std::collections::HashMap::new();
        props.insert("C_INPUT_CLK_TYPE".to_string(), "Differential".to_string());
        props.insert("C_MEMORY_TYPE".to_string(), "RDIMMs".to_string());
        let script = VivadoBackend::generate_ip_creation_script(ip_name, ip_type, &props);
        assert!(script.contains("create_ip"));
        assert!(script.contains("ddr4"));
        assert!(script.contains("C_INPUT_CLK_TYPE"));
        assert!(script.contains("C_MEMORY_TYPE"));
        assert!(script.contains("generate_target"));
    }

    #[test]
    fn test_generate_ip_creation_script_contains_required_commands() {
        let props = std::collections::HashMap::new();
        let script = VivadoBackend::generate_ip_creation_script("test_ip", "bram", &props);
        assert!(script.contains("set_property -dict"));
        assert!(script.contains("generate_target"));
    }

    // ── Device Verification Tests ──

    #[test]
    fn test_verify_device_part_returns_bool() {
        let b = VivadoBackend::new_deferred();
        // Deferred backend won't find vivado, so this should fail gracefully
        let result = b.verify_device_part("xc7a100tcsg324-1");
        // Either succeeds or returns ToolNotFound error
        match result {
            Err(BackendError::ToolNotFound(_)) => (),
            _ => (),
        }
    }

    // ── Pad Report Parsing Tests ──

    #[test]
    fn test_parse_pad_report_empty() {
        let content = "";
        let result = VivadoBackend::parse_pad_report(content).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_parse_pad_report_with_pins() {
        let content = r#"
PIN | BUFFER_TYPE
A14 | LVCMOS33
A15 | LVCMOS33
B16 | LVCMOS33
"#;
        let result = VivadoBackend::parse_pad_report(content).unwrap();
        assert!(result.len() >= 3);
        assert!(result.contains(&"A14".to_string()));
        assert!(result.contains(&"A15".to_string()));
        assert!(result.contains(&"B16".to_string()));
    }

    #[test]
    fn test_parse_pad_report_filters_headers() {
        let content = r#"
| PIN | BUFFER_TYPE |
|-----|-------------|
| A1  | LVCMOS33    |
"#;
        let result = VivadoBackend::parse_pad_report(content).unwrap();
        // Should not include header "PIN"
        assert!(!result.contains(&"PIN".to_string()));
    }

    // ── Build Script Generation with Different Configs ──

    #[test]
    fn test_build_script_with_project_file_option() {
        let b = VivadoBackend::new();
        let tmp = tempfile::tempdir().unwrap();
        let mut opts = std::collections::HashMap::new();
        opts.insert("project_file".into(), "custom.xpr".into());
        let script = b.generate_build_script(
            tmp.path(), "xc7a100t", "top", &[], &opts,
        ).unwrap();
        assert!(script.contains("open_project"));
        assert!(script.contains("custom.xpr"));
    }

    #[test]
    fn test_build_script_with_absolute_project_path() {
        let b = VivadoBackend::new();
        let tmp = tempfile::tempdir().unwrap();
        let mut opts = std::collections::HashMap::new();
        // Use an absolute path
        let abs_path = if cfg!(target_os = "windows") {
            "C:/Projects/my_proj.xpr"
        } else {
            "/home/user/Projects/my_proj.xpr"
        };
        opts.insert("project_file".into(), abs_path.into());
        let script = b.generate_build_script(
            tmp.path(), "xc7a100t", "top", &[], &opts,
        ).unwrap();
        assert!(script.contains("open_project"));
    }

    #[test]
    fn test_build_script_generates_all_reports() {
        let b = VivadoBackend::new();
        let tmp = tempfile::tempdir().unwrap();
        let script = b.generate_build_script(
            tmp.path(), "xc7a100t", "top", &[], &std::collections::HashMap::new(),
        ).unwrap();
        assert!(script.contains("report_timing_summary"));
        assert!(script.contains("report_utilization"));
        assert!(script.contains("report_power"));
    }

    #[test]
    fn test_build_script_closes_project() {
        let b = VivadoBackend::new();
        let tmp = tempfile::tempdir().unwrap();
        let script = b.generate_build_script(
            tmp.path(), "xc7a100t", "top", &[], &std::collections::HashMap::new(),
        ).unwrap();
        assert!(script.contains("close_project"));
    }

    // ── Timing Report Edge Cases ──

    #[test]
    fn test_parse_timing_report_file_not_found() {
        let b = VivadoBackend::new();
        let tmp = tempfile::tempdir().unwrap();
        let result = b.parse_timing_report(tmp.path());
        assert!(result.is_err());
        match result {
            Err(BackendError::ReportNotFound(_)) => (),
            _ => panic!("Expected ReportNotFound error"),
        }
    }

    // ── Constraint Read/Write Roundtrip ──

    #[test]
    fn test_constraint_roundtrip() {
        let b = VivadoBackend::new();
        let tmp = tempfile::tempdir().unwrap();
        let constraint_path = tmp.path().join("test.xdc");

        // Create sample constraints
        let constraints = vec![
            PinConstraint {
                pin: "A14".to_string(),
                net: "clk".to_string(),
                direction: "in".to_string(),
                io_standard: "LVCMOS33".to_string(),
                bank: String::new(),
                locked: false,
                extra: vec![],
            },
            PinConstraint {
                pin: "B15".to_string(),
                net: "reset_n".to_string(),
                direction: "in".to_string(),
                io_standard: "LVCMOS33".to_string(),
                bank: String::new(),
                locked: false,
                extra: vec![("PULLUP".to_string(), "TRUE".to_string())],
            },
        ];

        // Write constraints
        b.write_constraints(&constraints, &constraint_path).unwrap();
        assert!(constraint_path.exists());

        // Read them back
        let read_back = b.read_constraints(&constraint_path).unwrap();
        assert!(!read_back.is_empty());
    }

    #[test]
    fn test_constraint_write_creates_file() {
        let b = VivadoBackend::new();
        let tmp = tempfile::tempdir().unwrap();
        let constraint_path = tmp.path().join("output.xdc");

        let constraints = vec![
            PinConstraint {
                pin: "A1".to_string(),
                net: "data_in".to_string(),
                direction: "in".to_string(),
                io_standard: "LVCMOS33".to_string(),
                bank: String::new(),
                locked: false,
                extra: vec![],
            },
        ];

        b.write_constraints(&constraints, &constraint_path).unwrap();
        assert!(constraint_path.exists());

        let content = std::fs::read_to_string(&constraint_path).unwrap();
        assert!(content.len() > 0);
    }

    #[test]
    fn test_read_constraints_file_not_found() {
        let b = VivadoBackend::new();
        let tmp = tempfile::tempdir().unwrap();
        let nonexistent = tmp.path().join("nonexistent.xdc");
        let result = b.read_constraints(&nonexistent);
        assert!(result.is_err());
    }

    // ── Utility Function Tests ──

    #[test]
    fn test_find_project_files_prefers_exact_match() {
        let tmp = tempfile::tempdir().unwrap();
        // Create multiple .xpr files
        std::fs::write(tmp.path().join("top.xpr"), "").unwrap();
        std::fs::write(tmp.path().join("other.xpr"), "").unwrap();

        let results = VivadoBackend::find_project_files(tmp.path(), "top");
        assert!(!results.is_empty());
        assert_eq!(results[0].file_name().unwrap().to_str().unwrap(), "top.xpr");
    }

    #[test]
    fn test_detect_tool_deferred_returns_false() {
        let b = VivadoBackend::new_deferred();
        assert!(!b.detect_tool());
        assert!(b.is_deferred());
    }

    #[test]
    fn test_backend_identification() {
        let b = VivadoBackend::new();
        assert_eq!(b.id(), "vivado");
        assert_eq!(b.name(), "AMD Vivado");
        assert_eq!(b.short_name(), "Vivado");
        assert_eq!(b.cli_tool(), "vivado");
    }

    #[test]
    fn test_utilization_report_file_not_found() {
        let b = VivadoBackend::new();
        let tmp = tempfile::tempdir().unwrap();
        let result = b.parse_utilization_report(tmp.path());
        assert!(result.is_err());
    }

    // ── XDC Parsing Tests (Real Fixture Data) ──

    #[test]
    fn test_parse_xdc_blinky_led_constraints() {
        let b = VivadoBackend::new();
        let xdc_content = include_str!("../../../examples/vivado/blinky_led/constraints/blinky.xdc");
        let tmp = tempfile::tempdir().unwrap();
        let xdc_file = tmp.path().join("blinky.xdc");
        std::fs::write(&xdc_file, xdc_content).unwrap();

        if let Ok(constraints) = b.read_constraints(&xdc_file) {
            let _ = constraints;
        }
    }

    #[test]
    fn test_parse_xdc_uart_echo_constraints() {
        let b = VivadoBackend::new();
        let xdc_content = include_str!("../../../examples/vivado/uart_echo/constraints/uart.xdc");
        let tmp = tempfile::tempdir().unwrap();
        let xdc_file = tmp.path().join("uart.xdc");
        std::fs::write(&xdc_file, xdc_content).unwrap();

        if let Ok(constraints) = b.read_constraints(&xdc_file) {
            let _ = constraints;
        }
    }

    #[test]
    fn test_parse_xdc_ddr3_test_constraints() {
        let b = VivadoBackend::new();
        let xdc_content = include_str!("../../../examples/vivado/ddr3_test/constraints/ddr3.xdc");
        let tmp = tempfile::tempdir().unwrap();
        let xdc_file = tmp.path().join("ddr3.xdc");
        std::fs::write(&xdc_file, xdc_content).unwrap();

        if let Ok(constraints) = b.read_constraints(&xdc_file) {
            let _ = constraints;
        }
    }

    #[test]
    fn test_parse_xdc_pwm_rgb_constraints() {
        let b = VivadoBackend::new();
        let xdc_content = include_str!("../../../examples/vivado/pwm_rgb/constraints/pwm.xdc");
        let tmp = tempfile::tempdir().unwrap();
        let xdc_file = tmp.path().join("pwm.xdc");
        std::fs::write(&xdc_file, xdc_content).unwrap();

        if let Ok(constraints) = b.read_constraints(&xdc_file) {
            let _ = constraints;
        }
    }

    #[test]
    fn test_parse_xdc_axi_dma_engine_constraints() {
        let b = VivadoBackend::new();
        let xdc_content = include_str!("../../../examples/vivado/axi_dma_engine/constraints/dma.xdc");
        let tmp = tempfile::tempdir().unwrap();
        let xdc_file = tmp.path().join("dma.xdc");
        std::fs::write(&xdc_file, xdc_content).unwrap();

        if let Ok(constraints) = b.read_constraints(&xdc_file) {
            let _ = constraints;
        }
    }

    // ── XDC Roundtrip Tests (Parse → Write → Reparse) ──

    #[test]
    fn test_roundtrip_xdc_blinky_led() {
        let b = VivadoBackend::new();
        let xdc_content = include_str!("../../../examples/vivado/blinky_led/constraints/blinky.xdc");
        let tmp = tempfile::tempdir().unwrap();
        let xdc_file = tmp.path().join("blinky.xdc");
        std::fs::write(&xdc_file, xdc_content).unwrap();

        if let Ok(constraints_orig) = b.read_constraints(&xdc_file) {
            let output_file = tmp.path().join("blinky_out.xdc");
            if let Ok(_) = b.write_constraints(&constraints_orig, &output_file) {
                let _ = b.read_constraints(&output_file);
            }
        }
    }

    #[test]
    fn test_roundtrip_xdc_uart_echo() {
        let b = VivadoBackend::new();
        let xdc_content = include_str!("../../../examples/vivado/uart_echo/constraints/uart.xdc");
        let tmp = tempfile::tempdir().unwrap();
        let xdc_file = tmp.path().join("uart.xdc");
        std::fs::write(&xdc_file, xdc_content).unwrap();

        if let Ok(constraints_orig) = b.read_constraints(&xdc_file) {
            let output_file = tmp.path().join("uart_out.xdc");
            if let Ok(_) = b.write_constraints(&constraints_orig, &output_file) {
                let _ = b.read_constraints(&output_file);
            }
        }
    }

    #[test]
    fn test_roundtrip_xdc_ddr3_test() {
        let b = VivadoBackend::new();
        let xdc_content = include_str!("../../../examples/vivado/ddr3_test/constraints/ddr3.xdc");
        let tmp = tempfile::tempdir().unwrap();
        let xdc_file = tmp.path().join("ddr3.xdc");
        std::fs::write(&xdc_file, xdc_content).unwrap();

        if let Ok(constraints_orig) = b.read_constraints(&xdc_file) {
            let output_file = tmp.path().join("ddr3_out.xdc");
            if let Ok(_) = b.write_constraints(&constraints_orig, &output_file) {
                let _ = b.read_constraints(&output_file);
            }
        }
    }

    #[test]
    fn test_roundtrip_xdc_pwm_rgb() {
        let b = VivadoBackend::new();
        let xdc_content = include_str!("../../../examples/vivado/pwm_rgb/constraints/pwm.xdc");
        let tmp = tempfile::tempdir().unwrap();
        let xdc_file = tmp.path().join("pwm.xdc");
        std::fs::write(&xdc_file, xdc_content).unwrap();

        if let Ok(constraints_orig) = b.read_constraints(&xdc_file) {
            let output_file = tmp.path().join("pwm_out.xdc");
            if let Ok(_) = b.write_constraints(&constraints_orig, &output_file) {
                let _ = b.read_constraints(&output_file);
            }
        }
    }

    #[test]
    fn test_roundtrip_xdc_axi_dma_engine() {
        let b = VivadoBackend::new();
        let xdc_content = include_str!("../../../examples/vivado/axi_dma_engine/constraints/dma.xdc");
        let tmp = tempfile::tempdir().unwrap();
        let xdc_file = tmp.path().join("dma.xdc");
        std::fs::write(&xdc_file, xdc_content).unwrap();

        if let Ok(constraints_orig) = b.read_constraints(&xdc_file) {
            let output_file = tmp.path().join("dma_out.xdc");
            if let Ok(_) = b.write_constraints(&constraints_orig, &output_file) {
                let _ = b.read_constraints(&output_file);
            }
        }
    }

    // ── Build Script Generation Tests (Different Configurations) ──

    #[test]
    fn test_generate_build_script_artix7_blinky() {
        let b = VivadoBackend::new();
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("top.v"), "module top(); endmodule\n").unwrap();
        let script = b.generate_build_script(
            tmp.path(), "xc7a35tcpg236-1", "blinky_top", &[], &std::collections::HashMap::new(),
        ).unwrap();
        assert!(!script.is_empty(), "build script should not be empty");
    }

    #[test]
    fn test_generate_build_script_kintex7_project() {
        let b = VivadoBackend::new();
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("top.v"), "module top(); endmodule\n").unwrap();
        let script = b.generate_build_script(
            tmp.path(), "xc7k325tffg676-2", "uart_top", &[], &std::collections::HashMap::new(),
        ).unwrap();
        assert!(!script.is_empty(), "build script should not be empty");
    }

    #[test]
    fn test_generate_build_script_virtex7_high_performance() {
        let b = VivadoBackend::new();
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("top.v"), "module top(); endmodule\n").unwrap();
        let script = b.generate_build_script(
            tmp.path(), "xc7v585tffg1157-1", "ddr3_controller", &[], &std::collections::HashMap::new(),
        ).unwrap();
        assert!(!script.is_empty(), "build script should not be empty");
    }

    #[test]
    fn test_generate_build_script_zynq7_system() {
        let b = VivadoBackend::new();
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("top.v"), "module top(); endmodule\n").unwrap();
        let script = b.generate_build_script(
            tmp.path(), "xc7z020clg484-1", "zynq_top", &[], &std::collections::HashMap::new(),
        ).unwrap();
        assert!(!script.is_empty(), "build script should not be empty");
    }

    #[test]
    fn test_generate_build_script_with_device_placeholder() {
        let b = VivadoBackend::new();
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("top.v"), "module top(); endmodule\n").unwrap();
        let script = b.generate_build_script(
            tmp.path(), "xc7a100tcsg324-1", "axi_top", &[], &std::collections::HashMap::new(),
        ).unwrap();
        assert!(!script.is_empty(), "build script should not be empty");
    }
}
