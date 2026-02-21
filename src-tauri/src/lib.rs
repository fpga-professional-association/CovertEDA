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
            commands::git_is_dirty,
            commands::git_commit,
            commands::git_head_hash,
            commands::start_build,
            commands::cancel_build,
            commands::clean_build,
            commands::get_timing_report,
            commands::get_utilization_report,
            commands::get_power_report,
            commands::get_drc_report,
            commands::get_io_report,
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
            commands::get_project_config_at_head,
            commands::remove_recent_project,
            commands::detect_tools,
            commands::refresh_tools,
            commands::check_licenses,
            commands::read_file,
            commands::read_build_log,
            commands::delete_file,
            commands::delete_directory,
            commands::get_app_config,
            commands::save_app_config,
            commands::check_sources_stale,
            commands::get_raw_report,
            commands::generate_ip_script,
            commands::execute_ip_generate,
            commands::write_text_file,
            commands::list_bundled_examples,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
