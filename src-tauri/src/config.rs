use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

/// Cached config to avoid re-reading the TOML file on every backend init.
/// Cleared by `invalidate_cache()` after a save.
static CONFIG_CACHE: Mutex<Option<AppConfig>> = Mutex::new(None);

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
    #[serde(default)]
    pub ai_provider: Option<String>,
    #[serde(default)]
    pub ai_base_url: Option<String>,
    /// User-selected tool versions keyed by backend id (e.g. "quartus" -> "25.3")
    #[serde(default)]
    pub selected_versions: HashMap<String, String>,
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
    #[serde(default)]
    pub oss_cad_suite: Option<PathBuf>,
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
                oss_cad_suite: None,
            },
            license_servers: vec![],
            default_backend: "diamond".to_string(),
            theme: "dark".to_string(),
            scale_factor: 1.2,
            license_file: None,
            license_files: HashMap::new(),
            ai_api_key: None,
            ai_model: None,
            ai_provider: None,
            ai_base_url: None,
            selected_versions: HashMap::new(),
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

    /// Load config, using an in-memory cache to avoid redundant file reads.
    /// 7 backends call this during init — the file is read once, cloned 6 times.
    pub fn load() -> Self {
        if let Ok(guard) = CONFIG_CACHE.lock() {
            if let Some(ref cached) = *guard {
                return cached.clone();
            }
        }
        let config = Self::load_from_disk();
        if let Ok(mut guard) = CONFIG_CACHE.lock() {
            *guard = Some(config.clone());
        }
        config
    }

    /// Read config directly from disk, bypassing cache.
    fn load_from_disk() -> Self {
        let path = Self::config_path();
        if path.exists() {
            let content = std::fs::read_to_string(&path).unwrap_or_default();
            toml::from_str(&content).unwrap_or_default()
        } else {
            Self::default()
        }
    }

    /// Invalidate the cache so the next `load()` re-reads from disk.
    pub fn invalidate_cache() {
        if let Ok(mut guard) = CONFIG_CACHE.lock() {
            *guard = None;
        }
    }

    pub fn save(&self) -> Result<(), Box<dyn std::error::Error>> {
        let path = Self::config_path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let content = toml::to_string_pretty(self)?;
        std::fs::write(&path, content)?;
        // Invalidate cache so next load() picks up the saved values
        Self::invalidate_cache();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_config_default() {
        let config = AppConfig::default();
        assert_eq!(config.theme, "dark");
        assert_eq!(config.default_backend, "diamond");
        assert_eq!(config.scale_factor, 1.2);
        assert!(config.license_file.is_none());
        assert!(config.ai_api_key.is_none());
    }

    #[test]
    fn test_app_config_serialization_roundtrip() {
        let config = AppConfig::default();
        let toml_str = toml::to_string_pretty(&config).unwrap();
        let loaded: AppConfig = toml::from_str(&toml_str).unwrap();
        assert_eq!(loaded.theme, config.theme);
        assert_eq!(loaded.default_backend, config.default_backend);
        assert_eq!(loaded.scale_factor, config.scale_factor);
    }
}
