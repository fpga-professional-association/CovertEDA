use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Command;
use tauri::Emitter;

// ── Types ──

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SshToolKind {
    OpenSsh,
    Plink,
    Custom,
}

impl Default for SshToolKind {
    fn default() -> Self {
        SshToolKind::OpenSsh
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SshAuthMethod {
    Key,
    Agent,
    Password,
}

impl Default for SshAuthMethod {
    fn default() -> Self {
        SshAuthMethod::Agent
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshConfig {
    pub enabled: bool,
    pub tool: SshToolKind,
    #[serde(default)]
    pub custom_ssh_path: Option<String>,
    #[serde(default)]
    pub custom_scp_path: Option<String>,
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    pub user: String,
    pub auth: SshAuthMethod,
    #[serde(default)]
    pub key_path: Option<String>,
    pub remote_project_dir: String,
    #[serde(default)]
    pub remote_tool_paths: HashMap<String, String>,
}

fn default_port() -> u16 {
    22
}

impl Default for SshConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            tool: SshToolKind::OpenSsh,
            custom_ssh_path: None,
            custom_scp_path: None,
            host: String::new(),
            port: 22,
            user: String::new(),
            auth: SshAuthMethod::Agent,
            key_path: None,
            remote_project_dir: String::new(),
            remote_tool_paths: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshConnectionInfo {
    pub ok: bool,
    pub hostname: Option<String>,
    pub os: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteToolInfo {
    pub backend_id: String,
    pub name: String,
    pub path: String,
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshExecResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSystemInfo {
    pub kernel: Option<String>,
    pub distro: Option<String>,
    pub cpu_model: Option<String>,
    pub cpu_count: Option<u32>,
    pub mem_total_kb: Option<u64>,
    pub mem_available_kb: Option<u64>,
    pub disk_total_kb: Option<u64>,
    pub disk_avail_kb: Option<u64>,
    pub disk_mount: Option<String>,
    pub uptime: Option<String>,
    pub load_avg: Option<String>,
    pub license_env: Vec<LicenseEnvVar>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseEnvVar {
    pub name: String,
    pub value: String,
    pub reachable: bool,
}

// ── Command Builders ──

/// Build an SSH command for the given config and remote command string.
pub fn build_ssh_command(cfg: &SshConfig, remote_cmd: &str) -> Command {
    let (exe, port_flag) = match &cfg.tool {
        SshToolKind::OpenSsh => ("ssh".to_string(), "-p"),
        SshToolKind::Plink => ("plink".to_string(), "-P"),
        SshToolKind::Custom => {
            let exe = cfg.custom_ssh_path.as_deref().unwrap_or("ssh").to_string();
            (exe, "-p")
        }
    };

    let mut cmd = Command::new(&exe);

    // Port (skip if default 22 for cleaner commands)
    if cfg.port != 22 {
        cmd.arg(port_flag).arg(cfg.port.to_string());
    }

    // Key file
    if cfg.auth == SshAuthMethod::Key {
        if let Some(ref key) = cfg.key_path {
            cmd.arg("-i").arg(key);
        }
    }

    // Disable strict host key checking for non-interactive use
    if cfg.tool == SshToolKind::OpenSsh || cfg.tool == SshToolKind::Custom {
        cmd.arg("-o").arg("StrictHostKeyChecking=accept-new");
        cmd.arg("-o").arg("BatchMode=yes");
    }

    // user@host
    cmd.arg(format!("{}@{}", cfg.user, cfg.host));

    // Remote command
    cmd.arg(remote_cmd);

    cmd
}

/// Build an SCP command for file transfer.
/// `download=true`: remote→local, `download=false`: local→remote.
pub fn build_scp_command(cfg: &SshConfig, src: &str, dst: &str, download: bool) -> Command {
    let (exe, port_flag) = match &cfg.tool {
        SshToolKind::OpenSsh => ("scp".to_string(), "-P"),
        SshToolKind::Plink => ("pscp".to_string(), "-P"),
        SshToolKind::Custom => {
            let exe = cfg.custom_scp_path.as_deref().unwrap_or("scp").to_string();
            (exe, "-P")
        }
    };

    let mut cmd = Command::new(&exe);

    if cfg.port != 22 {
        cmd.arg(port_flag).arg(cfg.port.to_string());
    }

    if cfg.auth == SshAuthMethod::Key {
        if let Some(ref key) = cfg.key_path {
            cmd.arg("-i").arg(key);
        }
    }

    if cfg.tool == SshToolKind::OpenSsh || cfg.tool == SshToolKind::Custom {
        cmd.arg("-o").arg("StrictHostKeyChecking=accept-new");
        cmd.arg("-o").arg("BatchMode=yes");
    }

    let remote_prefix = format!("{}@{}", cfg.user, cfg.host);

    if download {
        // remote → local
        cmd.arg(format!("{}:{}", remote_prefix, src));
        cmd.arg(dst);
    } else {
        // local → remote
        cmd.arg(src);
        cmd.arg(format!("{}:{}", remote_prefix, dst));
    }

    cmd
}

// ── Execution Functions ──

/// Run a command on the remote host and return stdout.
pub fn ssh_exec(cfg: &SshConfig, remote_cmd: &str) -> Result<String, String> {
    let mut cmd = build_ssh_command(cfg, remote_cmd);
    let output = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to spawn SSH: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("SSH command failed: {}", stderr.trim()))
    }
}

/// Run a command on the remote host and return structured output (stdout, stderr, exit code).
pub fn ssh_exec_structured(cfg: &SshConfig, remote_cmd: &str) -> Result<SshExecResult, String> {
    let mut cmd = build_ssh_command(cfg, remote_cmd);
    let output = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to spawn SSH: {}", e))?;

    Ok(SshExecResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    })
}

/// Run a command on the remote host, streaming stdout/stderr via Tauri events.
pub fn ssh_exec_streaming(
    cfg: &SshConfig,
    remote_cmd: &str,
    app: &tauri::AppHandle,
    build_id: &str,
) -> Result<i32, String> {
    use std::io::BufRead;
    use std::process::Stdio;

    let mut child = build_ssh_command(cfg, remote_cmd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn SSH: {}", e))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    // Stream stdout
    let app_out = app.clone();
    let bid_out = build_id.to_string();
    let stdout_thread = std::thread::spawn(move || {
        if let Some(out) = stdout {
            let reader = std::io::BufReader::new(out);
            for line in reader.lines().flatten() {
                let _ = app_out.emit(
                    "build:stdout",
                    serde_json::json!({ "buildId": &bid_out, "line": &line }),
                );
            }
        }
    });

    // Stream stderr
    let app_err = app.clone();
    let bid_err = build_id.to_string();
    let stderr_thread = std::thread::spawn(move || {
        if let Some(err) = stderr {
            let reader = std::io::BufReader::new(err);
            for line in reader.lines().flatten() {
                let _ = app_err.emit(
                    "build:stdout",
                    serde_json::json!({ "buildId": &bid_err, "line": &line }),
                );
            }
        }
    });

    let status = child.wait().map_err(|e| format!("SSH process error: {}", e))?;
    let _ = stdout_thread.join();
    let _ = stderr_thread.join();

    Ok(status.code().unwrap_or(-1))
}

/// Test the SSH connection. Returns hostname and OS info on success.
pub fn test_connection(cfg: &SshConfig) -> Result<SshConnectionInfo, String> {
    match ssh_exec(cfg, "echo ok && uname -a && hostname") {
        Ok(output) => {
            let lines: Vec<&str> = output.trim().lines().collect();
            if lines.first().map(|l| l.trim()) != Some("ok") {
                return Ok(SshConnectionInfo {
                    ok: false,
                    hostname: None,
                    os: None,
                    error: Some("Unexpected response".into()),
                });
            }
            Ok(SshConnectionInfo {
                ok: true,
                os: lines.get(1).map(|s| s.trim().to_string()),
                hostname: lines.get(2).map(|s| s.trim().to_string()),
                error: None,
            })
        }
        Err(e) => Ok(SshConnectionInfo {
            ok: false,
            hostname: None,
            os: None,
            error: Some(e),
        }),
    }
}

/// Detect vendor tools on the remote machine.
pub fn detect_remote_tools(cfg: &SshConfig) -> Result<Vec<RemoteToolInfo>, String> {
    let tools = [
        ("diamond", "Diamond", "pnmainc"),
        ("radiant", "Radiant", "radiantc"),
        ("quartus", "Quartus", "quartus_sh"),
        ("vivado", "Vivado", "vivado"),
        ("oss", "OSS CAD Suite", "yosys"),
        ("ace", "Achronix ACE", "ace"),
    ];

    // Check override paths first, then use `which`
    let mut checks = Vec::new();
    for (id, _name, cli) in &tools {
        if let Some(override_path) = cfg.remote_tool_paths.get(*id) {
            checks.push(format!("if [ -x \"{}\" ]; then echo \"FOUND:{}:{}\"; else echo \"NOTFOUND:{}\"; fi", override_path, id, override_path, id));
        } else {
            checks.push(format!("if command -v {} >/dev/null 2>&1; then echo \"FOUND:{}:$(command -v {})\"; else echo \"NOTFOUND:{}\"; fi", cli, id, cli, id));
        }
    }

    let script = checks.join(" && ");
    let output = ssh_exec(cfg, &script)?;

    let mut results = Vec::new();
    for line in output.lines() {
        let line = line.trim();
        if line.starts_with("FOUND:") {
            let parts: Vec<&str> = line.splitn(3, ':').collect();
            if parts.len() == 3 {
                let id = parts[1];
                let path = parts[2];
                let name = tools.iter().find(|(tid, _, _)| *tid == id).map(|(_, n, _)| *n).unwrap_or(id);
                results.push(RemoteToolInfo {
                    backend_id: id.to_string(),
                    name: name.to_string(),
                    path: path.to_string(),
                    available: true,
                    version: None,
                });
            }
        } else if line.starts_with("NOTFOUND:") {
            let id = line.trim_start_matches("NOTFOUND:");
            let name = tools.iter().find(|(tid, _, _)| *tid == id).map(|(_, n, _)| *n).unwrap_or(id);
            results.push(RemoteToolInfo {
                backend_id: id.to_string(),
                name: name.to_string(),
                path: String::new(),
                available: false,
                version: None,
            });
        }
    }

    // Detect versions for found tools
    detect_remote_tool_versions(cfg, &mut results);

    Ok(results)
}

/// Run version commands for detected tools and fill in version strings.
fn detect_remote_tool_versions(cfg: &SshConfig, tools: &mut [RemoteToolInfo]) {
    let available: Vec<(usize, String)> = tools
        .iter()
        .enumerate()
        .filter(|(_, t)| t.available)
        .map(|(i, t)| {
            let cmd = match t.backend_id.as_str() {
                "diamond" => format!("{} -ver 2>/dev/null | head -1", t.path),
                "radiant" => format!("{} -ver 2>/dev/null | head -1", t.path),
                "quartus" => format!("{} --version 2>/dev/null | head -1", t.path),
                "vivado" => format!("{} -version 2>/dev/null | head -1", t.path),
                "oss" => format!("{} --version 2>/dev/null | head -1", t.path),
                "ace" => format!("{} -version 2>/dev/null | head -1", t.path),
                _ => "echo unknown".to_string(),
            };
            (i, cmd)
        })
        .collect();

    if available.is_empty() {
        return;
    }

    // Build a single SSH command that runs all version checks
    let version_script: String = available
        .iter()
        .map(|(_, cmd)| format!("echo '---VERSEP---' && {}", cmd))
        .collect::<Vec<_>>()
        .join(" && ");

    if let Ok(output) = ssh_exec(cfg, &version_script) {
        let sections: Vec<&str> = output.split("---VERSEP---").collect();
        // First element is empty (before first separator), skip it
        for (idx, (tool_idx, _)) in available.iter().enumerate() {
            if let Some(section) = sections.get(idx + 1) {
                let version = parse_version_string(
                    &tools[*tool_idx].backend_id,
                    section.trim(),
                );
                tools[*tool_idx].version = version;
            }
        }
    }
}

/// Parse a version string from tool output based on known patterns.
fn parse_version_string(backend_id: &str, output: &str) -> Option<String> {
    let line = output.lines().next()?.trim();
    if line.is_empty() {
        return None;
    }

    match backend_id {
        // Diamond: "pnmainc: Diamond (64-bit) 3.14.0.75.2"
        "diamond" => {
            if let Some(pos) = line.find("Diamond") {
                let after = &line[pos..];
                // Extract version after "Diamond" — skip optional "(64-bit)" etc.
                let version = after
                    .split_whitespace()
                    .find(|w| w.chars().next().map_or(false, |c| c.is_ascii_digit()))?;
                Some(version.to_string())
            } else {
                Some(line.to_string())
            }
        }
        // Radiant: "radiantc: Radiant Software (64-bit) 2025.2.0.25.1"
        "radiant" => {
            if let Some(pos) = line.find("Radiant") {
                let after = &line[pos..];
                let version = after
                    .split_whitespace()
                    .find(|w| w.chars().next().map_or(false, |c| c.is_ascii_digit()))?;
                Some(version.to_string())
            } else {
                Some(line.to_string())
            }
        }
        // Quartus: "Quartus Prime Shell Version 23.1std.1 Build 993 ..."
        "quartus" => {
            if let Some(pos) = line.find("Version") {
                let after = &line[pos + 7..].trim_start();
                let version = after.split_whitespace().next()?;
                Some(version.to_string())
            } else {
                Some(line.to_string())
            }
        }
        // Vivado: "Vivado v2024.1 (64-bit)" or "Vivado (TM) v2024.1"
        "vivado" => {
            // Look for " v" followed by a digit (the version marker, not "Vivado")
            let search = line;
            let mut start = 0;
            while let Some(pos) = search[start..].find('v') {
                let abs_pos = start + pos;
                let after = &search[abs_pos + 1..];
                if after.chars().next().map_or(false, |c| c.is_ascii_digit()) {
                    let version = after.split_whitespace().next()?;
                    return Some(format!("v{}", version));
                }
                start = abs_pos + 1;
            }
            Some(line.to_string())
        }
        // Yosys: "Yosys 0.38 (git sha1 ...)"
        "oss" => {
            if let Some(pos) = line.find("Yosys") {
                let after = &line[pos + 5..].trim_start();
                let version = after.split_whitespace().next()?;
                Some(version.to_string())
            } else {
                Some(line.to_string())
            }
        }
        // ACE: "Achronix ACE version 10.0" or similar
        "ace" => {
            if let Some(pos) = line.to_lowercase().find("version") {
                let after = &line[pos + 7..].trim_start();
                let version = after.split_whitespace().next()?;
                Some(version.to_string())
            } else {
                Some(line.to_string())
            }
        }
        _ => Some(line.to_string()),
    }
}

/// Probe the remote host for system info: CPU/RAM/disk/license env.
/// Runs a single batched SSH command with `---SEP---` markers to minimize latency.
pub fn ssh_get_system_info(cfg: &SshConfig) -> Result<RemoteSystemInfo, String> {
    let dir = if cfg.remote_project_dir.is_empty() {
        "/".to_string()
    } else {
        // Escape single quotes for shell safety
        cfg.remote_project_dir.replace('\'', "'\\''")
    };

    let script = format!(
        "echo '---KERNEL---' && uname -sr 2>/dev/null && \
         echo '---DISTRO---' && (. /etc/os-release 2>/dev/null && echo \"$PRETTY_NAME\") && \
         echo '---CPU---' && grep -m1 'model name' /proc/cpuinfo 2>/dev/null && \
         echo '---CPUCOUNT---' && nproc 2>/dev/null && \
         echo '---MEM---' && grep -E '^(MemTotal|MemAvailable):' /proc/meminfo 2>/dev/null && \
         echo '---DISK---' && df -Pk '{}' 2>/dev/null | tail -1 && \
         echo '---UPTIME---' && uptime -p 2>/dev/null && \
         echo '---LOAD---' && cut -d' ' -f1-3 /proc/loadavg 2>/dev/null && \
         echo '---LICENV---' && \
         echo \"LM_LICENSE_FILE=$LM_LICENSE_FILE\" && \
         echo \"LSC_LICENSE_FILE=$LSC_LICENSE_FILE\" && \
         echo \"ALTERAD_LICENSE_FILE=$ALTERAD_LICENSE_FILE\" && \
         echo \"XILINXD_LICENSE_FILE=$XILINXD_LICENSE_FILE\" && \
         echo '---END---'",
        dir
    );

    let output = ssh_exec(cfg, &script)?;
    let mut info = parse_system_info(&output);

    // For each license env var with a file-like value, check if the file exists on remote
    let mut check_script = String::new();
    for (i, lic) in info.license_env.iter().enumerate() {
        // Take first path in @-separated or :-separated list
        let first_path = lic
            .value
            .split(|c| c == ':' || c == ';')
            .next()
            .unwrap_or("")
            .trim();
        // Skip port@host FlexLM specs (not a file, treat as reachable=false here)
        if first_path.is_empty() || first_path.contains('@') {
            continue;
        }
        let escaped = first_path.replace('\'', "'\\''");
        check_script.push_str(&format!(
            "echo '---L{}---' && test -r '{}' && echo yes || echo no\n",
            i, escaped
        ));
    }
    if !check_script.is_empty() {
        if let Ok(out) = ssh_exec(cfg, &check_script) {
            for line_group in out.split("---L").skip(1) {
                if let Some((idx_str, rest)) = line_group.split_once("---") {
                    if let Ok(idx) = idx_str.trim().parse::<usize>() {
                        let answer = rest.trim().lines().next().unwrap_or("").trim();
                        if let Some(lic) = info.license_env.get_mut(idx) {
                            lic.reachable = answer == "yes";
                        }
                    }
                }
            }
        }
    }

    Ok(info)
}

/// Parse the batched system-info output produced by `ssh_get_system_info`.
fn parse_system_info(output: &str) -> RemoteSystemInfo {
    let mut info = RemoteSystemInfo::default();
    let mut sections: HashMap<String, Vec<String>> = HashMap::new();
    let mut current: Option<String> = None;

    for line in output.lines() {
        let trimmed = line.trim();
        if let Some(section) = trimmed
            .strip_prefix("---")
            .and_then(|s| s.strip_suffix("---"))
        {
            current = if section == "END" { None } else { Some(section.to_string()) };
            continue;
        }
        if let Some(ref sec) = current {
            sections.entry(sec.clone()).or_default().push(line.to_string());
        }
    }

    let joined = |name: &str| -> String {
        sections
            .get(name)
            .map(|v| v.join("\n").trim().to_string())
            .unwrap_or_default()
    };

    let kernel = joined("KERNEL");
    if !kernel.is_empty() {
        info.kernel = Some(kernel);
    }
    let distro = joined("DISTRO");
    if !distro.is_empty() {
        info.distro = Some(distro);
    }
    let cpu_line = joined("CPU");
    if let Some(pos) = cpu_line.find(':') {
        let model = cpu_line[pos + 1..].trim();
        if !model.is_empty() {
            info.cpu_model = Some(model.to_string());
        }
    }
    let cpu_count = joined("CPUCOUNT");
    info.cpu_count = cpu_count.parse().ok();

    if let Some(mem_lines) = sections.get("MEM") {
        for line in mem_lines {
            let line = line.trim();
            if let Some(rest) = line.strip_prefix("MemTotal:") {
                info.mem_total_kb = rest.trim().split_whitespace().next().and_then(|v| v.parse().ok());
            } else if let Some(rest) = line.strip_prefix("MemAvailable:") {
                info.mem_available_kb = rest.trim().split_whitespace().next().and_then(|v| v.parse().ok());
            }
        }
    }

    let disk_line = joined("DISK");
    let disk_parts: Vec<&str> = disk_line.split_whitespace().collect();
    if disk_parts.len() >= 6 {
        info.disk_total_kb = disk_parts[1].parse().ok();
        info.disk_avail_kb = disk_parts[3].parse().ok();
        info.disk_mount = Some(disk_parts[5].to_string());
    }

    let uptime = joined("UPTIME");
    if !uptime.is_empty() {
        info.uptime = Some(uptime);
    }
    let load = joined("LOAD");
    if !load.is_empty() {
        info.load_avg = Some(load);
    }

    if let Some(lic_lines) = sections.get("LICENV") {
        for line in lic_lines {
            let line = line.trim();
            if let Some((name, value)) = line.split_once('=') {
                let value = value.trim();
                if !value.is_empty() {
                    info.license_env.push(LicenseEnvVar {
                        name: name.to_string(),
                        value: value.to_string(),
                        reachable: false,
                    });
                }
            }
        }
    }

    info
}

/// Get remote project file tree via `find`.
pub fn ssh_remote_file_tree(cfg: &SshConfig) -> Result<Vec<crate::types::FileEntry>, String> {
    let dir = &cfg.remote_project_dir;
    // Use find with maxdepth to avoid huge trees. Output: type, size, path
    let cmd = format!(
        "find {} -maxdepth 4 -not -path '*/.git/*' -not -path '*/node_modules/*' -printf '%y %s %P\\n' 2>/dev/null | head -2000",
        dir
    );
    let output = ssh_exec(cfg, &cmd)?;

    let mut entries = Vec::new();
    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        // Format: "f 1234 path/to/file" or "d 0 path/to/dir"
        let mut parts = line.splitn(3, ' ');
        let ftype = parts.next().unwrap_or("f");
        let size_str = parts.next().unwrap_or("0");
        let rel_path = parts.next().unwrap_or("");
        if rel_path.is_empty() {
            continue;
        }

        let is_dir = ftype == "d";
        let size_bytes: u64 = size_str.parse().unwrap_or(0);
        let depth = rel_path.matches('/').count() as u32;
        let name = rel_path.rsplit('/').next().unwrap_or(rel_path).to_string();

        let file_type = crate::files::classify_file(&name, std::path::Path::new(rel_path));
        entries.push(crate::types::FileEntry {
            name,
            path: format!("{}/{}", dir, rel_path),
            is_dir,
            depth,
            file_type,
            git_status: None,
            in_synthesis: false,
            size_bytes,
        });
    }

    // Sort: directories first, then alphabetical
    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

/// Read a file from the remote server.
pub fn ssh_read_file(cfg: &SshConfig, path: &str) -> Result<String, String> {
    ssh_exec(cfg, &format!("cat '{}'", path))
}

/// Get git status from the remote project directory.
pub fn ssh_git_status(cfg: &SshConfig) -> Result<crate::types::GitStatus, String> {
    let dir = &cfg.remote_project_dir;
    let cmd = format!(
        "cd '{}' && git rev-parse --abbrev-ref HEAD 2>/dev/null && \
         git log -1 --format='%H|||%s|||%an|||%ar' 2>/dev/null && \
         git status --porcelain 2>/dev/null | wc -l && \
         git rev-list --count @{{u}}..HEAD 2>/dev/null || echo 0 && \
         git rev-list --count HEAD..@{{u}} 2>/dev/null || echo 0",
        dir
    );
    let output = ssh_exec(cfg, &cmd)?;
    let lines: Vec<&str> = output.trim().lines().collect();

    let branch = lines.first().unwrap_or(&"unknown").to_string();
    let (hash, msg, author, time_ago) = if let Some(log_line) = lines.get(1) {
        let parts: Vec<&str> = log_line.splitn(4, "|||").collect();
        (
            parts.first().unwrap_or(&"").to_string(),
            parts.get(1).unwrap_or(&"").to_string(),
            parts.get(2).unwrap_or(&"").to_string(),
            parts.get(3).unwrap_or(&"").to_string(),
        )
    } else {
        (String::new(), String::new(), String::new(), String::new())
    };

    let dirty_count: u32 = lines.get(2).and_then(|s| s.trim().parse().ok()).unwrap_or(0);
    let ahead: u32 = lines.get(3).and_then(|s| s.trim().parse().ok()).unwrap_or(0);
    let behind: u32 = lines.get(4).and_then(|s| s.trim().parse().ok()).unwrap_or(0);

    Ok(crate::types::GitStatus {
        branch,
        commit_hash: hash,
        commit_message: msg,
        author,
        time_ago,
        ahead,
        behind,
        staged: 0,
        unstaged: dirty_count,
        untracked: 0,
        stashes: 0,
        dirty: dirty_count > 0,
    })
}

/// Upload a file to the remote server via SCP.
pub fn scp_upload(cfg: &SshConfig, local_path: &str, remote_path: &str) -> Result<(), String> {
    let mut cmd = build_scp_command(cfg, local_path, remote_path, false);
    let output = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| format!("SCP upload failed: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("SCP upload failed: {}", stderr.trim()))
    }
}

/// Download a file from the remote server via SCP.
pub fn scp_download(cfg: &SshConfig, remote_path: &str, local_path: &str) -> Result<(), String> {
    let mut cmd = build_scp_command(cfg, remote_path, local_path, true);
    let output = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| format!("SCP download failed: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("SCP download failed: {}", stderr.trim()))
    }
}

// ── Directory Browsing ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteDirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permissions: Option<String>,
}

/// List immediate children of a remote directory with metadata.
/// Uses `ls -lpa --time-style=long-iso` for file details, falls back to simple `ls -1pa`.
/// Returns directories first, sorted alphabetically. Filters `.` and `..`.
pub fn ssh_list_directory(cfg: &SshConfig, dir: &str) -> Result<Vec<RemoteDirEntry>, String> {
    // Try detailed listing first
    let detailed_cmd = format!("ls -lpa --time-style=long-iso '{}' 2>/dev/null", dir);
    if let Ok(output) = ssh_exec(cfg, &detailed_cmd) {
        if let Some(entries) = parse_ls_long_output(&output, dir) {
            return Ok(entries);
        }
    }

    // Fallback to simple listing
    let output = ssh_exec(cfg, &format!("ls -1pa '{}'", dir))?;
    let mut dirs = Vec::new();
    let mut files = Vec::new();
    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() || line == "./" || line == "../" {
            continue;
        }
        let is_dir = line.ends_with('/');
        let name = if is_dir {
            line.trim_end_matches('/')
        } else {
            line
        };
        if name.is_empty() {
            continue;
        }
        let entry_path = if dir.ends_with('/') {
            format!("{}{}", dir, name)
        } else {
            format!("{}/{}", dir, name)
        };
        let entry = RemoteDirEntry {
            name: name.to_string(),
            path: entry_path,
            is_dir,
            size: None,
            modified: None,
            permissions: None,
        };
        if is_dir {
            dirs.push(entry);
        } else {
            files.push(entry);
        }
    }
    dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    dirs.append(&mut files);
    Ok(dirs)
}

/// Parse `ls -lpa --time-style=long-iso` output into RemoteDirEntry with metadata.
/// Format: `drwxr-xr-x 2 user group 4096 2025-01-15 14:30 dirname/`
fn parse_ls_long_output(output: &str, dir: &str) -> Option<Vec<RemoteDirEntry>> {
    let mut dirs = Vec::new();
    let mut files = Vec::new();

    for line in output.lines() {
        let line = line.trim();
        // Skip total line and empty lines
        if line.is_empty() || line.starts_with("total") {
            continue;
        }
        // Must start with a permission character
        let first = line.chars().next()?;
        if !matches!(first, 'd' | '-' | 'l' | 'c' | 'b' | 'p' | 's') {
            continue;
        }

        // Parse: permissions links user group size date time name
        let parts: Vec<&str> = line.splitn(8, char::is_whitespace).collect();
        // After splitting on whitespace, filter out empty strings
        let parts: Vec<&str> = parts.into_iter().filter(|s| !s.is_empty()).collect();
        if parts.len() < 7 {
            continue;
        }

        let perms = parts[0];
        // parts[1] = links, parts[2] = user, parts[3] = group
        let size: u64 = parts[4].parse().unwrap_or(0);

        // Date and time — parts[5] is date, parts[6] has "time name" or just time
        // Because --time-style=long-iso gives "2025-01-15 14:30", the rest is the name
        // We need to find where the filename starts after date+time
        let date_str = parts[5];

        // Find the filename in the original line — it's everything after the date+time
        // Find the date in the line, then skip past the time
        let date_pos = line.find(date_str)?;
        let after_date = &line[date_pos + date_str.len()..].trim_start();
        // Next token is time (HH:MM), rest is filename
        let space_after_time = after_date.find(' ')?;
        let time_str = &after_date[..space_after_time];
        let name_raw = after_date[space_after_time..].trim_start();

        if name_raw.is_empty() {
            continue;
        }

        // Skip . and ..
        let clean_name = name_raw.trim_end_matches('/');
        if clean_name == "." || clean_name == ".." {
            continue;
        }

        let is_dir = perms.starts_with('d') || name_raw.ends_with('/');
        let name = clean_name.to_string();
        if name.is_empty() {
            continue;
        }

        // Handle symlinks: "name -> target" — just use the name part
        let display_name = if let Some(arrow_pos) = name.find(" -> ") {
            name[..arrow_pos].to_string()
        } else {
            name
        };

        let entry_path = if dir.ends_with('/') {
            format!("{}{}", dir, display_name)
        } else {
            format!("{}/{}", dir, display_name)
        };

        let modified = format!("{} {}", date_str, time_str);

        let entry = RemoteDirEntry {
            name: display_name,
            path: entry_path,
            is_dir,
            size: Some(size),
            modified: Some(modified),
            permissions: Some(perms.to_string()),
        };

        if is_dir {
            dirs.push(entry);
        } else {
            files.push(entry);
        }
    }

    if dirs.is_empty() && files.is_empty() {
        return None; // Parsing failed, trigger fallback
    }

    dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    dirs.append(&mut files);
    Some(dirs)
}

/// Check if a remote directory contains a `.coverteda` project file.
/// Returns the parsed ProjectConfig if found, None otherwise.
pub fn ssh_check_project_dir(
    cfg: &SshConfig,
    dir: &str,
) -> Result<Option<crate::project::ProjectConfig>, String> {
    let coverteda_path = if dir.ends_with('/') {
        format!("{}.coverteda", dir)
    } else {
        format!("{}/.coverteda", dir)
    };
    // Check existence and read in one command
    let cmd = format!(
        "if [ -f '{}' ]; then cat '{}'; else echo '__NOT_FOUND__'; fi",
        coverteda_path, coverteda_path
    );
    let output = ssh_exec(cfg, &cmd)?;
    let trimmed = output.trim();
    if trimmed == "__NOT_FOUND__" {
        return Ok(None);
    }
    let config: crate::project::ProjectConfig =
        serde_json::from_str(trimmed).map_err(|e| format!("Invalid .coverteda: {}", e))?;
    Ok(Some(config))
}

/// Write a `.coverteda` project file to a remote directory.
pub fn ssh_create_project_file(
    cfg: &SshConfig,
    dir: &str,
    config: &crate::project::ProjectConfig,
) -> Result<(), String> {
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("JSON serialization error: {}", e))?;
    let coverteda_path = if dir.ends_with('/') {
        format!("{}.coverteda", dir)
    } else {
        format!("{}/.coverteda", dir)
    };
    // Use printf to avoid heredoc escaping issues
    let escaped = json.replace('\\', "\\\\").replace('\'', "'\\''");
    let cmd = format!("printf '%s' '{}' > '{}'", escaped, coverteda_path);
    ssh_exec(cfg, &cmd)?;
    Ok(())
}

// ── OS Keyring helpers for SSH password ──

const KEYRING_SERVICE: &str = "coverteda_ssh";

pub fn save_ssh_password(user: &str, host: &str, password: &str) -> Result<(), String> {
    let key = format!("{}@{}", user, host);
    let entry = keyring::Entry::new(KEYRING_SERVICE, &key)
        .map_err(|e| format!("Keyring error: {}", e))?;
    entry
        .set_password(password)
        .map_err(|e| format!("Failed to save password: {}", e))
}

pub fn load_ssh_password(user: &str, host: &str) -> Option<String> {
    let key = format!("{}@{}", user, host);
    let entry = keyring::Entry::new(KEYRING_SERVICE, &key).ok()?;
    entry.get_password().ok()
}

// ── Tests ──

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config() -> SshConfig {
        SshConfig {
            enabled: true,
            tool: SshToolKind::OpenSsh,
            custom_ssh_path: None,
            custom_scp_path: None,
            host: "build-server.local".into(),
            port: 22,
            user: "fpga".into(),
            auth: SshAuthMethod::Agent,
            key_path: None,
            remote_project_dir: "/home/fpga/projects/counter".into(),
            remote_tool_paths: HashMap::new(),
        }
    }

    #[test]
    fn test_openssh_command_default_port() {
        let cfg = test_config();
        let cmd = build_ssh_command(&cfg, "echo hello");
        let prog = cmd.get_program().to_str().unwrap();
        let args: Vec<&str> = cmd.get_args().map(|a| a.to_str().unwrap()).collect();

        assert_eq!(prog, "ssh");
        // No -p flag for default port 22
        assert!(!args.contains(&"-p"));
        assert!(args.contains(&"fpga@build-server.local"));
        assert!(args.contains(&"echo hello"));
    }

    #[test]
    fn test_openssh_command_custom_port() {
        let mut cfg = test_config();
        cfg.port = 2222;
        let cmd = build_ssh_command(&cfg, "ls");
        let args: Vec<&str> = cmd.get_args().map(|a| a.to_str().unwrap()).collect();

        assert!(args.contains(&"-p"));
        assert!(args.contains(&"2222"));
    }

    #[test]
    fn test_openssh_command_with_key() {
        let mut cfg = test_config();
        cfg.auth = SshAuthMethod::Key;
        cfg.key_path = Some("/home/user/.ssh/id_rsa".into());
        let cmd = build_ssh_command(&cfg, "hostname");
        let args: Vec<&str> = cmd.get_args().map(|a| a.to_str().unwrap()).collect();

        assert!(args.contains(&"-i"));
        assert!(args.contains(&"/home/user/.ssh/id_rsa"));
    }

    #[test]
    fn test_plink_command() {
        let mut cfg = test_config();
        cfg.tool = SshToolKind::Plink;
        cfg.port = 2222;
        let cmd = build_ssh_command(&cfg, "uname -a");
        let prog = cmd.get_program().to_str().unwrap();
        let args: Vec<&str> = cmd.get_args().map(|a| a.to_str().unwrap()).collect();

        assert_eq!(prog, "plink");
        assert!(args.contains(&"-P"));
        assert!(args.contains(&"2222"));
    }

    #[test]
    fn test_custom_ssh_command() {
        let mut cfg = test_config();
        cfg.tool = SshToolKind::Custom;
        cfg.custom_ssh_path = Some("/usr/local/bin/my-ssh".into());
        let cmd = build_ssh_command(&cfg, "whoami");
        let prog = cmd.get_program().to_str().unwrap();

        assert_eq!(prog, "/usr/local/bin/my-ssh");
    }

    #[test]
    fn test_scp_download_openssh() {
        let cfg = test_config();
        let cmd = build_scp_command(&cfg, "/remote/file.rpt", "/tmp/file.rpt", true);
        let prog = cmd.get_program().to_str().unwrap();
        let args: Vec<String> = cmd.get_args().map(|a| a.to_string_lossy().into_owned()).collect();

        assert_eq!(prog, "scp");
        assert!(args.iter().any(|a| a == "fpga@build-server.local:/remote/file.rpt"));
        assert!(args.iter().any(|a| a == "/tmp/file.rpt"));
    }

    #[test]
    fn test_scp_upload_openssh() {
        let cfg = test_config();
        let cmd = build_scp_command(&cfg, "/tmp/build.tcl", "/remote/build.tcl", false);
        let args: Vec<String> = cmd.get_args().map(|a| a.to_string_lossy().into_owned()).collect();

        assert!(args.iter().any(|a| a == "/tmp/build.tcl"));
        assert!(args.iter().any(|a| a == "fpga@build-server.local:/remote/build.tcl"));
    }

    #[test]
    fn test_scp_plink_port_flag() {
        let mut cfg = test_config();
        cfg.tool = SshToolKind::Plink;
        cfg.port = 2222;
        let cmd = build_scp_command(&cfg, "/remote/f", "/local/f", true);
        let prog = cmd.get_program().to_str().unwrap();
        let args: Vec<&str> = cmd.get_args().map(|a| a.to_str().unwrap()).collect();

        assert_eq!(prog, "pscp");
        // PuTTY pscp uses -P for port
        assert!(args.contains(&"-P"));
        assert!(args.contains(&"2222"));
    }

    #[test]
    fn test_scp_custom_binary() {
        let mut cfg = test_config();
        cfg.tool = SshToolKind::Custom;
        cfg.custom_scp_path = Some("/opt/bin/my-scp".into());
        let cmd = build_scp_command(&cfg, "/r/f", "/l/f", true);
        let prog = cmd.get_program().to_str().unwrap();

        assert_eq!(prog, "/opt/bin/my-scp");
    }

    #[test]
    fn test_default_ssh_config() {
        let cfg = SshConfig::default();
        assert!(!cfg.enabled);
        assert_eq!(cfg.tool, SshToolKind::OpenSsh);
        assert_eq!(cfg.port, 22);
        assert_eq!(cfg.auth, SshAuthMethod::Agent);
        assert!(cfg.host.is_empty());
    }

    #[test]
    fn test_ssh_config_serialization() {
        let cfg = test_config();
        let json = serde_json::to_string(&cfg).unwrap();
        let parsed: SshConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.host, "build-server.local");
        assert_eq!(parsed.user, "fpga");
        assert_eq!(parsed.port, 22);
        assert_eq!(parsed.tool, SshToolKind::OpenSsh);
    }

