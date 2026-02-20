use crate::backend::{BackendError, BackendResult, FpgaBackend};
use crate::types::*;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Open-source CAD suite backend — Yosys + nextpnr + ecppack.
pub struct OssBackend {
    version: String,
    install_dir: Option<PathBuf>,
}

impl OssBackend {
    pub fn new() -> Self {
        let (version, install_dir) = Self::detect_installation();
        Self {
            version,
            install_dir,
        }
    }

    /// Get the installation directory.
    pub fn install_dir(&self) -> Option<&Path> {
        self.install_dir.as_deref()
    }

    /// Full path to yosys binary, if install_dir is known.
    pub fn yosys_path(&self) -> Option<PathBuf> {
        let dir = self.install_dir.as_ref()?;
        let p = dir.join("bin").join("yosys");
        if p.exists() { Some(p) } else { None }
    }

    /// Full path to nextpnr-ecp5 binary, if install_dir is known.
    pub fn nextpnr_ecp5_path(&self) -> Option<PathBuf> {
        let dir = self.install_dir.as_ref()?;
        let p = dir.join("bin").join("nextpnr-ecp5");
        if p.exists() { Some(p) } else { None }
    }

    /// Full path to ecppack binary, if install_dir is known.
    pub fn ecppack_path(&self) -> Option<PathBuf> {
        let dir = self.install_dir.as_ref()?;
        let p = dir.join("bin").join("ecppack");
        if p.exists() { Some(p) } else { None }
    }

    /// Detect OSS CAD Suite installation. Priority:
    /// 1. Config `tool_paths.oss_cad_suite`
    /// 2. Legacy config `tool_paths.yosys` (backward compat — trace to root)
    /// 3. `which::which("yosys")` — trace parent dirs to find root
    /// 4. Scan common installation locations
    /// 5. Scan $HOME subdirectories matching fpga/cad/eda keywords
    fn detect_installation() -> (String, Option<PathBuf>) {
        let config = crate::config::AppConfig::load();

        // 1. Explicit oss_cad_suite config path
        if let Some(ref configured) = config.tool_paths.oss_cad_suite {
            if let Some(root) = Self::normalize_to_root(configured) {
                let version = Self::read_version(&root);
                return (version, Some(root));
            }
        }

        // 2. Legacy yosys path — trace upward to find oss-cad-suite root
        if let Some(ref yosys_path) = config.tool_paths.yosys {
            if let Some(root) = Self::trace_to_root(yosys_path) {
                let version = Self::read_version(&root);
                return (version, Some(root));
            }
        }

        // 3. which::which("yosys") — trace to root
        if let Ok(yosys_bin) = which::which("yosys") {
            if let Some(root) = Self::trace_to_root(&yosys_bin) {
                let version = Self::read_version(&root);
                return (version, Some(root));
            }
        }

        // 4. Common installation locations
        let home = dirs::home_dir();
        let mut candidates: Vec<PathBuf> = vec![
            PathBuf::from("/opt/oss-cad-suite"),
            PathBuf::from("/usr/local/oss-cad-suite"),
        ];
        if let Some(ref h) = home {
            candidates.push(h.join("oss-cad-suite"));
            candidates.push(h.join(".local").join("share").join("oss-cad-suite"));
        }
        for candidate in &candidates {
            if Self::is_oss_root(candidate) {
                let version = Self::read_version(candidate);
                return (version, Some(candidate.clone()));
            }
        }

        // 5. Scan $HOME subdirectories matching fpga/cad/eda (up to 3 levels)
        if let Some(ref h) = home {
            if let Some(root) = Self::scan_home_dirs(h) {
                let version = Self::read_version(&root);
                return (version, Some(root));
            }
        }

        // Nothing found — fall back to bare PATH check for version
        let version = Self::detect_version_from_path();
        (version, None)
    }

