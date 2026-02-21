use std::path::Path;

fn main() {
    tauri_build::build();

    // Copy examples/ to the output directory so they sit next to the exe.
    // This only runs during `cargo build` (not during packaging), but the
    // examples/ folder next to the exe is picked up by find_examples_dir().
    let examples_src = Path::new("../examples");
    if examples_src.is_dir() {
        let profile = std::env::var("PROFILE").unwrap_or_else(|_| "debug".into());
        let out_dir = Path::new("target").join(&profile).join("examples");
        if let Err(e) = copy_dir_recursive(examples_src, &out_dir) {
            println!("cargo:warning=Failed to copy examples: {}", e);
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
