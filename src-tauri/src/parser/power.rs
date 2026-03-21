use crate::backend::BackendResult;
use crate::types::*;
use regex::Regex;

/// Parse Radiant Power Calculator report
///
/// Example format:
/// ```text
/// Total Estimated Power:   0.0523 W
///   Static Power:          0.0312 W
///   Dynamic Power:         0.0211 W
///     Logic Power:         0.0089 W
///     I/O Power:           0.0067 W
///     Clock Power:         0.0045 W
/// Junction Temperature:    32.5 C
/// ```
pub fn parse_radiant_power(content: &str) -> BackendResult<PowerReport> {
    let mut total_mw = 0.0;
    let mut junction_temp_c = 25.0;
    let mut ambient_temp_c = 25.0;
    let mut breakdown = vec![];

    // Parse total power
    if let Ok(re) = Regex::new(r"Total Estimated Power:\s*(\d+\.?\d*)\s*W") {
        if let Some(caps) = re.captures(content) {
            if let Ok(val) = caps[1].parse::<f64>() {
                total_mw = val * 1000.0;
            }
        }
    }

    // Parse static power
    if let Ok(re) = Regex::new(r"Static Power:\s*(\d+\.?\d*)\s*W") {
        if let Some(caps) = re.captures(content) {
            if let Ok(val) = caps[1].parse::<f64>() {
                breakdown.push(PowerBreakdown {
                    category: "Static".to_string(),
                    mw: val * 1000.0,
                    percentage: 0.0,
                });
            }
        }
    }

    // Parse dynamic power
    if let Ok(re) = Regex::new(r"Dynamic Power:\s*(\d+\.?\d*)\s*W") {
        if let Some(caps) = re.captures(content) {
            if let Ok(val) = caps[1].parse::<f64>() {
                breakdown.push(PowerBreakdown {
                    category: "Dynamic".to_string(),
                    mw: val * 1000.0,
                    percentage: 0.0,
                });
            }
        }
    }

    // Parse logic power
    if let Ok(re) = Regex::new(r"Logic Power:\s*(\d+\.?\d*)\s*W") {
        if let Some(caps) = re.captures(content) {
            if let Ok(val) = caps[1].parse::<f64>() {
                breakdown.push(PowerBreakdown {
                    category: "Logic".to_string(),
                    mw: val * 1000.0,
                    percentage: 0.0,
                });
            }
        }
    }

    // Parse I/O power
    if let Ok(re) = Regex::new(r"I/O Power:\s*(\d+\.?\d*)\s*W") {
        if let Some(caps) = re.captures(content) {
            if let Ok(val) = caps[1].parse::<f64>() {
                breakdown.push(PowerBreakdown {
                    category: "I/O".to_string(),
                    mw: val * 1000.0,
                    percentage: 0.0,
                });
            }
        }
    }

    // Parse clock power
    if let Ok(re) = Regex::new(r"Clock Power:\s*(\d+\.?\d*)\s*W") {
        if let Some(caps) = re.captures(content) {
            if let Ok(val) = caps[1].parse::<f64>() {
                breakdown.push(PowerBreakdown {
                    category: "Clock".to_string(),
                    mw: val * 1000.0,
                    percentage: 0.0,
                });
            }
        }
    }

    // Parse junction temperature
    if let Ok(re) = Regex::new(r"Junction Temperature:\s*(\d+\.?\d*)\s*C") {
        if let Some(caps) = re.captures(content) {
            if let Ok(val) = caps[1].parse::<f64>() {
                junction_temp_c = val;
            }
        }
    }

    // Calculate percentages
    if total_mw > 0.0 {
        for entry in &mut breakdown {
            entry.percentage = (entry.mw / total_mw) * 100.0;
        }
    }

    Ok(PowerReport {
        total_mw,
        junction_temp_c,
        ambient_temp_c,
        theta_ja: 0.0,
        confidence: "Medium".to_string(),
        breakdown,
        by_rail: vec![],
    })
}

