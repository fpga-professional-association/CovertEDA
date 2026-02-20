use crate::backend::BackendRegistry;
use crate::project::{ProjectConfig, RecentProject, RecentProjectsList};
use crate::types::*;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, State};

pub struct AppState {
    pub registry: Mutex<BackendRegistry>,
    pub active_build: Mutex<Option<BuildHandle>>,
    pub current_project: Mutex<Option<(PathBuf, ProjectConfig)>>,
}

/// Handle for a running build process — stored so we can cancel it.
pub struct BuildHandle {
    pub build_id: String,
    pub child_pid: Option<u32>,
    pub cancel_flag: Arc<AtomicBool>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            registry: Mutex::new(BackendRegistry::new()),
            active_build: Mutex::new(None),
            current_project: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub fn get_file_tree(project_dir: String) -> Result<Vec<FileEntry>, String> {
    crate::files::scan_directory(&PathBuf::from(project_dir)).map_err(|e| e.to_string())
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
pub fn get_git_status(project_dir: String) -> Result<GitStatus, String> {
    crate::git::get_status(&PathBuf::from(project_dir)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn git_is_dirty(project_dir: String) -> Result<bool, String> {
    crate::git::is_dirty(&PathBuf::from(project_dir))
}

#[tauri::command]
pub fn git_commit(project_dir: String, message: String) -> Result<String, String> {
    crate::git::commit_all(&PathBuf::from(project_dir), &message)
}

#[tauri::command]
pub fn git_head_hash(project_dir: String) -> Result<String, String> {
    crate::git::head_hash(&PathBuf::from(project_dir))
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
        use std::process::{Command, Stdio};

        let _ = app_handle.emit("ip:stdout", serde_json::json!({
            "genId": &gen_id_clone,
            "line": format!("Spawning: {} {}", &executable, &script_arg),
        }));

        let mut cmd = Command::new(&executable);
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

    // Stage to Windows filesystem if needed (Radiant lowercases UNC paths,
    // which breaks case-sensitive WSL-native paths)
    let staging = if backend_id == "radiant" && needs_wsl_staging(&project_path) {
        let staging_dir = create_wsl_staging(&project_path, &config.top_module)?;
        Some(staging_dir)
    } else {
        None
    };
    let effective_dir = staging.as_deref().unwrap_or(&project_path);

    // Generate the build script via the backend
    let registry = state.registry.lock().map_err(|e| e.to_string())?;
    let backend = registry
        .get(&backend_id)
        .ok_or_else(|| format!("Unknown backend: {}", backend_id))?;

    let script = backend
        .generate_build_script(effective_dir, &config.device, &config.top_module, &stages, &options)
        .map_err(|e| e.to_string())?;
    let cli_tool = backend.cli_tool().to_string();
    drop(registry);

    // Write the build script to a temp file in the build directory
    let script_path = effective_dir.join(".coverteda_build.tcl");
    std::fs::write(&script_path, &script)
        .map_err(|e| format!("Failed to write build script: {}", e))?;

    // Determine the executable path for this backend
    let executable = resolve_cli_executable(&cli_tool, &backend_id);

    // Determine the script path that the tool sees
    // For WSL→Windows executables, convert the WSL path to a Windows path
    let script_arg = wsl_to_windows_path(&script_path);

    // Determine license environment variables
    let mut env_vars: HashMap<String, String> = HashMap::new();
    if backend_id == "radiant" {
        let radiant = crate::backend::radiant::RadiantBackend::new();
        if let Some(lic_path) = radiant.find_license() {
            // Convert WSL path to Windows path for the Windows-native radiantc.exe
            env_vars.insert(
                "LM_LICENSE_FILE".into(),
                wsl_to_windows_path(&lic_path),
            );
        }
    }

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
    let original_project_path = project_path.clone();
    let staging_dir_for_thread = staging.clone();
    std::thread::spawn(move || {
        use std::io::BufRead;
        use std::process::{Command, Stdio};

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
        if staging_dir_for_thread.is_some() {
            emit_info(&format!("Staged to Windows filesystem (WSL-native project)"));
        }
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
        emit_info(&format!("Spawning: {} {}", &executable, &script_arg));
        emit_info("");

        let mut cmd = Command::new(&executable);
        cmd.arg(&script_arg)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        for (key, val) in &env_vars {
            cmd.env(key, val);
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

                // If we staged to Windows filesystem, copy results back
                if let Some(ref staging) = staging_dir_for_thread {
                    if let Err(e) = copy_staging_results(staging, &original_project_path) {
                        let _ = app_handle.emit("build:stdout", serde_json::json!({
                            "buildId": &build_id_clone,
                            "line": format!("Warning: failed to copy staging results: {}", e),
                        }));
                    }
                }
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
                // Clean up staging on failure too
                if let Some(ref staging) = staging_dir_for_thread {
                    let _ = std::fs::remove_dir_all(staging);
                }
            }
        }
    });

    Ok(build_id)
}

#[tauri::command]
pub fn clean_build(project_dir: String) -> Result<u32, String> {
    let project_path = PathBuf::from(&project_dir);
    let mut removed = 0u32;

    // Remove impl directories (impl1/, impl2/, etc.)
    if let Ok(entries) = std::fs::read_dir(&project_path) {
        for entry in entries.filter_map(|e| e.ok()) {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("impl") && entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                if let Ok(_) = std::fs::remove_dir_all(entry.path()) {
                    removed += 1;
                }
            }
        }
    }

    // Remove build artifacts in project root
    let artifacts = [
        ".coverteda_build.tcl",
        ".coverteda_build.log",
    ];
    for name in &artifacts {
        let p = project_path.join(name);
        if p.exists() {
            let _ = std::fs::remove_file(&p);
            removed += 1;
        }
    }

    Ok(removed)
}

#[tauri::command]
pub fn check_sources_stale(project_dir: String) -> Result<bool, String> {
    let project_path = PathBuf::from(&project_dir);

    // Find newest build output timestamp in impl1/
    let impl_dir = project_path.join("impl1");
    if !impl_dir.exists() {
        return Ok(false); // No build outputs — not stale, just not built
    }

    let build_exts = ["twr", "bit", "mrp", "par", "jed", "sof"];
    let mut newest_output: Option<std::time::SystemTime> = None;
    if let Ok(entries) = std::fs::read_dir(&impl_dir) {
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
                    if !name.starts_with("impl") && !name.starts_with(".") {
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
                let _ = std::process::Command::new("taskkill")
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
) -> Result<ProjectConfig, String> {
    let project_dir = PathBuf::from(&dir);
    if !project_dir.exists() {
        std::fs::create_dir_all(&project_dir)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    let mut config = ProjectConfig::new_with_defaults(&name, &backend_id, &device, &top_module);
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
pub fn get_project_config_at_head(dir: String) -> Result<Option<ProjectConfig>, String> {
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
    let repo_root = repo.workdir().ok_or("Bare repo")?;
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

#[tauri::command]
pub fn detect_tools(state: State<'_, AppState>) -> Result<Vec<DetectedTool>, String> {
    let registry = state.registry.lock().map_err(|e| e.to_string())?;
    let backends = registry.list();

    let mut tools: Vec<DetectedTool> = backends
        .iter()
        .map(|b| {
            let install_path = match b.id.as_str() {
                "radiant" => {
                    let radiant = crate::backend::radiant::RadiantBackend::new();
                    radiant.install_dir().map(|p| p.display().to_string())
                }
                "quartus" => {
                    let quartus = crate::backend::quartus::QuartusBackend::new();
                    quartus.install_dir().map(|p| p.display().to_string())
                }
                _ => None,
            };
            DetectedTool {
                backend_id: b.id.clone(),
                name: b.name.clone(),
                version: b.version.clone(),
                install_path,
                available: b.available,
            }
        })
        .collect();

    // Append placeholder vendors (not yet implemented)
    let placeholders = [
        ("libero", "Microchip Libero SoC"),
        ("ace", "Achronix ACE"),
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
        "radiant" => {
            let radiant = crate::backend::radiant::RadiantBackend::new();
            if let Some(path) = radiant.radiantc_path_public() {
                return path.display().to_string();
            }
            cli_tool.to_string()
        }
        "quartus" => {
            let quartus = crate::backend::quartus::QuartusBackend::new();
            if let Some(path) = quartus.quartus_sh_path_public() {
                return path.display().to_string();
            }
            cli_tool.to_string()
        }
        _ => cli_tool.to_string(),
    }
}

/// Convert a WSL path to a Windows path for use by Windows executables.
/// e.g., /mnt/c/Users/foo/project → C:/Users/foo/project
/// Non-WSL paths are returned as-is.
fn wsl_to_windows_path(path: &std::path::Path) -> String {
    let s = path.display().to_string();
    if s.starts_with("/mnt/") && s.len() > 6 {
        let drive = s.chars().nth(5).unwrap().to_uppercase().to_string();
        let rest = &s[6..];
        format!("{}:{}", drive, rest.replace('/', "\\"))
    } else {
        s
    }
}

/// Check if a project directory lives on the WSL-native filesystem (not /mnt/).
/// Windows tools can't reliably access these paths because Radiant lowercases UNC paths.
fn needs_wsl_staging(project_dir: &Path) -> bool {
    let s = project_dir.display().to_string();
    s.starts_with('/') && !s.starts_with("/mnt/")
}

/// Create a staging directory on the Windows filesystem and copy project sources there.
/// Returns the staging directory path (under /mnt/c/).
fn create_wsl_staging(project_dir: &Path, project_name: &str) -> Result<PathBuf, String> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    project_dir.hash(&mut hasher);
    let hash = format!("{:x}", hasher.finish());

    let staging_base = PathBuf::from("/mnt/c/coverteda_builds");
    let staging_dir = staging_base.join(format!("{}_{}", project_name, &hash[..8]));

    // Clean and recreate
    if staging_dir.exists() {
        let _ = std::fs::remove_dir_all(&staging_dir);
    }
    std::fs::create_dir_all(&staging_dir)
        .map_err(|e| format!("Failed to create staging dir {}: {}", staging_dir.display(), e))?;

    // Copy source and constraint files (preserving subdirectory structure)
    copy_project_sources(project_dir, &staging_dir)?;

    Ok(staging_dir)
}

/// Copy HDL sources, constraints, and existing .rdf from project to staging dir.
fn copy_project_sources(src: &Path, dst: &Path) -> Result<(), String> {
    copy_dir_filtered(src, dst, 0).map_err(|e| format!("Staging copy failed: {}", e))
}

fn copy_dir_filtered(src: &Path, dst: &Path, depth: u32) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        let ty = entry.file_type()?;

        if ty.is_dir() {
            // Skip build artifacts, VCS, and irrelevant dirs
            if name.starts_with("impl")
                || name.starts_with('.')
                || name == "node_modules"
                || name == "target"
                || name == "src-tauri"
            {
                continue;
            }
            // Only recurse a couple levels deep
            if depth < 3 {
                copy_dir_filtered(&entry.path(), &dst.join(&name), depth + 1)?;
            }
        } else {
            let ext = Path::new(&name)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("");
            // Copy HDL sources, constraints, and Radiant project files
            let is_hdl = matches!(ext, "v" | "sv" | "vhd" | "vhdl");
            let is_support = matches!(
                ext,
                "pdc" | "sdc" | "lpf"
                    | "rdf" | "tcl"
                    | "mem" | "hex" | "mif"
            );
            if is_hdl {
                // Skip testbench files
                let stem = Path::new(&name)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                if stem.ends_with("_tb")
                    || stem.ends_with("_test")
                    || stem.ends_with("_testbench")
                    || stem.starts_with("tb_")
                    || stem.starts_with("test_")
                    || stem == "testbench"
                {
                    continue;
                }
                std::fs::copy(entry.path(), dst.join(&name))?;
            } else if is_support {
                std::fs::copy(entry.path(), dst.join(&name))?;
            }
        }
    }
    Ok(())
}

/// After a staged build, copy output artifacts back to the original project dir.
fn copy_staging_results(staging_dir: &Path, project_dir: &Path) -> Result<(), String> {
    // Copy impl1/ directory (contains reports, bitstreams, etc.)
    let impl1_src = staging_dir.join("impl1");
    if impl1_src.exists() {
        let impl1_dst = project_dir.join("impl1");
        copy_dir_all(&impl1_src, &impl1_dst)
            .map_err(|e| format!("Failed to copy impl1 back: {}", e))?;
    }

    // Copy .rdf project file
    for entry in std::fs::read_dir(staging_dir).map_err(|e| e.to_string())? {
        if let Ok(entry) = entry {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".rdf") {
                let _ = std::fs::copy(entry.path(), project_dir.join(&name));
            }
        }
    }

    // Clean up staging dir
    let _ = std::fs::remove_dir_all(staging_dir);

    Ok(())
}

/// Recursively copy a directory and all its contents.
fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let dst_path = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_all(&entry.path(), &dst_path)?;
        } else {
            std::fs::copy(entry.path(), &dst_path)?;
        }
    }
    Ok(())
}

