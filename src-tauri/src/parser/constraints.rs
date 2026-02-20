use crate::backend::BackendResult;
use crate::types::*;
use regex::Regex;

/// Parse Lattice .lpf constraint file
pub fn parse_lpf(content: &str) -> BackendResult<Vec<PinConstraint>> {
    let mut constraints = Vec::new();
    let locate_re =
        Regex::new(r#"LOCATE\s+COMP\s+"([^"]+)"\s+SITE\s+"([^"]+)""#).unwrap();

    for cap in locate_re.captures_iter(content) {
        let net = cap[1].to_string();
        let pin = cap[2].to_string();

        // Try to find matching IOBUF for I/O standard
        let iobuf_pattern = format!(r#"IOBUF\s+PORT\s+"{}"\s+IO_TYPE=(\w+)"#, regex::escape(&net));
        let io_standard = Regex::new(&iobuf_pattern)
            .ok()
            .and_then(|re| re.captures(content))
            .map(|c| c[1].to_string())
            .unwrap_or_else(|| "LVCMOS33".to_string());

        constraints.push(PinConstraint {
            pin,
            net,
            direction: String::new(),
            io_standard,
            bank: String::new(),
            locked: true,
            extra: vec![],
        });
    }

    Ok(constraints)
}

/// Write Lattice .lpf constraint file
pub fn write_lpf(constraints: &[PinConstraint]) -> String {
    let mut lines = Vec::new();
    lines.push("# CovertEDA — Generated LPF Constraints".to_string());
    lines.push(String::new());

    for c in constraints {
        lines.push(format!(r#"LOCATE COMP "{}" SITE "{}";"#, c.net, c.pin));
        lines.push(format!(
            r#"IOBUF PORT "{}" IO_TYPE={};"#,
            c.net, c.io_standard
        ));
    }

    lines.join("\n") + "\n"
}

/// Parse Synopsys .sdc constraint file (Quartus)
pub fn parse_sdc(content: &str) -> BackendResult<Vec<PinConstraint>> {
    let _ = content;
    Ok(vec![]) // TODO: SDC pin parsing
}

/// Write .sdc constraint file
pub fn write_sdc(constraints: &[PinConstraint]) -> String {
    let mut lines = Vec::new();
    lines.push("# CovertEDA — Generated SDC Constraints".to_string());
    for c in constraints {
        lines.push(format!(
            "set_location_assignment {} -to {}",
            c.pin, c.net
        ));
    }
    lines.join("\n") + "\n"
}

/// Parse Xilinx .xdc constraint file (Vivado)
pub fn parse_xdc(content: &str) -> BackendResult<Vec<PinConstraint>> {
    let mut constraints = Vec::new();
    let pkg_re = Regex::new(
        r#"set_property\s+PACKAGE_PIN\s+(\w+)\s+\[get_ports\s+\{?(\w+)\}?\]"#,
    )
    .unwrap();

    for cap in pkg_re.captures_iter(content) {
        constraints.push(PinConstraint {
            pin: cap[1].to_string(),
            net: cap[2].to_string(),
            direction: String::new(),
            io_standard: "LVCMOS33".to_string(),
            bank: String::new(),
            locked: true,
            extra: vec![],
        });
    }

    Ok(constraints)
}

/// Write .xdc constraint file
pub fn write_xdc(constraints: &[PinConstraint]) -> String {
    let mut lines = Vec::new();
    lines.push("# CovertEDA — Generated XDC Constraints".to_string());
    for c in constraints {
        lines.push(format!(
            "set_property PACKAGE_PIN {} [get_ports {{{}}}]",
            c.pin, c.net
        ));
        lines.push(format!(
            "set_property IOSTANDARD {} [get_ports {{{}}}]",
            c.io_standard, c.net
        ));
    }
    lines.join("\n") + "\n"
}

/// Parse open-source .pcf constraint file
pub fn parse_pcf(content: &str) -> BackendResult<Vec<PinConstraint>> {
    let mut constraints = Vec::new();
    let re = Regex::new(r"set_io\s+(\w+)\s+(\w+)").unwrap();

    for cap in re.captures_iter(content) {
        constraints.push(PinConstraint {
            pin: cap[2].to_string(),
            net: cap[1].to_string(),
            direction: String::new(),
            io_standard: "LVCMOS33".to_string(),
            bank: String::new(),
            locked: true,
            extra: vec![],
        });
    }

    Ok(constraints)
}

/// Write .pcf constraint file
pub fn write_pcf(constraints: &[PinConstraint]) -> String {
    let mut lines = Vec::new();
    lines.push("# CovertEDA — Generated PCF Constraints".to_string());
    for c in constraints {
        lines.push(format!("set_io {} {}", c.net, c.pin));
    }
    lines.join("\n") + "\n"
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── LPF ──

    #[test]
    fn test_parse_lpf_locate_comp() {
        let input = r#"LOCATE COMP "clk" SITE "A10";"#;
        let result = parse_lpf(input).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].pin, "A10");
        assert_eq!(result[0].net, "clk");
    }

    #[test]
    fn test_parse_lpf_with_iobuf() {
        let input = r#"LOCATE COMP "led" SITE "B5";
IOBUF PORT "led" IO_TYPE=LVCMOS25;"#;
        let result = parse_lpf(input).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].io_standard, "LVCMOS25");
    }

    #[test]
    fn test_parse_lpf_empty() {
        let result = parse_lpf("").unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_write_lpf_roundtrip() {
        let constraints = vec![PinConstraint {
            pin: "A10".into(),
            net: "clk".into(),
            direction: String::new(),
            io_standard: "LVCMOS33".into(),
            bank: String::new(),
            locked: true,
            extra: vec![],
        }];
        let written = write_lpf(&constraints);
        let parsed = parse_lpf(&written).unwrap();
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].pin, "A10");
        assert_eq!(parsed[0].net, "clk");
        assert_eq!(parsed[0].io_standard, "LVCMOS33");
    }

    // ── XDC ──

    #[test]
    fn test_parse_xdc_package_pin() {
        let input = "set_property PACKAGE_PIN E3 [get_ports {clk}]";
        let result = parse_xdc(input).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].pin, "E3");
        assert_eq!(result[0].net, "clk");
    }

    #[test]
    fn test_parse_xdc_empty() {
        let result = parse_xdc("").unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_write_xdc_format() {
        let constraints = vec![PinConstraint {
            pin: "E3".into(),
            net: "clk".into(),
            direction: String::new(),
            io_standard: "LVCMOS33".into(),
            bank: String::new(),
            locked: true,
            extra: vec![],
        }];
        let output = write_xdc(&constraints);
        assert!(output.contains("set_property PACKAGE_PIN E3 [get_ports {clk}]"));
        assert!(output.contains("set_property IOSTANDARD LVCMOS33 [get_ports {clk}]"));
    }

    // ── PCF ──

    #[test]
    fn test_parse_pcf_set_io() {
        let input = "set_io clk A10";
        let result = parse_pcf(input).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].pin, "A10");
        assert_eq!(result[0].net, "clk");
    }

    #[test]
    fn test_parse_pcf_empty() {
        let result = parse_pcf("").unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_write_pcf_format() {
        let constraints = vec![PinConstraint {
            pin: "A10".into(),
            net: "clk".into(),
            direction: String::new(),
            io_standard: "LVCMOS33".into(),
            bank: String::new(),
            locked: true,
            extra: vec![],
        }];
        let output = write_pcf(&constraints);
        assert!(output.contains("set_io clk A10"));
    }

    // ── SDC ──

    #[test]
    fn test_write_sdc_format() {
        let constraints = vec![PinConstraint {
            pin: "PIN_A10".into(),
            net: "clk".into(),
            direction: String::new(),
            io_standard: "LVCMOS33".into(),
            bank: String::new(),
            locked: true,
            extra: vec![],
        }];
        let output = write_sdc(&constraints);
        assert!(output.contains("set_location_assignment PIN_A10 -to clk"));
    }
}
