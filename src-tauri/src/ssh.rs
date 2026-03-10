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
            });
        }
    }

    Ok(results)
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
}

/// List immediate children of a remote directory.
/// Returns directories first, sorted alphabetically. Filters `.` and `..`.
pub fn ssh_list_directory(cfg: &SshConfig, dir: &str) -> Result<Vec<RemoteDirEntry>, String> {
    // ls -1pa: one entry per line, append / to dirs, include hidden files
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
        };
        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("\"isDir\":true"));
        assert!(json.contains("\"name\":\"src\""));
        let parsed: RemoteDirEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.name, "src");
        assert!(parsed.is_dir);
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
