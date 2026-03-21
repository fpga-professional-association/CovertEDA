use crate::backend::BackendResult;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Run status enumeration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
}

impl std::fmt::Display for RunStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RunStatus::Pending => write!(f, "Pending"),
            RunStatus::Running => write!(f, "Running"),
            RunStatus::Completed => write!(f, "Completed"),
            RunStatus::Failed => write!(f, "Failed"),
            RunStatus::Cancelled => write!(f, "Cancelled"),
        }
    }
}

/// Build strategy configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildStrategy {
    pub name: String,
    pub description: String,
    pub placement_effort: String,
    pub routing_effort: String,
    pub optimization_level: u32,
    pub timing_driven: bool,
    pub power_driven: bool,
    pub area_driven: bool,
}

/// Single implementation run
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImplementationRun {
    pub run_id: String,
    pub design_name: String,
    pub strategy: BuildStrategy,
    pub status: RunStatus,
    pub directory: PathBuf,
    pub start_time: u64,
    pub end_time: u64,
    pub elapsed_seconds: u64,
    pub errors: u32,
    pub warnings: u32,
}

/// Run results summary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunResults {
    pub run_id: String,
    pub fmax_mhz: f64,
    pub wns_ns: f64,
    pub lut_usage: u64,
    pub reg_usage: u64,
    pub power_mw: f64,
    pub placement_success: bool,
    pub routing_success: bool,
}

/// Comparison between runs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunComparison {
    pub run_a_id: String,
    pub run_b_id: String,
    pub fmax_delta_percent: f64,
    pub wns_delta_ns: f64,
    pub area_delta_percent: f64,
    pub power_delta_percent: f64,
    pub time_delta_seconds: i64,
}

/// Get default Radiant build strategies
pub fn radiant_default_strategies() -> Vec<BuildStrategy> {
    vec![
        BuildStrategy {
            name: "Balanced".to_string(),
            description: "Balanced approach for timing and area".to_string(),
            placement_effort: "5".to_string(),
            routing_effort: "5".to_string(),
            optimization_level: 2,
            timing_driven: true,
            power_driven: false,
            area_driven: false,
        },
        BuildStrategy {
            name: "Timing Optimized".to_string(),
            description: "Optimize for maximum frequency".to_string(),
            placement_effort: "7".to_string(),
            routing_effort: "8".to_string(),
            optimization_level: 3,
            timing_driven: true,
            power_driven: false,
            area_driven: false,
        },
        BuildStrategy {
            name: "Power Optimized".to_string(),
            description: "Minimize power consumption".to_string(),
            placement_effort: "6".to_string(),
            routing_effort: "6".to_string(),
            optimization_level: 2,
            timing_driven: false,
            power_driven: true,
            area_driven: false,
        },
        BuildStrategy {
            name: "Area Optimized".to_string(),
            description: "Minimize silicon area usage".to_string(),
            placement_effort: "4".to_string(),
            routing_effort: "4".to_string(),
            optimization_level: 1,
            timing_driven: false,
            power_driven: false,
            area_driven: true,
        },
    ]
}

/// Create run directory structure
pub fn create_run_directory(base_dir: &std::path::Path, run_id: &str) -> BackendResult<PathBuf> {
    let run_dir = base_dir.join(run_id);
    std::fs::create_dir_all(&run_dir)?;

    // Create subdirectories
    std::fs::create_dir_all(run_dir.join("synth"))?;
    std::fs::create_dir_all(run_dir.join("par"))?;
    std::fs::create_dir_all(run_dir.join("reports"))?;
    std::fs::create_dir_all(run_dir.join("logs"))?;

    Ok(run_dir)
}

