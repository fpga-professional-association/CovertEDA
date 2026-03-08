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
            let window = app.get_webview_window("main").unwrap();
            // Set window icon so WSLg/Linux WMs show our icon instead of a penguin
            match tauri::image::Image::from_bytes(include_bytes!("../icons/128x128.png")) {
                Ok(icon) => {
                    let _ = window.set_icon(icon);
                }
                Err(e) => log::warn!("Failed to set window icon: {}", e),
            }
            log::info!("CovertEDA starting up");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_file_tree,
            commands::get_git_status,
            commands::git_log,
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
            commands::get_ai_api_key,
            commands::set_ai_api_key,
            commands::get_ai_api_key_for_provider,
            commands::set_ai_api_key_for_provider,
            commands::list_ai_providers_with_keys,
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
            commands::git_list_branches,
            commands::git_list_tags,
            commands::git_pull,
            commands::git_push,
            commands::git_checkout,
            commands::open_in_file_manager,
            commands::open_in_editor,
            commands::get_system_stats,
            commands::list_report_files,
            commands::scan_source_directories,
            commands::detect_top_module,
            commands::import_vendor_project,
            commands::list_package_pins,
            commands::get_pad_report,
            commands::detect_tool_edition,
            commands::verify_device_part,
            commands::scan_project_files,
            commands::open_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