fn uuid_v4() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("{:x}", t)
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
        assert_eq!(result, "/home/user/project");
    }

    #[test]
    fn test_wsl_to_windows_path_short() {
        let p = std::path::Path::new("/mnt/");
        let result = wsl_to_windows_path(p);
        // Too short to be a valid WSL path — passes through
        assert_eq!(result, "/mnt/");
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

// ── Bundled Example Projects ──

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BundledExample {
    pub name: String,
    pub description: String,
    pub backend_id: String,
    pub device: String,
    pub top_module: String,
    pub path: String,
}

/// Find the examples/ directory containing bundled example projects.
/// In Tauri dev mode CWD is typically src-tauri/, so we check ../examples first
/// (the canonical project-root location). The src-tauri/examples/ created by
/// Tauri resource bundling only has .coverteda stubs, not full source trees.
fn find_examples_dir() -> Option<PathBuf> {
    let cwd = std::env::current_dir().ok()?;

    // Prefer parent examples/ (project root) — this is the canonical location.
    // In Tauri dev mode CWD=src-tauri/, so ../examples = project root examples/.
    // In project-root CWD this is harmless (../ just goes up one level).
    let parent_path = cwd.join("..").join("examples");
    if parent_path.is_dir() {
        return Some(parent_path.canonicalize().unwrap_or(parent_path));
    }

    // Fallback: CWD/examples (when CWD is already the project root)
    let dev_path = cwd.join("examples");
    if dev_path.is_dir() {
        return Some(dev_path);
    }

    // Production: relative to executable
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let prod_path = exe_dir.join("examples");
            if prod_path.is_dir() {
                return Some(prod_path);
            }
            // Tauri resource dir (one level up from bin)
            let resource_path = exe_dir.join("../examples");
            if resource_path.is_dir() {
                return Some(resource_path);
            }
        }
    }

    None
}

