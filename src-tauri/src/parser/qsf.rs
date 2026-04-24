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

    #[test]
    fn test_parse_qsf_empty_content() {
        let result = parse_qsf("");
        assert!(result.device.is_empty());
        assert!(result.family.is_empty());
        assert!(result.top_module.is_empty());
        assert!(result.source_files.is_empty());
        assert!(result.constraint_files.is_empty());
        assert!(result.pin_assignments.is_empty());
        // Should produce warnings for missing device, top_level_entity, and source files
        assert_eq!(result.warnings.len(), 3);
        assert!(result.warnings.iter().any(|w| w.contains("DEVICE")));
        assert!(result.warnings.iter().any(|w| w.contains("TOP_LEVEL_ENTITY")));
        assert!(result.warnings.iter().any(|w| w.contains("source files")));
    }

    #[test]
    fn test_parse_qsf_vhdl_files() {
        let content = r#"
set_global_assignment -name DEVICE EP4CE6E22C8
set_global_assignment -name TOP_LEVEL_ENTITY uart_top
set_global_assignment -name VHDL_FILE src/uart_top.vhd
set_global_assignment -name VHDL_FILE src/uart_rx.vhd
set_global_assignment -name VHDL_FILE src/uart_tx.vhd
"#;
        let result = parse_qsf(content);
        assert_eq!(result.source_files.len(), 3);
        assert!(result.source_files.contains(&"src/uart_top.vhd".to_string()));
        assert!(result.source_files.contains(&"src/uart_rx.vhd".to_string()));
        assert!(result.source_files.contains(&"src/uart_tx.vhd".to_string()));
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn test_parse_qsf_mixed_source_types() {
        let content = r#"
set_global_assignment -name DEVICE 5CEBA4F23C7
set_global_assignment -name TOP_LEVEL_ENTITY mixed_top
set_global_assignment -name VERILOG_FILE rtl/top.v
set_global_assignment -name SYSTEMVERILOG_FILE rtl/axi_if.sv
set_global_assignment -name VHDL_FILE rtl/legacy_block.vhd
set_global_assignment -name SDC_FILE timing.sdc
set_global_assignment -name SDC_FILE clocks.sdc
"#;
        let result = parse_qsf(content);
        assert_eq!(result.source_files.len(), 3);
        assert_eq!(result.constraint_files.len(), 2);
        assert!(result.constraint_files.contains(&"timing.sdc".to_string()));
        assert!(result.constraint_files.contains(&"clocks.sdc".to_string()));
    }

    #[test]
    fn test_parse_qsf_multiple_pin_assignments() {
        let content = r#"
set_global_assignment -name DEVICE 10M50DAF484C7G
set_global_assignment -name TOP_LEVEL_ENTITY blinky
set_global_assignment -name VERILOG_FILE blinky.v
set_location_assignment PIN_P11 -to clk_50mhz
set_location_assignment PIN_A7 -to reset_n
set_location_assignment PIN_A8 -to led[0]
set_location_assignment PIN_A9 -to led[1]
set_location_assignment PIN_A10 -to led[2]
set_location_assignment PIN_B10 -to led[3]
"#;
        let result = parse_qsf(content);
        assert_eq!(result.pin_assignments.len(), 6);

        // Verify specific pin mappings
        let clk = result.pin_assignments.iter().find(|p| p.net == "clk_50mhz").unwrap();
        assert_eq!(clk.pin, "P11");

        let led3 = result.pin_assignments.iter().find(|p| p.net == "led[3]").unwrap();
        assert_eq!(led3.pin, "B10");
    }

    #[test]
    fn test_parse_qsf_case_insensitive_keywords() {
        let content = r#"
SET_GLOBAL_ASSIGNMENT -name DEVICE EP4CE6E22C8
Set_Global_Assignment -name TOP_LEVEL_ENTITY my_top
set_global_assignment -name VERILOG_FILE top.v
SET_LOCATION_ASSIGNMENT PIN_AA1 -to clk
"#;
        let result = parse_qsf(content);
        assert_eq!(result.device, "EP4CE6E22C8");
        assert_eq!(result.top_module, "my_top");
        assert_eq!(result.source_files.len(), 1);
        assert_eq!(result.pin_assignments.len(), 1);
    }

    #[test]
    fn test_parse_qsf_summary_content() {
        let content = r#"
set_global_assignment -name DEVICE 5CSXFC6D6F31C6
set_global_assignment -name FAMILY "Cyclone V"
set_global_assignment -name TOP_LEVEL_ENTITY counter
set_global_assignment -name VERILOG_FILE counter.v
set_global_assignment -name VERILOG_FILE clk_div.v
set_global_assignment -name SDC_FILE timing.sdc
set_location_assignment PIN_AA14 -to clk
set_location_assignment PIN_AB12 -to rst
"#;
        let result = parse_qsf(content);
        assert!(result.summary.iter().any(|s| s.contains("Device: 5CSXFC6D6F31C6")));
        assert!(result.summary.iter().any(|s| s.contains("Family: Cyclone V")));
        assert!(result.summary.iter().any(|s| s.contains("Top module: counter")));
        assert!(result.summary.iter().any(|s| s.contains("2 source file(s)")));
        assert!(result.summary.iter().any(|s| s.contains("1 constraint file(s)")));
        assert!(result.summary.iter().any(|s| s.contains("2 pin assignment(s)")));
    }

    #[test]
    fn test_parse_qsf_no_source_files_warning() {
        let content = r#"
set_global_assignment -name DEVICE 5CSXFC6D6F31C6
set_global_assignment -name TOP_LEVEL_ENTITY my_top
"#;
        let result = parse_qsf(content);
        assert!(result.warnings.iter().any(|w| w.contains("source files")));
    }

    #[test]
    fn test_parse_qsf_project_output_directory_ignored() {
        let content = r#"
set_global_assignment -name DEVICE EP4CE6E22C8
set_global_assignment -name TOP_LEVEL_ENTITY top
set_global_assignment -name VERILOG_FILE top.v
set_global_assignment -name PROJECT_OUTPUT_DIRECTORY output_files
"#;
        let result = parse_qsf(content);
        // PROJECT_OUTPUT_DIRECTORY should not appear in source_files or cause issues
        assert_eq!(result.source_files.len(), 1);
        assert_eq!(result.source_files[0], "top.v");
    }

    #[test]
    fn test_parse_qsf_only_comments() {
        let content = r#"
# This is a comment-only QSF file
# set_global_assignment -name DEVICE EP4CE6E22C8
# Another comment
"#;
        let result = parse_qsf(content);
        assert!(result.device.is_empty());
        assert!(result.source_files.is_empty());
        assert_eq!(result.warnings.len(), 3);
    }

    #[test]
    fn test_parse_qpf_no_project_revision() {
        let content = r#"
QUARTUS_VERSION = "23.1"
DATE = "12:00:00 January 01, 2024"
"#;
        assert_eq!(parse_qpf_project_name(content), None);
    }

    #[test]
    fn test_parse_qpf_unquoted_revision() {
        let content = r#"
QUARTUS_VERSION = "23.1"
PROJECT_REVISION = blinky
"#;
        assert_eq!(parse_qpf_project_name(content), Some("blinky".to_string()));
    }

    #[test]
    fn test_parse_qpf_empty_content() {
        assert_eq!(parse_qpf_project_name(""), None);
    }

    #[test]
    fn test_parse_qpf_case_insensitive() {
        let content = "project_revision = \"my_project\"\n";
        assert_eq!(parse_qpf_project_name(content), Some("my_project".to_string()));
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // Quartus QSF fixture tests
    // ══════════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_quartus_example_blinky_led_qsf_parses() {
        let content = include_str!("../../../examples/quartus/blinky_led/constraints/blinky.qsf");
        let result = parse_qsf(content);
        assert!(!result.device.is_empty(), "QSF should parse successfully");
    }

    #[test]
    fn test_quartus_example_blinky_led_qsf_extracts_device() {
        let content = include_str!("../../../examples/quartus/blinky_led/constraints/blinky.qsf");
        let result = parse_qsf(content);
        // Device should be extracted (EP4CE6E22C8)
        assert!(!result.device.is_empty());
    }

    #[test]
    fn test_quartus_example_nios_hello_qsf_parses() {
        let content = include_str!("../../../examples/quartus/nios_hello/constraints/nios.qsf");
        let result = parse_qsf(content);
        assert!(!result.device.is_empty());
    }

    #[test]
    fn test_quartus_example_ethernet_mac_qsf_parses() {
        let content = include_str!("../../../examples/quartus/ethernet_mac/constraints/eth.qsf");
        let result = parse_qsf(content);
        assert!(!result.device.is_empty());
    }

    #[test]
    fn test_quartus_example_pcie_endpoint_qsf_parses() {
        let content = include_str!("../../../examples/quartus/pcie_endpoint/constraints/pcie.qsf");
        let result = parse_qsf(content);
        assert!(!result.device.is_empty());
    }

    #[test]
    fn test_quartus_example_signal_proc_qsf_parses() {
        let content = include_str!("../../../examples/quartus/signal_proc/constraints/ddc.qsf");
        let result = parse_qsf(content);
        assert!(!result.device.is_empty());
    }

    #[test]
    fn test_quartus_qsf_handles_global_assignments() {
        let content = include_str!("../../../examples/quartus/blinky_led/constraints/blinky.qsf");
        let result = parse_qsf(content);
        // Should handle set_global_assignment directives
        assert!(!result.device.is_empty(), "Should parse QSF with global assignments");
    }

    #[test]
    fn test_quartus_qsf_handles_location_assignments() {
        // Use an inline fixture because the examples/ QSFs intentionally
        // leave set_location_assignment lines commented (device-agnostic so
        // Quartus synthesis-only flows work across multiple target parts).
        let content = r#"
set_global_assignment -name FAMILY "Cyclone 10 GX"
set_global_assignment -name DEVICE 10CX085YU484E5G
set_global_assignment -name TOP_LEVEL_ENTITY blinky_top
set_location_assignment PIN_E1 -to clk_50m
set_location_assignment PIN_J15 -to rst_n
set_location_assignment PIN_A15 -to led[0]
set_location_assignment PIN_A13 -to led[1]
"#;
        let result = parse_qsf(content);
        assert!(!result.pin_assignments.is_empty(),
                "Should parse QSF with location assignments");
        assert_eq!(result.pin_assignments.len(), 4);
    }

    #[test]
    fn test_quartus_qsf_handles_instance_assignments() {
        let content = include_str!("../../../examples/quartus/nios_hello/constraints/nios.qsf");
        let result = parse_qsf(content);
        // Should handle set_instance_assignment directives
        assert!(!result.device.is_empty(), "Should parse QSF with instance assignments");
    }

    #[test]
    fn test_quartus_qsf_multiple_designs_parse() {
        let designs = vec![
            ("blinky_led", include_str!("../../../examples/quartus/blinky_led/constraints/blinky.qsf")),
            ("nios_hello", include_str!("../../../examples/quartus/nios_hello/constraints/nios.qsf")),
            ("ethernet_mac", include_str!("../../../examples/quartus/ethernet_mac/constraints/eth.qsf")),
            ("pcie_endpoint", include_str!("../../../examples/quartus/pcie_endpoint/constraints/pcie.qsf")),
            ("signal_proc", include_str!("../../../examples/quartus/signal_proc/constraints/ddc.qsf")),
        ];

        for (name, content) in designs {
            let result = parse_qsf(content);
            assert!(!result.device.is_empty(), "{} QSF should parse successfully", name);
        }
    }
}