    #[test]
    fn test_remote_dir_entry_serialization() {
        let entry = RemoteDirEntry {
            name: "src".into(),
            path: "/home/fpga/src".into(),
            is_dir: true,
            size: Some(4096),
            modified: Some("2025-01-15 14:30".into()),
            permissions: Some("drwxr-xr-x".into()),
        };
        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("\"isDir\":true"));
        assert!(json.contains("\"name\":\"src\""));
        assert!(json.contains("\"size\":4096"));
        let parsed: RemoteDirEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.name, "src");
        assert!(parsed.is_dir);
        assert_eq!(parsed.size, Some(4096));
    }

    #[test]
    fn test_remote_dir_entry_optional_fields_omitted() {
        let entry = RemoteDirEntry {
            name: "file.v".into(),
            path: "/home/fpga/file.v".into(),
            is_dir: false,
            size: None,
            modified: None,
            permissions: None,
        };
        let json = serde_json::to_string(&entry).unwrap();
        assert!(!json.contains("\"size\""));
        assert!(!json.contains("\"modified\""));
        assert!(!json.contains("\"permissions\""));
    }

    #[test]
    fn test_parse_ls_output() {
        // Simulate ls -1pa output parsing
        let output = ".\n../\ndir1/\ndir2/\nfile1.v\nfile2.vhd\n.hidden_dir/\n.hidden_file\n";
        let mut dirs = Vec::new();
        let mut files = Vec::new();
        let base = "/home/fpga/project";
        for line in output.lines() {
            let line = line.trim();
            if line.is_empty() || line == "./" || line == "../" || line == "." {
                continue;
            }
            let is_dir = line.ends_with('/');
            let name = if is_dir { line.trim_end_matches('/') } else { line };
            if name.is_empty() { continue; }
            let entry = RemoteDirEntry {
                name: name.to_string(),
                path: format!("{}/{}", base, name),
                is_dir,
                size: None,
                modified: None,
                permissions: None,
            };
            if is_dir { dirs.push(entry); } else { files.push(entry); }
        }
        dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        dirs.append(&mut files);

        assert_eq!(dirs.len(), 6);
        // Directories first
        assert!(dirs[0].is_dir);
        assert_eq!(dirs[0].name, ".hidden_dir");
        assert!(dirs[1].is_dir);
        assert_eq!(dirs[1].name, "dir1");
        assert!(dirs[2].is_dir);
        assert_eq!(dirs[2].name, "dir2");
        // Files after
        assert!(!dirs[3].is_dir);
        assert_eq!(dirs[3].name, ".hidden_file");
        assert!(!dirs[4].is_dir);
        assert_eq!(dirs[4].name, "file1.v");
        assert!(!dirs[5].is_dir);
        assert_eq!(dirs[5].name, "file2.vhd");
    }

    #[test]
    fn test_parse_ls_long_output() {
        let output = "total 28\n\
            drwxr-xr-x 3 user group  4096 2025-01-15 14:30 ./\n\
            drwxr-xr-x 5 user group  4096 2025-01-10 09:00 ../\n\
            drwxr-xr-x 2 user group  4096 2025-01-15 14:30 src/\n\
            -rw-r--r-- 1 user group  1234 2025-01-14 10:15 top.v\n\
            -rw-r--r-- 1 user group 56789 2025-01-13 08:45 constraints.lpf\n";
        let entries = parse_ls_long_output(output, "/home/fpga/project").unwrap();
        assert_eq!(entries.len(), 3);
        // dirs first
        assert_eq!(entries[0].name, "src");
        assert!(entries[0].is_dir);
        assert_eq!(entries[0].size, Some(4096));
        assert_eq!(entries[0].permissions.as_deref(), Some("drwxr-xr-x"));
        assert_eq!(entries[0].modified.as_deref(), Some("2025-01-15 14:30"));
        // files
        assert_eq!(entries[1].name, "constraints.lpf");
        assert!(!entries[1].is_dir);
        assert_eq!(entries[1].size, Some(56789));
        assert_eq!(entries[2].name, "top.v");
        assert!(!entries[2].is_dir);
        assert_eq!(entries[2].size, Some(1234));
    }

    #[test]
    fn test_parse_version_strings() {
        assert_eq!(
            parse_version_string("diamond", "pnmainc: Diamond (64-bit) 3.14.0.75.2"),
            Some("3.14.0.75.2".to_string())
        );
        assert_eq!(
            parse_version_string("quartus", "Quartus Prime Shell Version 23.1std.1 Build 993"),
            Some("23.1std.1".to_string())
        );
        assert_eq!(
            parse_version_string("vivado", "Vivado v2024.1 (64-bit)"),
            Some("v2024.1".to_string())
        );
        assert_eq!(
            parse_version_string("oss", "Yosys 0.38 (git sha1 abcdef)"),
            Some("0.38".to_string())
        );
        assert_eq!(
            parse_version_string("radiant", "radiantc: Radiant Software (64-bit) 2025.2.0.25.1"),
            Some("2025.2.0.25.1".to_string())
        );
    }

    #[test]
    fn test_ssh_exec_result_serialization() {
        let result = SshExecResult {
            stdout: "hello\n".into(),
            stderr: String::new(),
            exit_code: 0,
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"exitCode\":0"));
        assert!(json.contains("\"stdout\":\"hello\\n\""));
    }

    #[test]
    fn test_parse_system_info() {
        let output = "\
---KERNEL---
Linux 6.1.0-18-amd64
---DISTRO---
Ubuntu 22.04.3 LTS
---CPU---
model name\t: Intel(R) Xeon(R) Gold 6248R CPU @ 3.00GHz
---CPUCOUNT---
48
---MEM---
MemTotal:       131847280 kB
MemAvailable:   118290404 kB
---DISK---
/dev/nvme0n1p2  976284672 312104448 614532196  34% /
---UPTIME---
up 12 days, 4 hours
---LOAD---
0.12 0.08 0.05
---LICENV---
LM_LICENSE_FILE=/opt/licenses/lattice.dat:27000@flexserv
LSC_LICENSE_FILE=
ALTERAD_LICENSE_FILE=1800@altera-host
XILINXD_LICENSE_FILE=/opt/licenses/xilinx.lic
---END---
";
        let info = parse_system_info(output);
        assert_eq!(info.kernel.as_deref(), Some("Linux 6.1.0-18-amd64"));
        assert_eq!(info.distro.as_deref(), Some("Ubuntu 22.04.3 LTS"));
        assert_eq!(
            info.cpu_model.as_deref(),
            Some("Intel(R) Xeon(R) Gold 6248R CPU @ 3.00GHz")
        );
        assert_eq!(info.cpu_count, Some(48));
        assert_eq!(info.mem_total_kb, Some(131847280));
        assert_eq!(info.mem_available_kb, Some(118290404));
        assert_eq!(info.disk_total_kb, Some(976284672));
        assert_eq!(info.disk_avail_kb, Some(614532196));
        assert_eq!(info.disk_mount.as_deref(), Some("/"));
        assert_eq!(info.uptime.as_deref(), Some("up 12 days, 4 hours"));
        assert_eq!(info.load_avg.as_deref(), Some("0.12 0.08 0.05"));
        // LSC_LICENSE_FILE is empty so it's filtered out
        assert_eq!(info.license_env.len(), 3);
        assert_eq!(info.license_env[0].name, "LM_LICENSE_FILE");
        assert_eq!(info.license_env[0].value, "/opt/licenses/lattice.dat:27000@flexserv");
        assert!(!info.license_env[0].reachable);
        assert_eq!(info.license_env[1].name, "ALTERAD_LICENSE_FILE");
        assert_eq!(info.license_env[2].name, "XILINXD_LICENSE_FILE");
    }

    #[test]
    fn test_parse_system_info_partial() {
        // Simulate a host where some commands fail (empty sections)
        let output = "\
---KERNEL---
Linux 5.15.0
---DISTRO---
---CPU---
---CPUCOUNT---
8
---MEM---
---DISK---
---UPTIME---
---LOAD---
---LICENV---
---END---
";
        let info = parse_system_info(output);
        assert_eq!(info.kernel.as_deref(), Some("Linux 5.15.0"));
        assert_eq!(info.distro, None);
        assert_eq!(info.cpu_model, None);
        assert_eq!(info.cpu_count, Some(8));
        assert_eq!(info.mem_total_kb, None);
        assert_eq!(info.disk_mount, None);
        assert!(info.license_env.is_empty());
    }

    #[test]
    fn test_remote_system_info_serialization() {
        let info = RemoteSystemInfo {
            kernel: Some("Linux 6.1".into()),
            cpu_count: Some(16),
            mem_total_kb: Some(32_000_000),
            license_env: vec![LicenseEnvVar {
                name: "LM_LICENSE_FILE".into(),
                value: "/opt/lic.dat".into(),
                reachable: true,
            }],
            ..Default::default()
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"cpuCount\":16"));
        assert!(json.contains("\"memTotalKb\":32000000"));
        assert!(json.contains("\"licenseEnv\""));
        assert!(json.contains("\"reachable\":true"));
        let parsed: RemoteSystemInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.cpu_count, Some(16));
        assert_eq!(parsed.license_env.len(), 1);
    }

    #[test]
    fn test_parse_coverteda_json() {
        let json = r#"{
            "name": "counter",
            "backendId": "radiant",
            "device": "LIFCL-40",
            "topModule": "top",
            "sourcePatterns": ["*.v"],
            "constraintFiles": ["*.pdc"],
            "implDir": "impl1",
            "backendConfig": {},
            "buildStages": ["synth", "map", "par", "bitgen"],
            "buildOptions": {},
            "createdAt": "2025-01-01T00:00:00Z",
            "updatedAt": "2025-01-01T00:00:00Z"
        }"#;
        let config: crate::project::ProjectConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.name, "counter");
        assert_eq!(config.backend_id, "radiant");
        assert_eq!(config.device, "LIFCL-40");
        assert_eq!(config.top_module, "top");
    }

    #[test]
    fn test_parse_coverteda_not_found() {
        let output = "__NOT_FOUND__";
        assert_eq!(output.trim(), "__NOT_FOUND__");
    }
}