    /// Check if a directory is an OSS CAD Suite root.
    /// Fingerprint: has `environment` file AND `bin/yosys`.
    fn is_oss_root(dir: &Path) -> bool {
        dir.join("environment").is_file() && dir.join("bin").join("yosys").exists()
    }

    /// Normalize a user-provided path to the oss-cad-suite root.
    /// Handles user pointing at either the root or the bin/ directory.
    fn normalize_to_root(path: &Path) -> Option<PathBuf> {
        // Direct root
        if Self::is_oss_root(path) {
            return Some(path.to_path_buf());
        }
        // User pointed at bin/ directory
        if path.ends_with("bin") {
            if let Some(parent) = path.parent() {
                if Self::is_oss_root(parent) {
                    return Some(parent.to_path_buf());
                }
            }
        }
        // User pointed at a binary inside bin/
        if let Some(parent) = path.parent() {
            if parent.ends_with("bin") {
                if let Some(root) = parent.parent() {
                    if Self::is_oss_root(root) {
                        return Some(root.to_path_buf());
                    }
                }
            }
        }
        None
    }

    /// Given a path to a binary (e.g., yosys), trace parent directories
    /// upward to find an oss-cad-suite root.
    fn trace_to_root(binary_path: &Path) -> Option<PathBuf> {
        let mut current = binary_path.to_path_buf();
        // Walk up at most 5 levels
        for _ in 0..5 {
            current = current.parent()?.to_path_buf();
            if Self::is_oss_root(&current) {
                return Some(current);
            }
        }
        None
    }

    /// Scan $HOME subdirectories for oss-cad-suite directories.
    /// Looks for directories matching fpga/cad/eda (case-insensitive), up to 3 levels.
    fn scan_home_dirs(home: &Path) -> Option<PathBuf> {
        Self::scan_for_oss_recursive(home, 0, 3)
    }

