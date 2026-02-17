use crate::backend::BackendRegistry;
use crate::types::*;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub registry: Mutex<BackendRegistry>,
    pub active_build: Mutex<Option<String>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            registry: Mutex::new(BackendRegistry::new()),
            active_build: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub fn get_file_tree(project_dir: String) -> Result<Vec<FileEntry>, String> {
    crate::files::scan_directory(&PathBuf::from(project_dir)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_git_status(project_dir: String) -> Result<GitStatus, String> {
    crate::git::get_status(&PathBuf::from(project_dir)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn start_build(
    _state: State<'_, AppState>,
    _backend_id: String,
    _project_dir: String,
) -> Result<String, String> {
    // TODO: spawn actual build process
    let build_id = uuid_v4();
    Ok(build_id)
}

#[tauri::command]
pub fn cancel_build(
    _state: State<'_, AppState>,
    _build_id: String,
) -> Result<(), String> {
    // TODO: kill build process
    Ok(())
}

#[tauri::command]
pub fn get_timing_report(
    _state: State<'_, AppState>,
    _backend_id: String,
    _impl_dir: String,
) -> Result<TimingReport, String> {
    // TODO: delegate to active backend
    Err("No report available yet".to_string())
}

#[tauri::command]
pub fn get_utilization_report(
    _state: State<'_, AppState>,
    _backend_id: String,
    _impl_dir: String,
) -> Result<ResourceReport, String> {
    Err("No report available yet".to_string())
}

#[tauri::command]
pub fn switch_backend(
    _state: State<'_, AppState>,
    backend_id: String,
) -> Result<(), String> {
    let mut registry = _state.registry.lock().map_err(|e| e.to_string())?;
    if registry.switch(&backend_id) {
        Ok(())
    } else {
        Err(format!("Unknown backend: {}", backend_id))
    }
}

#[tauri::command]
pub fn get_available_backends(
    _state: State<'_, AppState>,
) -> Result<Vec<BackendInfo>, String> {
    let registry = _state.registry.lock().map_err(|e| e.to_string())?;
    Ok(registry.list())
}

#[tauri::command]
pub fn get_backend_info(
    _state: State<'_, AppState>,
    backend_id: String,
) -> Result<BackendInfo, String> {
    let registry = _state.registry.lock().map_err(|e| e.to_string())?;
    registry
        .list()
        .into_iter()
        .find(|b| b.id == backend_id)
        .ok_or_else(|| format!("Unknown backend: {}", backend_id))
}

#[tauri::command]
pub fn read_constraints(
    _state: State<'_, AppState>,
    _constraint_file: String,
) -> Result<Vec<PinConstraint>, String> {
    Err("Not implemented yet".to_string())
}

#[tauri::command]
pub fn write_constraints(
    _state: State<'_, AppState>,
    _constraints: Vec<PinConstraint>,
    _output_file: String,
) -> Result<(), String> {
    Err("Not implemented yet".to_string())
}

fn uuid_v4() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("{:x}", t)
}
