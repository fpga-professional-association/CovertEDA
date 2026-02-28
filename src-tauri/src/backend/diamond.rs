use crate::backend::{BackendResult, FpgaBackend, BackendError};
use crate::types::*;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Lattice Diamond backend — drives pnmainc (TCL shell) for MachXO3/ECP5 families.
pub struct DiamondBackend {
    version: String,
    install_dir: Option<PathBuf>,
}

impl DiamondBackend {
    pub fn new() -> Self {
        let (version, install_dir) = Self::detect_installation();
        Self {
            version,
            install_dir,
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

        // Fallback: check if pnmainc is on PATH
        if let Ok(output) = std::process::Command::new("which").arg("pnmainc").output() {
            if output.status.success() {
                let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let pnmainc_path = PathBuf::from(&path_str);
                // pnmainc is at <install>/bin/lin64/pnmainc — go up 3 levels
                if let Some(install) = pnmainc_path.parent().and_then(|p| p.parent()).and_then(|p| p.parent()) {
                    let ver = install.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| "unknown".to_string());
                    return (ver, Some(install.to_path_buf()));
                }
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

    /// Public accessor for the install directory.
    pub fn install_dir(&self) -> Option<&Path> {
        self.install_dir.as_deref()
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
        _stages: &[String],
        _options: &HashMap<String, String>,
    ) -> BackendResult<String> {
        let ldf = project_dir.join(format!("{}.ldf", top_module));
        Ok(format!(
            r#"# CovertEDA — Diamond Build Script
# Device: {device}
# Top: {top_module}

prj_project open "{ldf}"
prj_run Synthesis -impl impl1 -forceOne
prj_run Translate -impl impl1
prj_run Map -impl impl1
prj_run PAR -impl impl1
prj_run Export -task Bitgen
prj_run Export -task TimingSimFileVer
prj_project close
"#,
            ldf = ldf.display(),
        ))
    }

    fn detect_tool(&self) -> bool {
        self.tool_path().is_some()
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

    fn parse_power_report(&self, _impl_dir: &Path) -> BackendResult<Option<PowerReport>> {
        // Diamond power estimation is not always available
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

    #[test]
    fn test_diamond_build_script_contains_prj_run() {
        let b = DiamondBackend::new();
        let tmp = tempfile::tempdir().unwrap();
        let script = b.generate_build_script(
            tmp.path(), "LCMXO3LF-6900C", "top", &[], &std::collections::HashMap::new(),
        ).unwrap();
        assert!(script.contains("prj_run Synthesis"));
        assert!(script.contains("prj_run Map"));
        assert!(script.contains("prj_run PAR"));
        assert!(script.contains("prj_run Export"));
    }
}
