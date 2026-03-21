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

/// Parse Lattice .pdc constraint file (PDC - Physical Design Constraints)
pub fn parse_pdc(content: &str) -> BackendResult<Vec<PinConstraint>> {
    let mut constraints = Vec::new();

    // Parse ldc_set_location -site {SITE} [get_ports {PORT}]
    let location_re = Regex::new(r"ldc_set_location\s+-site\s+\{([^}]+)\}\s+\[get_ports\s+\{([^}]+)\}\]").unwrap();

    for cap in location_re.captures_iter(content) {
        let site = cap[1].to_string();
        let port = cap[2].to_string();

        // Try to find corresponding I/O standard from ldc_set_port
        let iobuf_pattern = format!(r"ldc_set_port\s+-iobuf\s+\{{([^}}]*)\}}\s+\[get_ports\s+\{{{}}}\]", regex::escape(&port));
        let io_standard = Regex::new(&iobuf_pattern)
            .ok()
            .and_then(|re| re.captures(content))
            .map(|c| {
                let config = c[1].to_string();
                // Extract IO_TYPE from the config string
                if let Some(io_match) = Regex::new(r"IO_TYPE=(\w+)").ok()
                    .and_then(|re| re.captures(&config)) {
                    io_match[1].to_string()
                } else {
                    "LVCMOS33".to_string()
                }
            })
            .unwrap_or_else(|| "LVCMOS33".to_string());

        constraints.push(PinConstraint {
            pin: site,
            net: port,
            direction: String::new(),
            io_standard,
            bank: String::new(),
            locked: true,
            extra: vec![],
        });
    }

    Ok(constraints)
}

/// Write Lattice .pdc constraint file
pub fn write_pdc(constraints: &[PinConstraint]) -> String {
    let mut lines = Vec::new();
    lines.push("# CovertEDA — Generated PDC Constraints".to_string());
    lines.push(String::new());

    for c in constraints {
        lines.push(format!(
            "ldc_set_location -site {{{}}} [get_ports {{{}}}]",
            c.pin, c.net
        ));
        lines.push(format!(
            "ldc_set_port -iobuf {{IO_TYPE={}}} [get_ports {{{}}}]",
            c.io_standard, c.net
        ));
    }

    lines.join("\n") + "\n"
}

