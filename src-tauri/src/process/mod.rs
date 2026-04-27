use std::path::Path;
use tokio::process::Command;

/// Windows `CREATE_NO_WINDOW` flag — prevents console windows from popping up
/// when spawning CLI tools in the background.
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Create a `std::process::Command` with `CREATE_NO_WINDOW` set on Windows.
/// Use this for all CLI tool invocations that should not show a console window.
#[allow(unused_mut)]
pub fn no_window_cmd(program: &str) -> std::process::Command {
    let mut cmd = std::process::Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Create a `tokio::process::Command` with `CREATE_NO_WINDOW` set on Windows.
/// Async variant for use with tokio subprocess spawning.
#[allow(unused_mut)]
pub fn no_window_cmd_async(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Spawn a vendor tool process and return handles for stdout/stderr streaming.
pub async fn spawn_build(
    executable: &str,
    args: &[&str],
    working_dir: &Path,
    env_vars: &[(&str, &str)],
) -> Result<tokio::process::Child, std::io::Error> {
    let mut cmd = no_window_cmd_async(executable);
    cmd.args(args)
        .current_dir(working_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    for (key, val) in env_vars {
        cmd.env(key, val);
    }

    cmd.spawn()
}

/// Kill a running build process.
pub async fn kill_build(child: &mut tokio::process::Child) -> Result<(), std::io::Error> {
    child.kill().await
}
