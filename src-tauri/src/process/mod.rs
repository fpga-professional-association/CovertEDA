use std::path::Path;
use tokio::process::Command;

/// Spawn a vendor tool process and return handles for stdout/stderr streaming.
pub async fn spawn_build(
    executable: &str,
    args: &[&str],
    working_dir: &Path,
    env_vars: &[(&str, &str)],
) -> Result<tokio::process::Child, std::io::Error> {
    let mut cmd = Command::new(executable);
    cmd.args(args)
        .current_dir(working_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    for (key, val) in env_vars {
        cmd.env(key, val);
    }

    // On Windows, prevent console window from appearing
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    cmd.spawn()
}

/// Kill a running build process.
pub async fn kill_build(child: &mut tokio::process::Child) -> Result<(), std::io::Error> {
    child.kill().await
}
