use std::path::Path;

fn main() {
    // Stage examples inside src-tauri/ so Tauri's resource bundler can find them.
    // The `../` relative path + glob doesn't work reliably on Windows, so we copy
    // them here first and reference `_bundled_examples/` in tauri.conf.json.
    let examples_src = Path::new("../examples");
    let staging = Path::new("_bundled_examples");
    if examples_src.is_dir() {
        let _ = std::fs::remove_dir_all(staging);
        if let Err(e) = copy_dir_recursive(examples_src, staging) {
            println!("cargo:warning=Failed to stage examples: {}", e);
        }
    }

    tauri_build::build();

    // Also copy examples next to the exe for standalone (non-installed) runs.
    let profile = std::env::var("PROFILE").unwrap_or_else(|_| "debug".into());
    let out_dir = Path::new("target").join(&profile).join("examples");
    if examples_src.is_dir() {
        if let Err(e) = copy_dir_recursive(examples_src, &out_dir) {
            println!("cargo:warning=Failed to copy examples to target: {}", e);
        }
    }
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}
