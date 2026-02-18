use crate::backend::{BackendError, BackendResult, FpgaBackend};
use crate::types::*;
use std::collections::HashMap;
use std::path::Path;

/// Open-source CAD suite backend — Yosys + nextpnr + ecppack.
pub struct OssBackend {
    version: String,
}

impl OssBackend {
    pub fn new() -> Self {
        Self {
            version: "yosys 0.40".to_string(),
        }
    }
}

impl FpgaBackend for OssBackend {
    fn id(&self) -> &str {
        "opensource"
    }
    fn name(&self) -> &str {
        "OSS CAD Suite"
    }
    fn short_name(&self) -> &str {
        "OSS"
    }
    fn version(&self) -> &str {
        &self.version
    }
    fn cli_tool(&self) -> &str {
        "yosys"
    }
    fn default_device(&self) -> &str {
        "LFE5U-85F-6BG381C"
    }
    fn constraint_ext(&self) -> &str {
        ".lpf"
    }

    fn pipeline_stages(&self) -> Vec<PipelineStage> {
        vec![
            PipelineStage {
                id: "synth".into(),
                label: "Yosys Synthesis".into(),
                cmd: "yosys -p 'synth_ecp5 -json out.json' *.v".into(),
                detail: "Open-source synthesis".into(),
            },
            PipelineStage {
                id: "pnr".into(),
                label: "nextpnr Place & Route".into(),
                cmd: "nextpnr-ecp5 --85k --json out.json --lpf pins.lpf".into(),
                detail: "Open-source place and route".into(),
            },
            PipelineStage {
                id: "pack".into(),
                label: "ecppack Bitstream".into(),
                cmd: "ecppack --compress out.config --bit out.bit".into(),
                detail: "Pack bitstream".into(),
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
        let family = if device.starts_with("LFE5U") {
            "ecp5"
        } else {
            "ecp5"
        };
        let size = "85k"; // TODO: extract from device string

        Ok(format!(
            r#"#!/bin/bash
# CovertEDA — OSS CAD Build Script
# Device: {device}
# Top: {top_module}
set -e

cd {project_dir}

echo "=== Yosys Synthesis ==="
yosys -p "synth_{family} -top {top_module} -json build/out.json" src/*.v src/*.sv

echo "=== nextpnr Place & Route ==="
nextpnr-{family} --{size} \
    --json build/out.json \
    --lpf constraints/pins.lpf \
    --textcfg build/out.config \
    --report build/report.json

echo "=== ecppack Bitstream ==="
ecppack --compress build/out.config --bit build/out.bit

echo "=== Done ==="
"#,
            project_dir = project_dir.display(),
        ))
    }

    fn detect_tool(&self) -> bool {
        which::which("yosys").is_ok()
    }

    fn parse_timing_report(&self, impl_dir: &Path) -> BackendResult<TimingReport> {
        let report = impl_dir.join("build").join("report.json");
        if !report.exists() {
            return Err(BackendError::ReportNotFound(report.display().to_string()));
        }
        let content = std::fs::read_to_string(&report)?;
        crate::parser::timing::parse_nextpnr_timing(&content)
    }

    fn parse_utilization_report(&self, impl_dir: &Path) -> BackendResult<ResourceReport> {
        let report = impl_dir.join("build").join("report.json");
        if !report.exists() {
            return Err(BackendError::ReportNotFound(report.display().to_string()));
        }
        let content = std::fs::read_to_string(&report)?;
        crate::parser::utilization::parse_nextpnr_utilization(&content, self.default_device())
    }

    fn parse_power_report(&self, _impl_dir: &Path) -> BackendResult<Option<PowerReport>> {
        // OSS tools don't produce power reports
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
        // OSS uses LPF or PCF format
        if constraint_file
            .extension()
            .is_some_and(|ext| ext == "pcf")
        {
            crate::parser::constraints::parse_pcf(&content)
        } else {
            crate::parser::constraints::parse_lpf(&content)
        }
    }

    fn write_constraints(
        &self,
        constraints: &[PinConstraint],
        output_file: &Path,
    ) -> BackendResult<()> {
        let content = if output_file
            .extension()
            .is_some_and(|ext| ext == "pcf")
        {
            crate::parser::constraints::write_pcf(constraints)
        } else {
            crate::parser::constraints::write_lpf(constraints)
        };
        std::fs::write(output_file, content)?;
        Ok(())
    }
}