/// Parse SDC for pin constraints (backward-compatible API for backends)
pub fn parse_sdc(content: &str) -> BackendResult<Vec<PinConstraint>> {
    // SDC files don't typically contain pin location assignments,
    // but Quartus uses set_location_assignment in SDC-like files
    let mut constraints = Vec::new();
    let loc_re = Regex::new(r"set_location_assignment\s+(\S+)\s+-to\s+(\S+)").unwrap();
    for cap in loc_re.captures_iter(content) {
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

/// Write SDC pin constraints (backward-compatible API for backends)
pub fn write_sdc_pins(constraints: &[PinConstraint]) -> String {
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

/// Parse Synopsys .sdc constraint file (full timing constraints)
pub fn parse_sdc_timing(content: &str) -> BackendResult<SdcFile> {
    let mut sdc = SdcFile {
        clocks: Vec::new(),
        input_delays: Vec::new(),
        output_delays: Vec::new(),
        false_paths: Vec::new(),
        multicycle_paths: Vec::new(),
        max_delays: Vec::new(),
        min_delays: Vec::new(),
        clock_groups: Vec::new(),
        other: Vec::new(),
    };

    // Remove comments
    let content_no_comments = content.lines()
        .map(|line| {
            if let Some(idx) = line.find('#') {
                &line[..idx]
            } else {
                line
            }
        })
        .collect::<Vec<_>>()
        .join("\n");

    // Parse create_clock
    let create_clock_re = Regex::new(
        r"create_clock\s+(?:-name\s+(\S+)\s+)?(?:-period\s+([\d.]+)\s+)?(?:-waveform\s+\{([^}]*)\}\s+)?\[get_[a-z_]+\s+\{?([^}\]]+)\}?\]"
    ).unwrap();

    for cap in create_clock_re.captures_iter(&content_no_comments) {
        let name = cap.get(1).map(|m| m.as_str().to_string());
        let period = cap.get(2).map(|m| m.as_str().parse::<f64>().unwrap_or(0.0));
        let target = cap.get(4).map(|m| m.as_str().trim().to_string()).unwrap_or_default();

        sdc.clocks.push(TimingConstraint {
            constraint_type: "create_clock".to_string(),
            name: name.clone(),
            clock: name,
            period,
            value: None,
            from: None,
            to: None,
            targets: vec![target],
            raw: cap.get(0).map(|m| m.as_str().to_string()).unwrap_or_default(),
        });
    }

    // Parse set_input_delay
    let input_delay_re = Regex::new(
        r"set_input_delay\s+(?:-clock\s+(\S+)\s+)?(?:-min\s+)?([\d.-]+)\s+\[get_ports\s+\{?([^}\]]+)\}?\]"
    ).unwrap();

    for cap in input_delay_re.captures_iter(&content_no_comments) {
        let clock = cap.get(1).map(|m| m.as_str().to_string());
        let value = cap.get(2).map(|m| m.as_str().parse::<f64>().unwrap_or(0.0));
        let targets = cap.get(3)
            .map(|m| m.as_str().split_whitespace().map(|s| s.to_string()).collect())
            .unwrap_or_default();

        sdc.input_delays.push(TimingConstraint {
            constraint_type: "set_input_delay".to_string(),
            name: None,
            clock,
            period: None,
            value,
            from: None,
            to: None,
            targets,
            raw: cap.get(0).map(|m| m.as_str().to_string()).unwrap_or_default(),
        });
    }

    // Parse set_output_delay
    let output_delay_re = Regex::new(
        r"set_output_delay\s+(?:-clock\s+(\S+)\s+)?(?:-min\s+)?([\d.-]+)\s+\[get_ports\s+\{?([^}\]]+)\}?\]"
    ).unwrap();

    for cap in output_delay_re.captures_iter(&content_no_comments) {
        let clock = cap.get(1).map(|m| m.as_str().to_string());
        let value = cap.get(2).map(|m| m.as_str().parse::<f64>().unwrap_or(0.0));
        let targets = cap.get(3)
            .map(|m| m.as_str().split_whitespace().map(|s| s.to_string()).collect())
            .unwrap_or_default();

        sdc.output_delays.push(TimingConstraint {
            constraint_type: "set_output_delay".to_string(),
            name: None,
            clock,
            period: None,
            value,
            from: None,
            to: None,
            targets,
            raw: cap.get(0).map(|m| m.as_str().to_string()).unwrap_or_default(),
        });
    }

    // Parse set_false_path
    let false_path_re = Regex::new(
        r"set_false_path\s+(?:-from\s+\[?(\S+)\]?\s+)?(?:-to\s+\[?(\S+)\]?)?"
    ).unwrap();

    for cap in false_path_re.captures_iter(&content_no_comments) {
        let from = cap.get(1).map(|m| {
            let s = m.as_str();
            s.trim_matches(|c| c == '[' || c == ']' || c == '{' || c == '}').to_string()
        });
        let to = cap.get(2).map(|m| {
            let s = m.as_str();
            s.trim_matches(|c| c == '[' || c == ']' || c == '{' || c == '}').to_string()
        });

        sdc.false_paths.push(TimingConstraint {
            constraint_type: "set_false_path".to_string(),
            name: None,
            clock: None,
            period: None,
            value: None,
            from,
            to,
            targets: vec![],
            raw: cap.get(0).map(|m| m.as_str().to_string()).unwrap_or_default(),
        });
    }

    // Parse set_multicycle_path
    let multicycle_re = Regex::new(
        r"set_multicycle_path\s+(\d+)\s+(?:-from\s+\[?(\S+)\]?\s+)?(?:-to\s+\[?(\S+)\]?)?"
    ).unwrap();

    for cap in multicycle_re.captures_iter(&content_no_comments) {
        let value = cap.get(1).map(|m| m.as_str().parse::<f64>().unwrap_or(0.0));
        let from = cap.get(2).map(|m| {
            let s = m.as_str();
            s.trim_matches(|c| c == '[' || c == ']' || c == '{' || c == '}').to_string()
        });
        let to = cap.get(3).map(|m| {
            let s = m.as_str();
            s.trim_matches(|c| c == '[' || c == ']' || c == '{' || c == '}').to_string()
        });

        sdc.multicycle_paths.push(TimingConstraint {
            constraint_type: "set_multicycle_path".to_string(),
            name: None,
            clock: None,
            period: None,
            value,
            from,
            to,
            targets: vec![],
            raw: cap.get(0).map(|m| m.as_str().to_string()).unwrap_or_default(),
        });
    }

    // Parse set_max_delay
    let max_delay_re = Regex::new(
        r"set_max_delay\s+([\d.-]+)\s+(?:-from\s+\[?(\S+)\]?\s+)?(?:-to\s+\[?(\S+)\]?)?"
    ).unwrap();

    for cap in max_delay_re.captures_iter(&content_no_comments) {
        let value = cap.get(1).map(|m| m.as_str().parse::<f64>().unwrap_or(0.0));
        let from = cap.get(2).map(|m| {
            let s = m.as_str();
            s.trim_matches(|c| c == '[' || c == ']' || c == '{' || c == '}').to_string()
        });
        let to = cap.get(3).map(|m| {
            let s = m.as_str();
            s.trim_matches(|c| c == '[' || c == ']' || c == '{' || c == '}').to_string()
        });

        sdc.max_delays.push(TimingConstraint {
            constraint_type: "set_max_delay".to_string(),
            name: None,
            clock: None,
            period: None,
            value,
            from,
            to,
            targets: vec![],
            raw: cap.get(0).map(|m| m.as_str().to_string()).unwrap_or_default(),
        });
    }

    // Parse set_min_delay
    let min_delay_re = Regex::new(
        r"set_min_delay\s+([\d.-]+)\s+(?:-from\s+\[?(\S+)\]?\s+)?(?:-to\s+\[?(\S+)\]?)?"
    ).unwrap();

    for cap in min_delay_re.captures_iter(&content_no_comments) {
        let value = cap.get(1).map(|m| m.as_str().parse::<f64>().unwrap_or(0.0));
        let from = cap.get(2).map(|m| {
            let s = m.as_str();
            s.trim_matches(|c| c == '[' || c == ']' || c == '{' || c == '}').to_string()
        });
        let to = cap.get(3).map(|m| {
            let s = m.as_str();
            s.trim_matches(|c| c == '[' || c == ']' || c == '{' || c == '}').to_string()
        });

        sdc.min_delays.push(TimingConstraint {
            constraint_type: "set_min_delay".to_string(),
            name: None,
            clock: None,
            period: None,
            value,
            from,
            to,
            targets: vec![],
            raw: cap.get(0).map(|m| m.as_str().to_string()).unwrap_or_default(),
        });
    }

    // Parse set_clock_groups
    let clock_groups_re = Regex::new(
        r"set_clock_groups\s+(?:-name\s+(\S+)\s+)?(?:-asynchronous\s+)?(?:-group\s+\{([^}]+)\}\s+)?(?:-group\s+\{([^}]+)\})"
    ).unwrap();

    for cap in clock_groups_re.captures_iter(&content_no_comments) {
        let name = cap.get(1).map(|m| m.as_str().to_string());
        let group1 = cap.get(2).map(|m| m.as_str().trim().to_string()).unwrap_or_default();
        let group2 = cap.get(3).map(|m| m.as_str().trim().to_string()).unwrap_or_default();

        let mut targets = vec![];
        if !group1.is_empty() {
            targets.push(group1);
        }
        if !group2.is_empty() {
            targets.push(group2);
        }

        sdc.clock_groups.push(TimingConstraint {
            constraint_type: "set_clock_groups".to_string(),
            name,
            clock: None,
            period: None,
            value: None,
            from: None,
            to: None,
            targets,
            raw: cap.get(0).map(|m| m.as_str().to_string()).unwrap_or_default(),
        });
    }

    Ok(sdc)
}

/// Write Synopsys .sdc constraint file (full timing constraints)
pub fn write_sdc_timing(sdc: &SdcFile) -> String {
    let mut lines = Vec::new();
    lines.push("# CovertEDA — Generated SDC Constraints".to_string());
    lines.push(String::new());

    // Write clocks
    for clock in &sdc.clocks {
        if let Some(period) = clock.period {
            let target = clock.targets.get(0).cloned().unwrap_or_default();
            if let Some(name) = &clock.name {
                lines.push(format!(
                    "create_clock -name {} -period {} [get_ports {{{}}}]",
                    name, period, target
                ));
            } else {
                lines.push(format!(
                    "create_clock -period {} [get_ports {{{}}}]",
                    period, target
                ));
            }
        }
    }

    if !sdc.clocks.is_empty() && !sdc.input_delays.is_empty() {
        lines.push(String::new());
    }

    // Write input delays
    for delay in &sdc.input_delays {
        if let Some(value) = delay.value {
            let clock_spec = delay.clock.as_ref()
                .map(|c| format!("-clock {} ", c))
                .unwrap_or_default();
            let targets = delay.targets.join(" ");
            lines.push(format!(
                "set_input_delay {}{}[get_ports {{{}}}]",
                clock_spec, value, targets
            ));
        }
    }

    if !sdc.input_delays.is_empty() && !sdc.output_delays.is_empty() {
        lines.push(String::new());
    }

    // Write output delays
    for delay in &sdc.output_delays {
        if let Some(value) = delay.value {
            let clock_spec = delay.clock.as_ref()
                .map(|c| format!("-clock {} ", c))
                .unwrap_or_default();
            let targets = delay.targets.join(" ");
            lines.push(format!(
                "set_output_delay {}{}[get_ports {{{}}}]",
                clock_spec, value, targets
            ));
        }
    }

    if (!sdc.input_delays.is_empty() || !sdc.output_delays.is_empty()) && !sdc.false_paths.is_empty() {
        lines.push(String::new());
    }

    // Write false paths
    for path in &sdc.false_paths {
        let mut spec = String::from("set_false_path");
        if let Some(from) = &path.from {
            spec.push_str(&format!(" -from [get_pins {{{}}}]", from));
        }
        if let Some(to) = &path.to {
            spec.push_str(&format!(" -to [get_pins {{{}}}]", to));
        }
        lines.push(spec);
    }

    if !sdc.false_paths.is_empty() && !sdc.multicycle_paths.is_empty() {
        lines.push(String::new());
    }

    // Write multicycle paths
    for path in &sdc.multicycle_paths {
        if let Some(value) = path.value {
            let value_int = value as i32;
            let mut spec = format!("set_multicycle_path {}", value_int);
            if let Some(from) = &path.from {
                spec.push_str(&format!(" -from [get_pins {{{}}}]", from));
            }
            if let Some(to) = &path.to {
                spec.push_str(&format!(" -to [get_pins {{{}}}]", to));
            }
            lines.push(spec);
        }
    }

    if !sdc.multicycle_paths.is_empty() && !sdc.max_delays.is_empty() {
        lines.push(String::new());
    }

    // Write max delays
    for delay in &sdc.max_delays {
        if let Some(value) = delay.value {
            let mut spec = format!("set_max_delay {}", value);
            if let Some(from) = &delay.from {
                spec.push_str(&format!(" -from [get_pins {{{}}}]", from));
            }
            if let Some(to) = &delay.to {
                spec.push_str(&format!(" -to [get_pins {{{}}}]", to));
            }
            lines.push(spec);
        }
    }

    if !sdc.max_delays.is_empty() && !sdc.min_delays.is_empty() {
        lines.push(String::new());
    }

    // Write min delays
    for delay in &sdc.min_delays {
        if let Some(value) = delay.value {
            let mut spec = format!("set_min_delay {}", value);
            if let Some(from) = &delay.from {
                spec.push_str(&format!(" -from [get_pins {{{}}}]", from));
            }
            if let Some(to) = &delay.to {
                spec.push_str(&format!(" -to [get_pins {{{}}}]", to));
            }
            lines.push(spec);
        }
    }

    if !sdc.min_delays.is_empty() && !sdc.clock_groups.is_empty() {
        lines.push(String::new());
    }

    // Write clock groups
    for group in &sdc.clock_groups {
        if group.targets.len() >= 2 {
            let mut spec = String::from("set_clock_groups -asynchronous");
            if let Some(name) = &group.name {
                spec.push_str(&format!(" -name {}", name));
            }
            for target in &group.targets {
                spec.push_str(&format!(" -group {{{}}}", target));
            }
            lines.push(spec);
        }
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

/// Parse Lattice .ldc constraint file (LDC - Lattice Design Constraints)
pub fn parse_ldc(content: &str) -> BackendResult<Vec<PinConstraint>> {
    // LDC is similar to PDC, but uses ldc_set_location and ldc_set_port
    parse_pdc(content)
}

/// Write Lattice .ldc constraint file
pub fn write_ldc(constraints: &[PinConstraint]) -> String {
    let mut lines = Vec::new();
    lines.push("# CovertEDA — Generated LDC Constraints".to_string());
    lines.push(String::new());

    for c in constraints {
        lines.push(format!(
            "ldc_set_location -site {{{}}} [get_ports {{{}}}]",
            c.pin, c.net
        ));
        lines.push(format!(
            "ldc_set_port -iobuf {{IO_TYPE={}}} [get_ports {{{}}}]",
            c.io_standard, c.net
        ));
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

    // ── PDC ──

    #[test]
    fn test_parse_pdc_location() {
        let input = "ldc_set_location -site {A3} [get_ports {led[0]}]";
        let result = parse_pdc(input).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].pin, "A3");
        assert_eq!(result[0].net, "led[0]");
    }

    #[test]
    fn test_parse_pdc_port_iobuf() {
        let input = "ldc_set_port -iobuf {IO_TYPE=LVCMOS33} [get_ports {led[0]}]";
        let result = parse_pdc(input).unwrap();
        assert_eq!(result.is_empty()); // No location, so not added
    }

    #[test]
    fn test_parse_pdc_location_and_port() {
        let input = r#"ldc_set_location -site {A3} [get_ports {led[0]}]
ldc_set_port -iobuf {IO_TYPE=LVCMOS33} [get_ports {led[0]}]"#;
        let result = parse_pdc(input).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].pin, "A3");
        assert_eq!(result[0].net, "led[0]");
        assert_eq!(result[0].io_standard, "LVCMOS33");
    }

    #[test]
    fn test_parse_pdc_with_drive() {
        let input = r#"ldc_set_location -site {B10} [get_ports {clk}]
ldc_set_port -iobuf {IO_TYPE=LVCMOS33 DRIVE=8} [get_ports {clk}]"#;
        let result = parse_pdc(input).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].pin, "B10");
        assert_eq!(result[0].net, "clk");
        assert_eq!(result[0].io_standard, "LVCMOS33");
    }

    #[test]
    fn test_parse_pdc_multiple() {
        let input = r#"ldc_set_location -site {A3} [get_ports {led[0]}]
ldc_set_location -site {B4} [get_ports {led[1]}]
ldc_set_location -site {C5} [get_ports {clk}]"#;
        let result = parse_pdc(input).unwrap();
        assert_eq!(result.len(), 3);
        assert_eq!(result[0].pin, "A3");
        assert_eq!(result[1].pin, "B4");
        assert_eq!(result[2].pin, "C5");
    }

    #[test]
    fn test_parse_pdc_with_comments() {
        let input = r#"# This is a comment
ldc_set_location -site {A3} [get_ports {led[0]}]
# Another comment
ldc_set_location -site {B4} [get_ports {led[1]}]"#;
        let result = parse_pdc(input).unwrap();
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn test_write_pdc_roundtrip() {
        let constraints = vec![PinConstraint {
            pin: "A3".into(),
            net: "led[0]".into(),
            direction: String::new(),
            io_standard: "LVCMOS33".into(),
            bank: String::new(),
            locked: true,
            extra: vec![],
        }];
        let written = write_pdc(&constraints);
        let parsed = parse_pdc(&written).unwrap();
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].pin, "A3");
        assert_eq!(parsed[0].net, "led[0]");
        assert_eq!(parsed[0].io_standard, "LVCMOS33");
    }

    // ── LDC ──

    #[test]
    fn test_parse_ldc_basic() {
        let input = "ldc_set_location -site {A3} [get_ports {led[0]}]";
        let result = parse_ldc(input).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].pin, "A3");
        assert_eq!(result[0].net, "led[0]");
    }

    #[test]
    fn test_write_ldc_roundtrip() {
        let constraints = vec![PinConstraint {
            pin: "D5".into(),
            net: "btn".into(),
            direction: String::new(),
            io_standard: "LVCMOS25".into(),
            bank: String::new(),
            locked: true,
            extra: vec![],
        }];
        let written = write_ldc(&constraints);
        let parsed = parse_ldc(&written).unwrap();
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].pin, "D5");
        assert_eq!(parsed[0].net, "btn");
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
    fn test_parse_sdc_create_clock() {
        let input = "create_clock -name clk -period 10.0 [get_ports {clk}]";
        let result = parse_sdc_timing(input).unwrap();
        assert_eq!(result.clocks.len(), 1);
        assert_eq!(result.clocks[0].name, Some("clk".to_string()));
        assert_eq!(result.clocks[0].period, Some(10.0));
        assert_eq!(result.clocks[0].targets.get(0).map(|s| s.as_str()), Some("clk"));
    }

    #[test]
    fn test_parse_sdc_input_delay() {
        let input = "set_input_delay -clock clk 2.0 [get_ports {data}]";
        let result = parse_sdc_timing(input).unwrap();
        assert_eq!(result.input_delays.len(), 1);
        assert_eq!(result.input_delays[0].clock, Some("clk".to_string()));
        assert_eq!(result.input_delays[0].value, Some(2.0));
    }

    #[test]
    fn test_parse_sdc_output_delay() {
        let input = "set_output_delay -clock clk 3.0 [get_ports {result}]";
        let result = parse_sdc_timing(input).unwrap();
        assert_eq!(result.output_delays.len(), 1);
        assert_eq!(result.output_delays[0].clock, Some("clk".to_string()));
        assert_eq!(result.output_delays[0].value, Some(3.0));
    }

    #[test]
    fn test_parse_sdc_false_path() {
        let input = "set_false_path -from [get_pins {async_in}] -to [get_pins {sync_out}]";
        let result = parse_sdc_timing(input).unwrap();
        assert_eq!(result.false_paths.len(), 1);
        assert!(result.false_paths[0].from.is_some());
        assert!(result.false_paths[0].to.is_some());
    }

    #[test]
    fn test_parse_sdc_multicycle() {
        let input = "set_multicycle_path 2 -from [get_pins {a}] -to [get_pins {b}]";
        let result = parse_sdc_timing(input).unwrap();
        assert_eq!(result.multicycle_paths.len(), 1);
        assert_eq!(result.multicycle_paths[0].value, Some(2.0));
    }

    #[test]
    fn test_parse_sdc_max_delay() {
        let input = "set_max_delay 5.5 -from [get_pins {a}] -to [get_pins {b}]";
        let result = parse_sdc_timing(input).unwrap();
        assert_eq!(result.max_delays.len(), 1);
        assert_eq!(result.max_delays[0].value, Some(5.5));
    }

    #[test]
    fn test_parse_sdc_min_delay() {
        let input = "set_min_delay 1.2 -from [get_pins {x}] -to [get_pins {y}]";
        let result = parse_sdc_timing(input).unwrap();
        assert_eq!(result.min_delays.len(), 1);
        assert_eq!(result.min_delays[0].value, Some(1.2));
    }

    #[test]
    fn test_parse_sdc_clock_groups() {
        let input = "set_clock_groups -asynchronous -group {clk1} -group {clk2}";
        let result = parse_sdc_timing(input).unwrap();
        assert_eq!(result.clock_groups.len(), 1);
        assert_eq!(result.clock_groups[0].targets.len(), 2);
    }

    #[test]
    fn test_parse_sdc_complex() {
        let input = r#"
create_clock -name sys_clk -period 20.0 [get_ports {clk}]
set_input_delay -clock sys_clk 5.0 [get_ports {data_in}]
set_output_delay -clock sys_clk 3.0 [get_ports {data_out}]
set_false_path -from [get_pins {reset_async}] -to [get_pins {sync_ff}]
"#;
        let result = parse_sdc_timing(input).unwrap();
        assert_eq!(result.clocks.len(), 1);
        assert_eq!(result.input_delays.len(), 1);
        assert_eq!(result.output_delays.len(), 1);
        assert_eq!(result.false_paths.len(), 1);
    }

    #[test]
    fn test_write_sdc_roundtrip() {
        let sdc = SdcFile {
            clocks: vec![TimingConstraint {
                constraint_type: "create_clock".to_string(),
                name: Some("clk".to_string()),
                clock: Some("clk".to_string()),
                period: Some(10.0),
                value: None,
                from: None,
                to: None,
                targets: vec!["clk".to_string()],
                raw: String::new(),
            }],
            input_delays: vec![],
            output_delays: vec![],
            false_paths: vec![],
            multicycle_paths: vec![],
            max_delays: vec![],
            min_delays: vec![],
            clock_groups: vec![],
            other: vec![],
        };

        let written = write_sdc_timing(&sdc);
        assert!(written.contains("create_clock"));
        assert!(written.contains("10.0"));
        assert!(written.contains("clk"));

        let parsed = parse_sdc_timing(&written).unwrap();
        assert_eq!(parsed.clocks.len(), 1);
        assert_eq!(parsed.clocks[0].period, Some(10.0));
    }
}