/// Parse Vivado power report
///
/// Vivado power report has a different format from Radiant.
/// This is a basic parser that extracts total power and breakdown.
pub fn parse_vivado_power(content: &str) -> BackendResult<PowerReport> {
    let mut total_mw = 0.0;
    let mut junction_temp_c = 25.0;
    let mut breakdown = vec![];

    // Parse "Total On-Chip Power (W)" or "Total Power"
    if let Ok(re) = Regex::new(r"Total\s+(?:On-Chip\s+)?Power[^:]*:\s*([\d.]+)\s*W") {
        if let Some(caps) = re.captures(content) {
            if let Ok(val) = caps[1].parse::<f64>() {
                total_mw = val * 1000.0;
            }
        }
    }

    // Parse static/dynamic breakdown
    if let Ok(re) = Regex::new(r"(?:Device\s+)?Static[^:]*:\s*([\d.]+)\s*W") {
        if let Some(caps) = re.captures(content) {
            if let Ok(val) = caps[1].parse::<f64>() {
                breakdown.push(PowerBreakdown {
                    category: "Static".to_string(),
                    mw: val * 1000.0,
                    percentage: 0.0,
                });
            }
        }
    }

    if let Ok(re) = Regex::new(r"Dynamic[^:]*:\s*([\d.]+)\s*W") {
        if let Some(caps) = re.captures(content) {
            if let Ok(val) = caps[1].parse::<f64>() {
                breakdown.push(PowerBreakdown {
                    category: "Dynamic".to_string(),
                    mw: val * 1000.0,
                    percentage: 0.0,
                });
            }
        }
    }

    // Parse junction temperature
    if let Ok(re) = Regex::new(r"Junction Temperature[^:]*:\s*([\d.]+)\s*C") {
        if let Some(caps) = re.captures(content) {
            if let Ok(val) = caps[1].parse::<f64>() {
                junction_temp_c = val;
            }
        }
    }

    // Calculate percentages
    if total_mw > 0.0 {
        for entry in &mut breakdown {
            entry.percentage = (entry.mw / total_mw) * 100.0;
        }
    }

    Ok(PowerReport {
        total_mw,
        junction_temp_c,
        ambient_temp_c: 25.0,
        theta_ja: 0.0,
        confidence: "Medium".to_string(),
        breakdown,
        by_rail: vec![],
    })
}

/// Parse Vivado DRC (Design Rule Check) report
///
/// Vivado DRC reports contain ERROR, WARNING, CRITICAL WARNING, and INFO entries.
/// Format: ERROR [CODE] message
pub fn parse_vivado_drc(content: &str) -> BackendResult<DrcReport> {
    let mut errors = 0u32;
    let mut critical_warnings = 0u32;
    let mut warnings = 0u32;
    let mut info = 0u32;
    let mut waived = 0u32;
    let mut items = vec![];

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let (severity, code, message, location, action) = if let Some(pos) = trimmed.find("[") {
            if let Some(end_bracket) = trimmed.find("]") {
                let severity_str = trimmed[..pos].trim();
                let code_str = trimmed[pos + 1..end_bracket].to_string();
                let rest = trimmed[end_bracket + 1..].trim();

                // Try to extract message and location
                let (msg, loc) = if let Some(at_pos) = rest.find(" at ") {
                    (rest[..at_pos].trim().to_string(), rest[at_pos + 4..].to_string())
                } else {
                    (rest.to_string(), String::new())
                };

                (severity_str, code_str, msg, loc, String::new())
            } else {
                continue;
            }
        } else {
            continue;
        };

        let severity_enum = if severity.contains("ERROR") && !severity.contains("WARNING") {
            errors += 1;
            DrcSeverity::Error
        } else if severity.contains("CRITICAL") {
            critical_warnings += 1;
            DrcSeverity::CriticalWarning
        } else if severity.contains("WARNING") {
            warnings += 1;
            DrcSeverity::Warning
        } else if severity.contains("INFO") {
            info += 1;
            DrcSeverity::Info
        } else if severity.contains("WAIVED") {
            waived += 1;
            DrcSeverity::Waived
        } else {
            continue;
        };

        items.push(DrcItem {
            severity: severity_enum,
            code,
            message,
            location,
            action,
        });
    }

    Ok(DrcReport {
        errors,
        critical_warnings,
        warnings,
        info,
        waived,
        items,
    })
}

