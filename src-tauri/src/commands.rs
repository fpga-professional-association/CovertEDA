use crate::backend::BackendRegistry;
use crate::project::{ProjectConfig, RecentProject, RecentProjectsList};
use crate::types::*;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, State};

pub struct AppState {
    pub registry: Mutex<BackendRegistry>,
    pub active_build: Mutex<Option<BuildHandle>>,
    pub current_project: Mutex<Option<(PathBuf, ProjectConfig)>>,
    pub ssh_config: Mutex<Option<crate::ssh::SshConfig>>,
}

/// Handle for a running build process — stored so we can cancel it.
pub struct BuildHandle {
    pub build_id: String,
    pub child_pid: Option<u32>,
    pub cancel_flag: Arc<AtomicBool>,
}

impl Default for AppState {
    fn default() -> Self {
        // Use deferred registry — zero filesystem I/O at startup.
        // Backends are detected lazily when detect_tools is first called.
        // Load SSH config from AppConfig if available.
        let ssh = crate::config::AppConfig::load().ssh;
        Self {
            registry: Mutex::new(BackendRegistry::new_deferred()),
            active_build: Mutex::new(None),
            current_project: Mutex::new(None),
            ssh_config: Mutex::new(ssh),
        }
    }
}

#[tauri::command]
pub async fn get_file_tree(project_dir: String) -> Result<Vec<FileEntry>, String> {
    tokio::task::spawn_blocking(move || {
        crate::files::scan_directory(&PathBuf::from(project_dir)).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn read_file(path: String) -> Result<FileContent, String> {
    let file_path = PathBuf::from(&path);
    let metadata = std::fs::metadata(&file_path)
        .map_err(|e| format!("Cannot read {}: {}", path, e))?;
    let size_bytes = metadata.len();

    // Cap at 2MB for text files
    const MAX_TEXT_SIZE: u64 = 2 * 1024 * 1024;

    // Read first 8KB to detect binary
    let mut file = std::fs::File::open(&file_path)
        .map_err(|e| format!("Cannot open {}: {}", path, e))?;
    let mut probe = vec![0u8; 8192.min(size_bytes as usize)];
    use std::io::Read;
    file.read_exact(&mut probe)
        .map_err(|e| format!("Cannot read {}: {}", path, e))?;

    let is_binary = probe.contains(&0);

    if is_binary {
        let ext = file_path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("unknown");
        let size_display = if size_bytes >= 1024 * 1024 {
            format!("{:.1} MB", size_bytes as f64 / (1024.0 * 1024.0))
        } else {
            format!("{:.0} KB", size_bytes as f64 / 1024.0)
        };
        return Ok(FileContent {
            path,
            content: format!("Binary file \u{2014} {} \u{2014} .{} file", size_display, ext),
            size_bytes,
            is_binary: true,
            line_count: 0,
        });
    }

    if size_bytes > MAX_TEXT_SIZE {
        return Err(format!("File too large ({} bytes, max 2MB)", size_bytes));
    }

    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Cannot read {}: {}", path, e))?;
    let line_count = content.lines().count() as u32;

    Ok(FileContent {
        path,
        content,
        size_bytes,
        is_binary: false,
        line_count,
    })
}

#[tauri::command]
pub fn read_build_log(project_dir: String) -> Result<String, String> {
    let log_path = PathBuf::from(&project_dir).join(".coverteda_build.log");
    std::fs::read_to_string(&log_path)
        .map_err(|e| format!("No build log found: {}", e))
}

#[tauri::command]
pub async fn get_git_status(project_dir: String) -> Result<GitStatus, String> {
    tokio::task::spawn_blocking(move || {
        crate::git::get_status(&PathBuf::from(project_dir)).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_log(project_dir: String, max_count: Option<usize>) -> Result<Vec<crate::types::GitLogEntry>, String> {
    let count = max_count.unwrap_or(20);
    tokio::task::spawn_blocking(move || {
        crate::git::get_log(&PathBuf::from(project_dir), count)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_is_dirty(project_dir: String) -> Result<bool, String> {
    tokio::task::spawn_blocking(move || {
        crate::git::is_dirty(&PathBuf::from(project_dir))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_commit(project_dir: String, message: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        crate::git::commit_all(&PathBuf::from(project_dir), &message)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn git_head_hash(project_dir: String) -> Result<String, String> {
    crate::git::head_hash(&PathBuf::from(project_dir))
}

#[tauri::command]
pub async fn git_list_branches(project_dir: String) -> Result<Vec<crate::git::BranchInfo>, String> {
    tokio::task::spawn_blocking(move || {
        crate::git::list_branches(&PathBuf::from(project_dir))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_list_tags(project_dir: String) -> Result<Vec<crate::git::TagInfo>, String> {
    tokio::task::spawn_blocking(move || {
        crate::git::list_tags(&PathBuf::from(project_dir))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_pull(project_dir: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        crate::git::git_pull(&PathBuf::from(project_dir))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_push(project_dir: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        crate::git::git_push(&PathBuf::from(project_dir))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_checkout(project_dir: String, branch: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        crate::git::git_checkout(&PathBuf::from(project_dir), &branch)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Generate an IP core using the vendor backend's TCL/script generation.
/// Returns the generated TCL script content and the output directory path.
#[tauri::command]
pub fn generate_ip_script(
    state: State<'_, AppState>,
    backend_id: String,
    project_dir: String,
    device: String,
    ip_name: String,
    instance_name: String,
    params: HashMap<String, String>,
) -> Result<IpGenerateResult, String> {
    let registry = state.registry.lock().map_err(|e| e.to_string())?;
    let backend = registry
        .get(&backend_id)
        .ok_or_else(|| format!("Unknown backend: {}", backend_id))?;

    let (script, output_dir) = backend
        .generate_ip_script(
            &PathBuf::from(&project_dir),
            &device,
            &ip_name,
            &instance_name,
            &params,
        )
        .map_err(|e| e.to_string())?;

    Ok(IpGenerateResult {
        script,
        output_dir,
        cli_tool: backend.cli_tool().to_string(),
    })
}

/// Execute a previously generated IP script using the vendor tool.
/// Writes the script to a temp file, spawns the tool, and streams output.
#[tauri::command]
pub fn execute_ip_generate(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    backend_id: String,
    project_dir: String,
    script: String,
) -> Result<String, String> {
    let project_path = PathBuf::from(&project_dir);

    // Write the IP generation script
    let script_path = project_path.join(".coverteda_ipgen.tcl");
    std::fs::write(&script_path, &script)
        .map_err(|e| format!("Failed to write IP generation script: {}", e))?;

    let registry = state.registry.lock().map_err(|e| e.to_string())?;
    let backend = registry
        .get(&backend_id)
        .ok_or_else(|| format!("Unknown backend: {}", backend_id))?;
    let cli_tool = backend.cli_tool().to_string();
    drop(registry);

    let executable = resolve_cli_executable(&cli_tool, &backend_id);
    let script_arg = wsl_to_windows_path(&script_path);

    // Determine license environment variables for Radiant
    let mut env_vars: HashMap<String, String> = HashMap::new();
    if backend_id == "radiant" {
        let radiant = crate::backend::radiant::RadiantBackend::new();
        if let Some(lic_path) = radiant.find_license() {
            env_vars.insert("LM_LICENSE_FILE".into(), wsl_to_windows_path(&lic_path));
        }
    }

    let gen_id = uuid_v4();
    let gen_id_clone = gen_id.clone();

    std::thread::spawn(move || {
        use std::io::BufRead;
        use std::process::Stdio;

        let _ = app_handle.emit("ip:stdout", serde_json::json!({
            "genId": &gen_id_clone,
            "line": format!("Spawning: {} {}", &executable, &script_arg),
        }));

        let mut cmd = crate::process::no_window_cmd(&executable);
        cmd.arg(&script_arg)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        for (key, val) in &env_vars {
            cmd.env(key, val);
        }

        match cmd.spawn() {
            Ok(mut child) => {
                // Stream stderr
                let stderr_handle = child.stderr.take().map(|stderr| {
                    let app_h = app_handle.clone();
                    let gid = gen_id_clone.clone();
                    std::thread::spawn(move || {
                        let reader = std::io::BufReader::new(stderr);
                        for line in reader.lines().flatten() {
                            let _ = app_h.emit("ip:stdout", serde_json::json!({
                                "genId": &gid,
                                "line": &line,
                            }));
                        }
                    })
                });

                // Stream stdout
                if let Some(stdout) = child.stdout.take() {
                    let reader = std::io::BufReader::new(stdout);
                    for line in reader.lines().flatten() {
                        let _ = app_handle.emit("ip:stdout", serde_json::json!({
                            "genId": &gen_id_clone,
                            "line": &line,
                        }));
                    }
                }

                if let Some(h) = stderr_handle {
                    let _ = h.join();
                }

                match child.wait() {
                    Ok(status) => {
                        let msg = if status.success() {
                            "IP generation complete".to_string()
                        } else {
                            format!("IP generation failed: {}", status)
                        };
                        let _ = app_handle.emit("ip:finished", serde_json::json!({
                            "genId": &gen_id_clone,
                            "status": if status.success() { "success" } else { "failed" },
                            "message": &msg,
                        }));
                    }
                    Err(e) => {
                        let _ = app_handle.emit("ip:finished", serde_json::json!({
                            "genId": &gen_id_clone,
                            "status": "failed",
                            "message": format!("Wait error: {}", e),
                        }));
                    }
                }
                let _ = std::fs::remove_file(&script_path);
            }
            Err(e) => {
                let _ = app_handle.emit("ip:finished", serde_json::json!({
                    "genId": &gen_id_clone,
                    "status": "failed",
                    "message": format!("Failed to spawn {}: {}", executable, e),
                }));
            }
        }
    });

    Ok(gen_id)
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IpGenerateResult {
    pub script: String,
    pub output_dir: String,
    pub cli_tool: String,
}

#[tauri::command]
pub fn start_build(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    backend_id: String,
    project_dir: String,
    stages: Vec<String>,
    options: HashMap<String, String>,
) -> Result<String, String> {
    let build_id = uuid_v4();
    let project_path = PathBuf::from(&project_dir);

    // Get the project config to know device/top_module
    let current = state.current_project.lock().map_err(|e| e.to_string())?;
    let config = current
        .as_ref()
        .map(|(_, c)| c.clone())
        .ok_or("No project is open")?;
    drop(current);

    // Pre-build sanity: top module must be set. Every vendor tool requires a
    // top-level entity and they all emit cryptic errors when it's missing —
    // catch it here with a human-readable message.
    if config.top_module.trim().is_empty() {
        return Err(
            "Top-level module is not set for this project. Open the project's \
             .coverteda config and set `topModule` to the name of the top entity \
             (usually the module with input/output ports at the design's root), \
             then click Build again."
                .into(),
        );
    }

    // Pre-build sanity: device must be compatible with the selected backend.
    // We run a fast local pattern match (validate_device_compat on the backend
    // trait) so obvious mismatches like Cyclone V → Quartus Pro fail here with
    // a clear explanation instead of 30s later deep inside quartus_syn.
    {
        let registry = state.registry.lock().map_err(|e| e.to_string())?;
        let backend = registry
            .get(&backend_id)
            .ok_or_else(|| format!("Unknown backend: {}", backend_id))?;
        if let Err(msg) = backend.validate_device_compat(&config.device) {
            return Err(msg);
        }
    }

    // Resolve constraint file from project config if not already in options
    let mut options = options;
    if !options.contains_key("constraint_file") && !config.constraint_files.is_empty() {
        // Glob-expand constraint patterns to find actual files
        for pattern in &config.constraint_files {
            let full_pattern = project_path.join(pattern);
            if let Ok(matches) = glob::glob(&full_pattern.to_string_lossy()) {
                for entry in matches.flatten() {
                    // Store path relative to project dir
                    if let Ok(rel) = entry.strip_prefix(&project_path) {
                        options.insert("constraint_file".into(), rel.to_string_lossy().into_owned());
                        break;
                    }
                }
            }
            if options.contains_key("constraint_file") { break; }
        }
    }

    // Generate the build script via the backend
    let registry = state.registry.lock().map_err(|e| e.to_string())?;
    let backend = registry
        .get(&backend_id)
        .ok_or_else(|| format!("Unknown backend: {}", backend_id))?;

    let script = backend
        .generate_build_script(&project_path, &config.device, &config.top_module, &stages, &options)
        .map_err(|e| e.to_string())?;
    let cli_tool = backend.cli_tool().to_string();
    drop(registry);

    // Pre-build cleanup: remove corrupted intermediate databases that can
    // cause vendor tools (especially Quartus) to crash on startup
    if backend_id == "quartus" {
        for dir_name in &["dni", "db", "qdb", "incremental_db"] {
            let dir = project_path.join(dir_name);
            if dir.exists() {
                let _ = std::fs::remove_dir_all(&dir);
            }
        }
    }

    // Write the build script to a temp file in the project directory
    let script_ext = if backend_id == "opensource" { ".sh" } else { ".tcl" };
    let script_path = project_path.join(format!(".coverteda_build{}", script_ext));
    std::fs::write(&script_path, &script)
        .map_err(|e| format!("Failed to write build script: {}", e))?;

    // Determine the executable path for this backend
    let executable = resolve_cli_executable(&cli_tool, &backend_id);

    // Determine the script path that the tool sees
    // For WSL→Windows executables, convert the WSL path to a Windows path
    let script_arg = wsl_to_windows_path(&script_path);

    // Determine environment variables for vendor tools
    let mut env_vars: HashMap<String, String> = HashMap::new();
    if backend_id == "diamond" || backend_id == "radiant" {
        // Both Diamond (pnmainc) and Radiant (radiantc) are Lattice tools that
        // need the `foundry` env var pointing to the directory containing cae_library/.
        // Find it by walking up from the actual binary location.
        let (lattice_bin_path, lattice_install_dir) = if backend_id == "diamond" {
            let d = crate::backend::diamond::DiamondBackend::new();
            (d.pnmainc_path_public(), d.install_dir().map(|p| p.to_path_buf()))
        } else {
            let r = crate::backend::radiant::RadiantBackend::new();
            (r.radiantc_path_public(), r.install_dir().map(|p| p.to_path_buf()))
        };

        if let Some(ref install_dir) = lattice_install_dir {
            if backend_id == "diamond" {
                env_vars.insert(
                    "LSC_DIAMOND".into(),
                    wsl_to_windows_path(install_dir),
                );
            } else {
                env_vars.insert(
                    "LSC_RADIANT".into(),
                    wsl_to_windows_path(install_dir),
                );
            }
        }

        // Walk up from the binary to find the directory containing cae_library/
        // e.g., pnmainc at .../lscc/diamond/3.14/bin/nt64/pnmainc.exe
        // cae_library could be at any ancestor level
        let mut foundry_set = false;
        if let Some(ref bin_path) = lattice_bin_path {
            let mut dir = bin_path.parent();
            for _ in 0..6 {
                match dir {
                    Some(d) => {
                        if d.join("cae_library").exists() {
                            env_vars.insert("foundry".into(), wsl_to_windows_path(d));
                            foundry_set = true;
                            break;
                        }
                        dir = d.parent();
                    }
                    None => break,
                }
            }
        }
        // Fallback: also check from install_dir upward if binary walk didn't find it
        if !foundry_set {
            if let Some(ref install_dir) = lattice_install_dir {
                let mut dir = Some(install_dir.as_path());
                for _ in 0..4 {
                    match dir {
                        Some(d) => {
                            if d.join("cae_library").exists() {
                                env_vars.insert("foundry".into(), wsl_to_windows_path(d));
                                foundry_set = true;
                                break;
                            }
                            dir = d.parent();
                        }
                        None => break,
                    }
                }
            }
        }
        let _ = foundry_set; // may be unused if both search paths fail

        // Add bin dir to PATH for DLL resolution
        if let Some(ref bin_path) = lattice_bin_path {
            if let Some(bin_dir) = bin_path.parent() {
                let win_bin = wsl_to_windows_path(bin_dir);
                let existing_path = std::env::var("PATH").unwrap_or_default();
                env_vars.insert("PATH".into(), format!("{};{}", win_bin, existing_path));
            }
        }

        // License file
        let lic_path = if backend_id == "diamond" {
            crate::backend::diamond::DiamondBackend::new().find_license()
        } else {
            crate::backend::radiant::RadiantBackend::new().find_license()
        };
        if let Some(lic) = lic_path {
            env_vars.insert(
                "LM_LICENSE_FILE".into(),
                wsl_to_windows_path(&lic),
            );
        }
    } else if backend_id == "quartus" || backend_id == "quartus_pro" {
        let quartus = crate::backend::quartus::QuartusBackend::new();
        // QUARTUS_ROOTDIR is critical — without it, the DDM (Device Data Manager)
        // crashes on startup with "Cannot identify the client"
        if let Some(install_dir) = quartus.install_dir() {
            let quartus_root = install_dir.join("quartus");
            env_vars.insert(
                "QUARTUS_ROOTDIR".into(),
                wsl_to_windows_path(&quartus_root),
            );
            // Ensure bin64 is on PATH for Windows DLL resolution
            let bin64 = quartus_root.join("bin64");
            let sopc_bin = install_dir.join("quartus").join("sopc_builder").join("bin");
            let win_bin64 = wsl_to_windows_path(&bin64);
            let win_sopc = wsl_to_windows_path(&sopc_bin);
            // Prepend to existing PATH
            let existing_path = std::env::var("PATH").unwrap_or_default();
            env_vars.insert(
                "PATH".into(),
                format!("{};{};{}", win_bin64, win_sopc, existing_path),
            );
            env_vars.insert("QUARTUS_64BIT".into(), "1".into());
        }
        // Set license file for Quartus
        if let Some(lic_path) = quartus.find_license() {
            env_vars.insert(
                "LM_LICENSE_FILE".into(),
                wsl_to_windows_path(&lic_path),
            );
        }
    }

    // For Windows vendor tools on WSL, use a batch file wrapper to ensure environment
    // variables reach the Windows process. Command.env() doesn't work reliably
    // for WSL→Windows process interop.
    let needs_bat_wrapper = executable.contains(".exe") &&
        matches!(backend_id.as_str(), "diamond" | "radiant" | "quartus" | "quartus_pro");
    let bat_wrapper_path: Option<String> = if needs_bat_wrapper {
        let bat_path = project_path.join(".coverteda_build.bat");
        let win_exe = wsl_to_windows_path(&PathBuf::from(&executable));
        let mut bat = String::from("@echo off\r\n");
        for (key, val) in &env_vars {
            if key == "PATH" {
                // For PATH, extract only Windows-style paths and prepend to %PATH%
                let win_paths: Vec<&str> = val.split(';')
                    .filter(|p| !p.starts_with('/')) // Skip WSL paths
                    .collect();
                if !win_paths.is_empty() {
                    bat.push_str(&format!("set \"PATH={};%PATH%\"\r\n", win_paths.join(";")));
                }
            } else {
                bat.push_str(&format!("set \"{}={}\"\r\n", key, val));
            }
        }
        // Backend-specific CLI flags
        let cli_flags = match backend_id.as_str() {
            "quartus" | "quartus_pro" => " -t",
            _ => "", // Diamond/Radiant: pnmainc/radiantc take bare script arg
        };
        bat.push_str(&format!("\"{}\"{} \"{}\"\r\n", win_exe, cli_flags, &script_arg));
        std::fs::write(&bat_path, &bat)
            .map_err(|e| format!("Failed to write batch wrapper: {}", e))?;
        Some(wsl_to_windows_path(&bat_path))
    } else {
        None
    };

    // Record the build with a cancel flag
    let bid = build_id.clone();
    let cancel_flag = Arc::new(AtomicBool::new(false));
    let cancel_flag_clone = cancel_flag.clone();
    {
        let mut active = state.active_build.lock().map_err(|e| e.to_string())?;
        *active = Some(BuildHandle {
            build_id: bid.clone(),
            child_pid: None,
            cancel_flag,
        });
    }

    // Spawn the build in a background thread
    let build_id_clone = build_id.clone();
    let log_path = project_path.join(".coverteda_build.log");
    std::thread::spawn(move || {
        use std::io::BufRead;
        use std::process::Stdio;

        // Open log file for writing
        let mut log_file = std::fs::File::create(&log_path).ok();
        let start_time = std::time::Instant::now();

        let write_log = |log_file: &mut Option<std::fs::File>, line: &str| {
            if let Some(ref mut f) = log_file {
                use std::io::Write;
                let _ = writeln!(f, "{}", line);
            }
        };

        // Emit the build plan so the user sees what CovertEDA is doing
        let emit_info = |msg: &str| {
            let _ = app_handle.emit("build:stdout", serde_json::json!({
                "buildId": &build_id_clone,
                "line": msg,
            }));
        };

        emit_info(&format!("═══ CovertEDA Build ═══"));
        emit_info(&format!("Backend: {} ({})", backend_id, &executable));
        emit_info(&format!("Project: {}", project_dir));
        for (key, val) in &env_vars {
            emit_info(&format!("ENV: {}={}", key, val));
        }
        emit_info(&format!("Script: {}", &script_arg));
        emit_info("───── TCL commands ─────");
        for tcl_line in script.lines() {
            let trimmed = tcl_line.trim();
            if !trimmed.is_empty() && !trimmed.starts_with('#') {
                emit_info(&format!("  $ {}", trimmed));
            }
        }
        emit_info("────────────────────────");
        if let Some(ref bat_path) = bat_wrapper_path {
            emit_info(&format!("Spawning via batch wrapper: cmd.exe /c {}", bat_path));
        } else {
            emit_info(&format!("Spawning: {} {}", &executable, &script_arg));
        }
        emit_info(&format!("Working dir: {}", project_path.display()));
        emit_info("");

        let mut cmd = if let Some(ref bat_path) = bat_wrapper_path {
            // Use batch wrapper (Quartus on WSL) — env vars are set inside the .bat
            let mut c = crate::process::no_window_cmd("cmd.exe");
            c.args(["/c", bat_path]);
            c
        } else {
            let mut c = crate::process::no_window_cmd(&executable);
            // Backend-specific CLI flags before the script path
            match backend_id.as_str() {
                "quartus" => { c.arg("-t"); }
                "vivado" => { c.args(["-mode", "batch", "-source"]); }
                "ace" => { c.args(["-batch", "-script_file"]); }
                _ => {} // radiant, diamond, oss: bare argument
            }
            c.arg(&script_arg);
            c
        };
        cmd.current_dir(&project_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Only set env vars directly when not using batch wrapper
        if bat_wrapper_path.is_none() {
            for (key, val) in &env_vars {
                cmd.env(key, val);
            }
        }

        match cmd.spawn() {
            Ok(mut child) => {
                // Store PID so cancel_build can kill the process
                let child_pid = child.id();
                if let Some(state) = app_handle.try_state::<AppState>() {
                    if let Ok(mut active) = state.active_build.lock() {
                        if let Some(ref mut handle) = *active {
                            handle.child_pid = Some(child_pid);
                        }
                    }
                }

                // Capture stderr in a separate thread
                let stderr_handle = child.stderr.take().map(|stderr| {
                    let app_h = app_handle.clone();
                    let bid = build_id_clone.clone();
                    let log_p = log_path.clone();
                    std::thread::spawn(move || {
                        let reader = std::io::BufReader::new(stderr);
                        let mut log_f = std::fs::OpenOptions::new()
                            .append(true)
                            .open(&log_p)
                            .ok();
                        for line in reader.lines().flatten() {
                            if let Some(ref mut f) = log_f {
                                use std::io::Write;
                                let _ = writeln!(f, "[stderr] {}", line);
                            }
                            let _ = app_h.emit("build:stdout", serde_json::json!({
                                "buildId": &bid,
                                "line": &line,
                            }));
                        }
                    })
                });

                // Stream stdout line by line
                if let Some(stdout) = child.stdout.take() {
                    let reader = std::io::BufReader::new(stdout);
                    let mut current_stage: i32 = -1;

                    for line in reader.lines() {
                        // Check cancellation flag between lines
                        if cancel_flag_clone.load(Ordering::Relaxed) {
                            let _ = child.kill();
                            break;
                        }
                        if let Ok(line) = line {
                            write_log(&mut log_file, &line);

                            let _ = app_handle.emit("build:stdout", serde_json::json!({
                                "buildId": &build_id_clone,
                                "line": &line,
                            }));

                            let lower = line.to_lowercase();

                            // Detect Quartus stages
                            if backend_id == "quartus" {
                                // Quartus Pro uses execute_module -tool <name>
                                if current_stage < 0
                                    && (lower.contains("quartus_syn") || lower.contains("execute_module -tool syn"))
                                {
                                    current_stage = 0;
                                    let _ = app_handle.emit("build:stdout", serde_json::json!({
                                        "buildId": &build_id_clone,
                                        "line": "\u{25b6} [Stage 1/4] Synthesis started...",
                                    }));
                                }
                                if current_stage < 1
                                    && (lower.contains("quartus_fit") || lower.contains("execute_module -tool fit"))
                                {
                                    if current_stage == 0 {
                                        let _ = app_handle.emit("build:stage_complete", BuildEvent {
                                            build_id: build_id_clone.clone(), stage_idx: 0,
                                            status: BuildStatus::Success, message: "Synthesis complete".into(),
                                        });
                                    }
                                    current_stage = 1;
                                    let _ = app_handle.emit("build:stdout", serde_json::json!({
                                        "buildId": &build_id_clone,
                                        "line": "\u{25b6} [Stage 2/4] Fitter started...",
                                    }));
                                }
                                if current_stage < 2
                                    && (lower.contains("quartus_sta") || lower.contains("execute_module -tool sta"))
                                {
                                    if current_stage == 1 {
                                        let _ = app_handle.emit("build:stage_complete", BuildEvent {
                                            build_id: build_id_clone.clone(), stage_idx: 1,
                                            status: BuildStatus::Success, message: "Fitter complete".into(),
                                        });
                                    }
                                    current_stage = 2;
                                    let _ = app_handle.emit("build:stdout", serde_json::json!({
                                        "buildId": &build_id_clone,
                                        "line": "\u{25b6} [Stage 3/4] Timing Analysis started...",
                                    }));
                                }
                                if current_stage < 3
                                    && (lower.contains("quartus_asm") || lower.contains("execute_module -tool asm"))
                                {
                                    if current_stage == 2 {
                                        let _ = app_handle.emit("build:stage_complete", BuildEvent {
                                            build_id: build_id_clone.clone(), stage_idx: 2,
                                            status: BuildStatus::Success, message: "Timing Analysis complete".into(),
                                        });
                                    }
                                    current_stage = 3;
                                    let _ = app_handle.emit("build:stdout", serde_json::json!({
                                        "buildId": &build_id_clone,
                                        "line": "\u{25b6} [Stage 4/4] Assembler started...",
                                    }));
                                }
                                if lower.contains("quartus_asm") && lower.contains("successful") {
                                    let _ = app_handle.emit("build:stage_complete", BuildEvent {
                                        build_id: build_id_clone.clone(), stage_idx: 3,
                                        status: BuildStatus::Success, message: "Assembler complete".into(),
                                    });
                                }
                            }

                            // Detect OSS CAD Suite stages from build script echo markers
                            if backend_id == "opensource" {
                                // Stage starts: "=== Yosys Synthesis", "=== nextpnr", "=== ecppack/icepack/gowin_pack Bitstream"
                                if lower.contains("=== yosys synthesis") {
                                    current_stage = 0;
                                }
                                if lower.contains("=== nextpnr") || lower.contains("place & route") {
                                    if current_stage == 0 {
                                        let _ = app_handle.emit("build:stage_complete", BuildEvent {
                                            build_id: build_id_clone.clone(), stage_idx: 0,
                                            status: BuildStatus::Success,
                                            message: "Synthesis complete".into(),
                                        });
                                    }
                                    current_stage = 1;
                                }
                                if lower.contains("=== ecppack") || lower.contains("=== icepack")
                                    || lower.contains("=== gowin_pack") || lower.contains("=== prjoxide")
                                    || lower.contains("bitstream")
                                        && (lower.starts_with("=== ") || lower.contains("=== "))
                                        && !lower.contains("done")
                                {
                                    if current_stage == 1 {
                                        let _ = app_handle.emit("build:stage_complete", BuildEvent {
                                            build_id: build_id_clone.clone(), stage_idx: 1,
                                            status: BuildStatus::Success,
                                            message: "Place & Route complete".into(),
                                        });
                                    }
                                    current_stage = 2;
                                }
                                if lower.contains("=== done") {
                                    if current_stage == 2 {
                                        let _ = app_handle.emit("build:stage_complete", BuildEvent {
                                            build_id: build_id_clone.clone(), stage_idx: 2,
                                            status: BuildStatus::Success,
                                            message: "Bitstream complete".into(),
                                        });
                                    }
                                }
                                // Detect failures from tool error output
                                if lower.starts_with("error") || lower.contains("] error") {
                                    let failed_stage = current_stage.max(0) as usize;
                                    let _ = app_handle.emit("build:stage_complete", BuildEvent {
                                        build_id: build_id_clone.clone(),
                                        stage_idx: failed_stage,
                                        status: BuildStatus::Failed,
                                        message: line.clone(),
                                    });
                                }
                            }

                            // Detect Radiant stage starts — emit info lines and track progress
                            if current_stage < 0
                                && (lower.contains("running synthesis")
                                    || lower.contains("prj_run_synthesis")
                                    || lower.contains("lse :"))
                            {
                                current_stage = 0;
                                let _ = app_handle.emit("build:stdout", serde_json::json!({
                                    "buildId": &build_id_clone,
                                    "line": "▶ [Stage 1/4] Synthesis (LSE) started...",
                                }));
                            }
                            if current_stage < 1
                                && (lower.contains("running map")
                                    || lower.contains("prj_run_map")
                                    || (lower.contains("map :") && lower.contains("version")))
                            {
                                current_stage = 1;
                                let _ = app_handle.emit("build:stdout", serde_json::json!({
                                    "buildId": &build_id_clone,
                                    "line": "▶ [Stage 2/4] Map started...",
                                }));
                            }
                            if current_stage < 2
                                && (lower.contains("running par")
                                    || lower.contains("prj_run_par")
                                    || (lower.contains("par :") && lower.contains("version")))
                            {
                                current_stage = 2;
                                let _ = app_handle.emit("build:stdout", serde_json::json!({
                                    "buildId": &build_id_clone,
                                    "line": "▶ [Stage 3/4] Place & Route started...",
                                }));
                            }
                            if current_stage < 3
                                && (lower.contains("running bitstream")
                                    || lower.contains("prj_run_bitstream")
                                    || lower.contains("bitgen :"))
                            {
                                current_stage = 3;
                                let _ = app_handle.emit("build:stdout", serde_json::json!({
                                    "buildId": &build_id_clone,
                                    "line": "▶ [Stage 4/4] Bitstream generation started...",
                                }));
                            }

                            // Detect stage completions from real Radiant output
                            if lower.contains("checksum -- syn")
                                || (lower.contains("synthesis") && lower.contains("total cpu time"))
                            {
                                let elapsed = start_time.elapsed().as_secs();
                                let _ = app_handle.emit("build:stdout", serde_json::json!({
                                    "buildId": &build_id_clone,
                                    "line": format!("✓ Synthesis complete ({}s)", elapsed),
                                }));
                                let _ = app_handle.emit("build:stage_complete", BuildEvent {
                                    build_id: build_id_clone.clone(),
                                    stage_idx: 0,
                                    status: BuildStatus::Success,
                                    message: "Synthesis complete".into(),
                                });
                            }
                            if lower.contains("checksum -- map")
                                || (lower.contains("map ") && lower.contains("total cpu time"))
                            {
                                let elapsed = start_time.elapsed().as_secs();
                                let _ = app_handle.emit("build:stdout", serde_json::json!({
                                    "buildId": &build_id_clone,
                                    "line": format!("✓ Map complete ({}s)", elapsed),
                                }));
                                let _ = app_handle.emit("build:stage_complete", BuildEvent {
                                    build_id: build_id_clone.clone(),
                                    stage_idx: 1,
                                    status: BuildStatus::Success,
                                    message: "Map complete".into(),
                                });
                            }
                            if lower.contains("par done!")
                                || lower.contains("par_summary::run status = completed")
                            {
                                let elapsed = start_time.elapsed().as_secs();
                                let _ = app_handle.emit("build:stdout", serde_json::json!({
                                    "buildId": &build_id_clone,
                                    "line": format!("✓ Place & Route complete ({}s)", elapsed),
                                }));
                                let _ = app_handle.emit("build:stage_complete", BuildEvent {
                                    build_id: build_id_clone.clone(),
                                    stage_idx: 2,
                                    status: BuildStatus::Success,
                                    message: "Place & Route complete".into(),
                                });
                            }
                            if lower.contains("bitstream generation complete")
                                || (lower.contains("bitgen") && lower.contains("total cpu time"))
                            {
                                let elapsed = start_time.elapsed().as_secs();
                                let _ = app_handle.emit("build:stdout", serde_json::json!({
                                    "buildId": &build_id_clone,
                                    "line": format!("✓ Bitstream generation complete ({}s)", elapsed),
                                }));
                                let _ = app_handle.emit("build:stage_complete", BuildEvent {
                                    build_id: build_id_clone.clone(),
                                    stage_idx: 3,
                                    status: BuildStatus::Success,
                                    message: "Bitstream complete".into(),
                                });
                            }
                        }
                    }
                }

                // Wait for stderr thread
                if let Some(h) = stderr_handle {
                    let _ = h.join();
                }

                // Wait for process to finish
                let cancelled = cancel_flag_clone.load(Ordering::Relaxed);
                match child.wait() {
                    Ok(status) => {
                        let total_secs = start_time.elapsed().as_secs();
                        let mins = total_secs / 60;
                        let secs = total_secs % 60;
                        if cancelled {
                            let msg = format!("═══ BUILD CANCELLED ═══  {}m {}s", mins, secs);
                            write_log(&mut log_file, &msg);
                            let _ = app_handle.emit("build:finished", BuildEvent {
                                build_id: build_id_clone.clone(),
                                stage_idx: 0,
                                status: BuildStatus::Failed,
                                message: msg,
                            });
                        } else {
                            let final_status = if status.success() {
                                BuildStatus::Success
                            } else {
                                BuildStatus::Failed
                            };
                            let msg = if status.success() {
                                format!("═══ BUILD COMPLETE ═══  {}m {}s", mins, secs)
                            } else {
                                format!("═══ BUILD FAILED ═══  {} ({}m {}s)", status, mins, secs)
                            };
                            write_log(&mut log_file, &msg);
                            let _ = app_handle.emit("build:finished", BuildEvent {
                                build_id: build_id_clone.clone(),
                                stage_idx: 0,
                                status: final_status,
                                message: msg,
                            });
                        }
                    }
                    Err(e) => {
                        let msg = if cancelled {
                            format!("═══ BUILD CANCELLED ═══")
                        } else {
                            format!("Build wait error: {}", e)
                        };
                        write_log(&mut log_file, &msg);
                        let _ = app_handle.emit("build:finished", BuildEvent {
                            build_id: build_id_clone.clone(),
                            stage_idx: 0,
                            status: BuildStatus::Failed,
                            message: msg,
                        });
                    }
                }

                // Clean up the temp script
                let _ = std::fs::remove_file(&script_path);
            }
            Err(e) => {
                let msg = format!("Failed to spawn {}: {}", executable, e);
                write_log(&mut log_file, &msg);
                let _ = app_handle.emit("build:finished", BuildEvent {
                    build_id: build_id_clone.clone(),
                    stage_idx: 0,
                    status: BuildStatus::Failed,
                    message: msg,
                });
            }
        }
    });

    Ok(build_id)
}

#[tauri::command]
pub async fn clean_build(project_dir: String) -> Result<u32, String> {
    tokio::task::spawn_blocking(move || {
        let project_path = PathBuf::from(&project_dir);
        let mut removed = 0u32;

        // Remove impl directories (impl1/, impl2/, etc.) — Lattice Diamond/Radiant
        if let Ok(entries) = std::fs::read_dir(&project_path) {
            for entry in entries.filter_map(|e| e.ok()) {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("impl") && entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    if std::fs::remove_dir_all(entry.path()).is_ok() {
                        removed += 1;
                    }
                }
            }
        }

        // Remove OSS build/ directory
        let oss_build = project_path.join("build");
        if oss_build.exists() && oss_build.is_dir() {
            if std::fs::remove_dir_all(&oss_build).is_ok() {
                removed += 1;
            }
        }

        // Remove Quartus build directories
        for dir_name in &["db", "dni", "incremental_db", "output_files", "qdb", "tmp", "greybox_tmp", "simulation"] {
            let p = project_path.join(dir_name);
            if p.exists() && p.is_dir() {
                if std::fs::remove_dir_all(&p).is_ok() {
                    removed += 1;
                }
            }
        }

        // Remove Quartus generated files
        if let Ok(entries) = std::fs::read_dir(&project_path) {
            for entry in entries.filter_map(|e| e.ok()) {
                let name = entry.file_name().to_string_lossy().to_string();
                let is_quartus = name.ends_with(".qpf") || name.ends_with(".qsf")
                    || name.ends_with(".qws") || name.ends_with(".done")
                    || name.ends_with(".summary") || name.ends_with(".smsg")
                    || name.ends_with(".jdi") || name.ends_with(".pin")
                    || name.ends_with(".sld") || name.ends_with(".dpf")
                    || name.ends_with(".bak") || name.ends_with(".rpt");
                if is_quartus && entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                    if std::fs::remove_file(entry.path()).is_ok() {
                        removed += 1;
                    }
                }
            }
        }

        // Remove .rpt files from Lattice impl dirs, Vivado runs, and other output dirs
        for subdir in &["output", "output_files"] {
            let dir = project_path.join(subdir);
            if dir.exists() && dir.is_dir() {
                if let Ok(entries) = std::fs::read_dir(&dir) {
                    for entry in entries.filter_map(|e| e.ok()) {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if name.ends_with(".rpt") && entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                            if std::fs::remove_file(entry.path()).is_ok() {
                                removed += 1;
                            }
                        }
                    }
                }
            }
        }

        // Remove Vivado build directories
        for suffix in &[".runs", ".cache", ".hw", ".ip_user_files"] {
            if let Ok(entries) = std::fs::read_dir(&project_path) {
                for entry in entries.filter_map(|e| e.ok()) {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.ends_with(suffix) && entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                        if std::fs::remove_dir_all(entry.path()).is_ok() {
                            removed += 1;
                        }
                    }
                }
            }
        }
        let xil_dir = project_path.join(".Xil");
        if xil_dir.exists() && xil_dir.is_dir() {
            if std::fs::remove_dir_all(&xil_dir).is_ok() {
                removed += 1;
            }
        }

        // Remove build artifacts in project root
        let artifacts = [
            ".coverteda_build.tcl",
            ".coverteda_build.sh",
            ".coverteda_build.bat",
            ".coverteda_build.log",
            ".coverteda_default.sdc",
        ];
        for name in &artifacts {
            let p = project_path.join(name);
            if p.exists() {
                let _ = std::fs::remove_file(&p);
                removed += 1;
            }
        }

        Ok(removed)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn check_sources_stale(project_dir: String) -> Result<bool, String> {
    let project_path = PathBuf::from(&project_dir);

    // Find newest build output timestamp in impl1/ or build/ (OSS)
    let impl_dir = project_path.join("impl1");
    let oss_dir = project_path.join("build");

    let build_exts = ["twr", "bit", "mrp", "par", "jed", "sof", "config", "json", "log"];
    let mut newest_output: Option<std::time::SystemTime> = None;
    for search_dir in [&impl_dir, &oss_dir] {
        if !search_dir.exists() {
            continue;
        }
        if let Ok(entries) = std::fs::read_dir(search_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    if build_exts.contains(&ext) {
                        if let Ok(meta) = path.metadata() {
                            if let Ok(mtime) = meta.modified() {
                                if newest_output.map_or(true, |t| mtime > t) {
                                    newest_output = Some(mtime);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let newest_output = match newest_output {
        Some(t) => t,
        None => return Ok(false), // No recognized build outputs
    };

    // Find newest source file timestamp
    let source_exts = ["v", "sv", "vhd", "vhdl"];
    let mut newest_source: Option<std::time::SystemTime> = None;
    fn scan_sources(
        dir: &std::path::Path,
        exts: &[&str],
        newest: &mut Option<std::time::SystemTime>,
    ) {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.is_dir() {
                    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                    if !name.starts_with("impl") && name != "build" && !name.starts_with(".") {
                        scan_sources(&path, exts, newest);
                    }
                } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    if exts.contains(&ext) {
                        if let Ok(meta) = path.metadata() {
                            if let Ok(mtime) = meta.modified() {
                                if newest.map_or(true, |t| mtime > t) {
                                    *newest = Some(mtime);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    scan_sources(&project_path, &source_exts, &mut newest_source);

    match newest_source {
        Some(src_time) => Ok(src_time > newest_output),
        None => Ok(false),
    }
}

#[tauri::command]
pub fn cancel_build(
    state: State<'_, AppState>,
    _build_id: String,
) -> Result<(), String> {
    let mut active = state.active_build.lock().map_err(|e| e.to_string())?;
    if let Some(handle) = active.as_ref() {
        // Signal the build thread to stop reading output
        handle.cancel_flag.store(true, Ordering::Relaxed);

        if let Some(pid) = handle.child_pid {
            #[cfg(unix)]
            {
                // SIGTERM first, then SIGKILL after a short delay
                unsafe { libc::kill(pid as i32, libc::SIGTERM); }
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(2));
                    unsafe { libc::kill(pid as i32, libc::SIGKILL); }
                });
            }
            #[cfg(windows)]
            {
                let _ = crate::process::no_window_cmd("taskkill")
                    .args(&["/PID", &pid.to_string(), "/F"])
                    .spawn();
            }
        }
    }
    *active = None;
    Ok(())
}

#[tauri::command]
pub fn get_timing_report(
    state: State<'_, AppState>,
    backend_id: String,
    impl_dir: String,
) -> Result<TimingReport, String> {
    let registry = state.registry.lock().map_err(|e| e.to_string())?;
    let backend = registry
        .get(&backend_id)
        .ok_or_else(|| format!("Unknown backend: {}", backend_id))?;
    backend
        .parse_timing_report(&PathBuf::from(&impl_dir))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_utilization_report(
    state: State<'_, AppState>,
    backend_id: String,
    impl_dir: String,
) -> Result<ResourceReport, String> {
    let registry = state.registry.lock().map_err(|e| e.to_string())?;
    let backend = registry
        .get(&backend_id)
        .ok_or_else(|| format!("Unknown backend: {}", backend_id))?;
    backend
        .parse_utilization_report(&PathBuf::from(&impl_dir))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_power_report(
    state: State<'_, AppState>,
    backend_id: String,
    impl_dir: String,
) -> Result<Option<PowerReport>, String> {
    let registry = state.registry.lock().map_err(|e| e.to_string())?;
    let backend = registry
        .get(&backend_id)
        .ok_or_else(|| format!("Unknown backend: {}", backend_id))?;
    backend
        .parse_power_report(&PathBuf::from(&impl_dir))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_drc_report(
    state: State<'_, AppState>,
    backend_id: String,
    impl_dir: String,
) -> Result<Option<DrcReport>, String> {
    let registry = state.registry.lock().map_err(|e| e.to_string())?;
    let backend = registry
        .get(&backend_id)
        .ok_or_else(|| format!("Unknown backend: {}", backend_id))?;
    backend
        .parse_drc_report(&PathBuf::from(&impl_dir))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_io_report(
    state: State<'_, AppState>,
    backend_id: String,
    project_dir: String,
) -> Result<Option<IoReport>, String> {
    let project_path = PathBuf::from(&project_dir);
    let registry = state.registry.lock().map_err(|e| e.to_string())?;
    let backend = registry
        .get(&backend_id)
        .ok_or_else(|| format!("Unknown backend: {}", backend_id))?;

    // Find constraint files in common locations + vendor-specific dirs
    let ext = backend.constraint_ext();
    let search_dirs = [
        project_path.join("constraints"),
        project_path.join("src"),
        project_path.clone(),
        // Vendor-specific build output directories
        project_path.join("impl1"),         // Radiant/Diamond
        project_path.join("source"),        // Radiant alt
        project_path.join("output_files"),  // Quartus
        project_path.join("build"),         // OSS CAD Suite
        project_path.join("output"),        // ACE
    ];

    let mut all_constraints = Vec::new();
    for dir in &search_dirs {
        if !dir.exists() {
            continue;
        }
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()).map(|e| e == ext.trim_start_matches('.')).unwrap_or(false) {
                    if let Ok(pins) = backend.read_constraints(&path) {
                        all_constraints.extend(pins);
                    }
                }
            }
        }
    }

    // If constraint parsing found pins, build report from those
    if !all_constraints.is_empty() {
        return Ok(Some(constraints_to_io_report(all_constraints)));
    }

    // Fallback: try .pad file (post-P&R pin report from Lattice Radiant/Diamond)
    // This gives actual pin assignments even if no separate constraint file exists
    let pad_dirs = [
        project_path.join("impl1"),
        project_path.clone(),
    ];
    for dir in &pad_dirs {
        if !dir.exists() { continue; }
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.extension().map(|e| e == "pad").unwrap_or(false) {
                    if let Ok(content) = std::fs::read_to_string(&p) {
                        if let Ok(pad) = crate::parser::pad::parse_radiant_pad(&content) {
                            return Ok(Some(pad_report_to_io_report(&pad)));
                        }
                    }
                }
            }
        }
    }

    Ok(None)
}

/// Convert constraint pin list into an IoReport grouped by I/O standard.
fn constraints_to_io_report(all_constraints: Vec<PinConstraint>) -> IoReport {
    let mut groups: std::collections::HashMap<String, Vec<PinConstraint>> =
        std::collections::HashMap::new();
    for c in &all_constraints {
        groups
            .entry(c.io_standard.clone())
            .or_default()
            .push(c.clone());
    }

    let banks: Vec<IoBank> = groups
        .into_iter()
        .map(|(io_std, pins)| {
            let vccio = io_standard_to_vccio(&io_std);
            let bank_pins: Vec<IoBankPin> = pins
                .iter()
                .map(|p| IoBankPin {
                    pin: p.pin.clone(),
                    net: p.net.clone(),
                    direction: if p.direction.is_empty() {
                        "BIDIR".to_string()
                    } else {
                        p.direction.clone()
                    },
                })
                .collect();
            let count = bank_pins.len() as u32;
            IoBank {
                id: io_std,
                vccio: vccio.to_string(),
                used: count,
                total: count,
                pins: bank_pins,
            }
        })
        .collect();

    IoReport { banks }
}

/// Convert a PadReport (from .pad file) into an IoReport grouped by physical bank.
fn pad_report_to_io_report(pad: &crate::types::PadReport) -> IoReport {
    use std::collections::HashMap;

    // Build bank-level VCCIO lookup from pad report
    let bank_vccio: HashMap<&str, &str> = pad.vccio_banks.iter()
        .map(|b| (b.bank.as_str(), b.vccio.as_str()))
        .collect();

    // Group pins by physical bank
    let mut bank_groups: HashMap<String, Vec<IoBankPin>> = HashMap::new();
    for pin in &pad.assigned_pins {
        let bank_id = if pin.bank.is_empty() { "Unknown".to_string() } else { format!("Bank {}", pin.bank) };
        bank_groups.entry(bank_id).or_default().push(IoBankPin {
            pin: pin.pin.clone(),
            net: pin.port_name.clone(),
            direction: pin.direction.clone(),
        });
    }

    let mut banks: Vec<IoBank> = bank_groups.into_iter().map(|(bank_id, pins)| {
        // Extract numeric bank from "Bank N"
        let bank_num = bank_id.strip_prefix("Bank ").unwrap_or("");
        let vccio = bank_vccio.get(bank_num).copied().unwrap_or("3.3V");
        let count = pins.len() as u32;
        IoBank {
            id: bank_id,
            vccio: vccio.to_string(),
            used: count,
            total: count,
            pins,
        }
    }).collect();
    banks.sort_by(|a, b| a.id.cmp(&b.id));

    IoReport { banks }
}

/// Map I/O standard name to VCCIO voltage.
fn io_standard_to_vccio(io_std: &str) -> &'static str {
    match io_std {
        "LVCMOS33" => "3.3V",
        "LVCMOS25" => "2.5V",
        "LVCMOS18" => "1.8V",
        "LVCMOS15" => "1.5V",
        "LVCMOS12" => "1.2V",
        "LVTTL" => "3.3V",
        "SSTL15" => "1.5V",
        "SSTL18" => "1.8V",
        "SSTL135" => "1.35V",
        "LVDS" | "LVDS25" => "2.5V",
        _ => "3.3V",
    }
}

#[tauri::command]
pub fn get_pad_report(
    state: State<'_, AppState>,
    backend_id: String,
    impl_dir: String,
) -> Result<Option<PadReport>, String> {
    let impl_path = PathBuf::from(&impl_dir);
    let registry = state.registry.lock().map_err(|e| e.to_string())?;
    let backend = registry
        .get(&backend_id)
        .ok_or_else(|| format!("Unknown backend: {}", backend_id))?;
    backend.parse_pad_report(&impl_path).map_err(|e| e.to_string())
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

// ── Project Management Commands ──

#[tauri::command]
pub fn get_recent_projects() -> Result<Vec<RecentProject>, String> {
    let mut list = RecentProjectsList::load();
    list.prune();
    let _ = list.save();
    Ok(list.projects)
}

#[tauri::command]
pub fn create_project(
    state: State<'_, AppState>,
    dir: String,
    name: String,
    backend_id: String,
    device: String,
    top_module: String,
    source_patterns: Option<Vec<String>>,
    constraint_files: Option<Vec<String>>,
) -> Result<ProjectConfig, String> {
    let project_dir = PathBuf::from(&dir);
    if !project_dir.exists() {
        std::fs::create_dir_all(&project_dir)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    let mut config = ProjectConfig::new_with_options(
        &name, &backend_id, &device, &top_module,
        source_patterns, constraint_files,
    );
    config.save(&project_dir)?;

    let mut list = RecentProjectsList::load();
    list.add(&project_dir, &config);
    list.save()?;

    let mut current = state.current_project.lock().map_err(|e| e.to_string())?;
    *current = Some((project_dir, config.clone()));

    Ok(config)
}

#[tauri::command]
pub fn open_project(
    state: State<'_, AppState>,
    dir: String,
) -> Result<ProjectConfig, String> {
    let project_dir = PathBuf::from(&dir);
    let config = ProjectConfig::load(&project_dir)?;

    let mut list = RecentProjectsList::load();
    list.add(&project_dir, &config);
    list.save()?;

    let mut current = state.current_project.lock().map_err(|e| e.to_string())?;
    *current = Some((project_dir, config.clone()));

    Ok(config)
}

#[tauri::command]
pub fn check_project_dir(dir: String) -> Result<Option<ProjectConfig>, String> {
    let project_dir = PathBuf::from(&dir);
    if ProjectConfig::exists(&project_dir) {
        Ok(Some(ProjectConfig::load(&project_dir)?))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn save_project(
    state: State<'_, AppState>,
    dir: String,
    config: ProjectConfig,
) -> Result<(), String> {
    let project_dir = PathBuf::from(&dir);
    let mut config = config;
    config.save(&project_dir)?;

    let mut current = state.current_project.lock().map_err(|e| e.to_string())?;
    *current = Some((project_dir, config));

    Ok(())
}

#[tauri::command]
pub async fn get_project_config_at_head(dir: String) -> Result<Option<ProjectConfig>, String> {
    tokio::task::spawn_blocking(move || {
        let project_dir = std::path::Path::new(&dir);
        let repo = match git2::Repository::discover(project_dir) {
            Ok(r) => r,
            Err(_) => return Ok(None), // Not a git repo
        };
        let head = match repo.head() {
            Ok(h) => h,
            Err(_) => return Ok(None), // No commits yet
        };
        let commit = head.peel_to_commit().map_err(|e| e.to_string())?;
        let tree = commit.tree().map_err(|e| e.to_string())?;

        // Find .coverteda relative to repo root
        let repo_root = repo.workdir().ok_or("Bare repo".to_string())?;
        let relative = project_dir
            .strip_prefix(repo_root)
            .unwrap_or(std::path::Path::new(""));
        let config_path = relative.join(".coverteda");

        let entry = match tree.get_path(&config_path) {
            Ok(e) => e,
            Err(_) => return Ok(None), // File not in HEAD
        };
        let blob = repo
            .find_blob(entry.id())
            .map_err(|e| e.to_string())?;
        let content = std::str::from_utf8(blob.content())
            .map_err(|e| e.to_string())?;
        let config: ProjectConfig =
            serde_json::from_str(content).map_err(|e| e.to_string())?;
        Ok(Some(config))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn remove_recent_project(path: String) -> Result<(), String> {
    let mut list = RecentProjectsList::load();
    list.remove(&path);
    list.save()
}

// ── Tool Detection & License Commands ──

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DetectedTool {
    pub backend_id: String,
    pub name: String,
    pub version: String,
    pub install_path: Option<String>,
    pub available: bool,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LicenseFeature {
    pub feature: String,
    pub vendor: String,
    pub expires: String,
    pub host_id: String,
    pub status: String,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LicenseFileInfo {
    pub backend: String,
    pub path: String,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LicenseCheckResult {
    pub license_files: Vec<LicenseFileInfo>,
    pub features: Vec<LicenseFeature>,
}

/// Ensure the registry has run full detection. On first call this upgrades
/// the deferred registry; subsequent calls are a no-op (use refresh_tools
/// to force re-detection).
fn ensure_detected(state: &AppState) -> Result<(), String> {
    let mut registry = state.registry.lock().map_err(|e| e.to_string())?;
    // Check if still in deferred state (first backend has empty version and no install_dir)
    let needs_detect = registry.list().first()
        .map(|b| b.version.is_empty() && !b.available)
        .unwrap_or(true);
    if needs_detect {
        *registry = crate::backend::BackendRegistry::new();
    }
    Ok(())
}

#[tauri::command]
pub fn detect_tools(state: State<'_, AppState>) -> Result<Vec<DetectedTool>, String> {
    // Upgrade deferred registry on first call
    ensure_detected(&state)?;

    let registry = state.registry.lock().map_err(|e| e.to_string())?;
    let backends = registry.list();

    // install_path now comes from BackendInfo (via the install_path_str trait method)
    // — no need to re-instantiate backends.
    let mut tools: Vec<DetectedTool> = backends
        .iter()
        .map(|b| DetectedTool {
            backend_id: b.id.clone(),
            name: b.name.clone(),
            version: b.version.clone(),
            install_path: b.install_path.clone(),
            available: b.available,
        })
        .collect();

    // Append placeholder vendors (not yet implemented in Rust backend)
    let placeholders = [
        ("gowin", "GOWIN EDA"),
        ("efinity", "Efinix Efinity"),
        ("quicklogic", "QuickLogic Aurora"),
        ("flexlogix", "Flex Logix EFLX"),
    ];
    for (id, name) in &placeholders {
        tools.push(DetectedTool {
            backend_id: id.to_string(),
            name: name.to_string(),
            version: String::new(),
            install_path: None,
            available: false,
        });
    }

    // Sort so available tools come first
    tools.sort_by(|a, b| b.available.cmp(&a.available));
    Ok(tools)
}

/// Re-detect all tools by re-running each backend's detection logic.
/// This re-creates the backend registry, picking up any tools installed
/// or configured since the app started.
#[tauri::command]
pub fn refresh_tools(state: State<'_, AppState>) -> Result<Vec<DetectedTool>, String> {
    // Re-create the registry so backends re-run their detection
    {
        let mut registry = state.registry.lock().map_err(|e| e.to_string())?;
        *registry = crate::backend::BackendRegistry::new();
    }
    // Re-use detect_tools to return the updated list
    detect_tools(state)
}

/// List all detected versions of a specific backend's tool.
#[tauri::command]
pub fn list_tool_versions(backend_id: String) -> Result<Vec<crate::backend::DetectedVersion>, String> {
    let versions = match backend_id.as_str() {
        "diamond" => crate::backend::diamond::DiamondBackend::scan_all_versions(),
        "radiant" => crate::backend::radiant::RadiantBackend::scan_all_versions(),
        "quartus" => crate::backend::quartus::QuartusBackend::scan_all_versions(crate::backend::quartus::QuartusEdition::Standard),
        "quartus_pro" => crate::backend::quartus::QuartusBackend::scan_all_versions(crate::backend::quartus::QuartusEdition::Pro),
        "vivado" => crate::backend::vivado::VivadoBackend::scan_all_versions(),
        "ace" => crate::backend::ace::AceBackend::scan_all_versions(),
        "libero" => crate::backend::libero::LiberoBackend::scan_all_versions(),
        "opensource" => crate::backend::oss::OssBackend::scan_all_versions(),
        _ => vec![],
    };
    Ok(versions)
}

/// Select a specific tool version by writing its install path to config.
/// This re-creates the BackendRegistry so the selected version is used.
#[tauri::command]
pub fn select_tool_version(
    backend_id: String,
    install_path: String,
    version: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut config = crate::config::AppConfig::load();

    // Write install path to the corresponding tool_paths field
    let path = std::path::PathBuf::from(&install_path);
    match backend_id.as_str() {
        "diamond" => config.tool_paths.diamond = Some(path),
        "radiant" => config.tool_paths.radiant = Some(path),
        "quartus" => config.tool_paths.quartus = Some(path),
        "quartus_pro" => config.tool_paths.quartus_pro = Some(path),
        "vivado" => config.tool_paths.vivado = Some(path),
        "opensource" => config.tool_paths.oss_cad_suite = Some(path),
        _ => {}
    }

    // Record which version was selected
    config.selected_versions.insert(backend_id, version);

    config.save().map_err(|e| e.to_string())?;

    // Re-create registry so backends pick up the new config
    let mut registry = state.registry.lock().map_err(|e| e.to_string())?;
    *registry = crate::backend::BackendRegistry::new();

    Ok(())
}

/// Run `which <cli_tool>` for a backend and return info about it.
#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WhichResult {
    /// Resolved path from `which`, if on PATH
    pub which_path: Option<String>,
    /// The bin directory CovertEDA detected (may not be on PATH)
    pub detected_bin_dir: Option<String>,
}

#[tauri::command]
pub fn which_tool(backend_id: String) -> Result<WhichResult, String> {
    let cli_names: Vec<&str> = match backend_id.as_str() {
        "diamond" => vec!["pnmainc", "diamond"],
        "radiant" => vec!["radiantc"],
        "quartus" => vec!["quartus_sh"],
        "vivado" => vec!["vivado"],
        "opensource" => vec!["yosys"],
        "ace" => vec!["ace"],
        "libero" => vec!["libero"],
        _ => return Ok(WhichResult { which_path: None, detected_bin_dir: None }),
    };

    // Cross-platform PATH lookup using the `which` crate
    let mut which_path = None;
    for name in &cli_names {
        if let Ok(path) = which::which(name) {
            which_path = Some(path.display().to_string());
            break;
        }
    }

    // Derive detected bin dir from install path
    let detected_bin_dir = get_backend_bin_dir(&backend_id);

    Ok(WhichResult { which_path, detected_bin_dir })
}

/// Get the bin directory for a backend from its detected install path.
fn get_backend_bin_dir(backend_id: &str) -> Option<String> {
    let install: std::path::PathBuf = match backend_id {
        "diamond" => crate::backend::diamond::DiamondBackend::new().install_dir()?.to_path_buf(),
        "radiant" => crate::backend::radiant::RadiantBackend::new().install_dir()?.to_path_buf(),
        "quartus" => crate::backend::quartus::QuartusBackend::new().install_dir()?.to_path_buf(),
        "vivado" => crate::backend::vivado::VivadoBackend::new().install_dir()?.to_path_buf(),
        "opensource" => crate::backend::oss::OssBackend::new().install_dir()?.to_path_buf(),
        "ace" => crate::backend::ace::AceBackend::new().install_dir()?.to_path_buf(),
        _ => return None,
    };

    let bin_dir = match backend_id {
        "diamond" | "radiant" => {
            let lin = install.join("bin").join("lin64");
            let nt = install.join("bin").join("nt64");
            if lin.exists() { lin } else if nt.exists() { nt } else { install.join("bin") }
        }
        "quartus" => {
            let q64 = install.join("quartus").join("bin64");
            let qbin = install.join("quartus").join("bin");
            if q64.exists() { q64 } else if qbin.exists() { qbin } else { install.join("bin") }
        }
        _ => install.join("bin"),
    };

    if bin_dir.exists() {
        Some(bin_dir.display().to_string())
    } else {
        None
    }
}

/// Add a detected tool's bin directory to the user's shell PATH config.
/// Detects bash/zsh on Unix, uses `setx` on Windows.
/// Returns a message describing what was done.
#[tauri::command]
pub fn add_tool_to_path(backend_id: String) -> Result<String, String> {
    let bin_str = get_backend_bin_dir(&backend_id)
        .ok_or_else(|| format!("{} is not detected — cannot determine bin path", backend_id))?;

    let backend_name = match backend_id.as_str() {
        "diamond" => "Lattice Diamond",
        "radiant" => "Lattice Radiant",
        "quartus" => "Intel Quartus",
        "vivado" => "AMD Vivado",
        "opensource" => "OSS CAD Suite",
        "ace" => "Achronix ACE",
        _ => &backend_id,
    };

    if cfg!(target_os = "windows") {
        // Windows: read user-level PATH from registry, append, write back.
        // Using PowerShell to read/write ONLY the user PATH (not the system PATH).
        let get_cmd = crate::process::no_window_cmd("powershell")
            .args(["-NoProfile", "-Command",
                "[Environment]::GetEnvironmentVariable('Path', 'User')"])
            .output()
            .map_err(|e| format!("Failed to read user PATH: {}", e))?;
        let user_path = String::from_utf8_lossy(&get_cmd.stdout).trim().to_string();
        // Check both user PATH and current process PATH
        if user_path.contains(&bin_str) || std::env::var("PATH").unwrap_or_default().contains(&bin_str) {
            return Ok(format!("{} (already in PATH)", bin_str));
        }
        let new_user_path = if user_path.is_empty() {
            bin_str.clone()
        } else {
            format!("{};{}", bin_str, user_path)
        };
        let set_cmd = crate::process::no_window_cmd("powershell")
            .args(["-NoProfile", "-Command",
                &format!("[Environment]::SetEnvironmentVariable('Path', '{}', 'User')", new_user_path)])
            .output()
            .map_err(|e| format!("Failed to update user PATH: {}", e))?;
        if !set_cmd.status.success() {
            return Err(format!("Failed to update PATH: {}", String::from_utf8_lossy(&set_cmd.stderr)));
        }
        return Ok(format!("{} → added to user PATH (restart app to take effect)", bin_str));
    }

    // Unix: detect shell from $SHELL env var, write to appropriate rc file
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    let home_path = std::path::PathBuf::from(&home);
    let shell = std::env::var("SHELL").unwrap_or_default();

    let rc_file = if shell.ends_with("/zsh") {
        home_path.join(".zshrc")
    } else if shell.ends_with("/fish") {
        // fish uses a different syntax — handle separately
        home_path.join(".config").join("fish").join("config.fish")
    } else {
        // Default to .bashrc (bash, sh, etc.)
        home_path.join(".bashrc")
    };

    let rc_name = rc_file.file_name().unwrap_or_default().to_string_lossy().to_string();

    // Check if already present
    let existing = std::fs::read_to_string(&rc_file).unwrap_or_default();
    if existing.contains(&bin_str) {
        return Ok(format!("{} (already in {})", bin_str, rc_name));
    }

    // Build the export line based on shell type
    let line = if shell.ends_with("/fish") {
        format!("\n# {} (added by CovertEDA)\nfish_add_path {}\n", backend_name, bin_str)
    } else {
        format!("\n# {} (added by CovertEDA)\nexport PATH=\"{}:$PATH\"\n", backend_name, bin_str)
    };

    // Ensure parent dir exists (for fish config)
    if let Some(parent) = rc_file.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&rc_file)
        .map_err(|e| format!("Failed to open {}: {}", rc_name, e))?;
    std::io::Write::write_all(&mut file, line.as_bytes())
        .map_err(|e| format!("Failed to write to {}: {}", rc_name, e))?;

    Ok(format!("{} → added to {}", bin_str, rc_name))
}

#[tauri::command]
pub fn check_licenses() -> Result<LicenseCheckResult, String> {
    let mut config = crate::config::AppConfig::load();
    let mut license_files: Vec<LicenseFileInfo> = vec![];
    let mut all_features: Vec<LicenseFeature> = vec![];
    let mut config_changed = false;

    // ── Radiant ──
    let radiant_path = resolve_cached_license(&config, "radiant", || {
        let radiant = crate::backend::radiant::RadiantBackend::new();
        radiant.find_license()
    });
    if let Some(ref path) = radiant_path {
        license_files.push(LicenseFileInfo {
            backend: "radiant".into(),
            path: path.display().to_string(),
        });
        all_features.extend(parse_license_file(path));
        let path_str = path.display().to_string();
        if config.license_files.get("radiant").map(|s| s.as_str()) != Some(&path_str) {
            config.license_files.insert("radiant".into(), path_str);
            config_changed = true;
        }
    }

    // ── Quartus ──
    let quartus_path = resolve_cached_license(&config, "quartus", || {
        let quartus = crate::backend::quartus::QuartusBackend::new();
        quartus.find_license()
    });
    if let Some(ref path) = quartus_path {
        license_files.push(LicenseFileInfo {
            backend: "quartus".into(),
            path: path.display().to_string(),
        });
        // Only add features not already present (in case both use the same file)
        let existing_names: std::collections::HashSet<String> =
            all_features.iter().map(|f| f.feature.clone()).collect();
        for feat in parse_license_file(path) {
            if !existing_names.contains(&feat.feature) {
                all_features.push(feat);
            }
        }
        let path_str = path.display().to_string();
        if config.license_files.get("quartus").map(|s| s.as_str()) != Some(&path_str) {
            config.license_files.insert("quartus".into(), path_str);
            config_changed = true;
        }
    }

    // Save updated cache if any new paths were discovered
    if config_changed {
        let _ = config.save();
    }

    Ok(LicenseCheckResult {
        license_files,
        features: all_features,
    })
}

/// Check the cached license path for a vendor. If the cached file still exists,
/// return it immediately. Otherwise, run the scan function to find a new one.
fn resolve_cached_license<F>(
    config: &crate::config::AppConfig,
    vendor: &str,
    scan: F,
) -> Option<PathBuf>
where
    F: FnOnce() -> Option<PathBuf>,
{
    // Check cached path first
    if let Some(cached) = config.license_files.get(vendor) {
        let p = PathBuf::from(cached);
        if p.exists() {
            return Some(p);
        }
    }
    // Fall back to legacy single license_file field (migration)
    if let Some(ref legacy) = config.license_file {
        let p = PathBuf::from(legacy);
        if p.exists() {
            return Some(p);
        }
    }
    // Full scan
    scan()
}

fn parse_license_file(path: &std::path::Path) -> Vec<LicenseFeature> {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    let mut features = vec![];
    // Join continuation lines (lines ending with \)
    let joined = content.replace("\\\n", " ").replace("\\\r\n", " ");

    for line in joined.lines() {
        let line = line.trim();
        if line.starts_with("FEATURE ") || line.starts_with("INCREMENT ") {
            // Format: FEATURE <name> <vendor> <version> <expiry> <count> <key> [options...]
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 6 {
                let feature_name = parts[1].to_string();
                let vendor = parts[2].to_string();
                let expires = parts[4].to_string();

                // Extract HOSTID if present
                let host_id = parts
                    .iter()
                    .find(|p| p.starts_with("HOSTID="))
                    .map(|p| p.trim_start_matches("HOSTID=").to_string())
                    .unwrap_or_default();

                // Determine status based on expiry date
                let status = if expires == "permanent" || expires == "0" {
                    "active".to_string()
                } else {
                    // Try to parse the date
                    match parse_license_date(&expires) {
                        Some(exp_date) => {
                            let now = chrono::Utc::now().date_naive();
                            if exp_date < now {
                                "expired".to_string()
                            } else {
                                let days_left = (exp_date - now).num_days();
                                if days_left < 30 {
                                    "warning".to_string()
                                } else {
                                    "active".to_string()
                                }
                            }
                        }
                        None => "unknown".to_string(),
                    }
                };

                features.push(LicenseFeature {
                    feature: feature_name,
                    vendor,
                    expires,
                    host_id,
                    status,
                });
            }
        }
    }

    features
}

fn parse_license_date(s: &str) -> Option<chrono::NaiveDate> {
    // FlexLM date format: "26-dec-2026" or "31-jan-2025"
    let months = [
        ("jan", 1), ("feb", 2), ("mar", 3), ("apr", 4),
        ("may", 5), ("jun", 6), ("jul", 7), ("aug", 8),
        ("sep", 9), ("oct", 10), ("nov", 11), ("dec", 12),
    ];
    let parts: Vec<&str> = s.split('-').collect();
    if parts.len() == 3 {
        let day: u32 = parts[0].parse().ok()?;
        let month = months
            .iter()
            .find(|(name, _)| *name == parts[1].to_lowercase())
            .map(|(_, num)| *num)?;
        let year: i32 = parts[2].parse().ok()?;
        chrono::NaiveDate::from_ymd_opt(year, month, day)
    } else {
        None
    }
}

/// Resolve the CLI executable path for a given backend.
/// Checks the backend's detected installation path first, then falls back to PATH.
fn resolve_cli_executable(cli_tool: &str, backend_id: &str) -> String {
    match backend_id {
        "diamond" => {
            let diamond = crate::backend::diamond::DiamondBackend::new();
            if let Some(path) = diamond.pnmainc_path_public() {
                return path.display().to_string();
            }
            cli_tool.to_string()
        }
        "radiant" => {
            let radiant = crate::backend::radiant::RadiantBackend::new();
            if let Some(path) = radiant.radiantc_path_public() {
                return path.display().to_string();
            }
            cli_tool.to_string()
        }
        "quartus" | "quartus_pro" => {
            let quartus = if backend_id == "quartus_pro" {
                crate::backend::quartus::QuartusBackend::new_pro()
            } else {
                crate::backend::quartus::QuartusBackend::new()
            };
            if let Some(path) = quartus.quartus_sh_path_public() {
                return path.display().to_string();
            }
            cli_tool.to_string()
        }
        "opensource" => {
            // OSS scripts are bash; cli_tool is already "bash"
            "bash".to_string()
        }
        _ => cli_tool.to_string(),
    }
}

/// Convert a WSL path to a Windows path for use by Windows executables.
/// /mnt/c/Users/foo → C:\Users\foo
/// /home/user/proj  → \\wsl.localhost\<distro>\home\user\proj
fn wsl_to_windows_path(path: &std::path::Path) -> String {
    let s = path.display().to_string();
    if s.starts_with("/mnt/") && s.len() > 6 {
        let drive = s.chars().nth(5).unwrap().to_uppercase().to_string();
        let rest = &s[6..];
        format!("{}:{}", drive, rest.replace('/', "\\"))
    } else if s.starts_with('/') {
        // WSL-native path → UNC path
        if let Ok(distro) = std::env::var("WSL_DISTRO_NAME") {
            format!("\\\\wsl.localhost\\{}{}", distro, s.replace('/', "\\"))
        } else {
            s
        }
    } else {
        s
    }
}

fn uuid_v4() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("{:x}", t)
}

// ═══════════════════════════════════════════
// ── PROGRAMMER COMMANDS ──
// ═══════════════════════════════════════════

#[tauri::command]
pub fn detect_programmer_cables(
    state: State<'_, AppState>,
) -> Result<Vec<crate::programmer::Cable>, String> {
    // Currently Radiant-only (pgrcmd)
    let radiant = crate::backend::radiant::RadiantBackend::new();
    let install_dir = radiant
        .install_dir()
        .ok_or("Radiant not installed — cannot scan for programmer cables")?;

    let pgrcmd = crate::programmer::find_pgrcmd(install_dir)
        .ok_or("pgrcmd not found in Radiant installation")?;

    // Write a scan XCF to a temp file
    let xcf_content = crate::programmer::generate_scan_xcf();
    let xcf_path = std::env::temp_dir().join(".coverteda_scan.xcf");
    std::fs::write(&xcf_path, &xcf_content)
        .map_err(|e| format!("Failed to write scan XCF: {}", e))?;

    let xcf_arg = wsl_to_windows_path(&xcf_path);
    let pgrcmd_str = pgrcmd.display().to_string();

    // Determine license env
    let mut env_vars: HashMap<String, String> = HashMap::new();
    if let Some(lic_path) = radiant.find_license() {
        env_vars.insert("LM_LICENSE_FILE".into(), wsl_to_windows_path(&lic_path));
    }

    let mut cmd = crate::process::no_window_cmd(&pgrcmd_str);
    cmd.arg("-infile").arg(&xcf_arg);
    for (key, val) in &env_vars {
        cmd.env(key, val);
    }

    let output = cmd.output().map_err(|e| format!("Failed to run pgrcmd: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = format!("{}\n{}", stdout, stderr);

    let _ = std::fs::remove_file(&xcf_path);

    // Force-drop the lock to satisfy the borrow checker
    drop(state);

    Ok(crate::programmer::parse_cable_scan_output(&combined))
}

#[tauri::command]
pub fn find_bitstreams(
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let current = state.current_project.lock().map_err(|e| e.to_string())?;
    let (project_dir, config) = current
        .as_ref()
        .ok_or("No project is open")?;

    let bitstreams = crate::programmer::find_bitstreams(project_dir, &config.impl_dir);
    Ok(bitstreams.into_iter().map(|p| p.display().to_string()).collect())
}

#[tauri::command]
pub fn program_device(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    bitstream: String,
    device: String,
    cable_port: String,
    operation: String,
) -> Result<String, String> {
    let radiant = crate::backend::radiant::RadiantBackend::new();
    let install_dir = radiant
        .install_dir()
        .ok_or("Radiant not installed")?;

    let pgrcmd = crate::programmer::find_pgrcmd(install_dir)
        .ok_or("pgrcmd not found")?;

    let bitstream_win = wsl_to_windows_path(&PathBuf::from(&bitstream));
    let xcf_content = crate::programmer::generate_program_xcf(
        &bitstream_win,
        &device,
        &cable_port,
        &operation,
    );

    let xcf_path = std::env::temp_dir().join(".coverteda_program.xcf");
    std::fs::write(&xcf_path, &xcf_content)
        .map_err(|e| format!("Failed to write program XCF: {}", e))?;

    let xcf_arg = wsl_to_windows_path(&xcf_path);
    let pgrcmd_str = pgrcmd.display().to_string();

    let mut env_vars: HashMap<String, String> = HashMap::new();
    if let Some(lic_path) = radiant.find_license() {
        env_vars.insert("LM_LICENSE_FILE".into(), wsl_to_windows_path(&lic_path));
    }

    let prog_id = uuid_v4();
    let prog_id_clone = prog_id.clone();

    // Force-drop the lock
    drop(state);

    std::thread::spawn(move || {
        use std::io::BufRead;
        use std::process::Stdio;

        let _ = app_handle.emit("program:stdout", serde_json::json!({
            "progId": &prog_id_clone,
            "line": format!("Programming {} with {}", &device, &bitstream),
        }));
        let _ = app_handle.emit("program:stdout", serde_json::json!({
            "progId": &prog_id_clone,
            "line": format!("Cable: {}", &cable_port),
        }));
        let _ = app_handle.emit("program:stdout", serde_json::json!({
            "progId": &prog_id_clone,
            "line": format!("Spawning: {} -infile {}", &pgrcmd_str, &xcf_arg),
        }));

        let mut cmd = crate::process::no_window_cmd(&pgrcmd_str);
        cmd.arg("-infile")
            .arg(&xcf_arg)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        for (key, val) in &env_vars {
            cmd.env(key, val);
        }

        match cmd.spawn() {
            Ok(mut child) => {
                let stderr_handle = child.stderr.take().map(|stderr| {
                    let app_h = app_handle.clone();
                    let pid = prog_id_clone.clone();
                    std::thread::spawn(move || {
                        let reader = std::io::BufReader::new(stderr);
                        for line in reader.lines().flatten() {
                            let _ = app_h.emit("program:stdout", serde_json::json!({
                                "progId": &pid,
                                "line": &line,
                            }));
                        }
                    })
                });

                if let Some(stdout) = child.stdout.take() {
                    let reader = std::io::BufReader::new(stdout);
                    for line in reader.lines().flatten() {
                        let _ = app_handle.emit("program:stdout", serde_json::json!({
                            "progId": &prog_id_clone,
                            "line": &line,
                        }));
                    }
                }

                if let Some(h) = stderr_handle {
                    let _ = h.join();
                }

                match child.wait() {
                    Ok(status) => {
                        let success = status.success();
                        let msg = if success {
                            "Programming complete".to_string()
                        } else {
                            format!("Programming failed: {}", status)
                        };
                        let _ = app_handle.emit("program:finished", serde_json::json!({
                            "progId": &prog_id_clone,
                            "success": success,
                            "message": &msg,
                        }));
                    }
                    Err(e) => {
                        let _ = app_handle.emit("program:finished", serde_json::json!({
                            "progId": &prog_id_clone,
                            "success": false,
                            "message": format!("Wait error: {}", e),
                        }));
                    }
                }
                let _ = std::fs::remove_file(&xcf_path);
            }
            Err(e) => {
                let _ = app_handle.emit("program:finished", serde_json::json!({
                    "progId": &prog_id_clone,
                    "success": false,
                    "message": format!("Failed to spawn pgrcmd: {}", e),
                }));
            }
        }
    });

    Ok(prog_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Datelike;

    // ── WSL path conversion ──

    #[test]
    fn test_wsl_to_windows_path_mnt_c() {
        let p = std::path::Path::new("/mnt/c/Users/foo/project");
        let result = wsl_to_windows_path(p);
        assert_eq!(result, r"C:\Users\foo\project");
    }

    #[test]
    fn test_wsl_to_windows_path_mnt_d() {
        let p = std::path::Path::new("/mnt/d/work/design.tcl");
        let result = wsl_to_windows_path(p);
        assert_eq!(result, r"D:\work\design.tcl");
    }

    #[test]
    fn test_wsl_to_windows_path_native_linux() {
        let p = std::path::Path::new("/home/user/project");
        let result = wsl_to_windows_path(p);
        if std::env::var("WSL_DISTRO_NAME").is_ok() {
            assert!(result.starts_with("\\\\wsl.localhost\\"));
            assert!(result.ends_with("\\home\\user\\project"));
        } else {
            assert_eq!(result, "/home/user/project");
        }
    }

    #[test]
    fn test_wsl_to_windows_path_short() {
        let p = std::path::Path::new("/mnt/");
        let result = wsl_to_windows_path(p);
        // Too short for /mnt/X/ conversion — falls through to UNC or passthrough
        if std::env::var("WSL_DISTRO_NAME").is_ok() {
            assert!(result.starts_with("\\\\wsl.localhost\\"));
        } else {
            assert_eq!(result, "/mnt/");
        }
    }

    // ── UUID generation ──

    #[test]
    fn test_uuid_v4_nonempty() {
        let id = uuid_v4();
        assert!(!id.is_empty());
    }

    #[test]
    fn test_uuid_v4_uniqueness() {
        let a = uuid_v4();
        std::thread::sleep(std::time::Duration::from_millis(1));
        let b = uuid_v4();
        assert_ne!(a, b);
    }

    // ── License date parsing ──

    #[test]
    fn test_parse_license_date_valid() {
        let d = parse_license_date("26-dec-2026");
        assert!(d.is_some());
        let d = d.unwrap();
        assert_eq!(d.year(), 2026);
        assert_eq!(d.month(), 12);
        assert_eq!(d.day(), 26);
    }

    #[test]
    fn test_parse_license_date_invalid() {
        assert!(parse_license_date("not-a-date").is_none());
    }

    #[test]
    fn test_parse_license_date_partial() {
        assert!(parse_license_date("26-dec").is_none());
    }

    // ── License file parsing ──

    #[test]
    fn test_parse_license_file_feature_line() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(tmp.path(), "FEATURE LSC_RADIANT lattice 1.0 26-dec-2099 uncounted ABCD1234 HOSTID=ANY\n").unwrap();
        let features = parse_license_file(tmp.path());
        assert_eq!(features.len(), 1);
        assert_eq!(features[0].feature, "LSC_RADIANT");
        assert_eq!(features[0].vendor, "lattice");
        assert_eq!(features[0].expires, "26-dec-2099");
        assert_eq!(features[0].status, "active");
    }

    #[test]
    fn test_parse_license_file_permanent_status() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(tmp.path(), "FEATURE LSC_FREE lattice 1.0 permanent uncounted ABCD1234\n").unwrap();
        let features = parse_license_file(tmp.path());
        assert_eq!(features.len(), 1);
        assert_eq!(features[0].status, "active");
    }

    #[test]
    fn test_parse_license_file_increment_line() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(tmp.path(), "INCREMENT quartus_pro intel 24.0 31-jan-2099 10 KEY123\n").unwrap();
        let features = parse_license_file(tmp.path());
        assert_eq!(features.len(), 1);
        assert_eq!(features[0].feature, "quartus_pro");
        assert_eq!(features[0].vendor, "intel");
    }

    #[test]
    fn test_parse_license_file_continuation_lines() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(tmp.path(), "FEATURE long_feature vendor 1.0 \\\n26-dec-2099 uncounted KEY123\n").unwrap();
        let features = parse_license_file(tmp.path());
        assert_eq!(features.len(), 1);
        assert_eq!(features[0].feature, "long_feature");
    }
}

// ── Raw report file reading ──

#[tauri::command]
pub fn get_raw_report(project_dir: String, report_type: String) -> Result<String, String> {
    let project_path = PathBuf::from(&project_dir);

    // Search in vendor output dirs, OSS build/ directory, and project root
    // (Quartus may place reports directly in the project directory)
    let search_dirs: Vec<PathBuf> = vec![
        project_path.join("output_files"),
        project_path.join("impl1"),
        project_path.join("build"),
        project_path.join("output"),
        project_path.clone(),
    ];

    // Map report type to file extensions/patterns
    // Includes vendor-specific patterns and OSS log file names
    let patterns: Vec<&str> = match report_type.as_str() {
        "synth" => vec!["srr", "srp", "syn.rpt", "map.rpt", "synth.log"],
        "map" => vec!["mrp", "map.rpt", "fit.rpt", "synth.log"],
        "par" => vec!["par", "fit.rpt", "pnr.log"],
        "bitstream" => vec!["bgn", "asm.rpt", "bitstream.log"],
        "timing" => vec!["twr", "sta.rpt"],
        "fit" => vec!["fit.rpt", "par"],
        "sta" => vec!["sta.rpt", "twr"],
        "asm" => vec!["asm.rpt", "bgn"],
        "flow" => vec!["flow.rpt", "flow_summary.rpt"],
        _ => return Err(format!("Unknown report type: {}", report_type)),
    };

    for dir in &search_dirs {
        if !dir.exists() {
            continue;
        }
        let entries: Vec<_> = std::fs::read_dir(dir)
            .map_err(|e| e.to_string())?
            .filter_map(|e| e.ok())
            .collect();

        for pattern in &patterns {
            // Check if pattern contains a dot (suffix match) vs plain extension
            if pattern.contains('.') {
                // Match files ending with this suffix
                let found = entries.iter().find(|e| {
                    e.path().to_str().map(|s| s.ends_with(pattern)).unwrap_or(false)
                });
                if let Some(entry) = found {
                    return std::fs::read_to_string(entry.path()).map_err(|e| e.to_string());
                }
            } else {
                // Match by extension
                let found = entries.iter().find(|e| {
                    e.path().extension().map(|x| x == *pattern).unwrap_or(false)
                });
                if let Some(entry) = found {
                    return std::fs::read_to_string(entry.path()).map_err(|e| e.to_string());
                }
            }
        }
    }

    Err(format!("No report file found for type '{}'", report_type))
}

// ── Auto-detect report loading (no backend ID needed) ──

/// All reports bundled into a single response.
#[derive(serde::Serialize)]
pub struct AutoReports {
    pub timing: Option<TimingReport>,
    pub utilization: Option<ResourceReport>,
    pub power: Option<PowerReport>,
    pub drc: Option<DrcReport>,
}

/// Try to load all available reports by auto-detecting project type from files on disk.
/// Falls back through multiple parsers so it works regardless of backend ID.
#[tauri::command]
pub fn auto_load_reports(project_dir: String) -> Result<AutoReports, String> {
    let dir = PathBuf::from(&project_dir);
    let build_dir = dir.join("build");
    let impl_dir = dir.join("impl1");

    let mut timing: Option<TimingReport> = None;
    let mut utilization: Option<ResourceReport> = None;
    let mut power: Option<PowerReport> = None;
    let mut drc: Option<DrcReport>;

    // ── Try OSS / nextpnr report.json first ──
    let report_json = build_dir.join("report.json");
    if report_json.exists() {
        if let Ok(content) = std::fs::read_to_string(&report_json) {
            if timing.is_none() {
                timing = crate::parser::timing::parse_nextpnr_timing(&content).ok();
            }
            if utilization.is_none() {
                utilization = crate::parser::utilization::parse_nextpnr_utilization(&content, "auto").ok();
            }
            // Power estimate from utilization
            if power.is_none() {
                power = estimate_power_from_json(&content);
            }
        }
    }

    // ── Fallback: parse nextpnr pnr.log for timing ──
    let pnr_log = build_dir.join("pnr.log");
    if timing.is_none() && pnr_log.exists() {
        if let Ok(content) = std::fs::read_to_string(&pnr_log) {
            timing = crate::parser::timing::parse_nextpnr_log_timing(&content).ok();
        }
    }

    // ── Fallback: parse Yosys synth.log for utilization ──
    let synth_log = build_dir.join("synth.log");
    if utilization.is_none() && synth_log.exists() {
        if let Ok(content) = std::fs::read_to_string(&synth_log) {
            if let Ok(synth) = crate::parser::synthesis::parse_yosys_synthesis(&content) {
                let mut items = vec![];
                if synth.lut_count > 0 {
                    items.push(ResourceItem { resource: "LUTs".into(), used: synth.lut_count, total: 0, detail: Some("from synthesis (pre-PnR)".into()) });
                }
                if synth.reg_count > 0 {
                    items.push(ResourceItem { resource: "Registers/FFs".into(), used: synth.reg_count, total: 0, detail: Some("from synthesis (pre-PnR)".into()) });
                }
                if synth.ram_count > 0 {
                    items.push(ResourceItem { resource: "Block RAM".into(), used: synth.ram_count, total: 0, detail: Some("from synthesis (pre-PnR)".into()) });
                }
                if synth.dsp_count > 0 {
                    items.push(ResourceItem { resource: "DSP Blocks".into(), used: synth.dsp_count, total: 0, detail: Some("from synthesis (pre-PnR)".into()) });
                }
                if !items.is_empty() {
                    utilization = Some(ResourceReport {
                        device: "auto".into(),
                        categories: vec![ResourceCategory { name: "Logic (Synthesis Estimate)".into(), items }],
                        by_module: vec![],
                    });
                }
            }
        }
    }

    // ── DRC: parse warnings/errors from all log files ──
    {
        let mut drc_items = Vec::new();
        let mut errors = 0u32;
        let mut warnings = 0u32;
        let mut critical_warnings = 0u32;
        let info_count = 0u32;
        let bitstream_log = build_dir.join("bitstream.log");

        for (log_path, source) in [
            (&synth_log, "yosys"),
            (&pnr_log, "nextpnr"),
            (&bitstream_log, "packer"),
        ] {
            if let Ok(content) = std::fs::read_to_string(log_path) {
                for line in content.lines() {
                    let trimmed = line.trim();
                    if trimmed.starts_with("Warning:") || trimmed.contains("] Warning:") {
                        let msg = trimmed.splitn(2, "Warning:").nth(1).unwrap_or(trimmed).trim().to_string();
                        let lower = msg.to_lowercase();
                        if source == "nextpnr" && (lower.contains("timing") || lower.contains("slack") || lower.contains("frequency")) {
                            critical_warnings += 1;
                            drc_items.push(DrcItem { severity: DrcSeverity::CriticalWarning, code: format!("{}-CW", source.to_uppercase()), message: msg, location: source.to_string(), action: "Review timing warning".into() });
                        } else {
                            warnings += 1;
                            drc_items.push(DrcItem { severity: DrcSeverity::Warning, code: format!("{}-W", source.to_uppercase()), message: msg, location: source.to_string(), action: "Review warning".into() });
                        }
                    } else if trimmed.starts_with("ERROR:") || trimmed.starts_with("Error:") {
                        errors += 1;
                        let msg = trimmed.splitn(2, "rror:").nth(1).unwrap_or(trimmed).trim().to_string();
                        drc_items.push(DrcItem { severity: DrcSeverity::Error, code: format!("{}-E", source.to_uppercase()), message: msg, location: source.to_string(), action: "Fix error".into() });
                    }
                }
            }
        }
        drc = Some(DrcReport { errors, critical_warnings, warnings, info: info_count, waived: 0, items: drc_items });
    }

    // ── Vendor-specific DRC: merge into existing DRC report ──
    // Radiant: .drc files in impl1/
    if impl_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&impl_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.extension().map(|e| e == "drc").unwrap_or(false) {
                    if let Ok(content) = std::fs::read_to_string(&p) {
                        let vendor_drc = parse_radiant_drc_content(&content);
                        merge_drc(&mut drc, vendor_drc);
                    }
                }
            }
        }
    }

    // ACE: *_drc.rpt in output/
    let ace_output_dir_drc = dir.join("output");
    if ace_output_dir_drc.exists() {
        if let Ok(entries) = std::fs::read_dir(&ace_output_dir_drc) {
            for entry in entries.flatten() {
                let p = entry.path();
                let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if name.ends_with("_drc.rpt") {
                    if let Ok(content) = std::fs::read_to_string(&p) {
                        let vendor_drc = parse_ace_drc_content(&content);
                        merge_drc(&mut drc, vendor_drc);
                    }
                }
            }
        }
    }

    // Libero: drc/drc_report.rpt or drc_report.rpt
    for candidate in [dir.join("drc").join("drc_report.rpt"), dir.join("drc_report.rpt")] {
        if candidate.exists() {
            if let Ok(content) = std::fs::read_to_string(&candidate) {
                let vendor_drc = parse_libero_drc_content(&content);
                merge_drc(&mut drc, vendor_drc);
                break;
            }
        }
    }

    // ── Try vendor reports from impl1/ (Lattice Diamond/Radiant) ──
    if timing.is_none() {
        if impl_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&impl_dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.extension().map(|e| e == "twr").unwrap_or(false) {
                        if let Ok(content) = std::fs::read_to_string(&p) {
                            timing = crate::parser::timing::parse_radiant_timing(&content).ok()
                                .or_else(|| crate::parser::timing::parse_diamond_timing(&content).ok());
                            break;
                        }
                    }
                }
            }
        }
    }
    if utilization.is_none() {
        if impl_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&impl_dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.extension().map(|e| e == "mrp").unwrap_or(false) {
                        if let Ok(content) = std::fs::read_to_string(&p) {
                            utilization = crate::parser::utilization::parse_radiant_utilization(&content, "auto").ok();
                            break;
                        }
                    }
                }
            }
        }
    }

    // ── Try Quartus reports from output_files/ and project root ──
    let output_files_dir = dir.join("output_files");
    let quartus_search_dirs: [PathBuf; 2] = [output_files_dir.clone(), dir.clone()];

    if timing.is_none() {
        for search_dir in &quartus_search_dirs {
            if !search_dir.exists() { continue; }
            if let Ok(entries) = std::fs::read_dir(search_dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                    if name.ends_with(".sta.rpt") {
                        if let Ok(content) = std::fs::read_to_string(&p) {
                            timing = crate::parser::timing::parse_quartus_timing(&content).ok();
                            if timing.is_some() { break; }
                        }
                    }
                }
            }
            if timing.is_some() { break; }
        }
    }

    if utilization.is_none() {
        for search_dir in &quartus_search_dirs {
            if !search_dir.exists() { continue; }
            if let Ok(entries) = std::fs::read_dir(search_dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                    if name.ends_with(".fit.rpt") {
                        if let Ok(content) = std::fs::read_to_string(&p) {
                            utilization = crate::parser::utilization::parse_quartus_utilization(&content, "auto").ok();
                            if utilization.is_some() { break; }
                        }
                    }
                }
            }
            if utilization.is_some() { break; }
        }
    }

    // ── Try Vivado reports from *.runs/ directories ──
    if timing.is_none() || utilization.is_none() {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                if name.ends_with(".runs") && p.is_dir() {
                    // Scan for timing/utilization reports inside run dirs
                    if let Ok(run_entries) = std::fs::read_dir(&p) {
                        for run_entry in run_entries.flatten() {
                            let rp = run_entry.path();
                            if rp.is_dir() {
                                if let Ok(inner) = std::fs::read_dir(&rp) {
                                    for file in inner.flatten() {
                                        let fp = file.path();
                                        let fname = fp.file_name().and_then(|n| n.to_str()).unwrap_or("");
                                        if timing.is_none() && fname.contains("timing_summary") && fname.ends_with(".rpt") {
                                            if let Ok(content) = std::fs::read_to_string(&fp) {
                                                timing = crate::parser::timing::parse_vivado_timing(&content).ok();
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // ── Try ACE reports from output/ ──
    let ace_output_dir = dir.join("output");
    if timing.is_none() && ace_output_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&ace_output_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if name.ends_with("_timing.rpt") {
                    if let Ok(content) = std::fs::read_to_string(&p) {
                        timing = crate::parser::timing::parse_ace_timing(&content).ok();
                        if timing.is_some() { break; }
                    }
                }
            }
        }
    }
    if utilization.is_none() && ace_output_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&ace_output_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if name.ends_with("_utilization.rpt") {
                    if let Ok(content) = std::fs::read_to_string(&p) {
                        utilization = crate::parser::utilization::parse_ace_utilization(&content, "auto").ok();
                        if utilization.is_some() { break; }
                    }
                }
            }
        }
    }

    Ok(AutoReports { timing, utilization, power, drc })
}

// ── Vendor DRC parsers for auto_load_reports (no backend instance needed) ──

/// Parse Radiant `.drc` file content directly.
fn parse_radiant_drc_content(content: &str) -> DrcReport {
    let mut errors = 0u32;
    let mut warnings = 0u32;
    let mut items = Vec::new();

    let summary_re = regex::Regex::new(r"DRC detected (\d+) errors? and (\d+) warnings?").unwrap();
    if let Some(caps) = summary_re.captures(content) {
        errors = caps[1].parse().unwrap_or(0);
        warnings = caps[2].parse().unwrap_or(0);
    }

    let item_re = regex::Regex::new(r"(?m)^(ERROR|WARNING)\s*-\s*([A-Z0-9_]+):\s*(.+)$").unwrap();
    for caps in item_re.captures_iter(content) {
        let sev = match &caps[1] {
            "ERROR" => DrcSeverity::Error,
            _ => DrcSeverity::Warning,
        };
        items.push(DrcItem {
            severity: sev,
            code: caps[2].to_string(),
            message: caps[3].trim().to_string(),
            location: String::new(),
            action: String::new(),
        });
    }

    DrcReport { errors, critical_warnings: 0, warnings, info: 0, waived: 0, items }
}

/// Parse ACE `*_drc.rpt` file content directly.
fn parse_ace_drc_content(content: &str) -> DrcReport {
    let mut errors = 0u32;
    let mut warnings = 0u32;
    let mut items = Vec::new();

    let item_re = regex::Regex::new(r"(?m)^(ERROR|WARNING):\s*\[([^\]]+)\]\s*(.+)$").unwrap();
    for caps in item_re.captures_iter(content) {
        let sev = match &caps[1] {
            "ERROR" => { errors += 1; DrcSeverity::Error }
            _ => { warnings += 1; DrcSeverity::Warning }
        };
        items.push(DrcItem {
            severity: sev,
            code: caps[2].trim().to_string(),
            message: caps[3].trim().to_string(),
            location: String::new(),
            action: String::new(),
        });
    }

    DrcReport { errors, critical_warnings: 0, warnings, info: 0, waived: 0, items }
}

/// Parse Libero `drc_report.rpt` file content directly.
fn parse_libero_drc_content(content: &str) -> DrcReport {
    let err_re = regex::Regex::new(r"(?i)errors?\s*[:\|]\s*(\d+)").ok();
    let warn_re = regex::Regex::new(r"(?i)warnings?\s*[:\|]\s*(\d+)").ok();

    let errors = err_re
        .and_then(|r| r.captures(content))
        .and_then(|c| c[1].parse().ok())
        .unwrap_or(0);
    let warnings = warn_re
        .and_then(|r| r.captures(content))
        .and_then(|c| c[1].parse().ok())
        .unwrap_or(0);

    DrcReport { errors, critical_warnings: 0, warnings, info: 0, waived: 0, items: vec![] }
}

/// Merge a vendor-specific DRC report into the existing (log-based) DRC report.
/// Vendor items are added alongside log-parsed items, and summary counts are updated.
fn merge_drc(existing: &mut Option<DrcReport>, vendor: DrcReport) {
    if vendor.items.is_empty() && vendor.errors == 0 && vendor.warnings == 0 {
        return;
    }
    match existing {
        Some(ref mut drc) => {
            drc.errors += vendor.errors;
            drc.warnings += vendor.warnings;
            drc.critical_warnings += vendor.critical_warnings;
            drc.info += vendor.info;
            drc.items.extend(vendor.items);
        }
        None => {
            *existing = Some(vendor);
        }
    }
}

/// Estimate power from nextpnr report.json utilization data
fn estimate_power_from_json(json_str: &str) -> Option<PowerReport> {
    let json: serde_json::Value = serde_json::from_str(json_str).ok()?;
    let util = json.get("utilisation").or_else(|| json.get("utilization"))?.as_object()?;
    let mut lut_count = 0.0f64;
    let mut ff_count = 0.0f64;
    let mut bram_count = 0.0f64;
    for (key, val) in util {
        let lower = key.to_lowercase();
        let used = val.as_object()?.get("used")?.as_f64().unwrap_or(0.0);
        if lower.contains("lut") || lower.contains("slice") || lower.contains("lc") { lut_count += used; }
        else if lower.contains("ff") || lower.contains("dff") || lower.contains("reg") { ff_count += used; }
        else if lower.contains("bram") || lower.contains("ebr") || lower.contains("ram") { bram_count += used; }
    }
    if lut_count == 0.0 && ff_count == 0.0 && bram_count == 0.0 { return None; }
    let static_mw = 50.0;
    let lut_mw = lut_count * 0.01;
    let ff_mw = ff_count * 0.005;
    let bram_mw = bram_count * 5.0;
    let total_mw = static_mw + lut_mw + ff_mw + bram_mw;
    Some(PowerReport {
        total_mw, junction_temp_c: 25.0, ambient_temp_c: 25.0, theta_ja: 0.0, confidence: "Estimate".into(),
        breakdown: vec![
            PowerBreakdown { category: "Static".into(), mw: static_mw, percentage: (static_mw / total_mw) * 100.0 },
            PowerBreakdown { category: "Logic (LUTs)".into(), mw: lut_mw, percentage: (lut_mw / total_mw) * 100.0 },
            PowerBreakdown { category: "Registers (FFs)".into(), mw: ff_mw, percentage: (ff_mw / total_mw) * 100.0 },
            PowerBreakdown { category: "Block RAM".into(), mw: bram_mw, percentage: (bram_mw / total_mw) * 100.0 },
        ],
        by_rail: vec![
            PowerRail { rail: "VCCIO".into(), mw: total_mw * 0.3 },
            PowerRail { rail: "VCCINT".into(), mw: total_mw * 0.7 },
        ],
    })
}

// ── Makefile Import/Export Commands ──

#[tauri::command]
pub fn import_makefile(path: String) -> Result<crate::makefile::MakefileImportResult, String> {
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read Makefile: {}", e))?;
    let config = crate::makefile::parse_makefile(&content);
    Ok(crate::makefile::makefile_config_to_import_result(&config))
}

#[tauri::command]
pub fn export_makefile(
    _project_dir: String,
    device: String,
    top_module: String,
    sources: Vec<String>,
    constraints: Vec<String>,
    build_dir: String,
    build_options: HashMap<String, String>,
) -> Result<String, String> {
    Ok(crate::makefile::generate_makefile(
        &device,
        &top_module,
        &sources,
        &constraints,
        &build_dir,
        &build_options,
    ))
}

// ── Git Init Command ──

#[tauri::command]
pub fn git_init(project_dir: String) -> Result<String, String> {
    crate::git::init_repo(&PathBuf::from(project_dir))
}

// ── App Config commands ──

#[tauri::command]
pub fn delete_file(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let file_path = PathBuf::from(&path);

    // Security check: file must be within the current project directory
    let project_guard = state.current_project.lock().map_err(|e| e.to_string())?;
    if let Some((project_dir, _)) = &*project_guard {
        let canonical_file = file_path.canonicalize()
            .map_err(|e| format!("Cannot resolve path {}: {}", path, e))?;
        let canonical_dir = project_dir.canonicalize()
            .map_err(|e| format!("Cannot resolve project dir: {}", e))?;
        if !canonical_file.starts_with(&canonical_dir) {
            return Err("File is outside the project directory".to_string());
        }
    } else {
        return Err("No project is currently open".to_string());
    }
    drop(project_guard);

    std::fs::remove_file(&file_path)
        .map_err(|e| format!("Failed to delete {}: {}", path, e))
}

#[tauri::command]
pub fn delete_directory(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let dir_path = PathBuf::from(&path);

    // Security check: directory must be within the current project
    let project_guard = state.current_project.lock().map_err(|e| e.to_string())?;
    if let Some((project_dir, _)) = &*project_guard {
        let canonical_dir = dir_path.canonicalize()
            .map_err(|e| format!("Cannot resolve path {}: {}", path, e))?;
        let canonical_project = project_dir.canonicalize()
            .map_err(|e| format!("Cannot resolve project dir: {}", e))?;
        if !canonical_dir.starts_with(&canonical_project) {
            return Err("Directory is outside the project".to_string());
        }
        // Don't allow deleting the project root itself
        if canonical_dir == canonical_project {
            return Err("Cannot delete the project root directory".to_string());
        }
    } else {
        return Err("No project is currently open".to_string());
    }
    drop(project_guard);

    std::fs::remove_dir_all(&dir_path)
        .map_err(|e| format!("Failed to delete {}: {}", path, e))
}

#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_in_file_manager(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    #[cfg(target_os = "linux")]
    {
        // On WSL, try explorer.exe first (opens Windows Explorer)
        if std::fs::read_to_string("/proc/version")
            .unwrap_or_default()
            .contains("microsoft")
        {
            // Convert WSL path to Windows path for /mnt/c/... paths
            let win_path = if path.starts_with("/mnt/") {
                let trimmed = path.strip_prefix("/mnt/").unwrap();
                let drive = &trimmed[..1];
                let rest = &trimmed[1..];
                format!("{}:{}", drive.to_uppercase(), rest.replace('/', "\\"))
            } else {
                // Use wslpath for non-/mnt/ paths
                match crate::process::no_window_cmd("wslpath")
                    .args(["-w", &path])
                    .output()
                {
                    Ok(out) => String::from_utf8_lossy(&out.stdout).trim().to_string(),
                    Err(_) => path.clone(),
                }
            };
            return std::process::Command::new("explorer.exe")
                .arg(&win_path)
                .spawn()
                .map(|_| ())
                .map_err(|e| format!("Failed to open explorer.exe: {}", e));
        }
        // Native Linux: use xdg-open
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to open: {}", e))
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to open: {}", e))
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to open: {}", e))
    }
}

#[tauri::command]
pub fn open_in_editor(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    let config = crate::config::AppConfig::load();

    // If a preferred editor is configured, use it directly
    if let Some(ref editor) = config.preferred_editor {
        if !editor.is_empty() {
            // On WSL, convert path if the editor is a Windows binary
            let file_arg = if cfg!(target_os = "linux") {
                let is_wsl = std::fs::read_to_string("/proc/version")
                    .unwrap_or_default()
                    .contains("microsoft");
                let is_windows_editor = editor.ends_with(".exe")
                    || editor.contains("\\")
                    || editor.starts_with("/mnt/");
                if is_wsl && is_windows_editor && path.starts_with("/mnt/") {
                    let trimmed = path.strip_prefix("/mnt/").unwrap();
                    let drive = &trimmed[..1];
                    let rest = &trimmed[1..];
                    format!("{}:{}", drive.to_uppercase(), rest.replace('/', "\\"))
                } else {
                    path.clone()
                }
            } else {
                path.clone()
            };
            return crate::process::no_window_cmd(editor)
                .arg(&file_arg)
                .spawn()
                .map(|_| ())
                .map_err(|e| format!("Failed to open editor '{}': {}", editor, e));
        }
    }

    // Fall back to platform defaults
    #[cfg(target_os = "linux")]
    {
        if std::fs::read_to_string("/proc/version")
            .unwrap_or_default()
            .contains("microsoft")
        {
            // WSL: use cmd.exe /c start to delegate to Windows file association
            let win_path = if path.starts_with("/mnt/") {
                let trimmed = path.strip_prefix("/mnt/").unwrap();
                let drive = &trimmed[..1];
                let rest = &trimmed[1..];
                format!("{}:{}", drive.to_uppercase(), rest.replace('/', "\\"))
            } else {
                match crate::process::no_window_cmd("wslpath")
                    .args(["-w", &path])
                    .output()
                {
                    Ok(out) => String::from_utf8_lossy(&out.stdout).trim().to_string(),
                    Err(_) => path.clone(),
                }
            };
            return crate::process::no_window_cmd("cmd.exe")
                .args(["/c", "start", "", &win_path])
                .spawn()
                .map(|_| ())
                .map_err(|e| format!("Failed to open file: {}", e));
        }
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to open: {}", e))
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to open: {}", e))
    }

    #[cfg(target_os = "windows")]
    {
        crate::process::no_window_cmd("cmd")
            .args(["/c", "start", "", &path])
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to open: {}", e))
    }
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        // On WSL, use cmd.exe /c start to open in Windows default browser
        if std::fs::read_to_string("/proc/version")
            .unwrap_or_default()
            .contains("microsoft")
        {
            // cmd.exe /c start requires replacing & with ^& in URLs
            let escaped = url.replace('&', "^&");
            return crate::process::no_window_cmd("cmd.exe")
                .args(["/c", "start", &escaped])
                .spawn()
                .map(|_| ())
                .map_err(|e| format!("Failed to open URL: {}", e));
        }
        // Native Linux
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to open URL: {}", e))
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to open URL: {}", e))
    }

    #[cfg(target_os = "windows")]
    {
        crate::process::no_window_cmd("cmd")
            .args(["/c", "start", &url.replace('&', "^&")])
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to open URL: {}", e))
    }
}

#[tauri::command]
pub fn get_app_config() -> Result<crate::config::AppConfig, String> {
    Ok(crate::config::AppConfig::load())
}

#[tauri::command]
pub fn save_app_config(config: crate::config::AppConfig) -> Result<(), String> {
    config.save().map_err(|e| e.to_string())
}

// ── Secure AI API Key (OS keyring) ──

#[tauri::command]
pub fn get_ai_api_key() -> Result<Option<String>, String> {
    // 1. Try OS keyring first
    match keyring::Entry::new("coverteda", "ai_api_key") {
        Ok(entry) => match entry.get_password() {
            Ok(key) => return Ok(Some(key)),
            Err(keyring::Error::NoEntry) => {}
            Err(_) => {} // Keyring unavailable — fall through to TOML
        },
        Err(_) => {} // Keyring unavailable
    }
    // 2. Fallback: read from config TOML (migration path)
    let config = crate::config::AppConfig::load();
    Ok(config.ai_api_key.clone())
}

#[tauri::command]
pub fn set_ai_api_key(key: Option<String>) -> Result<(), String> {
    if let Ok(entry) = keyring::Entry::new("coverteda", "ai_api_key") {
        match &key {
            Some(k) if !k.is_empty() => {
                entry.set_password(k).map_err(|e| e.to_string())?;
            }
            _ => {
                let _ = entry.delete_credential(); // ignore "no entry" error
            }
        }
    }
    // Clear the TOML field (migration: remove plaintext)
    let mut config = crate::config::AppConfig::load();
    if config.ai_api_key.is_some() {
        config.ai_api_key = None;
        config.save().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── Per-Provider AI API Keys ──

const AI_PROVIDERS: &[&str] = &["anthropic", "openai", "google", "mistral", "xai", "deepseek"];

#[tauri::command]
pub fn get_ai_api_key_for_provider(provider: String) -> Result<Option<String>, String> {
    let service = format!("coverteda_ai_{}", provider);
    match keyring::Entry::new(&service, "api_key") {
        Ok(entry) => match entry.get_password() {
            Ok(key) => Ok(Some(key)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Ok(None),
        },
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub fn set_ai_api_key_for_provider(provider: String, key: Option<String>) -> Result<(), String> {
    let service = format!("coverteda_ai_{}", provider);
    if let Ok(entry) = keyring::Entry::new(&service, "api_key") {
        match &key {
            Some(k) if !k.is_empty() => {
                entry.set_password(k).map_err(|e| e.to_string())?;
            }
            _ => {
                let _ = entry.delete_credential();
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn list_ai_providers_with_keys() -> Result<Vec<String>, String> {
    let mut result = Vec::new();
    for &provider in AI_PROVIDERS {
        let service = format!("coverteda_ai_{}", provider);
        if let Ok(entry) = keyring::Entry::new(&service, "api_key") {
            if entry.get_password().is_ok() {
                result.push(provider.to_string());
            }
        }
    }
    Ok(result)
}

// ── System stats for "Stats for Nerds" overlay ──

#[derive(serde::Serialize, Clone)]
pub struct SystemStats {
    pub cpu_pct: f64,
    pub mem_used_mb: u64,
    pub mem_total_mb: u64,
    pub mem_pct: f64,
    pub disk_write_bytes: u64,
    pub disk_write_pct: f64,
}

/// Cached system stats to avoid blocking 200ms per call.
static SYS_STATS_CACHE: std::sync::Mutex<Option<(std::time::Instant, SystemStats)>> =
    std::sync::Mutex::new(None);

#[tauri::command]
pub async fn get_system_stats() -> Result<SystemStats, String> {
    // Return cached value if sampled within last 500ms
    if let Ok(guard) = SYS_STATS_CACHE.lock() {
        if let Some((ts, ref cached)) = *guard {
            if ts.elapsed() < std::time::Duration::from_millis(500) {
                return Ok(cached.clone());
            }
        }
    }

    tokio::task::spawn_blocking(|| {
        let cpu_pct = read_cpu_usage().unwrap_or(0.0);
        let (mem_used_mb, mem_total_mb, mem_pct) = read_mem_usage().unwrap_or((0, 0, 0.0));
        let (disk_write_bytes, disk_write_pct) = read_disk_write().unwrap_or((0, 0.0));
        let stats = SystemStats {
            cpu_pct,
            mem_used_mb,
            mem_total_mb,
            mem_pct,
            disk_write_bytes,
            disk_write_pct,
        };
        if let Ok(mut guard) = SYS_STATS_CACHE.lock() {
            *guard = Some((std::time::Instant::now(), stats.clone()));
        }
        Ok(stats)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Read CPU usage from /proc/stat (Linux) or approximate on other platforms.
/// Uses a two-sample approach with a brief sleep to measure delta.
fn read_cpu_usage() -> Option<f64> {
    #[cfg(target_os = "linux")]
    {
        fn parse_cpu_line(line: &str) -> Option<(u64, u64)> {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 5 || parts[0] != "cpu" { return None; }
            let vals: Vec<u64> = parts[1..].iter().filter_map(|s| s.parse().ok()).collect();
            if vals.len() < 4 { return None; }
            let idle = vals[3] + vals.get(4).copied().unwrap_or(0); // idle + iowait
            let total: u64 = vals.iter().sum();
            Some((idle, total))
        }
        let s1 = std::fs::read_to_string("/proc/stat").ok()?;
        let line1 = s1.lines().next()?;
        let (idle1, total1) = parse_cpu_line(line1)?;
        std::thread::sleep(std::time::Duration::from_millis(100));
        let s2 = std::fs::read_to_string("/proc/stat").ok()?;
        let line2 = s2.lines().next()?;
        let (idle2, total2) = parse_cpu_line(line2)?;
        let d_total = total2.saturating_sub(total1) as f64;
        let d_idle = idle2.saturating_sub(idle1) as f64;
        if d_total <= 0.0 { return Some(0.0); }
        Some(((d_total - d_idle) / d_total * 100.0 * 10.0).round() / 10.0)
    }
    #[cfg(not(target_os = "linux"))]
    {
        None
    }
}

/// Read memory usage from /proc/meminfo (Linux) or system APIs.
fn read_mem_usage() -> Option<(u64, u64, f64)> {
    #[cfg(target_os = "linux")]
    {
        let s = std::fs::read_to_string("/proc/meminfo").ok()?;
        let mut total_kb = 0u64;
        let mut available_kb = 0u64;
        for line in s.lines() {
            if line.starts_with("MemTotal:") {
                total_kb = line.split_whitespace().nth(1)?.parse().ok()?;
            } else if line.starts_with("MemAvailable:") {
                available_kb = line.split_whitespace().nth(1)?.parse().ok()?;
            }
        }
        if total_kb == 0 { return None; }
        let used_kb = total_kb.saturating_sub(available_kb);
        let total_mb = total_kb / 1024;
        let used_mb = used_kb / 1024;
        let pct = (used_kb as f64 / total_kb as f64 * 1000.0).round() / 10.0;
        Some((used_mb, total_mb, pct))
    }
    #[cfg(not(target_os = "linux"))]
    {
        None
    }
}

/// Read disk write stats from /proc/diskstats (Linux).
/// Returns (bytes_written_since_boot, estimated_write_activity_pct).
fn read_disk_write() -> Option<(u64, f64)> {
    #[cfg(target_os = "linux")]
    {
        // First sample
        let (_, write1, time1) = read_diskstats_snapshot()?;
        std::thread::sleep(std::time::Duration::from_millis(100));
        // Second sample
        let (_, write2, time2) = read_diskstats_snapshot()?;

        let d_write = write2.saturating_sub(write1);
        let d_time = time2.saturating_sub(time1);
        // io_time is in ms; our sample is ~100ms
        let write_pct = if d_time > 0 {
            (d_time as f64 / 100.0 * 100.0 * 10.0).round() / 10.0
        } else {
            0.0
        };
        // Sectors are 512 bytes each
        let write_bytes = d_write * 512;
        Some((write_bytes, write_pct.min(100.0)))
    }
    #[cfg(not(target_os = "linux"))]
    {
        None
    }
}

#[cfg(target_os = "linux")]
fn read_diskstats_snapshot() -> Option<(u64, u64, u64)> {
    let s = std::fs::read_to_string("/proc/diskstats").ok()?;
    let mut total_reads = 0u64;
    let mut total_writes = 0u64;
    let mut total_io_time = 0u64;
    for line in s.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 14 { continue; }
        let name = parts[2];
        // Only count whole disks (sda, vda, nvme0n1) not partitions
        let is_disk = (name.starts_with("sd") || name.starts_with("vd") || name.starts_with("hd"))
            && name.len() == 3;
        let is_nvme = name.starts_with("nvme") && name.contains("n") && !name.contains("p");
        if !is_disk && !is_nvme { continue; }
        let reads: u64 = parts[5].parse().unwrap_or(0);    // sectors read
        let writes: u64 = parts[9].parse().unwrap_or(0);   // sectors written
        let io_time: u64 = parts[12].parse().unwrap_or(0); // ms spent doing I/O
        total_reads += reads;
        total_writes += writes;
        total_io_time += io_time;
    }
    Some((total_reads, total_writes, total_io_time))
}

// ── Report file discovery ──

const REPORT_EXTENSIONS: &[&str] = &[
    "rpt", "twr", "mrp", "par", "srp", "bgn", "log", "drc",
    "pad", "arearep", "srr", "htm", "html",
];

const REPORT_SUFFIXES: &[&str] = &[
    ".sta.rpt", ".fit.rpt", ".map.rpt", ".asm.rpt", ".syn.rpt", ".flow.rpt",
    ".drc.rpt",
];

#[tauri::command]
pub async fn list_report_files(project_dir: String) -> Result<Vec<ReportFileEntry>, String> {
    tokio::task::spawn_blocking(move || {
        let project_path = PathBuf::from(&project_dir);
        // Scan project root + common vendor output subdirectories
        let mut search_dirs = vec![project_path.clone()];
        for sub in &["impl1", "output_files", "build", "output"] {
            search_dirs.push(project_path.join(sub));
        }

        let skip_dirs: std::collections::HashSet<&str> = [
            "db", "dni", "qdb", "incremental_db", "greybox_tmp",
            "simulation", ".git", "node_modules", "target", "source",
        ].iter().copied().collect();

        let mut files = Vec::new();
        let mut seen_paths = std::collections::HashSet::new();

        for dir in &search_dirs {
            if !dir.exists() {
                continue;
            }
            // Recurse up to depth 3 (covers e.g. output_files/timing/ or impl1/report/)
            for entry in walkdir::WalkDir::new(dir)
                .max_depth(3)
                .into_iter()
                .filter_entry(|e| {
                    if e.file_type().is_dir() {
                        let name = e.file_name().to_str().unwrap_or("");
                        return !skip_dirs.contains(name);
                    }
                    true
                })
                .filter_map(|e| e.ok())
            {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }
                // Deduplicate since project root overlaps with subdirs
                let abs = path.to_path_buf();
                if !seen_paths.insert(abs.clone()) {
                    continue;
                }

                let name = path.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();
                let name_lower = name.to_lowercase();

                let is_report = REPORT_SUFFIXES.iter().any(|s| name_lower.ends_with(s))
                    || path.extension()
                        .and_then(|e| e.to_str())
                        .map(|ext| REPORT_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
                        .unwrap_or(false);

                if !is_report {
                    continue;
                }

                let metadata = match entry.metadata() {
                    Ok(m) => m,
                    Err(_) => continue,
                };
                let modified_epoch_ms = metadata.modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);

                let extension = path.extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();

                files.push(ReportFileEntry {
                    name,
                    path: path.to_string_lossy().to_string(),
                    size_bytes: metadata.len(),
                    modified_epoch_ms,
                    extension,
                });
            }
        }

        files.sort_by(|a, b| b.modified_epoch_ms.cmp(&a.modified_epoch_ms));
        Ok(files)
    })
    .await
    .map_err(|e| e.to_string())?
}

// ── Feature 2: Source directory scanning & top module detection ──

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SourceDirSuggestion {
    pub dir: String,
    pub file_count: usize,
    pub extensions: Vec<String>,
}

#[tauri::command]
pub async fn scan_source_directories(project_dir: String) -> Result<Vec<SourceDirSuggestion>, String> {
    tokio::task::spawn_blocking(move || {
        use std::collections::{HashMap, HashSet};
        use walkdir::WalkDir;

        let root = PathBuf::from(&project_dir);
        let hdl_exts: HashSet<&str> = [
            "v", "sv", "vhd", "vhdl",
        ].into_iter().collect();
        let skip_dirs: HashSet<&str> = [
            "node_modules", "target", "__pycache__", ".git", "db", "dni",
            "qdb", "incremental_db", "greybox_tmp", "simulation",
        ].into_iter().collect();

        // dir path -> (file_count, set of extensions)
        let mut dir_stats: HashMap<String, (usize, HashSet<String>)> = HashMap::new();

        for entry in WalkDir::new(&root)
            .max_depth(4)
            .into_iter()
            .filter_entry(|e| {
                let name = e.file_name().to_string_lossy();
                if name.starts_with('.') { return false; }
                !skip_dirs.contains(name.as_ref())
            })
        {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            if entry.file_type().is_dir() { continue; }

            let path = entry.path();
            let ext = path.extension()
                .and_then(|e| e.to_str())
                .unwrap_or("");

            if !hdl_exts.contains(ext) { continue; }

            let parent = match path.parent() {
                Some(p) => p,
                None => continue,
            };
            // Make relative to project root
            let rel = match parent.strip_prefix(&root) {
                Ok(r) => r.to_string_lossy().to_string(),
                Err(_) => continue,
            };
            let dir_key = if rel.is_empty() { ".".to_string() } else { rel };

            let entry = dir_stats.entry(dir_key).or_insert_with(|| (0, HashSet::new()));
            entry.0 += 1;
            entry.1.insert(ext.to_string());
        }

        let mut suggestions: Vec<SourceDirSuggestion> = dir_stats
            .into_iter()
            .map(|(dir, (file_count, exts))| {
                let mut extensions: Vec<String> = exts.into_iter().collect();
                extensions.sort();
                SourceDirSuggestion { dir, file_count, extensions }
            })
            .collect();
        suggestions.sort_by(|a, b| b.file_count.cmp(&a.file_count));

        Ok(suggestions)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn detect_top_module(
    project_dir: String,
    source_patterns: Vec<String>,
) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || {
        use std::collections::{HashMap, HashSet};
        use regex::Regex;

        let root = PathBuf::from(&project_dir);

        // Collect all HDL files matching the source patterns
        let mut hdl_files: Vec<PathBuf> = Vec::new();
        for pattern in &source_patterns {
            let full_pattern = root.join(pattern).to_string_lossy().to_string();
            for entry in glob::glob(&full_pattern).map_err(|e| e.to_string())? {
                if let Ok(path) = entry {
                    if path.is_file() {
                        hdl_files.push(path);
                    }
                }
            }
        }

        if hdl_files.is_empty() {
            return Ok(None);
        }

        // Parse module declarations and instantiations
        let module_decl_re = Regex::new(r"(?m)^\s*module\s+(\w+)").unwrap();
        let inst_re = Regex::new(r"(?m)^\s*(\w+)\s+(?:#\s*\([\s\S]*?\)\s*)?(\w+)\s*\(").unwrap();

        let mut declared: HashMap<String, String> = HashMap::new(); // module_name -> file_stem
        let mut instantiated: HashSet<String> = HashSet::new();

        for path in &hdl_files {
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            if ext != "v" && ext != "sv" { continue; }

            let content = match std::fs::read_to_string(path) {
                Ok(c) => c,
                Err(_) => continue,
            };
            let file_stem = path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();

            // Find module declarations
            for caps in module_decl_re.captures_iter(&content) {
                let mod_name = caps[1].to_string();
                declared.entry(mod_name).or_insert(file_stem.clone());
            }

            // Find instantiations (identifier followed by instance name and parens)
            for caps in inst_re.captures_iter(&content) {
                let mod_name = caps[1].to_string();
                // Skip Verilog keywords that look like instantiations
                let keywords: HashSet<&str> = [
                    "module", "endmodule", "input", "output", "inout", "wire", "reg",
                    "assign", "always", "initial", "begin", "end", "if", "else",
                    "case", "for", "while", "generate", "parameter", "localparam",
                    "function", "task", "integer", "real", "time", "genvar",
                ].into_iter().collect();
                if !keywords.contains(mod_name.as_str()) {
                    instantiated.insert(mod_name);
                }
            }
        }

        // Top module = declared but never instantiated by another module
        let top_candidates: Vec<&String> = declared.keys()
            .filter(|m| !instantiated.contains(m.as_str()))
            .collect();

        if top_candidates.len() == 1 {
            return Ok(Some(top_candidates[0].clone()));
        }

        if top_candidates.is_empty() {
            return Ok(None);
        }

        // Multiple candidates — prefer common top names
        let project_name = root.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_lowercase();
        let preferred = ["top", "top_level", "main", &project_name];
        for pref in &preferred {
            if let Some(m) = top_candidates.iter().find(|m| m.to_lowercase() == **pref) {
                return Ok(Some((*m).clone()));
            }
        }

        // Return the first one alphabetically
        let mut sorted = top_candidates;
        sorted.sort();
        Ok(Some(sorted[0].clone()))
    })
    .await
    .map_err(|e| e.to_string())?
}

// ── Feature 3: Vendor project file import ──

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VendorImportResult {
    pub found: bool,
    pub vendor_file: String,
    pub vendor_type: String, // "qsf", "xpr", "ldf", "rdf"
    pub backend_id: String,
    pub device: String,
    pub top_module: String,
    pub source_files: Vec<String>,
    pub constraint_files: Vec<String>,
    pub project_name: String,
    pub warnings: Vec<String>,
    pub summary: Vec<String>,
}

#[tauri::command]
pub async fn import_vendor_project(dir: String) -> Result<VendorImportResult, String> {
    tokio::task::spawn_blocking(move || {
        let project_dir = PathBuf::from(&dir);

        // Scan for vendor project files (priority order)
        let extensions = [
            ("qsf", "quartus"),
            ("qpf", "quartus"),
            ("xpr", "vivado"),
            ("ldf", "diamond"),
            ("rdf", "radiant"),
            ("acepro", "ace"),
            ("prjx", "libero"),
        ];

        let mut found_file: Option<(PathBuf, &str, &str)> = None;
        if let Ok(entries) = std::fs::read_dir(&project_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file() { continue; }
                let ext = path.extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();

                for (target_ext, backend_id) in &extensions {
                    if ext == *target_ext {
                        found_file = Some((path.clone(), target_ext, backend_id));
                        break;
                    }
                }
                if found_file.is_some() { break; }
            }
        }

        let (vendor_path, vendor_type, backend_id) = match found_file {
            Some(f) => f,
            None => {
                // No vendor project file found — try scanning TCL files for project commands
                if let Ok(entries) = std::fs::read_dir(&project_dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if !path.is_file() { continue; }
                        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                        if ext != "tcl" { continue; }
                        if let Ok(content) = std::fs::read_to_string(&path) {
                            let content_lower = content.to_lowercase();
                            // Detect vendor from TCL patterns
                            let detected_backend = if content_lower.contains("prj_project new") || content_lower.contains("prj_project open") {
                                Some("radiant")
                            } else if content_lower.contains("create_project") && content_lower.contains("vivado") {
                                Some("vivado")
                            } else if content_lower.contains("project_new") || content_lower.contains("quartus_sh") {
                                Some("quartus")
                            } else if content_lower.contains("open_project") && content_lower.contains("ace") {
                                Some("ace")
                            } else {
                                None
                            };
                            if let Some(bid) = detected_backend {
                                // Try to extract device and top_module from TCL
                                let mut device = String::new();
                                let mut top_module = String::new();
                                for line in content.lines() {
                                    let trimmed = line.trim();
                                    // Common patterns: -device "LIFCL-40", -part xc7a35t, etc.
                                    if let Some(pos) = trimmed.find("-device") {
                                        let after = &trimmed[pos + 7..].trim_start();
                                        let dev = after.trim_start_matches(|c: char| c == '"' || c == '{' || c == ' ');
                                        let end = dev.find(|c: char| c == '"' || c == '}' || c == ' ' || c == '\t').unwrap_or(dev.len());
                                        if end > 0 { device = dev[..end].to_string(); }
                                    }
                                    if let Some(pos) = trimmed.find("-part") {
                                        let after = &trimmed[pos + 5..].trim_start();
                                        let dev = after.trim_start_matches(|c: char| c == '"' || c == '{' || c == ' ');
                                        let end = dev.find(|c: char| c == '"' || c == '}' || c == ' ' || c == '\t').unwrap_or(dev.len());
                                        if end > 0 && device.is_empty() { device = dev[..end].to_string(); }
                                    }
                                    if let Some(pos) = trimmed.find("-top") {
                                        let after = &trimmed[pos + 4..].trim_start();
                                        let m = after.trim_start_matches(|c: char| c == '"' || c == '{' || c == ' ');
                                        let end = m.find(|c: char| c == '"' || c == '}' || c == ' ' || c == '\t').unwrap_or(m.len());
                                        if end > 0 { top_module = m[..end].to_string(); }
                                    }
                                }
                                let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                                return Ok(VendorImportResult {
                                    found: true,
                                    vendor_file: file_name.clone(),
                                    vendor_type: "tcl".to_string(),
                                    backend_id: bid.to_string(),
                                    device,
                                    top_module,
                                    source_files: Vec::new(),
                                    constraint_files: Vec::new(),
                                    project_name: path.file_stem().and_then(|s| s.to_str()).unwrap_or("project").to_string(),
                                    warnings: vec![format!("Detected {} backend from TCL script: {}", bid, file_name)],
                                    summary: vec![format!("TCL project script: {}", file_name)],
                                });
                            }
                        }
                    }
                }

                return Ok(VendorImportResult {
                    found: false,
                    vendor_file: String::new(),
                    vendor_type: String::new(),
                    backend_id: String::new(),
                    device: String::new(),
                    top_module: String::new(),
                    source_files: Vec::new(),
                    constraint_files: Vec::new(),
                    project_name: String::new(),
                    warnings: Vec::new(),
                    summary: Vec::new(),
                });
            }
        };

        let vendor_file = vendor_path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        match vendor_type {
            "qsf" => {
                let content = std::fs::read_to_string(&vendor_path)
                    .map_err(|e| format!("Failed to read {}: {}", vendor_file, e))?;
                let result = crate::parser::qsf::parse_qsf(&content);

                // Also try to find companion .qpf for project name
                let mut project_name = result.project_name.clone();
                if project_name.is_empty() {
                    let qpf_path = vendor_path.with_extension("qpf");
                    if qpf_path.exists() {
                        if let Ok(qpf_content) = std::fs::read_to_string(&qpf_path) {
                            if let Some(name) = crate::parser::qsf::parse_qpf_project_name(&qpf_content) {
                                project_name = name;
                            }
                        }
                    }
                }
                if project_name.is_empty() {
                    project_name = vendor_path.file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("project")
                        .to_string();
                }

                Ok(VendorImportResult {
                    found: true,
                    vendor_file,
                    vendor_type: vendor_type.to_string(),
                    backend_id: backend_id.to_string(),
                    device: result.device,
                    top_module: result.top_module,
                    source_files: result.source_files,
                    constraint_files: result.constraint_files,
                    project_name,
                    warnings: result.warnings,
                    summary: result.summary,
                })
            }
            "qpf" => {
                // For .qpf, look for matching .qsf file
                let stem = vendor_path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("");
                let qsf_path = project_dir.join(format!("{}.qsf", stem));
                if qsf_path.exists() {
                    let content = std::fs::read_to_string(&qsf_path)
                        .map_err(|e| format!("Failed to read QSF: {}", e))?;
                    let result = crate::parser::qsf::parse_qsf(&content);
                    let mut project_name = String::new();
                    let qpf_content = std::fs::read_to_string(&vendor_path).unwrap_or_default();
                    if let Some(name) = crate::parser::qsf::parse_qpf_project_name(&qpf_content) {
                        project_name = name;
                    }
                    if project_name.is_empty() {
                        project_name = stem.to_string();
                    }

                    Ok(VendorImportResult {
                        found: true,
                        vendor_file: format!("{}.qsf", stem),
                        vendor_type: "qsf".to_string(),
                        backend_id: backend_id.to_string(),
                        device: result.device,
                        top_module: result.top_module,
                        source_files: result.source_files,
                        constraint_files: result.constraint_files,
                        project_name,
                        warnings: result.warnings,
                        summary: result.summary,
                    })
                } else {
                    Ok(VendorImportResult {
                        found: true,
                        vendor_file,
                        vendor_type: vendor_type.to_string(),
                        backend_id: backend_id.to_string(),
                        device: String::new(),
                        top_module: String::new(),
                        source_files: Vec::new(),
                        constraint_files: Vec::new(),
                        project_name: stem.to_string(),
                        warnings: vec![format!("Found .qpf but no matching .qsf file")],
                        summary: vec![format!("Quartus project: {}", stem)],
                    })
                }
            }
            _ => {
                // For other vendor types, return basic info and let user configure
                let project_name = vendor_path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("project")
                    .to_string();

                let summary_msg = format!("Found {} project file: {}", backend_id, &vendor_file);
                Ok(VendorImportResult {
                    found: true,
                    vendor_file,
                    vendor_type: vendor_type.to_string(),
                    backend_id: backend_id.to_string(),
                    device: String::new(),
                    top_module: String::new(),
                    source_files: Vec::new(),
                    constraint_files: Vec::new(),
                    project_name,
                    warnings: vec![
                        format!("Import from .{} files is not yet fully supported. Settings may need manual adjustment.", vendor_type),
                    ],
                    summary: vec![summary_msg],
                })
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

// ── Package pin listing ──

#[tauri::command]
pub async fn list_package_pins(
    backend_id: String,
    device: String,
    state: State<'_, AppState>,
) -> Result<crate::backend::DevicePinData, String> {
    let registry = state.registry.lock().map_err(|e| e.to_string())?;
    let backend = registry
        .get(&backend_id)
        .ok_or_else(|| format!("Unknown backend: {}", backend_id))?;
    backend.list_device_pin_data(&device).map_err(|e| e.to_string())
}

// ── Feature 4: Tool edition detection ──

#[tauri::command]
pub async fn detect_tool_edition(backend_id: String) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || {
        match backend_id.as_str() {
            "quartus" | "quartus_pro" => {
                // Edition is now determined by which backend the user selected,
                // but still detect for informational purposes
                let result = crate::process::no_window_cmd("quartus_sh")
                    .arg("--version")
                    .output();
                match result {
                    Ok(output) => {
                        let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
                        let stderr = String::from_utf8_lossy(&output.stderr).to_lowercase();
                        let combined = format!("{} {}", stdout, stderr);
                        if combined.contains("pro edition") || combined.contains("quartus prime pro") {
                            Ok(Some("pro".to_string()))
                        } else if combined.contains("lite edition") || combined.contains("quartus prime lite") {
                            Ok(Some("lite".to_string()))
                        } else if combined.contains("standard edition") || combined.contains("quartus prime standard") {
                            Ok(Some("standard".to_string()))
                        } else if !stdout.is_empty() || !stderr.is_empty() {
                            Ok(Some("standard".to_string()))
                        } else {
                            Ok(None)
                        }
                    }
                    Err(_) => Ok(None),
                }
            }
            "vivado" => {
                let result = crate::process::no_window_cmd("vivado")
                    .arg("-version")
                    .output();
                match result {
                    Ok(output) => {
                        let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
                        if stdout.contains("vivado ml") {
                            Ok(Some("ml_standard".to_string()))
                        } else if stdout.contains("vivado") {
                            Ok(Some("standard".to_string()))
                        } else {
                            Ok(None)
                        }
                    }
                    Err(_) => Ok(None),
                }
            }
            _ => Ok(None),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

// ── Device Part Verification ──

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyDeviceResult {
    pub valid: bool,
    pub cli_verified: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn verify_device_part(
    backend_id: String,
    part: String,
) -> Result<VerifyDeviceResult, String> {
    tokio::task::spawn_blocking(move || {
        // Construct the backend inside spawn_blocking to avoid holding Mutex across await
        let registry = BackendRegistry::new();
        let backend = registry.get(&backend_id).ok_or_else(|| {
            format!("Unknown backend: {}", backend_id)
        })?;

        match backend.verify_device_part(&part) {
            Ok(valid) => Ok(VerifyDeviceResult {
                valid,
                cli_verified: true,
                error: None,
            }),
            Err(e) => {
                // CLI verification not available — return without error
                Ok(VerifyDeviceResult {
                    valid: false,
                    cli_verified: false,
                    error: Some(e.to_string()),
                })
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Scan for vendor project files (.ldf, .qpf, .xpr, .acepro) in a directory and subdirectories.
#[tauri::command]
pub fn scan_project_files(
    project_dir: String,
    backend_id: String,
    top_module: String,
) -> Result<Vec<String>, String> {
    let dir = PathBuf::from(&project_dir);
    let files = match backend_id.as_str() {
        "diamond" => crate::backend::diamond::DiamondBackend::find_project_files(&dir, &top_module),
        "quartus" | "quartus_pro" => crate::backend::quartus::QuartusBackend::find_project_files(&dir, &top_module),
        "vivado" => crate::backend::vivado::VivadoBackend::find_project_files(&dir, &top_module),
        "radiant" => crate::backend::radiant::RadiantBackend::find_project_files(&dir, &top_module),
        "ace" => crate::backend::ace::AceBackend::find_project_files(&dir, &top_module),
        "libero" => crate::backend::libero::LiberoBackend::find_project_files(&dir, &top_module),
        _ => Vec::new(),
    };
    // Return paths relative to project_dir when possible, otherwise absolute
    Ok(files
        .into_iter()
        .map(|p| {
            p.strip_prefix(&dir)
                .map(|rel| rel.display().to_string())
                .unwrap_or_else(|_| p.display().to_string())
        })
        .collect())
}

// ── SSH Remote Build Commands ──

#[tauri::command]
pub async fn ssh_test_connection(
    host: String,
    port: u16,
    user: String,
    tool: String,
    key_path: Option<String>,
    custom_ssh: Option<String>,
    custom_scp: Option<String>,
) -> Result<crate::ssh::SshConnectionInfo, String> {
    let tool_kind = match tool.as_str() {
        "plink" => crate::ssh::SshToolKind::Plink,
        "custom" => crate::ssh::SshToolKind::Custom,
        _ => crate::ssh::SshToolKind::OpenSsh,
    };
    let auth = if key_path.is_some() {
        crate::ssh::SshAuthMethod::Key
    } else {
        crate::ssh::SshAuthMethod::Agent
    };
    let cfg = crate::ssh::SshConfig {
        enabled: true,
        tool: tool_kind,
        custom_ssh_path: custom_ssh,
        custom_scp_path: custom_scp,
        host,
        port,
        user,
        auth,
        key_path,
        remote_project_dir: String::new(),
        remote_tool_paths: std::collections::HashMap::new(),
    };
    tokio::task::spawn_blocking(move || crate::ssh::test_connection(&cfg))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn ssh_save_config(
    state: State<'_, AppState>,
    config: crate::ssh::SshConfig,
) -> Result<(), String> {
    // Save to AppConfig TOML
    let mut app_config = crate::config::AppConfig::load();
    app_config.ssh = Some(config.clone());
    app_config.save().map_err(|e| e.to_string())?;

    // Update in-memory state
    let mut guard = state.ssh_config.lock().map_err(|e| e.to_string())?;
    *guard = Some(config);
    Ok(())
}

#[tauri::command]
pub fn ssh_load_config(
    state: State<'_, AppState>,
) -> Result<Option<crate::ssh::SshConfig>, String> {
    let guard = state.ssh_config.lock().map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

#[tauri::command]
pub async fn ssh_detect_tools(
    state: State<'_, AppState>,
) -> Result<Vec<crate::ssh::RemoteToolInfo>, String> {
    let cfg = {
        let guard = state.ssh_config.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("No SSH config")?
    };
    tokio::task::spawn_blocking(move || crate::ssh::detect_remote_tools(&cfg))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn ssh_set_password(
    state: State<'_, AppState>,
    password: String,
) -> Result<(), String> {
    let guard = state.ssh_config.lock().map_err(|e| e.to_string())?;
    let cfg = guard.as_ref().ok_or("No SSH config")?;
    crate::ssh::save_ssh_password(&cfg.user, &cfg.host, &password)
}

#[tauri::command]
pub fn ssh_get_password(
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let guard = state.ssh_config.lock().map_err(|e| e.to_string())?;
    let cfg = guard.as_ref().ok_or("No SSH config")?;
    Ok(crate::ssh::load_ssh_password(&cfg.user, &cfg.host))
}

#[tauri::command]
pub async fn ssh_remote_file_tree(
    state: State<'_, AppState>,
) -> Result<Vec<crate::types::FileEntry>, String> {
    let cfg = {
        let guard = state.ssh_config.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("No SSH config")?
    };
    tokio::task::spawn_blocking(move || crate::ssh::ssh_remote_file_tree(&cfg))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn ssh_read_remote_file(
    state: State<'_, AppState>,
    path: String,
) -> Result<String, String> {
    let cfg = {
        let guard = state.ssh_config.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("No SSH config")?
    };
    tokio::task::spawn_blocking(move || crate::ssh::ssh_read_file(&cfg, &path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn ssh_browse_directory(
    state: State<'_, AppState>,
    dir: String,
) -> Result<Vec<crate::ssh::RemoteDirEntry>, String> {
    let cfg = {
        let guard = state.ssh_config.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("No SSH config")?
    };
    tokio::task::spawn_blocking(move || crate::ssh::ssh_list_directory(&cfg, &dir))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn ssh_exec_command(
    state: State<'_, AppState>,
    command: String,
) -> Result<crate::ssh::SshExecResult, String> {
    let cfg = {
        let guard = state.ssh_config.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("No SSH config")?
    };
    tokio::task::spawn_blocking(move || crate::ssh::ssh_exec_structured(&cfg, &command))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn ssh_get_system_info(
    state: State<'_, AppState>,
) -> Result<crate::ssh::RemoteSystemInfo, String> {
    let cfg = {
        let guard = state.ssh_config.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("No SSH config")?
    };
    tokio::task::spawn_blocking(move || crate::ssh::ssh_get_system_info(&cfg))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn ssh_check_project(
    state: State<'_, AppState>,
    dir: String,
) -> Result<Option<crate::project::ProjectConfig>, String> {
    let cfg = {
        let guard = state.ssh_config.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("No SSH config")?
    };
    tokio::task::spawn_blocking(move || crate::ssh::ssh_check_project_dir(&cfg, &dir))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn ssh_create_project(
    state: State<'_, AppState>,
    dir: String,
    name: String,
    backend_id: String,
    device: String,
    top_module: String,
    source_patterns: Option<Vec<String>>,
    constraint_files: Option<Vec<String>>,
) -> Result<crate::project::ProjectConfig, String> {
    let cfg = {
        let guard = state.ssh_config.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("No SSH config")?
    };
    let mut project_config =
        crate::project::ProjectConfig::new_with_defaults(&name, &backend_id, &device, &top_module);
    if let Some(sp) = source_patterns {
        project_config.source_patterns = sp;
    }
    if let Some(cf) = constraint_files {
        project_config.constraint_files = cf;
    }
    let pc = project_config.clone();
    tokio::task::spawn_blocking(move || crate::ssh::ssh_create_project_file(&cfg, &dir, &pc))
        .await
        .map_err(|e| e.to_string())??;
    Ok(project_config)
}

// ════════════════════════════════════════════════════════════════════════
//                                COCOTB
// ════════════════════════════════════════════════════════════════════════

#[tauri::command]
pub fn discover_cocotb_tests(project_dir: String) -> Result<Vec<crate::cocotb::CocotbTest>, String> {
    let path = PathBuf::from(&project_dir);
    if !path.is_dir() {
        return Err(format!("project dir does not exist: {project_dir}"));
    }
    Ok(crate::cocotb::discover_tests(&path))
}

#[tauri::command]
pub async fn run_cocotb_test(test_dir: String) -> Result<crate::cocotb::CocotbResult, String> {
    let path = PathBuf::from(&test_dir);
    tokio::task::spawn_blocking(move || crate::cocotb::run_test(&path, 300))
        .await
        .map_err(|e| e.to_string())?
}

// ════════════════════════════════════════════════════════════════════════
//                         SIMULATION / TESTBENCH
// ════════════════════════════════════════════════════════════════════════

#[tauri::command]
pub fn sim_parse_top_ports(
    source: String,
    top_module: String,
) -> Vec<crate::sim_generator::TopPort> {
    crate::sim_generator::parse_top_ports(&source, &top_module)
}

#[tauri::command]
pub fn sim_generate_verilog_testbench(
    top_module: String,
    ports: Vec<crate::sim_generator::TopPort>,
) -> String {
    crate::sim_generator::generate_verilog_testbench(&top_module, &ports)
}

/// Returns { testPy, makefile } — the Python cocotb test and its Makefile.
#[tauri::command]
pub fn sim_generate_cocotb_testbench(
    top_module: String,
    ports: Vec<crate::sim_generator::TopPort>,
) -> serde_json::Value {
    let (py, mf) = crate::sim_generator::generate_cocotb_testbench(&top_module, &ports);
    serde_json::json!({ "testPy": py, "makefile": mf })
}

#[tauri::command]
pub fn sim_generate_script(
    simulator: String,
    sources: Vec<String>,
    testbench: String,
    top_module: String,
    sim_time: String,
    timescale: String,
) -> String {
    crate::sim_generator::generate_sim_script(
        &simulator, &sources, &testbench, &top_module, &sim_time, &timescale,
    )
}

#[tauri::command]
pub fn sim_project_sources(project_dir: String) -> Vec<String> {
    let p = PathBuf::from(&project_dir);
    crate::sim_generator::project_sources(&p)
}
