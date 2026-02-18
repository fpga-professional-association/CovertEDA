use crate::backend::{BackendError, BackendResult, FpgaBackend};
use crate::types::*;
use std::collections::HashMap;
use std::path::Path;

/// Intel Quartus Prime backend — drives quartus_sh, quartus_syn, quartus_fit, quartus_sta.
pub struct QuartusBackend {
    version: String,
}

impl QuartusBackend {
    pub fn new() -> Self {
        Self {
            version: "23.1".to_string(),
        }
    }
}

impl FpgaBackend for QuartusBackend {
    fn id(&self) -> &str {
        "quartus"
    }
    fn name(&self) -> &str {
        "Intel Quartus Prime"
    }
    fn short_name(&self) -> &str {
        "Quartus"
    }
    fn version(&self) -> &str {
        &self.version
    }
    fn cli_tool(&self) -> &str {
        "quartus_sh"
    }
    fn default_device(&self) -> &str {
        "5CSEMA5F31C6"
    }
    fn constraint_ext(&self) -> &str {
        ".sdc"
    }

    fn pipeline_stages(&self) -> Vec<PipelineStage> {
        vec![
            PipelineStage {
                id: "analysis".into(),
                label: "Analysis & Elaboration".into(),
                cmd: "quartus_syn --analysis_and_elaboration".into(),
                detail: "HDL parse and elaboration".into(),
            },
            PipelineStage {
                id: "synth".into(),
                label: "Synthesis".into(),
                cmd: "quartus_syn --read_settings_files=on".into(),
                detail: "Map to ALMs".into(),
            },
            PipelineStage {
                id: "fit".into(),
                label: "Fitter".into(),
                cmd: "quartus_fit --read_settings_files=on".into(),
                detail: "Place and route".into(),
            },
            PipelineStage {
                id: "asm".into(),
                label: "Assembler".into(),
                cmd: "quartus_asm".into(),
                detail: "Generate .sof bitstream".into(),
            },
            PipelineStage {
                id: "sta".into(),
                label: "TimeQuest STA".into(),
                cmd: "quartus_sta --sdc_file=timing.sdc".into(),
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
        Ok(format!(
            r#"# CovertEDA — Quartus Build Script
# Device: {device}
# Top: {top_module}

project_open {project_dir}/{top_module}
set_global_assignment -name FAMILY "Cyclone V"
set_global_assignment -name DEVICE {device}
set_global_assignment -name TOP_LEVEL_ENTITY {top_module}

execute_module -tool syn
execute_module -tool fit
execute_module -tool asm
execute_module -tool sta

project_close
"#,
            project_dir = project_dir.display(),
        ))
    }

    fn detect_tool(&self) -> bool {
        which::which("quartus_sh").is_ok()
    }

    fn parse_timing_report(&self, impl_dir: &Path) -> BackendResult<TimingReport> {
        let sta_rpt = impl_dir.join("output_files").join("top_level.sta.rpt");
        if !sta_rpt.exists() {
            return Err(BackendError::ReportNotFound(sta_rpt.display().to_string()));
        }
        let content = std::fs::read_to_string(&sta_rpt)?;
        crate::parser::timing::parse_quartus_timing(&content)
    }

    fn parse_utilization_report(&self, impl_dir: &Path) -> BackendResult<ResourceReport> {
        let fit_rpt = impl_dir.join("output_files").join("top_level.fit.rpt");
        if !fit_rpt.exists() {
            return Err(BackendError::ReportNotFound(fit_rpt.display().to_string()));
        }
        let content = std::fs::read_to_string(&fit_rpt)?;
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
        let content = crate::parser::constraints::write_sdc(constraints);
        std::fs::write(output_file, content)?;
        Ok(())
    }
}