/// Parse Quartus PowerPlay power report
///
/// Quartus PowerPlay format:
/// ```text
/// Total Power (W)           : 0.123
/// Core Power (W)            : 0.087
/// I/O Power (W)             : 0.036
/// Thermal Analysis Enabled  : Yes
/// Temperature (C)           : 45.5
/// Device Thermal Limit (C)  : 85.0
/// ```
pub fn parse_quartus_power(content: &str) -> BackendResult<PowerReport> {
    let mut total_mw = 0.0;
    let mut junction_temp_c = 25.0;
    let mut breakdown = vec![];

    // Parse total power
    if let Ok(re) = Regex::new(r"Total\s+Power\s*\(W\)[^:]*:\s*([\d.]+)") {
        if let Some(caps) = re.captures(content) {
            if let Ok(val) = caps[1].parse::<f64>() {
                total_mw = val * 1000.0;
            }
        }
    }

    // Parse core power
    if let Ok(re) = Regex::new(r"Core\s+Power\s*\(W\)[^:]*:\s*([\d.]+)") {
        if let Some(caps) = re.captures(content) {
            if let Ok(val) = caps[1].parse::<f64>() {
                breakdown.push(PowerBreakdown {
                    category: "Core".to_string(),
                    mw: val * 1000.0,
                    percentage: 0.0,
                });
            }
        }
    }

    // Parse I/O power
    if let Ok(re) = Regex::new(r"I/O\s+Power\s*\(W\)[^:]*:\s*([\d.]+)") {
        if let Some(caps) = re.captures(content) {
            if let Ok(val) = caps[1].parse::<f64>() {
                breakdown.push(PowerBreakdown {
                    category: "I/O".to_string(),
                    mw: val * 1000.0,
                    percentage: 0.0,
                });
            }
        }
    }

    // Parse device temperature
    if let Ok(re) = Regex::new(r"Temperature\s*\(C\)[^:]*:\s*([\d.]+)") {
        if let Some(caps) = re.captures(content) {
            if let Ok(val) = caps[1].parse::<f64>() {
                junction_temp_c = val;
            }
        }
    }

    // Calculate percentages
    if total_mw > 0.0 {
        for entry in &mut breakdown {
            entry.percentage = (entry.mw / total_mw) * 100.0;
        }
    }

    Ok(PowerReport {
        total_mw,
        junction_temp_c,
        ambient_temp_c: 25.0,
        theta_ja: 0.0,
        confidence: "Medium".to_string(),
        breakdown,
        by_rail: vec![],
    })
}

/// Parse Diamond power report
///
/// Diamond power format:
/// ```text
/// Total Estimated Power: 0.125 W
/// Static Power: 0.045 W
/// Dynamic Power: 0.080 W
///   Core: 0.070 W
///   I/O: 0.010 W
/// Temperature (C): 50.0
/// ```
pub fn parse_diamond_power(content: &str) -> BackendResult<PowerReport> {
    let mut total_mw = 0.0;
    let mut junction_temp_c = 25.0;
    let mut breakdown = vec![];

    // Parse total power - Diamond uses "Total Estimated Power"
    if let Ok(re) = Regex::new(r"Total Estimated Power:\s*([\d.]+)\s*W") {
        if let Some(caps) = re.captures(content) {
            if let Ok(val) = caps[1].parse::<f64>() {
                total_mw = val * 1000.0;
            }
        }
    }

    // Parse static power
    if let Ok(re) = Regex::new(r"Static Power:\s*([\d.]+)\s*W") {
        if let Some(caps) = re.captures(content) {
            if let Ok(val) = caps[1].parse::<f64>() {
                breakdown.push(PowerBreakdown {
                    category: "Static".to_string(),
                    mw: val * 1000.0,
                    percentage: 0.0,
                });
            }
        }
    }

    // Parse dynamic power
    if let Ok(re) = Regex::new(r"Dynamic Power:\s*([\d.]+)\s*W") {
        if let Some(caps) = re.captures(content) {
            if let Ok(val) = caps[1].parse::<f64>() {
                breakdown.push(PowerBreakdown {
                    category: "Dynamic".to_string(),
                    mw: val * 1000.0,
                    percentage: 0.0,
                });
            }
        }
    }

    // Parse core power (sub-component)
    if let Ok(re) = Regex::new(r"Core:\s*([\d.]+)\s*W") {
        if let Some(caps) = re.captures(content) {
            if let Ok(val) = caps[1].parse::<f64>() {
                breakdown.push(PowerBreakdown {
                    category: "Core".to_string(),
                    mw: val * 1000.0,
                    percentage: 0.0,
                });
            }
        }
    }

    // Parse temperature
    if let Ok(re) = Regex::new(r"(?:Junction\s+)?Temperature\s*\(C\)[^:]*:\s*([\d.]+)") {
        if let Some(caps) = re.captures(content) {
            if let Ok(val) = caps[1].parse::<f64>() {
                junction_temp_c = val;
            }
        }
    }

    // Calculate percentages
    if total_mw > 0.0 {
        for entry in &mut breakdown {
            entry.percentage = (entry.mw / total_mw) * 100.0;
        }
    }

    Ok(PowerReport {
        total_mw,
        junction_temp_c,
        ambient_temp_c: 25.0,
        theta_ja: 0.0,
        confidence: "Medium".to_string(),
        breakdown,
        by_rail: vec![],
    })
}

