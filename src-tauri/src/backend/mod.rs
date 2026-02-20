pub mod diamond;
pub mod oss;
pub mod quartus;
pub mod radiant;
pub mod vivado;

use crate::types::*;
use std::collections::HashMap;
use std::path::Path;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum BackendError {
    #[error("Tool not found: {0}")]
    ToolNotFound(String),
    #[error("Build failed at stage '{stage}': {message}")]
    BuildFailed { stage: String, message: String },
    #[error("Report not found: {0}")]
    ReportNotFound(String),
    #[error("Parse error: {0}")]
    ParseError(String),
    #[error("Configuration error: {0}")]
    ConfigError(String),
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
}

pub type BackendResult<T> = Result<T, BackendError>;

/// Core trait that every FPGA vendor backend must implement.
/// CovertEDA never runs synthesis/PnR itself — it generates TCL/shell scripts
/// and spawns vendor CLIs as subprocesses.
pub trait FpgaBackend: Send + Sync {
    /// Backend identifier (e.g., "diamond", "quartus", "vivado", "opensource")
    fn id(&self) -> &str;

    /// Human-readable name
    fn name(&self) -> &str;

    /// Short display name
    fn short_name(&self) -> &str;

    /// Version string of the detected vendor tool
    fn version(&self) -> &str;

    /// CLI executable name
    fn cli_tool(&self) -> &str;

    /// Default device string
    fn default_device(&self) -> &str;

    /// Constraint file extension
    fn constraint_ext(&self) -> &str;

    /// Ordered list of build pipeline stages
    fn pipeline_stages(&self) -> Vec<PipelineStage>;

    /// Generate the build script content (TCL or shell).
    /// `stages` selects which pipeline stages to run (empty = all).
    /// `options` passes backend-specific build options (e.g. frequency, optimization).
    fn generate_build_script(
        &self,
        project_dir: &Path,
        device: &str,
        top_module: &str,
        stages: &[String],
        options: &HashMap<String, String>,
    ) -> BackendResult<String>;

    /// Check if the vendor tool is installed and available on this system
    fn detect_tool(&self) -> bool;

    /// Parse a timing report from the implementation directory
    fn parse_timing_report(&self, impl_dir: &Path) -> BackendResult<TimingReport>;

    /// Parse a resource utilization report
    fn parse_utilization_report(&self, impl_dir: &Path) -> BackendResult<ResourceReport>;

    /// Parse a power report (optional — not all backends produce one)
    fn parse_power_report(&self, impl_dir: &Path) -> BackendResult<Option<PowerReport>>;

    /// Parse DRC results
    fn parse_drc_report(&self, impl_dir: &Path) -> BackendResult<Option<DrcReport>>;

    /// Read pin constraints from a constraint file
    fn read_constraints(&self, constraint_file: &Path) -> BackendResult<Vec<PinConstraint>>;

    /// Write pin constraints to a constraint file
    fn write_constraints(
        &self,
        constraints: &[PinConstraint],
        output_file: &Path,
    ) -> BackendResult<()>;

    /// Generate a TCL/shell script to create and configure an IP core.
    /// Returns the script content and the expected output directory.
    /// `ip_name` is the vendor IP component name (e.g., "FIFO_DC", "altsyncram").
    /// `instance_name` is the user-chosen instance name.
    /// `params` maps parameter keys to values.
    fn generate_ip_script(
        &self,
        project_dir: &Path,
        device: &str,
        ip_name: &str,
        instance_name: &str,
        params: &HashMap<String, String>,
    ) -> BackendResult<(String, String)> {
        let _ = (project_dir, device, ip_name, instance_name, params);
        Err(BackendError::ConfigError(format!(
            "IP generation not supported for {} backend",
            self.name()
        )))
    }

