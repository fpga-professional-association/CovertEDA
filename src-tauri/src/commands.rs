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
        emit_info(&format!("Working dir: {}", project_path.display()));
        emit_info("");

        let mut cmd = Command::new(&executable);
        // Backend-specific CLI flags before the script path
        match backend_id.as_str() {
            "quartus" => { cmd.arg("-t"); }
            "vivado" => { cmd.args(["-mode", "batch", "-source"]); }
            "ace" => { cmd.args(["-batch", "-script_file"]); }
            _ => {} // radiant, diamond, oss: bare argument
        }
        cmd.arg(&script_arg)
            .current_dir(&project_path)
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
                    || name.ends_with(".bak");
                if is_quartus && entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                    if std::fs::remove_file(entry.path()).is_ok() {
                        removed += 1;
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

    // Find constraint files in common locations
    let ext = backend.constraint_ext();
    let search_dirs = [
        project_path.join("constraints"),
        project_path.join("src"),
        project_path.clone(),
    ];

    let mut all_constraints = Vec::new();
    for dir in &search_dirs {
        if !dir.exists() {
            continue;
        }
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.extension().map(|e| e == ext).unwrap_or(false) {
                    if let Ok(pins) = backend.read_constraints(&path) {
                        all_constraints.extend(pins);
                    }
                }
            }
        }
    }

    if all_constraints.is_empty() {
        return Ok(None);
    }

    // Group by I/O standard (acts as "bank" for grouping)
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
            let vccio = match io_std.as_str() {
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
            };
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

    Ok(Some(IoReport { banks }))
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
                "opensource" => {
                    let oss = crate::backend::oss::OssBackend::new();
                    oss.install_dir().map(|p| p.display().to_string())
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

    let mut cmd = std::process::Command::new(&pgrcmd_str);
    cmd.arg("-infile").arg(&xcf_arg);
    for (key, val) in &env_vars {
        cmd.env(key, val);
    }

    // Suppress console window on Windows
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
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
        use std::process::{Command, Stdio};

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

        let mut cmd = Command::new(&pgrcmd_str);
        cmd.arg("-infile")
            .arg(&xcf_arg)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        for (key, val) in &env_vars {
            cmd.env(key, val);
        }

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
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

    // Search in vendor output dirs and OSS build/ directory
    let search_dirs: Vec<PathBuf> = vec![
        project_path.join("impl1"),
        project_path.join("output_files"),
        project_path.join("build"),
    ];

    // Map report type to file extensions/patterns
    // Includes vendor-specific patterns and OSS log file names
    let patterns: Vec<&str> = match report_type.as_str() {
        "synth" => vec!["srr", "srp", "syn.rpt", "synth.log"],
        "map" => vec!["mrp", "map.rpt", "synth.log"],
        "par" => vec!["par", "fit.rpt", "pnr.log"],
        "bitstream" => vec!["bgn", "bitstream.log"],
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
    let drc: Option<DrcReport>;

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

    // ── Try vendor reports from impl1/ as fallback ──
    if timing.is_none() {
        // Look for .twr files
        if impl_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&impl_dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.extension().map(|e| e == "twr").unwrap_or(false) {
                        if let Ok(content) = std::fs::read_to_string(&p) {
                            // Try Radiant format first, then Diamond
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
        // Look for .mrp files
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

    Ok(AutoReports { timing, utilization, power, drc })
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
                match std::process::Command::new("wslpath")
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
pub fn get_app_config() -> Result<crate::config::AppConfig, String> {
    Ok(crate::config::AppConfig::load())
}

#[tauri::command]
pub fn save_app_config(config: crate::config::AppConfig) -> Result<(), String> {
    config.save().map_err(|e| e.to_string())
}

// ── System stats for "Stats for Nerds" overlay ──

#[derive(serde::Serialize)]
pub struct SystemStats {
    pub cpu_pct: f64,
    pub mem_used_mb: u64,
    pub mem_total_mb: u64,
    pub mem_pct: f64,
    pub disk_write_bytes: u64,
    pub disk_write_pct: f64,
}

#[tauri::command]
pub async fn get_system_stats() -> Result<SystemStats, String> {
    tokio::task::spawn_blocking(|| {
        let cpu_pct = read_cpu_usage().unwrap_or(0.0);
        let (mem_used_mb, mem_total_mb, mem_pct) = read_mem_usage().unwrap_or((0, 0, 0.0));
        let (disk_write_bytes, disk_write_pct) = read_disk_write().unwrap_or((0, 0.0));
        Ok(SystemStats {
            cpu_pct,
            mem_used_mb,
            mem_total_mb,
            mem_pct,
            disk_write_bytes,
            disk_write_pct,
        })
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
        let search_dirs = vec![
            project_path.join("impl1"),
            project_path.join("output_files"),
            project_path.join("build"),
            project_path.join("output"),
        ];

        let mut files = Vec::new();

        for dir in &search_dirs {
            if !dir.exists() {
                continue;
            }
            let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if !path.is_file() {
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

                let metadata = entry.metadata().map_err(|e| e.to_string())?;
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
