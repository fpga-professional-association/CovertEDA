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
    #[serde(default)]
    pub description: Option<String>,
    pub backend_id: String,
    pub device: String,
    pub top_module: String,
    pub source_patterns: Vec<String>,
    pub constraint_files: Vec<String>,
    pub impl_dir: String,
    #[serde(default)]
    pub backend_config: HashMap<String, String>,
    #[serde(default)]
    pub build_stages: Vec<String>,
    #[serde(default)]
    pub build_options: HashMap<String, String>,
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
        Self::new_with_options(name, backend_id, device, top_module, None, None)
    }

    pub fn new_with_options(
        name: &str,
        backend_id: &str,
        device: &str,
        top_module: &str,
        custom_source_patterns: Option<Vec<String>>,
        custom_constraint_files: Option<Vec<String>>,
    ) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        let (default_source_patterns, default_constraint_files, impl_dir) = match backend_id {
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

        let source_patterns = custom_source_patterns.unwrap_or(default_source_patterns);
        let constraint_files = custom_constraint_files.unwrap_or(default_constraint_files);

        Self {
            name: name.to_string(),
            description: None,
            backend_id: backend_id.to_string(),
            device: device.to_string(),
            top_module: top_module.to_string(),
            source_patterns,
            constraint_files,
            impl_dir,
            backend_config: HashMap::new(),
            build_stages: Vec::new(),
            build_options: HashMap::new(),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_project_config_new_with_defaults_diamond() {
        let c = ProjectConfig::new_with_defaults("test", "diamond", "LCMXO3", "top");
        assert_eq!(c.impl_dir, "impl1");
        assert!(c.source_patterns.iter().any(|p| p.contains("*.v")));
        assert!(c.constraint_files.iter().any(|p| p.contains("*.lpf")));
    }

    #[test]
    fn test_project_config_new_with_defaults_quartus() {
        let c = ProjectConfig::new_with_defaults("test", "quartus", "10CX220", "top");
        assert_eq!(c.impl_dir, "output_files");
        assert!(c.constraint_files.iter().any(|p| p.contains("*.sdc")));
    }

    #[test]
    fn test_project_config_new_with_defaults_radiant() {
        let c = ProjectConfig::new_with_defaults("test", "radiant", "LIFCL-40", "top");
        assert_eq!(c.impl_dir, "impl1");
        assert!(c.source_patterns.iter().any(|p| p.contains("source/")));
    }

    #[test]
    fn test_project_config_new_with_defaults_vivado() {
        let c = ProjectConfig::new_with_defaults("test", "vivado", "xc7a100t", "top");
        assert_eq!(c.impl_dir, "runs");
        assert!(c.constraint_files.iter().any(|p| p.contains("*.xdc")));
    }

    #[test]
    fn test_project_config_new_with_defaults_oss() {
        let c = ProjectConfig::new_with_defaults("test", "opensource", "LFE5U-85F", "top");
        assert_eq!(c.impl_dir, "build");
    }

    #[test]
    fn test_project_config_save_and_load() {
        let tmp = tempfile::tempdir().unwrap();
        let mut config = ProjectConfig::new_with_defaults("test_proj", "radiant", "LIFCL-40", "counter");
        config.save(tmp.path()).unwrap();
        let loaded = ProjectConfig::load(tmp.path()).unwrap();
        assert_eq!(loaded.name, "test_proj");
        assert_eq!(loaded.backend_id, "radiant");
        assert_eq!(loaded.device, "LIFCL-40");
        assert_eq!(loaded.top_module, "counter");
    }

    #[test]
    fn test_project_config_exists_true() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join(".coverteda"), "{}").unwrap();
        assert!(ProjectConfig::exists(tmp.path()));
    }

    #[test]
    fn test_project_config_exists_false() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(!ProjectConfig::exists(tmp.path()));
    }

    #[test]
    fn test_recent_projects_add_and_truncate() {
        let mut list = RecentProjectsList::default();
        for i in 0..25 {
            let tmp = tempfile::tempdir().unwrap();
            let config = ProjectConfig::new_with_defaults(
                &format!("proj_{}", i), "diamond", "dev", "top",
            );
            list.add(tmp.path(), &config);
        }
        assert_eq!(list.projects.len(), 20);
    }

    #[test]
    fn test_recent_projects_dedup() {
        let mut list = RecentProjectsList::default();
        let tmp = tempfile::tempdir().unwrap();
        let config = ProjectConfig::new_with_defaults("proj", "diamond", "dev", "top");
        list.add(tmp.path(), &config);
        list.add(tmp.path(), &config);
        assert_eq!(list.projects.len(), 1);
    }

    #[test]
    fn test_recent_projects_remove() {
        let mut list = RecentProjectsList::default();
        let tmp = tempfile::tempdir().unwrap();
        let config = ProjectConfig::new_with_defaults("proj", "diamond", "dev", "top");
        list.add(tmp.path(), &config);
        assert_eq!(list.projects.len(), 1);
        list.remove(&tmp.path().to_string_lossy());
        assert_eq!(list.projects.len(), 0);
    }
}
