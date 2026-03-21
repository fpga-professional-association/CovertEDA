use crate::backend::BackendResult;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Build strategy definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Strategy {
    pub id: String,
    pub name: String,
    pub description: String,
    pub backend: String,
    pub parameters: std::collections::HashMap<String, String>,
    pub created_at: u64,
    pub modified_at: u64,
    pub is_builtin: bool,
}

impl Default for Strategy {
    fn default() -> Self {
        Self {
            id: format!("strategy_{}", std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()),
            name: "Default".to_string(),
            description: "Default build strategy".to_string(),
            backend: "radiant".to_string(),
            parameters: std::collections::HashMap::new(),
            created_at: 0,
            modified_at: 0,
            is_builtin: false,
        }
    }
}

/// Strategy store for persistence
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrategyStore {
    pub strategies: Vec<Strategy>,
    pub version: u32,
}

impl Default for StrategyStore {
    fn default() -> Self {
        Self {
            strategies: vec![],
            version: 1,
        }
    }
}

/// List all strategies
pub fn list_strategies(store: &StrategyStore) -> Vec<Strategy> {
    store.strategies.clone()
}

/// Get strategy by ID
pub fn get_strategy(store: &StrategyStore, id: &str) -> Option<Strategy> {
    store.strategies.iter().find(|s| s.id == id).cloned()
}

/// Save strategy to store
pub fn save_strategy(store: &mut StrategyStore, strategy: Strategy) -> BackendResult<()> {
    if let Some(existing) = store.strategies.iter_mut().find(|s| s.id == strategy.id) {
        *existing = strategy;
    } else {
        store.strategies.push(strategy);
    }
    Ok(())
}

/// Load strategy from file
pub fn load_strategy_from_file(path: &PathBuf) -> BackendResult<Strategy> {
    let json = std::fs::read_to_string(path)?;
    let strategy = serde_json::from_str(&json)?;
    Ok(strategy)
}

/// Save strategy to file
pub fn save_strategy_to_file(path: &PathBuf, strategy: &Strategy) -> BackendResult<()> {
    let json = serde_json::to_string_pretty(strategy)?;
    std::fs::write(path, json)?;
    Ok(())
}

/// Delete strategy
pub fn delete_strategy(store: &mut StrategyStore, id: &str) -> BackendResult<()> {
    store.strategies.retain(|s| s.id != id);
    Ok(())
}

/// Get Radiant builtin strategies
pub fn radiant_builtin_strategies() -> Vec<Strategy> {
    let mut params_balanced = std::collections::HashMap::new();
    params_balanced.insert("placement_effort".to_string(), "5".to_string());
    params_balanced.insert("routing_effort".to_string(), "5".to_string());
    params_balanced.insert("optimization_level".to_string(), "2".to_string());

    let mut params_timing = std::collections::HashMap::new();
    params_timing.insert("placement_effort".to_string(), "7".to_string());
    params_timing.insert("routing_effort".to_string(), "8".to_string());
    params_timing.insert("optimization_level".to_string(), "3".to_string());
    params_timing.insert("timing_driven".to_string(), "1".to_string());

    let mut params_power = std::collections::HashMap::new();
    params_power.insert("placement_effort".to_string(), "6".to_string());
    params_power.insert("routing_effort".to_string(), "6".to_string());
    params_power.insert("power_driven".to_string(), "1".to_string());

    let mut params_area = std::collections::HashMap::new();
    params_area.insert("placement_effort".to_string(), "4".to_string());
    params_area.insert("routing_effort".to_string(), "4".to_string());
    params_area.insert("area_driven".to_string(), "1".to_string());

    vec![
        Strategy {
            id: "radiant_balanced".to_string(),
            name: "Balanced".to_string(),
            description: "Balanced approach for timing and area".to_string(),
            backend: "radiant".to_string(),
            parameters: params_balanced,
            created_at: 0,
            modified_at: 0,
            is_builtin: true,
        },
        Strategy {
            id: "radiant_timing".to_string(),
            name: "Timing Optimized".to_string(),
            description: "Optimize for maximum frequency".to_string(),
            backend: "radiant".to_string(),
            parameters: params_timing,
            created_at: 0,
            modified_at: 0,
            is_builtin: true,
        },
        Strategy {
            id: "radiant_power".to_string(),
            name: "Power Optimized".to_string(),
            description: "Minimize power consumption".to_string(),
            backend: "radiant".to_string(),
            parameters: params_power,
            created_at: 0,
            modified_at: 0,
            is_builtin: true,
        },
        Strategy {
            id: "radiant_area".to_string(),
            name: "Area Optimized".to_string(),
            description: "Minimize silicon area usage".to_string(),
            backend: "radiant".to_string(),
            parameters: params_area,
            created_at: 0,
            modified_at: 0,
            is_builtin: true,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strategy_default() {
        let strategy = Strategy::default();
        assert_eq!(strategy.name, "Default");
        assert!(!strategy.is_builtin);
    }

    #[test]
    fn test_radiant_builtin_strategies() {
        let strategies = radiant_builtin_strategies();
        assert_eq!(strategies.len(), 4);
        assert!(strategies.iter().all(|s| s.is_builtin));
        assert!(strategies.iter().all(|s| s.backend == "radiant"));
    }

    #[test]
    fn test_list_strategies() {
        let mut store = StrategyStore::default();
        let strategy = Strategy::default();
        store.strategies.push(strategy.clone());

        let strategies = list_strategies(&store);
        assert_eq!(strategies.len(), 1);
        assert_eq!(strategies[0].name, "Default");
    }

    #[test]
    fn test_save_and_get_strategy() {
        let mut store = StrategyStore::default();
        let mut strategy = Strategy::default();
        strategy.id = "test_id".to_string();
        strategy.name = "Test Strategy".to_string();

        save_strategy(&mut store, strategy.clone()).unwrap();

        let retrieved = get_strategy(&store, "test_id");
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().name, "Test Strategy");
    }

    #[test]
    fn test_delete_strategy() {
        let mut store = StrategyStore::default();
        let strategy = Strategy {
            id: "test_id".to_string(),
            ..Default::default()
        };
        store.strategies.push(strategy);

        assert_eq!(store.strategies.len(), 1);
        delete_strategy(&mut store, "test_id").unwrap();
        assert_eq!(store.strategies.len(), 0);
    }

    #[test]
    fn test_strategy_parameters() {
        let strategies = radiant_builtin_strategies();
        let timing_strategy = strategies
            .iter()
            .find(|s| s.name.contains("Timing"))
            .unwrap();

        assert_eq!(
            timing_strategy.parameters.get("timing_driven").unwrap(),
            "1"
        );
    }
}
