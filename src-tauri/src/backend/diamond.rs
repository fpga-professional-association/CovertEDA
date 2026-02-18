use crate::backend::{BackendResult, FpgaBackend, BackendError};
use crate::types::*;
use std::collections::HashMap;
use std::path::Path;

/// Lattice Diamond backend — drives pnmainc (TCL shell) for MachXO3/ECP5 families.
pub struct DiamondBackend {
    version: String,
}

impl DiamondBackend {
    pub fn new() -> Self {
        Self {
            version: "3.13".to_string(),
        }
    }

    /// Platform-specific path to pnmainc
    fn tool_path(&self) -> std::path::PathBuf {
        if cfg!(target_os = "windows") {
            // C:\lscc\diamond\<ver>\bin\nt64\pnmainc.exe
            std::path::PathBuf::from(format!(
                r"C:\lscc\diamond\{}\bin\nt64\pnmainc.exe",
                self.version
            ))
        } else {
            // /usr/local/diamond/<ver>/bin/lin64/pnmainc
            std::path::PathBuf::from(format!(
                "/usr/local/diamond/{}/bin/lin64/pnmainc",
                self.version
            ))
        }
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
        self.tool_path().exists()
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
