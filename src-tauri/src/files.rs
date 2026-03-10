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
                // Quartus build artifacts
                && name != "db"
                && name != "dni"
                && name != "qdb"
                && name != "incremental_db"
                && name != "output_files"
                && name != "greybox_tmp"
                && name != "simulation"
                // Vivado build artifacts
                && !name.ends_with(".runs")
                && !name.ends_with(".cache")
                && !name.ends_with(".hw")
                && !name.ends_with(".ip_user_files")
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

pub fn classify_file(name: &str, _path: &Path) -> FileType {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn test_classify_verilog() {
        assert_eq!(classify_file("counter.v", Path::new("counter.v")), FileType::Rtl);
    }
    #[test]
    fn test_classify_systemverilog() {
        assert_eq!(classify_file("alu.sv", Path::new("alu.sv")), FileType::Rtl);
    }
    #[test]
    fn test_classify_vhdl() {
        assert_eq!(classify_file("fir.vhd", Path::new("fir.vhd")), FileType::Rtl);
    }
    #[test]
    fn test_classify_vhdl_long() {
        assert_eq!(classify_file("fir.vhdl", Path::new("fir.vhdl")), FileType::Rtl);
    }
    #[test]
    fn test_classify_testbench_prefix() {
        assert_eq!(classify_file("tb_counter.v", Path::new("tb_counter.v")), FileType::Testbench);
    }
    #[test]
    fn test_classify_testbench_suffix() {
        assert_eq!(classify_file("counter_tb.v", Path::new("counter_tb.v")), FileType::Testbench);
    }
    #[test]
    fn test_classify_lpf_constraint() {
        assert_eq!(classify_file("pins.lpf", Path::new("pins.lpf")), FileType::Constraint);
    }
    #[test]
    fn test_classify_sdc_constraint() {
        assert_eq!(classify_file("timing.sdc", Path::new("timing.sdc")), FileType::Constraint);
    }
    #[test]
    fn test_classify_xdc_constraint() {
        assert_eq!(classify_file("io.xdc", Path::new("io.xdc")), FileType::Constraint);
    }
    #[test]
    fn test_classify_pcf_constraint() {
        assert_eq!(classify_file("pins.pcf", Path::new("pins.pcf")), FileType::Constraint);
    }
    #[test]
    fn test_classify_pdc_constraint() {
        assert_eq!(classify_file("pins.pdc", Path::new("pins.pdc")), FileType::Constraint);
    }
    #[test]
    fn test_classify_bit_output() {
        assert_eq!(classify_file("design.bit", Path::new("design.bit")), FileType::Output);
    }
    #[test]
    fn test_classify_jed_output() {
        assert_eq!(classify_file("top.jed", Path::new("top.jed")), FileType::Output);
    }
    #[test]
    fn test_classify_twr_output() {
        assert_eq!(classify_file("timing.twr", Path::new("timing.twr")), FileType::Output);
    }
    #[test]
    fn test_classify_markdown_doc() {
        assert_eq!(classify_file("README.md", Path::new("README.md")), FileType::Doc);
    }
    #[test]
    fn test_classify_tcl_config() {
        assert_eq!(classify_file("build.tcl", Path::new("build.tcl")), FileType::Config);
    }
    #[test]
    fn test_classify_json_config() {
        assert_eq!(classify_file("package.json", Path::new("package.json")), FileType::Config);
    }
    #[test]
    fn test_classify_unknown() {
        assert_eq!(classify_file("random.xyz", Path::new("random.xyz")), FileType::Other);
    }
}
