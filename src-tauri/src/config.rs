use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub tool_paths: ToolPaths,
    pub license_servers: Vec<LicenseServer>,
    pub default_backend: String,
    pub theme: String,
    #[serde(default = "default_scale")]
    pub scale_factor: f64,
    /// Legacy single license file path (kept for backward compat on load)
    #[serde(default)]
    pub license_file: Option<String>,
    /// Cached license file paths keyed by vendor id (e.g. "radiant", "quartus")
    #[serde(default)]
    pub license_files: HashMap<String, String>,
    #[serde(default)]
    pub ai_api_key: Option<String>,
    #[serde(default)]
    pub ai_model: Option<String>,
}

fn default_scale() -> f64 {
    1.2
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolPaths {
    pub diamond: Option<PathBuf>,
    pub radiant: Option<PathBuf>,
    pub quartus: Option<PathBuf>,
    pub vivado: Option<PathBuf>,
    pub yosys: Option<PathBuf>,
    pub nextpnr: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseServer {
    pub vendor: String,
    pub address: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            tool_paths: ToolPaths {
                diamond: None,
                radiant: None,
                quartus: None,
                vivado: None,
                yosys: None,
                nextpnr: None,
            },
            license_servers: vec![],
            default_backend: "diamond".to_string(),
            theme: "dark".to_string(),
            scale_factor: 1.2,
            license_file: None,
            license_files: HashMap::new(),
            ai_api_key: None,
            ai_model: None,
        }
    }
}

impl AppConfig {
    pub fn config_path() -> PathBuf {
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("coverteda")
            .join("config.toml")
    }

    pub fn load() -> Self {
        let path = Self::config_path();
        if path.exists() {
            let content = std::fs::read_to_string(&path).unwrap_or_default();
            toml::from_str(&content).unwrap_or_default()
        } else {
            Self::default()
        }
    }

    pub fn save(&self) -> Result<(), Box<dyn std::error::Error>> {
        let path = Self::config_path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let content = toml::to_string_pretty(self)?;
        std::fs::write(&path, content)?;
        Ok(())
    }
}