/// Compare two runs
pub fn compare_runs(run_a: &RunResults, run_b: &RunResults) -> BackendResult<RunComparison> {
    let fmax_delta_percent = if run_a.fmax_mhz > 0.0 {
        ((run_b.fmax_mhz - run_a.fmax_mhz) / run_a.fmax_mhz) * 100.0
    } else {
        0.0
    };

    let area_delta_percent = if run_a.lut_usage > 0 {
        ((run_b.lut_usage as f64 - run_a.lut_usage as f64) / run_a.lut_usage as f64) * 100.0
    } else {
        0.0
    };

    let power_delta_percent = if run_a.power_mw > 0.0 {
        ((run_b.power_mw - run_a.power_mw) / run_a.power_mw) * 100.0
    } else {
        0.0
    };

    Ok(RunComparison {
        run_a_id: run_a.run_id.clone(),
        run_b_id: run_b.run_id.clone(),
        fmax_delta_percent,
        wns_delta_ns: run_b.wns_ns - run_a.wns_ns,
        area_delta_percent,
        power_delta_percent,
        time_delta_seconds: 0,
    })
}

/// Save run configuration to file
pub fn save_run_config(
    run_dir: &std::path::Path,
    run: &ImplementationRun,
) -> BackendResult<()> {
    let config_path = run_dir.join("run_config.json");
    let json = serde_json::to_string_pretty(run)?;
    std::fs::write(config_path, json)?;
    Ok(())
}

/// Load run configuration from file
pub fn load_run_config(run_dir: &std::path::Path) -> BackendResult<ImplementationRun> {
    let config_path = run_dir.join("run_config.json");
    let json = std::fs::read_to_string(config_path)?;
    let run = serde_json::from_str(&json)?;
    Ok(run)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_run_status_display() {
        assert_eq!(RunStatus::Pending.to_string(), "Pending");
        assert_eq!(RunStatus::Completed.to_string(), "Completed");
        assert_eq!(RunStatus::Failed.to_string(), "Failed");
    }

    #[test]
    fn test_radiant_default_strategies() {
        let strategies = radiant_default_strategies();
        assert_eq!(strategies.len(), 4);
        assert!(strategies[0].name.contains("Balanced"));
        assert!(strategies[1].timing_driven);
        assert!(strategies[2].power_driven);
        assert!(strategies[3].area_driven);
    }

    #[test]
    fn test_compare_runs() {
        let run_a = RunResults {
            run_id: "run_a".to_string(),
            fmax_mhz: 100.0,
            wns_ns: 1.0,
            lut_usage: 1000,
            reg_usage: 500,
            power_mw: 10.0,
            placement_success: true,
            routing_success: true,
        };

        let run_b = RunResults {
            run_id: "run_b".to_string(),
            fmax_mhz: 110.0,
            wns_ns: 0.5,
            lut_usage: 950,
            reg_usage: 480,
            power_mw: 9.0,
            placement_success: true,
            routing_success: true,
        };

        let comparison = compare_runs(&run_a, &run_b).unwrap();
        assert!(comparison.fmax_delta_percent > 0.0);
        assert!(comparison.wns_delta_ns < 0.0);
        assert!(comparison.area_delta_percent < 0.0);
    }

    #[test]
    fn test_implementation_run_structure() {
        let run = ImplementationRun {
            run_id: "test_run".to_string(),
            design_name: "top".to_string(),
            strategy: BuildStrategy {
                name: "Test".to_string(),
                description: "Test strategy".to_string(),
                placement_effort: "5".to_string(),
                routing_effort: "5".to_string(),
                optimization_level: 2,
                timing_driven: true,
                power_driven: false,
                area_driven: false,
            },
            status: RunStatus::Completed,
            directory: PathBuf::from("/tmp/test"),
            start_time: 0,
            end_time: 100,
            elapsed_seconds: 100,
            errors: 0,
            warnings: 5,
        };

        assert_eq!(run.run_id, "test_run");
        assert_eq!(run.errors, 0);
        assert_eq!(run.warnings, 5);
    }

    #[test]
    fn test_run_results_serialization() {
        let results = RunResults {
            run_id: "test_run".to_string(),
            fmax_mhz: 150.0,
            wns_ns: 0.5,
            lut_usage: 2000,
            reg_usage: 1000,
            power_mw: 15.0,
            placement_success: true,
            routing_success: true,
        };

        let json = serde_json::to_string(&results).unwrap();
        assert!(json.contains("test_run"));
        assert!(json.contains("150.0"));
    }
}
