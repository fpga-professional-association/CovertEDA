use crate::backend::{BackendError, BackendResult, FpgaBackend};
use crate::types::*;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// AMD Vivado backend — drives vivado in batch/TCL mode.
pub struct VivadoBackend {
    version: String,
    install_dir: Option<PathBuf>,
}

impl VivadoBackend {
    pub fn new() -> Self {
        let (version, install_dir) = Self::detect_installation();
        Self {
            version,
            install_dir,
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

    fn detect_installation() -> (String, Option<PathBuf>) {
        let config = crate::config::AppConfig::load();

        // 1. User-configured path
        if let Some(ref configured) = config.tool_paths.vivado {
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
            }
        }

        // 2. Scan known directories
        // Vivado installs to <base>/Vivado/<version>/ (note capital V)
        let candidates: Vec<PathBuf> = if cfg!(target_os = "windows") {
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

        for base in &candidates {
            if let Some((ver, install)) = Self::scan_version_dirs(base) {
                return (ver, Some(install));
            }
        }

        // 3. Fallback: which vivado
        if let Ok(output) = std::process::Command::new("which").arg("vivado").output() {
            if output.status.success() {
                let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let bin_path = PathBuf::from(&path_str);
                // vivado is at <install>/bin/vivado — go up 2 levels
                if let Some(install) = bin_path.parent().and_then(|p| p.parent()) {
                    let ver = install.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| "unknown".to_string());
                    return (ver, Some(install.to_path_buf()));
                }
            }
        }

        ("unknown".to_string(), None)
    }

    /// Public accessor for the install directory.
    pub fn install_dir(&self) -> Option<&Path> {
        self.install_dir.as_deref()
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
        _options: &HashMap<String, String>,
    ) -> BackendResult<String> {
        Ok(format!(
            r#"# CovertEDA — Vivado Build Script
# Device: {device}
# Top: {top_module}

open_project {project_dir}/{top_module}.xpr

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
            project_dir = project_dir.display(),
        ))
    }

    fn detect_tool(&self) -> bool {
        self.install_dir.is_some() || which::which("vivado").is_ok()
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
}