/// Parse ACE (Altera/Intel power estimation) power report
///
/// ACE power format:
/// ```text
/// Total Power Dissipation: 0.234 W
/// Static Power: 0.095 W
/// Dynamic Power: 0.139 W
/// Junction Temp: 55.2 C
/// Device: EP4CE6E22C6
/// ```
pub fn parse_ace_power(content: &str) -> BackendResult<PowerReport> {
    let mut total_mw = 0.0;
    let mut junction_temp_c = 25.0;
    let mut breakdown = vec![];

    // Parse total power - ACE uses "Total Power Dissipation"
    if let Ok(re) = Regex::new(r"Total Power Dissipation:\s*([\d.]+)\s*W") {
        if let Some(caps) = re.captures(content) {
            if let Ok(val) = caps[1].parse::<f64>() {
                total_mw = val * 1000.0;
            }
        }
    }

    // Parse static power
    if let Ok(re) = Regex::new(r"Static Power:\s*([\d.]+)\s*W") {
        if let Some(caps) = re.captures(content) {
            if let Ok(val) = caps[1].parse::<f64>() {
                breakdown.push(PowerBreakdown {
                    category: "Static".to_string(),
                    mw: val * 1000.0,
                    percentage: 0.0,
                });
            }
        }
    }

    // Parse dynamic power
    if let Ok(re) = Regex::new(r"Dynamic Power:\s*([\d.]+)\s*W") {
        if let Some(caps) = re.captures(content) {
            if let Ok(val) = caps[1].parse::<f64>() {
                breakdown.push(PowerBreakdown {
                    category: "Dynamic".to_string(),
                    mw: val * 1000.0,
                    percentage: 0.0,
                });
            }
        }
    }

    // Parse junction temperature
    if let Ok(re) = Regex::new(r"Junction Temp:\s*([\d.]+)\s*C") {
        if let Some(caps) = re.captures(content) {
            if let Ok(val) = caps[1].parse::<f64>() {
                junction_temp_c = val;
            }
        }
    }

    // Calculate percentages
    if total_mw > 0.0 {
        for entry in &mut breakdown {
            entry.percentage = (entry.mw / total_mw) * 100.0;
        }
    }

    Ok(PowerReport {
        total_mw,
        junction_temp_c,
        ambient_temp_c: 25.0,
        theta_ja: 0.0,
        confidence: "Medium".to_string(),
        breakdown,
        by_rail: vec![],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Vivado DRC Parser Tests ──

    #[test]
    fn test_parse_vivado_drc_empty() {
        let content = "";
        let report = parse_vivado_drc(content).unwrap();
        assert_eq!(report.errors, 0);
        assert_eq!(report.warnings, 0);
        assert_eq!(report.critical_warnings, 0);
    }

    #[test]
    fn test_parse_vivado_drc_with_error() {
        let content = r#"ERROR [CFGBVS-2] Bank 18 is not assigned."#;
        let report = parse_vivado_drc(content).unwrap();
        assert_eq!(report.errors, 1);
        assert!(!report.items.is_empty());
    }

    #[test]
    fn test_parse_vivado_drc_with_warning() {
        let content = r#"WARNING [PLHIGH-6] Problem with PLL output."#;
        let report = parse_vivado_drc(content).unwrap();
        assert_eq!(report.warnings, 1);
        assert_eq!(report.errors, 0);
    }

    #[test]
    fn test_parse_vivado_drc_with_critical_warning() {
        let content = r#"CRITICAL WARNING [TIMING-7] Timing constraint not met."#;
        let report = parse_vivado_drc(content).unwrap();
        assert_eq!(report.critical_warnings, 1);
        assert_eq!(report.warnings, 0);
    }

    #[test]
    fn test_parse_vivado_drc_mixed_severity() {
        let content = r#"
ERROR [CODE1] error message
WARNING [CODE2] warning message
CRITICAL WARNING [CODE3] critical warning message
INFO [CODE4] info message
"#;
        let report = parse_vivado_drc(content).unwrap();
        assert_eq!(report.errors, 1);
        assert_eq!(report.warnings, 1);
        assert_eq!(report.critical_warnings, 1);
        assert_eq!(report.info, 1);
        assert_eq!(report.items.len(), 4);
    }

    #[test]
    fn test_parse_vivado_drc_extracts_code() {
        let content = r#"ERROR [CFGBVS-2] Bank 18 is not assigned."#;
        let report = parse_vivado_drc(content).unwrap();
        assert!(!report.items.is_empty());
        assert_eq!(report.items[0].code, "CFGBVS-2");
    }

    #[test]
    fn test_parse_vivado_drc_extracts_message() {
        let content = r#"WARNING [TEST-99] This is a test warning message."#;
        let report = parse_vivado_drc(content).unwrap();
        assert!(!report.items[0].message.is_empty());
        assert!(report.items[0].message.contains("warning"));
    }

    // ── Radiant Power Parser Tests ──

    #[test]
    fn test_parse_radiant_power_basic() {
        let content = r#"
Total Estimated Power:   0.0523 W
  Static Power:          0.0312 W
  Dynamic Power:         0.0211 W
    Logic Power:         0.0089 W
    I/O Power:           0.0067 W
    Clock Power:         0.0045 W
Junction Temperature:    32.5 C
"#;
        let report = parse_radiant_power(content).unwrap();
        assert!(report.total_mw > 0.0);
        assert!(report.junction_temp_c > 30.0);
        assert!(!report.breakdown.is_empty());
    }

    #[test]
    fn test_parse_radiant_power_empty() {
        let content = "";
        let report = parse_radiant_power(content).unwrap();
        assert_eq!(report.total_mw, 0.0);
        assert_eq!(report.junction_temp_c, 25.0);
    }

    #[test]
    fn test_parse_radiant_power_percentage() {
        let content = r#"
Total Estimated Power:   1.0 W
  Static Power:          0.5 W
  Dynamic Power:         0.5 W
"#;
        let report = parse_radiant_power(content).unwrap();
        assert_eq!(report.breakdown.len(), 2);
        // Both should be 50%
        assert!(report.breakdown[0].percentage > 49.0 && report.breakdown[0].percentage < 51.0);
    }

    #[test]
    fn test_parse_radiant_power_with_decimal() {
        let content = "Total Estimated Power:   0.1234 W\nJunction Temperature:    45.75 C";
        let report = parse_radiant_power(content).unwrap();
        assert!((report.total_mw - 123.4).abs() < 0.1);
        assert!((report.junction_temp_c - 45.75).abs() < 0.01);
    }

    // ── Quartus Power Parser Tests ──

    #[test]
    fn test_parse_quartus_power_basic() {
        let content = r#"
Total Power (W)           : 0.123
Core Power (W)            : 0.087
I/O Power (W)             : 0.036
Temperature (C)           : 45.5
"#;
        let report = parse_quartus_power(content).unwrap();
        assert!((report.total_mw - 123.0).abs() < 1.0);
        assert!((report.junction_temp_c - 45.5).abs() < 0.1);
        assert!(report.breakdown.len() >= 2);
    }

    #[test]
    fn test_parse_quartus_power_empty() {
        let content = "";
        let report = parse_quartus_power(content).unwrap();
        assert_eq!(report.total_mw, 0.0);
        assert_eq!(report.breakdown.len(), 0);
    }

    #[test]
    fn test_parse_quartus_power_percentage_calculation() {
        let content = r#"
Total Power (W)           : 1.0
Core Power (W)            : 0.7
I/O Power (W)             : 0.3
"#;
        let report = parse_quartus_power(content).unwrap();
        assert_eq!(report.breakdown.len(), 2);
        assert!((report.breakdown[0].percentage - 70.0).abs() < 1.0);
        assert!((report.breakdown[1].percentage - 30.0).abs() < 1.0);
    }

    #[test]
    fn test_parse_quartus_power_temperature_parsing() {
        let content = "Temperature (C)           : 78.25";
        let report = parse_quartus_power(content).unwrap();
        assert!((report.junction_temp_c - 78.25).abs() < 0.1);
    }

    // ── Diamond Power Parser Tests ──

    #[test]
    fn test_parse_diamond_power_basic() {
        let content = r#"
Total Estimated Power: 0.125 W
Static Power: 0.045 W
Dynamic Power: 0.080 W
Core: 0.070 W
Temperature (C): 50.0
"#;
        let report = parse_diamond_power(content).unwrap();
        assert!((report.total_mw - 125.0).abs() < 1.0);
        assert!((report.junction_temp_c - 50.0).abs() < 0.1);
        assert!(report.breakdown.len() >= 3);
    }

    #[test]
    fn test_parse_diamond_power_empty() {
        let content = "";
        let report = parse_diamond_power(content).unwrap();
        assert_eq!(report.total_mw, 0.0);
    }

    #[test]
    fn test_parse_diamond_power_static_dynamic_split() {
        let content = r#"
Total Estimated Power: 1.0 W
Static Power: 0.4 W
Dynamic Power: 0.6 W
"#;
        let report = parse_diamond_power(content).unwrap();
        assert!(report.breakdown.iter().any(|b| b.category == "Static"));
        assert!(report.breakdown.iter().any(|b| b.category == "Dynamic"));
    }

    #[test]
    fn test_parse_diamond_power_with_core_component() {
        let content = r#"
Total Estimated Power: 1.0 W
Core: 0.8 W
"#;
        let report = parse_diamond_power(content).unwrap();
        assert!(report.breakdown.iter().any(|b| b.category == "Core" && (b.mw - 800.0).abs() < 1.0));
    }

    #[test]
    fn test_parse_diamond_power_junction_temperature_variant() {
        let content = "Junction Temperature (C): 55.5";
        let report = parse_diamond_power(content).unwrap();
        assert!((report.junction_temp_c - 55.5).abs() < 0.1);
    }

    // ── ACE Power Parser Tests ──

    #[test]
    fn test_parse_ace_power_basic() {
        let content = r#"
Total Power Dissipation: 0.234 W
Static Power: 0.095 W
Dynamic Power: 0.139 W
Junction Temp: 55.2 C
Device: EP4CE6E22C6
"#;
        let report = parse_ace_power(content).unwrap();
        assert!((report.total_mw - 234.0).abs() < 2.0);
        assert!((report.junction_temp_c - 55.2).abs() < 0.1);
        assert!(report.breakdown.len() >= 2);
    }

    #[test]
    fn test_parse_ace_power_empty() {
        let content = "";
        let report = parse_ace_power(content).unwrap();
        assert_eq!(report.total_mw, 0.0);
    }

    #[test]
    fn test_parse_ace_power_breakdown_calculation() {
        let content = r#"
Total Power Dissipation: 1.0 W
Static Power: 0.3 W
Dynamic Power: 0.7 W
"#;
        let report = parse_ace_power(content).unwrap();
        assert_eq!(report.breakdown.len(), 2);
        let static_pct = report.breakdown.iter().find(|b| b.category == "Static").unwrap().percentage;
        let dynamic_pct = report.breakdown.iter().find(|b| b.category == "Dynamic").unwrap().percentage;
        assert!((static_pct - 30.0).abs() < 1.0);
        assert!((dynamic_pct - 70.0).abs() < 1.0);
    }

    #[test]
    fn test_parse_ace_power_confidence_level() {
        let content = "Total Power Dissipation: 0.1 W";
        let report = parse_ace_power(content).unwrap();
        assert_eq!(report.confidence, "Medium");
    }

    // ── Vivado Power Parser Tests ──

    #[test]
    fn test_parse_vivado_power_basic() {
        let content = r#"
Total Power (W): 0.456
Device Static: 0.123 W
Dynamic: 0.333 W
Junction Temperature: 62.0 C
"#;
        let report = parse_vivado_power(content).unwrap();
        assert!((report.total_mw - 456.0).abs() < 5.0);
        assert!((report.junction_temp_c - 62.0).abs() < 0.1);
    }

    #[test]
    fn test_parse_vivado_power_empty() {
        let content = "";
        let report = parse_vivado_power(content).unwrap();
        assert_eq!(report.total_mw, 0.0);
    }
}
