use crate::types::*;
use std::path::Path;
use walkdir::WalkDir;

/// Scan a project directory and return a file tree with metadata.
pub fn scan_directory(project_dir: &Path) -> Result<Vec<FileEntry>, std::io::Error> {
    let mut entries = Vec::new();

    for entry in WalkDir::new(project_dir)
        .max_depth(6)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            // Skip truly hidden dirs/files (but allow .coverteda* project files)
            if name.starts_with('.') {
                return name.starts_with(".coverteda");
            }
            name != "node_modules"
                && name != "target"
                && name != "__pycache__"
        })
    {
        let entry = entry.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        let path = entry.path();
        let depth = entry.depth() as u32;
        let name = entry.file_name().to_string_lossy().to_string();

        if depth == 0 {
            continue; // Skip root directory itself
        }

        let file_type = classify_file(&name, path);
        let in_synthesis = matches!(file_type, FileType::Rtl | FileType::Constraint | FileType::Ip);

        let size_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);

        entries.push(FileEntry {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir: path.is_dir(),
            depth,
            file_type,
            git_status: None, // Filled in separately by git module
            in_synthesis,
            size_bytes,
        });
    }

    Ok(entries)
}

fn classify_file(name: &str, _path: &Path) -> FileType {
    let lower = name.to_lowercase();
    if lower.ends_with(".v") || lower.ends_with(".sv") || lower.ends_with(".vhd") || lower.ends_with(".vhdl") {
        if lower.starts_with("tb_") || lower.contains("_tb.") || lower.contains("testbench") {
            FileType::Testbench
        } else {
            FileType::Rtl
        }
    } else if lower.ends_with(".lpf")
        || lower.ends_with(".sdc")
        || lower.ends_with(".xdc")
        || lower.ends_with(".pcf")
        || lower.ends_with(".pdc")
    {
        FileType::Constraint
    } else if lower.ends_with(".jed")
        || lower.ends_with(".bit")
        || lower.ends_with(".sof")
        || lower.ends_with(".bin")
        || lower.ends_with(".twr")
        || lower.ends_with(".mrp")
        || lower.ends_with(".par")
        || lower.ends_with(".bgn")
        || lower.ends_with(".drc")
        || lower.ends_with(".srp")
        || lower.ends_with(".pad")
        || lower.ends_with(".arearep")
        || lower.ends_with(".log")
    {
        FileType::Output
    } else if lower.ends_with(".md") || lower.ends_with(".txt") || lower.ends_with(".pdf") {
        FileType::Doc
    } else if lower.ends_with(".tcl")
        || lower.ends_with(".do")
        || lower.ends_with(".toml")
        || lower.ends_with(".json")
        || lower.ends_with(".rdf")
        || lower.ends_with(".sty")
    {
        FileType::Config
    } else {
        FileType::Other
    }
}
