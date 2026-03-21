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

#[cfg(test)]
mod tests {
    use super::*;

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
}
