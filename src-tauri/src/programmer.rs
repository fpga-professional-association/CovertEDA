use std::path::{Path, PathBuf};

/// Represents a detected programming cable.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cable {
    pub index: u32,
    pub name: String,
    pub port: String,
}

/// Find pgrcmd executable adjacent to radiantc in the Radiant installation.
pub fn find_pgrcmd(radiant_install_dir: &Path) -> Option<PathBuf> {
    let bin = if cfg!(target_os = "windows") {
        radiant_install_dir.join("bin").join("nt64").join("pgrcmd.exe")
    } else if radiant_install_dir.starts_with("/mnt/c") || radiant_install_dir.starts_with("/mnt/d") {
        // WSL accessing Windows install — use .exe
        radiant_install_dir.join("bin").join("nt64").join("pgrcmd.exe")
    } else {
        radiant_install_dir.join("bin").join("lin64").join("pgrcmd")
    };
    if bin.exists() {
        Some(bin)
    } else {
        None
    }
}

/// Generate a minimal XCF file for cable scanning.
pub fn generate_scan_xcf() -> String {
    r#"<?xml version="1.0" encoding="utf-8" ?>
<XCINFO Ver="1.0">
  <CABLE>
    <CABTYPE>USB2</CABTYPE>
    <CABPORT>FTUSB-0</CABPORT>
    <BAUDRATE>-1</BAUDRATE>
  </CABLE>
  <CHAIN>
    <SCAN />
  </CHAIN>
</XCINFO>
"#.to_string()
}

/// Generate a programming XCF file for the given bitstream + device + cable.
pub fn generate_program_xcf(
    bitstream_path: &str,
    device: &str,
    cable_port: &str,
    operation: &str,
) -> String {
    format!(
        r#"<?xml version="1.0" encoding="utf-8" ?>
<XCINFO Ver="1.0">
  <CABLE>
    <CABTYPE>USB2</CABTYPE>
    <CABPORT>{cable_port}</CABPORT>
    <BAUDRATE>-1</BAUDRATE>
  </CABLE>
  <CHAIN>
    <IRSIZECHAIN>8</IRSIZECHAIN>
    <DEVICE>
      <DEVNAME>{device}</DEVNAME>
      <OPCODE>{operation}</OPCODE>
      <DATAFILE>{bitstream_path}</DATAFILE>
    </DEVICE>
  </CHAIN>
</XCINFO>
"#
    )
}

/// Parse cable scan output from pgrcmd.
/// Looks for lines like: "Cable 0: FTUSB-0 (USB2)"
pub fn parse_cable_scan_output(output: &str) -> Vec<Cable> {
    let mut cables = Vec::new();
    for line in output.lines() {
        let trimmed = line.trim();
        // Various pgrcmd output formats:
        // "FTUSB-0" standalone or "Cable found: FTUSB-0"
        if trimmed.contains("FTUSB") || trimmed.contains("USB2") || trimmed.contains("cable") {
            // Try to parse structured output
            if let Some(port) = extract_cable_port(trimmed) {
                cables.push(Cable {
                    index: cables.len() as u32,
                    name: format!("USB Cable {}", cables.len()),
                    port,
                });
            }
        }
    }
    // If no cables found from structured parsing, check for generic USB detection
    if cables.is_empty() && output.contains("FTUSB") {
        cables.push(Cable {
            index: 0,
            name: "USB Cable 0".to_string(),
            port: "FTUSB-0".to_string(),
        });
    }
    cables
}

fn extract_cable_port(line: &str) -> Option<String> {
    // Look for FTUSB-N pattern
    let re_pattern = regex::Regex::new(r"(FTUSB-\d+)").ok()?;
    re_pattern.captures(line).map(|c| c[1].to_string())
}

/// Find bitstream files in the project's implementation directory.
pub fn find_bitstreams(project_dir: &Path, impl_dir: &str) -> Vec<PathBuf> {
    let impl_path = project_dir.join(impl_dir);
    let extensions = ["bit", "jed", "bin", "sof", "svf", "acxbit"];
    let mut results = Vec::new();

    // Check impl dir directly
    scan_dir_for_bitstreams(&impl_path, &extensions, &mut results);
    // Check common subdirectories
    for subdir in &["output", "output_files", "bitstream"] {
        scan_dir_for_bitstreams(&impl_path.join(subdir), &extensions, &mut results);
    }
    results
}

fn scan_dir_for_bitstreams(dir: &Path, extensions: &[&str], results: &mut Vec<PathBuf>) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    if extensions.contains(&ext) {
                        results.push(path);
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_scan_xcf() {
        let xcf = generate_scan_xcf();
        assert!(xcf.contains("<SCAN />"));
        assert!(xcf.contains("FTUSB-0"));
    }

    #[test]
    fn test_generate_program_xcf() {
        let xcf = generate_program_xcf(
            r"C:\project\impl1\top.bit",
            "LIFCL-40",
            "FTUSB-0",
            "PROGRAM",
        );
        assert!(xcf.contains("LIFCL-40"));
        assert!(xcf.contains("PROGRAM"));
        assert!(xcf.contains(r"C:\project\impl1\top.bit"));
        assert!(xcf.contains("FTUSB-0"));
    }

    #[test]
    fn test_parse_cable_scan_empty() {
        let cables = parse_cable_scan_output("No cables found\n");
        assert!(cables.is_empty());
    }

    #[test]
    fn test_parse_cable_scan_found() {
        let output = "Scanning...\nCable found: FTUSB-0 (USB2)\nDone.\n";
        let cables = parse_cable_scan_output(output);
        assert_eq!(cables.len(), 1);
        assert_eq!(cables[0].port, "FTUSB-0");
    }

    #[test]
    fn test_parse_cable_scan_multiple() {
        let output = "Cable: FTUSB-0\nCable: FTUSB-1\n";
        let cables = parse_cable_scan_output(output);
        assert_eq!(cables.len(), 2);
        assert_eq!(cables[0].port, "FTUSB-0");
        assert_eq!(cables[1].port, "FTUSB-1");
    }
}