#[tauri::command]
pub fn list_bundled_examples() -> Result<Vec<BundledExample>, String> {
    let examples_dir = match find_examples_dir() {
        Some(d) => d,
        None => return Ok(vec![]),
    };

    let mut results = Vec::new();

    let entries = std::fs::read_dir(&examples_dir)
        .map_err(|e| format!("Cannot read examples dir: {}", e))?;

    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let config_path = path.join(".coverteda");
        if !config_path.exists() {
            continue;
        }
        let content = match std::fs::read_to_string(&config_path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let config: crate::project::ProjectConfig = match serde_json::from_str(&content) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let abs_path = match path.canonicalize() {
            Ok(p) => p.display().to_string(),
            Err(_) => path.display().to_string(),
        };

        results.push(BundledExample {
            name: config.name,
            description: config.description.unwrap_or_default(),
            backend_id: config.backend_id,
            device: config.device,
            top_module: config.top_module,
            path: abs_path,
        });
    }

    // Sort by name for consistent ordering
    results.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(results)
}

// ── Raw report file reading ──

#[tauri::command]
pub fn get_raw_report(project_dir: String, report_type: String) -> Result<String, String> {
    let project_path = PathBuf::from(&project_dir);

    // Search in both Radiant (impl1/) and Quartus (output_files/) directories
    let search_dirs: Vec<PathBuf> = vec![
        project_path.join("impl1"),
        project_path.join("output_files"),
    ];

    // Map report type to file extensions/patterns
    let patterns: Vec<&str> = match report_type.as_str() {
        "synth" => vec!["srr", "srp", "syn.rpt"],
        "map" => vec!["mrp", "map.rpt"],
        "par" => vec!["par", "fit.rpt"],
        "bitstream" => vec!["bgn"],
        "timing" => vec!["twr", "sta.rpt"],
        "fit" => vec!["fit.rpt", "par"],
        "sta" => vec!["sta.rpt", "twr"],
        "asm" => vec!["asm.rpt", "bgn"],
        "flow" => vec!["flow.rpt"],
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
pub fn get_app_config() -> Result<crate::config::AppConfig, String> {
    Ok(crate::config::AppConfig::load())
}

#[tauri::command]
pub fn save_app_config(config: crate::config::AppConfig) -> Result<(), String> {
    config.save().map_err(|e| e.to_string())
}
