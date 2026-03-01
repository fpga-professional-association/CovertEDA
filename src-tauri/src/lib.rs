pub mod backend;
pub mod commands;
pub mod config;
pub mod files;
pub mod git;
pub mod makefile;
pub mod parser;
pub mod process;
pub mod programmer;
pub mod project;
pub mod types;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
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
            commands::auto_load_reports,
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
            commands::list_tool_versions,
            commands::select_tool_version,
            commands::which_tool,
            commands::add_tool_to_path,
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
            commands::detect_programmer_cables,
            commands::find_bitstreams,
            commands::program_device,
            commands::import_makefile,
            commands::export_makefile,
            commands::git_init,
            commands::open_in_file_manager,
            commands::get_system_stats,
            commands::list_report_files,
            commands::scan_source_directories,
            commands::detect_top_module,
            commands::import_vendor_project,
            commands::detect_tool_edition,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
