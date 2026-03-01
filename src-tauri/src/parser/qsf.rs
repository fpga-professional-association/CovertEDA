/// Parser for Quartus Settings Files (.qsf)
///
/// QSF files contain `set_global_assignment` and `set_location_assignment` lines
/// that define device settings, source files, pin assignments, etc.

use regex::Regex;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QsfImportResult {
    pub device: String,
    pub family: String,
    pub top_module: String,
    pub source_files: Vec<String>,
    pub constraint_files: Vec<String>,
    pub pin_assignments: Vec<QsfPinAssignment>,
    pub project_name: String,
    pub warnings: Vec<String>,
    pub summary: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QsfPinAssignment {
    pub pin: String,
    pub net: String,
}

/// Parse a .qsf file's text content and extract project settings.
pub fn parse_qsf(content: &str) -> QsfImportResult {
    let mut device = String::new();
    let mut family = String::new();
    let mut top_module = String::new();
    let project_name = String::new();
    let mut source_files = Vec::new();
    let mut constraint_files = Vec::new();
    let mut pin_assignments = Vec::new();
    let mut warnings = Vec::new();
    let mut summary = Vec::new();

    // Regex for: set_global_assignment -name <KEY> <VALUE>
    // Value may be quoted or unquoted
    let global_re = Regex::new(
        r#"(?i)set_global_assignment\s+-name\s+(\S+)\s+"?([^"\r\n]+?)"?\s*$"#
    ).unwrap();

    // Regex for: set_location_assignment PIN_<pin> -to <net>
    let pin_re = Regex::new(
        r#"(?i)set_location_assignment\s+PIN_(\S+)\s+-to\s+"?([^"\r\n]+?)"?\s*$"#
    ).unwrap();

    for line in content.lines() {
        let trimmed = line.trim();

        // Skip comments and empty lines
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        // Parse global assignments
        if let Some(caps) = global_re.captures(trimmed) {
            let key = caps[1].to_uppercase();
            let value = caps[2].trim().to_string();

            match key.as_str() {
                "DEVICE" => device = value,
                "FAMILY" => family = value.trim_matches('"').to_string(),
                "TOP_LEVEL_ENTITY" => top_module = value.trim_matches('"').to_string(),
                "PROJECT_OUTPUT_DIRECTORY" => { /* ignored */ }
                "VERILOG_FILE" | "SYSTEMVERILOG_FILE" | "VHDL_FILE" => {
                    source_files.push(value);
                }
                "SDC_FILE" => {
                    constraint_files.push(value);
                }
                _ => { /* other settings ignored */ }
            }
        }

        // Parse pin assignments
        if let Some(caps) = pin_re.captures(trimmed) {
            pin_assignments.push(QsfPinAssignment {
                pin: caps[1].to_string(),
                net: caps[2].trim().to_string(),
            });
        }
    }

    // Build summary
    if !device.is_empty() {
        summary.push(format!("Device: {}", device));
    }
    if !family.is_empty() {
        summary.push(format!("Family: {}", family));
    }
    if !top_module.is_empty() {
        summary.push(format!("Top module: {}", top_module));
    }
    summary.push(format!("{} source file(s)", source_files.len()));
    summary.push(format!("{} constraint file(s)", constraint_files.len()));
    summary.push(format!("{} pin assignment(s)", pin_assignments.len()));

    // Warnings
    if device.is_empty() {
        warnings.push("No DEVICE assignment found in QSF".to_string());
    }
    if top_module.is_empty() {
        warnings.push("No TOP_LEVEL_ENTITY found in QSF".to_string());
    }
    if source_files.is_empty() {
        warnings.push("No source files (VERILOG_FILE/VHDL_FILE) found in QSF".to_string());
    }

    QsfImportResult {
        device,
        family,
        top_module,
        source_files,
        constraint_files,
        pin_assignments,
        project_name,
        warnings,
        summary,
    }
}

/// Try to extract the project name from a .qpf file.
pub fn parse_qpf_project_name(content: &str) -> Option<String> {
    let re = Regex::new(r#"(?i)PROJECT_REVISION\s*=\s*"?(\S+)"?"#).unwrap();
    for line in content.lines() {
        if let Some(caps) = re.captures(line.trim()) {
            return Some(caps[1].trim_matches('"').to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_qsf_basic() {
        let content = r#"
set_global_assignment -name FAMILY "Cyclone V"
set_global_assignment -name DEVICE 5CSXFC6D6F31C6
set_global_assignment -name TOP_LEVEL_ENTITY top_level
set_global_assignment -name VERILOG_FILE src/top_level.v
set_global_assignment -name VERILOG_FILE src/counter.v
set_global_assignment -name SYSTEMVERILOG_FILE src/alu.sv
set_global_assignment -name SDC_FILE constraints/timing.sdc
set_location_assignment PIN_AA14 -to clk
set_location_assignment PIN_AB12 -to reset_n
set_location_assignment PIN_Y16 -to led[0]
"#;
        let result = parse_qsf(content);
        assert_eq!(result.device, "5CSXFC6D6F31C6");
        assert_eq!(result.family, "Cyclone V");
        assert_eq!(result.top_module, "top_level");
        assert_eq!(result.source_files.len(), 3);
        assert_eq!(result.constraint_files.len(), 1);
        assert_eq!(result.pin_assignments.len(), 3);
        assert_eq!(result.pin_assignments[0].pin, "AA14");
        assert_eq!(result.pin_assignments[0].net, "clk");
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn test_parse_qsf_missing_device() {
        let content = r#"
set_global_assignment -name TOP_LEVEL_ENTITY blinky
set_global_assignment -name VERILOG_FILE blinky.v
"#;
        let result = parse_qsf(content);
        assert_eq!(result.top_module, "blinky");
        assert!(result.device.is_empty());
        assert!(result.warnings.iter().any(|w| w.contains("DEVICE")));
    }

    #[test]
    fn test_parse_qsf_comments_and_empty_lines() {
        let content = r#"
# Quartus Prime settings file

# Device
set_global_assignment -name DEVICE 10M50DAF484C7G

set_global_assignment -name VERILOG_FILE rtl/top.v
"#;
        let result = parse_qsf(content);
        assert_eq!(result.device, "10M50DAF484C7G");
        assert_eq!(result.source_files.len(), 1);
    }

    #[test]
    fn test_parse_qpf_project_name() {
        let content = r#"
QUARTUS_VERSION = "23.1"
PROJECT_REVISION = "my_design"
"#;
        assert_eq!(parse_qpf_project_name(content), Some("my_design".to_string()));
    }

    #[test]
    fn test_parse_qsf_quoted_values() {
        let content = r#"
set_global_assignment -name DEVICE "5CSXFC6D6F31C6"
set_global_assignment -name TOP_LEVEL_ENTITY "my_top"
set_global_assignment -name VERILOG_FILE "src/my file.v"
"#;
        let result = parse_qsf(content);
        assert_eq!(result.device, "5CSXFC6D6F31C6");
        assert_eq!(result.top_module, "my_top");
        assert_eq!(result.source_files.len(), 1);
    }
}