    fn scan_for_oss_recursive(dir: &Path, depth: u32, max_depth: u32) -> Option<PathBuf> {
        if depth >= max_depth {
            return None;
        }
        let entries = std::fs::read_dir(dir).ok()?;
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_lowercase();
            // Skip hidden directories and common non-relevant ones
            if name.starts_with('.') {
                continue;
            }
            // Check if this IS an oss-cad-suite directory
            if name.contains("oss-cad-suite") || name.contains("oss_cad_suite") {
                if Self::is_oss_root(&path) {
                    return Some(path);
                }
            }
            // Recurse into directories that look FPGA/EDA-related
            if depth < max_depth - 1
                && (name.contains("fpga")
                    || name.contains("cad")
                    || name.contains("eda")
                    || name.contains("reverse_engineering")
                    || name.contains("tools")
                    || name.contains("electronics"))
            {
                if let Some(found) = Self::scan_for_oss_recursive(&path, depth + 1, max_depth) {
                    return Some(found);
                }
            }
        }
        None
    }

    /// Read version from the VERSION file in the install dir, or fall back to yosys --version.
    fn read_version(root: &Path) -> String {
        // Try VERSION file first
        let version_file = root.join("VERSION");
        if let Ok(content) = std::fs::read_to_string(&version_file) {
            let trimmed = content.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
        // Fall back to yosys --version
        let yosys = root.join("bin").join("yosys");
        if yosys.exists() {
            if let Ok(output) = std::process::Command::new(&yosys).arg("--version").output() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let trimmed = stdout.trim();
                if !trimmed.is_empty() {
                    return trimmed.to_string();
                }
            }
        }
        "unknown".to_string()
    }

    /// Try to get version string from yosys on PATH (no install dir known).
    fn detect_version_from_path() -> String {
        if let Ok(yosys) = which::which("yosys") {
            if let Ok(output) = std::process::Command::new(&yosys).arg("--version").output() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let trimmed = stdout.trim();
                if !trimmed.is_empty() {
                    return trimmed.to_string();
                }
            }
        }
        "unknown".to_string()
    }

    /// Resolve the full path for a tool binary. Uses install_dir if available,
    /// otherwise returns bare name for PATH lookup.
    fn resolve_tool(&self, name: &str) -> String {
        if let Some(ref dir) = self.install_dir {
            let full = dir.join("bin").join(name);
            if full.exists() {
                return full.display().to_string();
            }
        }
        name.to_string()
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
        "bash"
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

        let yosys = self.resolve_tool("yosys");
        let nextpnr = self.resolve_tool(&format!("nextpnr-{}", family));
        let ecppack = self.resolve_tool("ecppack");

        // If we have an install dir, source the environment script for proper LD_LIBRARY_PATH etc.
        let source_env = if let Some(ref dir) = self.install_dir {
            let env_file = dir.join("environment");
            if env_file.exists() {
                format!("source \"{}\"\n\n", env_file.display())
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        Ok(format!(
            r#"#!/bin/bash
# CovertEDA — OSS CAD Build Script
# Device: {device}
# Top: {top_module}
set -e

{source_env}cd {project_dir}

echo "=== Yosys Synthesis ==="
{yosys} -p "synth_{family} -top {top_module} -json build/out.json" src/*.v src/*.sv

echo "=== nextpnr Place & Route ==="
{nextpnr} --{size} \
    --json build/out.json \
    --lpf constraints/pins.lpf \
    --textcfg build/out.config \
    --report build/report.json

echo "=== ecppack Bitstream ==="
{ecppack} --compress build/out.config --bit build/out.bit

echo "=== Done ==="
"#,
            project_dir = project_dir.display(),
        ))
    }

    fn detect_tool(&self) -> bool {
        // Check installed path first, then fall back to PATH
        if self.yosys_path().is_some() {
            return true;
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_oss_id_and_name() {
        let b = OssBackend {
            version: "test".to_string(),
            install_dir: None,
        };
        assert_eq!(b.id(), "opensource");
        assert_eq!(b.name(), "OSS CAD Suite");
    }

    #[test]
    fn test_oss_cli_tool_is_bash() {
        let b = OssBackend {
            version: "test".to_string(),
            install_dir: None,
        };
        assert_eq!(b.cli_tool(), "bash");
    }

    #[test]
    fn test_oss_pipeline_has_three_stages() {
        let b = OssBackend {
            version: "test".to_string(),
            install_dir: None,
        };
        let stages = b.pipeline_stages();
        assert_eq!(stages.len(), 3);
        assert_eq!(stages[0].id, "synth");
        assert_eq!(stages[1].id, "pnr");
        assert_eq!(stages[2].id, "pack");
    }

    #[test]
    fn test_oss_build_script_is_bash() {
        let b = OssBackend {
            version: "test".to_string(),
            install_dir: None,
        };
        let tmp = tempfile::tempdir().unwrap();
        let script = b.generate_build_script(
            tmp.path(), "LFE5U-85F", "top", &[], &std::collections::HashMap::new(),
        ).unwrap();
        assert!(script.starts_with("#!/bin/bash"));
    }

    #[test]
    fn test_oss_build_script_contains_tools() {
        let b = OssBackend {
            version: "test".to_string(),
            install_dir: None,
        };
        let tmp = tempfile::tempdir().unwrap();
        let script = b.generate_build_script(
            tmp.path(), "LFE5U-85F", "top", &[], &std::collections::HashMap::new(),
        ).unwrap();
        assert!(script.contains("yosys"));
        assert!(script.contains("nextpnr"));
        assert!(script.contains("ecppack"));
    }

    #[test]
    fn test_oss_build_script_uses_full_paths_when_installed() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        // Create fake oss-cad-suite structure
        std::fs::create_dir_all(root.join("bin")).unwrap();
        std::fs::write(root.join("environment"), "# env\n").unwrap();
        std::fs::write(root.join("bin").join("yosys"), "").unwrap();
        std::fs::write(root.join("bin").join("nextpnr-ecp5"), "").unwrap();
        std::fs::write(root.join("bin").join("ecppack"), "").unwrap();

        let b = OssBackend {
            version: "test".to_string(),
            install_dir: Some(root.to_path_buf()),
        };
        let project_tmp = tempfile::tempdir().unwrap();
        let script = b.generate_build_script(
            project_tmp.path(), "LFE5U-85F", "top", &[], &HashMap::new(),
        ).unwrap();
        // Should contain full paths
        assert!(script.contains(&root.join("bin").join("yosys").display().to_string()));
        assert!(script.contains(&root.join("bin").join("nextpnr-ecp5").display().to_string()));
        assert!(script.contains(&root.join("bin").join("ecppack").display().to_string()));
        // Should source the environment file
        assert!(script.contains("source"));
        assert!(script.contains("environment"));
    }

    #[test]
    fn test_is_oss_root() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        // Not a root yet
        assert!(!OssBackend::is_oss_root(root));
        // Add environment file but no bin/yosys
        std::fs::write(root.join("environment"), "# env\n").unwrap();
        assert!(!OssBackend::is_oss_root(root));
        // Add bin/yosys
        std::fs::create_dir_all(root.join("bin")).unwrap();
        std::fs::write(root.join("bin").join("yosys"), "").unwrap();
        assert!(OssBackend::is_oss_root(root));
    }

    #[test]
    fn test_normalize_to_root_direct() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        std::fs::create_dir_all(root.join("bin")).unwrap();
        std::fs::write(root.join("environment"), "").unwrap();
        std::fs::write(root.join("bin").join("yosys"), "").unwrap();

        let result = OssBackend::normalize_to_root(root);
        assert_eq!(result, Some(root.to_path_buf()));
    }

    #[test]
    fn test_normalize_to_root_from_bin() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        std::fs::create_dir_all(root.join("bin")).unwrap();
        std::fs::write(root.join("environment"), "").unwrap();
        std::fs::write(root.join("bin").join("yosys"), "").unwrap();

        let bin_dir = root.join("bin");
        let result = OssBackend::normalize_to_root(&bin_dir);
        assert_eq!(result, Some(root.to_path_buf()));
    }

    #[test]
    fn test_normalize_to_root_from_binary() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        std::fs::create_dir_all(root.join("bin")).unwrap();
        std::fs::write(root.join("environment"), "").unwrap();
        std::fs::write(root.join("bin").join("yosys"), "").unwrap();

        let yosys_path = root.join("bin").join("yosys");
        let result = OssBackend::normalize_to_root(&yosys_path);
        assert_eq!(result, Some(root.to_path_buf()));
    }

    #[test]
    fn test_trace_to_root() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("oss-cad-suite");
        std::fs::create_dir_all(root.join("bin")).unwrap();
        std::fs::write(root.join("environment"), "").unwrap();
        std::fs::write(root.join("bin").join("yosys"), "").unwrap();

        let yosys_path = root.join("bin").join("yosys");
        let result = OssBackend::trace_to_root(&yosys_path);
        assert_eq!(result, Some(root));
    }

    #[test]
    fn test_read_version_from_file() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        std::fs::create_dir_all(root.join("bin")).unwrap();
        std::fs::write(root.join("environment"), "").unwrap();
        std::fs::write(root.join("bin").join("yosys"), "").unwrap();
        std::fs::write(root.join("VERSION"), "2024-02-15").unwrap();

        let version = OssBackend::read_version(root);
        assert_eq!(version, "2024-02-15");
    }

    #[test]
    fn test_install_dir_accessors() {
        let b = OssBackend {
            version: "test".to_string(),
            install_dir: Some(PathBuf::from("/opt/oss-cad-suite")),
        };
        assert_eq!(b.install_dir(), Some(Path::new("/opt/oss-cad-suite")));

        let b2 = OssBackend {
            version: "test".to_string(),
            install_dir: None,
        };
        assert!(b2.install_dir().is_none());
    }
}
