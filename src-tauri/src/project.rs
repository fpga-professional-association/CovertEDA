use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

const PROJECT_FILE: &str = ".coverteda";
const RECENT_FILE: &str = "recent.json";

// ── Project Config (.coverteda file in project root) ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfig {
    pub name: String,
    pub backend_id: String,
    pub device: String,
    pub top_module: String,
    pub source_patterns: Vec<String>,
    pub constraint_files: Vec<String>,
    pub impl_dir: String,
    #[serde(default)]
    pub backend_config: HashMap<String, String>,
    pub created_at: String,
    pub updated_at: String,
}

impl ProjectConfig {
    pub fn new_with_defaults(
        name: &str,
        backend_id: &str,
        device: &str,
        top_module: &str,
    ) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        let (source_patterns, constraint_files, impl_dir) = match backend_id {
            "diamond" => (
                vec!["src/**/*.v".into(), "src/**/*.sv".into()],
                vec!["constraints/*.lpf".into()],
                "impl1".to_string(),
            ),
            "quartus" => (
                vec!["src/**/*.v".into(), "src/**/*.sv".into()],
                vec!["constraints/*.sdc".into()],
                "output_files".to_string(),
            ),
            "vivado" => (
                vec!["src/**/*.v".into(), "src/**/*.sv".into()],
                vec!["constraints/*.xdc".into()],
                "runs".to_string(),
            ),
            "radiant" => (
                vec![
                    "source/**/*.v".into(),
                    "source/**/*.sv".into(),
                    "source/**/*.vhd".into(),
                ],
                vec!["source/*.pdc".into(), "source/*.sdc".into()],
                "impl1".to_string(),
            ),
            "opensource" => (
                vec!["src/**/*.v".into(), "src/**/*.sv".into()],
                vec!["constraints/*.lpf".into(), "constraints/*.pcf".into()],
                "build".to_string(),
            ),
            _ => (
                vec!["src/**/*.v".into(), "src/**/*.sv".into()],
                vec![],
                "build".to_string(),
            ),
        };

        Self {
            name: name.to_string(),
            backend_id: backend_id.to_string(),
            device: device.to_string(),
            top_module: top_module.to_string(),
            source_patterns,
            constraint_files,
            impl_dir,
            backend_config: HashMap::new(),
            created_at: now.clone(),
            updated_at: now,
        }
    }

    pub fn load(project_dir: &Path) -> Result<Self, String> {
        let path = project_dir.join(PROJECT_FILE);
        let content = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse {}: {}", path.display(), e))
    }

    pub fn save(&mut self, project_dir: &Path) -> Result<(), String> {
        self.updated_at = chrono::Utc::now().to_rfc3339();
        let path = project_dir.join(PROJECT_FILE);
        let content = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize project config: {}", e))?;
        std::fs::write(&path, content)
            .map_err(|e| format!("Failed to write {}: {}", path.display(), e))
    }

    pub fn exists(project_dir: &Path) -> bool {
        project_dir.join(PROJECT_FILE).exists()
    }
}

// ── Recent Projects List (persisted in user config dir) ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentProject {
    pub path: String,
    pub name: String,
    pub backend_id: String,
    pub device: String,
    pub last_opened: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RecentProjectsList {
    pub projects: Vec<RecentProject>,
}

impl RecentProjectsList {
    fn file_path() -> PathBuf {
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("coverteda")
            .join(RECENT_FILE)
    }

    pub fn load() -> Self {
        let path = Self::file_path();
        if path.exists() {
            let content = std::fs::read_to_string(&path).unwrap_or_default();
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            Self::default()
        }
    }

    pub fn save(&self) -> Result<(), String> {
        let path = Self::file_path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create config dir: {}", e))?;
        }
        let content = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize recents: {}", e))?;
        std::fs::write(&path, content)
            .map_err(|e| format!("Failed to write recents: {}", e))
    }

    pub fn add(&mut self, project_dir: &Path, config: &ProjectConfig) {
        let path_str = project_dir.to_string_lossy().to_string();
        self.projects.retain(|p| p.path != path_str);
        self.projects.insert(
            0,
            RecentProject {
                path: path_str,
                name: config.name.clone(),
                backend_id: config.backend_id.clone(),
                device: config.device.clone(),
                last_opened: chrono::Utc::now().to_rfc3339(),
            },
        );
        // Keep at most 20 recent projects
        self.projects.truncate(20);
    }

    pub fn remove(&mut self, path: &str) {
        self.projects.retain(|p| p.path != path);
    }

    pub fn prune(&mut self) {
        self.projects.retain(|p| Path::new(&p.path).exists());
    }
}
