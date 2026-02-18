pub mod backend;
pub mod commands;
pub mod config;
pub mod files;
pub mod git;
pub mod parser;
pub mod process;
pub mod project;
pub mod types;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::AppState::default())
        .setup(|app| {
            let _window = app.get_webview_window("main").unwrap();
            log::info!("CovertEDA starting up");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_file_tree,
            commands::get_git_status,
            commands::start_build,
            commands::cancel_build,
            commands::get_timing_report,
            commands::get_utilization_report,
            commands::switch_backend,
            commands::get_available_backends,
            commands::get_backend_info,
            commands::read_constraints,
            commands::write_constraints,
            commands::get_recent_projects,
            commands::create_project,
            commands::open_project,
            commands::check_project_dir,
            commands::save_project,
            commands::remove_recent_project,
            commands::detect_tools,
            commands::check_licenses,
            commands::read_file,
            commands::read_build_log,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