    /// Get backend info for the frontend
    fn info(&self) -> BackendInfo {
        BackendInfo {
            id: self.id().to_string(),
            name: self.name().to_string(),
            short: self.short_name().to_string(),
            version: self.version().to_string(),
            cli: self.cli_tool().to_string(),
            default_device: self.default_device().to_string(),
            constraint_ext: self.constraint_ext().to_string(),
            pipeline: self.pipeline_stages(),
            available: self.detect_tool(),
        }
    }
}

/// Registry of all available backends
pub struct BackendRegistry {
    backends: Vec<Box<dyn FpgaBackend>>,
    active_idx: usize,
}

impl BackendRegistry {
    pub fn new() -> Self {
        Self {
            backends: vec![
                Box::new(diamond::DiamondBackend::new()),
                Box::new(radiant::RadiantBackend::new()),
                Box::new(quartus::QuartusBackend::new()),
                Box::new(vivado::VivadoBackend::new()),
                Box::new(oss::OssBackend::new()),
            ],
            active_idx: 0,
        }
    }

    pub fn active(&self) -> &dyn FpgaBackend {
        self.backends[self.active_idx].as_ref()
    }

    pub fn switch(&mut self, id: &str) -> bool {
        if let Some(idx) = self.backends.iter().position(|b| b.id() == id) {
            self.active_idx = idx;
            true
        } else {
            false
        }
    }

    pub fn list(&self) -> Vec<BackendInfo> {
        self.backends.iter().map(|b| b.info()).collect()
    }

    pub fn active_id(&self) -> &str {
        self.backends[self.active_idx].id()
    }

    pub fn get(&self, id: &str) -> Option<&dyn FpgaBackend> {
        self.backends
            .iter()
            .find(|b| b.id() == id)
            .map(|b| b.as_ref())
    }
}

impl Default for BackendRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_registry_new_has_five_backends() {
        let reg = BackendRegistry::new();
        assert_eq!(reg.list().len(), 5);
    }

    #[test]
    fn test_registry_default_active_is_diamond() {
        let reg = BackendRegistry::new();
        assert_eq!(reg.active_id(), "diamond");
    }

    #[test]
    fn test_registry_switch_to_radiant() {
        let mut reg = BackendRegistry::new();
        assert!(reg.switch("radiant"));
        assert_eq!(reg.active_id(), "radiant");
    }

    #[test]
    fn test_registry_switch_to_quartus() {
        let mut reg = BackendRegistry::new();
        assert!(reg.switch("quartus"));
        assert_eq!(reg.active_id(), "quartus");
    }

    #[test]
    fn test_registry_switch_invalid() {
        let mut reg = BackendRegistry::new();
        assert!(!reg.switch("nonexistent"));
        assert_eq!(reg.active_id(), "diamond");
    }

    #[test]
    fn test_registry_get_known_backend() {
        let reg = BackendRegistry::new();
        assert!(reg.get("vivado").is_some());
        assert_eq!(reg.get("vivado").unwrap().id(), "vivado");
    }

    #[test]
    fn test_registry_get_unknown_backend() {
        let reg = BackendRegistry::new();
        assert!(reg.get("nonexistent").is_none());
    }

    #[test]
    fn test_registry_list_contains_all_ids() {
        let reg = BackendRegistry::new();
        let ids: Vec<String> = reg.list().iter().map(|b| b.id.clone()).collect();
        assert!(ids.contains(&"diamond".to_string()));
        assert!(ids.contains(&"radiant".to_string()));
        assert!(ids.contains(&"quartus".to_string()));
        assert!(ids.contains(&"vivado".to_string()));
        assert!(ids.contains(&"opensource".to_string()));
    }

    #[test]
    fn test_backend_info_fields_nonempty() {
        let reg = BackendRegistry::new();
        for info in reg.list() {
            assert!(!info.id.is_empty(), "id empty for {}", info.name);
            assert!(!info.name.is_empty(), "name empty for {}", info.id);
            assert!(!info.short.is_empty(), "short empty for {}", info.id);
            assert!(!info.cli.is_empty(), "cli empty for {}", info.id);
            assert!(!info.pipeline.is_empty(), "pipeline empty for {}", info.id);
        }
    }
}
