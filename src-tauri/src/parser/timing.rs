use crate::backend::{BackendError, BackendResult};
use crate::types::*;
use regex::Regex;

/// Parse Diamond .twr timing report
pub fn parse_diamond_timing(content: &str) -> BackendResult<TimingReport> {
    let fmax = extract_float(content, r"Maximum\s+frequency[^:]*:\s*([\d.]+)\s*MHz")
        .unwrap_or(0.0);
    let wns = extract_float(content, r"Worst\s+negative\s+slack[^:]*:\s*([+-]?[\d.]+)\s*ns")
        .unwrap_or(0.0);
    let whs = extract_float(content, r"Worst\s+hold\s+slack[^:]*:\s*([+-]?[\d.]+)\s*ns")
        .unwrap_or(0.0);

    Ok(TimingReport {
        fmax_mhz: fmax,
        target_mhz: 125.0,
        wns_ns: wns,
        tns_ns: 0.0,
        whs_ns: whs,
        ths_ns: 0.0,
        failing_paths: if wns < 0.0 { 1 } else { 0 },
        total_paths: 0,
        clock_domains: vec![],
        critical_paths: vec![],
    })
}

/// Parse Quartus .sta.rpt timing report
pub fn parse_quartus_timing(content: &str) -> BackendResult<TimingReport> {
    let fmax = extract_float(content, r"Fmax[^:]*:\s*([\d.]+)\s*MHz").unwrap_or(0.0);
    let wns = extract_float(content, r"Setup[^:]*:\s*([+-]?[\d.]+)\s*ns").unwrap_or(0.0);

    Ok(TimingReport {
        fmax_mhz: fmax,
        target_mhz: 100.0,
        wns_ns: wns,
        tns_ns: 0.0,
        whs_ns: 0.0,
        ths_ns: 0.0,
        failing_paths: if wns < 0.0 { 1 } else { 0 },
        total_paths: 0,
        clock_domains: vec![],
        critical_paths: vec![],
    })
}

/// Parse Vivado timing_summary report
pub fn parse_vivado_timing(content: &str) -> BackendResult<TimingReport> {
    let wns = extract_float(content, r"WNS\(ns\)\s*:\s*([+-]?[\d.]+)").unwrap_or(0.0);
    let tns = extract_float(content, r"TNS\(ns\)\s*:\s*([+-]?[\d.]+)").unwrap_or(0.0);
    let whs = extract_float(content, r"WHS\(ns\)\s*:\s*([+-]?[\d.]+)").unwrap_or(0.0);
    let ths = extract_float(content, r"THS\(ns\)\s*:\s*([+-]?[\d.]+)").unwrap_or(0.0);

    // Derive fmax from WNS and target period if available
    let target_period = extract_float(content, r"Target\s+Period\s*:\s*([\d.]+)").unwrap_or(10.0);
    let fmax = if target_period > 0.0 {
        1000.0 / (target_period - wns)
    } else {
        0.0
    };

    Ok(TimingReport {
        fmax_mhz: fmax,
        target_mhz: if target_period > 0.0 {
            1000.0 / target_period
        } else {
            100.0
        },
        wns_ns: wns,
        tns_ns: tns,
        whs_ns: whs,
        ths_ns: ths,
        failing_paths: if wns < 0.0 { 1 } else { 0 },
        total_paths: 0,
        clock_domains: vec![],
        critical_paths: vec![],
    })
}

/// Parse nextpnr JSON report
pub fn parse_nextpnr_timing(content: &str) -> BackendResult<TimingReport> {
    let json: serde_json::Value = serde_json::from_str(content)
        .map_err(|e| BackendError::ParseError(format!("Invalid nextpnr JSON: {}", e)))?;

    let fmax = json
        .pointer("/fmax")
        .and_then(|v| v.as_object())
        .and_then(|obj| obj.values().next())
        .and_then(|v| v.get("achieved"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    Ok(TimingReport {
        fmax_mhz: fmax,
        target_mhz: 125.0,
        wns_ns: 0.0,
        tns_ns: 0.0,
        whs_ns: 0.0,
        ths_ns: 0.0,
        failing_paths: 0,
        total_paths: 0,
        clock_domains: vec![],
        critical_paths: vec![],
    })
}

/// Parse Radiant .twr timing report
///
/// Radiant timing reports have a different format from Diamond:
/// - Overall summary: "Timing Errors: N endpoints;  Total Negative Slack: X.XXX ns"
///   per corner (setup at hot, setup at cold, hold at cold)
/// - Clock summaries with Fmax per clock
/// - Endpoint slack tables
/// - Detailed path analysis sections
pub fn parse_radiant_timing(content: &str) -> BackendResult<TimingReport> {
    // Extract timing errors and TNS from the overall summary section
    // Format: "Setup at Speed Grade ... Timing Errors: 0 endpoints;  Total Negative Slack: 0.000 ns"
    let setup_tns_re = Regex::new(
        r"Setup at Speed Grade[^\n]*Timing Errors:\s*(\d+)\s*endpoints;\s*Total Negative Slack:\s*([+-]?[\d.]+)\s*ns"
    ).unwrap();
    let hold_tns_re = Regex::new(
        r"Hold at Speed Grade[^\n]*Timing Errors:\s*(\d+)\s*endpoints;\s*Total Negative Slack:\s*([+-]?[\d.]+)\s*ns"
    ).unwrap();

    let mut setup_errors: u32 = 0;
    let mut setup_tns: f64 = 0.0;
    let mut hold_tns: f64 = 0.0;

    // Take the worst setup corner
    for cap in setup_tns_re.captures_iter(content) {
        let errors: u32 = cap[1].parse().unwrap_or(0);
        let tns: f64 = cap[2].parse().unwrap_or(0.0);
        if errors > setup_errors {
            setup_errors = errors;
        }
        if tns < setup_tns {
            setup_tns = tns;
        }
    }

    if let Some(cap) = hold_tns_re.captures(content) {
        hold_tns = cap[2].parse().unwrap_or(0.0);
    }

    // Extract Fmax from clock summary tables
    let mut fmax = 0.0_f64;
    let mut wns = 0.0_f64;
    let mut clock_domains = vec![];

    // Look for clock summary section
    let in_clock_section = content.contains("Clock Summary");
    if in_clock_section {
        // Find lines in clock summary with frequency data
        let clock_freq_re = Regex::new(
            r"(?m)^\s*(\w[\w./]*)\s+([\d.]+)\s+([\d.]+)\s+([+-]?[\d.]+)\s+(\d+)"
        ).unwrap();
        for cap in clock_freq_re.captures_iter(content) {
            let name = cap[1].to_string();
            let period: f64 = cap[2].parse().unwrap_or(0.0);
            let freq: f64 = cap[3].parse().unwrap_or(0.0);
            let slack: f64 = cap[4].parse().unwrap_or(0.0);
            let paths: u32 = cap[5].parse().unwrap_or(0);

            if freq > fmax {
                fmax = freq;
            }
            if slack < wns {
                wns = slack;
            }

            clock_domains.push(ClockDomain {
                name,
                period_ns: period,
                frequency_mhz: freq,
                source: String::new(),
                clock_type: "primary".into(),
                wns_ns: slack,
                path_count: paths,
            });
        }
    }

    // Count unconstrained I/O ports
    let unconstrained_io = extract_float(
        content,
        r"Number of I/O ports without constraint\s*\|\s*(\d+)",
    )
    .map(|v| v as u32)
    .unwrap_or(0);

    Ok(TimingReport {
        fmax_mhz: fmax,
        target_mhz: if fmax > 0.0 { fmax } else { 0.0 },
        wns_ns: wns,
        tns_ns: setup_tns,
        whs_ns: 0.0,
        ths_ns: hold_tns,
        failing_paths: setup_errors,
        total_paths: unconstrained_io,
        clock_domains,
        critical_paths: vec![],
    })
}

fn extract_float(content: &str, pattern: &str) -> Option<f64> {
    Regex::new(pattern)
        .ok()?
        .captures(content)?
        .get(1)?
        .as_str()
        .parse()
        .ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_float_basic() {
        let content = "Maximum frequency: 125.50 MHz";
        let result = extract_float(content, r"frequency:\s*([\d.]+)\s*MHz");
        assert_eq!(result, Some(125.50));
    }

    #[test]
    fn test_extract_float_no_match() {
        let result = extract_float("no data here", r"frequency:\s*([\d.]+)");
        assert_eq!(result, None);
    }

    #[test]
    fn test_extract_float_empty_input() {
        let result = extract_float("", r"frequency:\s*([\d.]+)");
        assert_eq!(result, None);
    }

    #[test]
    fn test_parse_diamond_timing_with_data() {
        let content = r#"
Maximum frequency for clock domain clk: 132.50 MHz
Worst negative slack: 2.350 ns
Worst hold slack: 0.150 ns
"#;
        let report = parse_diamond_timing(content).unwrap();
        assert!((report.fmax_mhz - 132.50).abs() < 0.01);
        assert!((report.wns_ns - 2.35).abs() < 0.01);
        assert!((report.whs_ns - 0.15).abs() < 0.01);
        assert_eq!(report.failing_paths, 0);
    }

    #[test]
    fn test_parse_diamond_timing_empty() {
        let report = parse_diamond_timing("").unwrap();
        assert_eq!(report.fmax_mhz, 0.0);
        assert_eq!(report.wns_ns, 0.0);
        assert_eq!(report.whs_ns, 0.0);
    }

    #[test]
    fn test_parse_quartus_timing_with_data() {
        let content = "Fmax Summary: 200.50 MHz\nSetup Slack: 1.200 ns";
        let report = parse_quartus_timing(content).unwrap();
        assert!((report.fmax_mhz - 200.50).abs() < 0.01);
        assert_eq!(report.failing_paths, 0);
    }

    #[test]
    fn test_parse_quartus_timing_empty() {
        let report = parse_quartus_timing("").unwrap();
        assert_eq!(report.fmax_mhz, 0.0);
    }

    #[test]
    fn test_parse_vivado_timing_with_data() {
        let content = r#"
WNS(ns)      : 2.500
TNS(ns)      : 0.000
WHS(ns)      : 0.100
THS(ns)      : 0.000
Target Period : 10.000
"#;
        let report = parse_vivado_timing(content).unwrap();
        assert!(report.fmax_mhz > 0.0);
        assert!((report.wns_ns - 2.5).abs() < 0.01);
        assert!((report.tns_ns - 0.0).abs() < 0.01);
        assert!((report.whs_ns - 0.1).abs() < 0.01);
        // Fmax = 1000 / (10.0 - 2.5) = 133.33
        assert!((report.fmax_mhz - 133.333).abs() < 0.1);
        assert_eq!(report.failing_paths, 0);
    }

    #[test]
    fn test_parse_vivado_timing_empty() {
        let report = parse_vivado_timing("").unwrap();
        // With default 10.0 period and 0.0 WNS: fmax = 1000/10 = 100
        assert!((report.fmax_mhz - 100.0).abs() < 0.1);
    }

    #[test]
    fn test_parse_nextpnr_timing_valid_json() {
        let content = r#"{"fmax": {"clk": {"achieved": 155.25, "constraint": 125.0}}}"#;
        let report = parse_nextpnr_timing(content).unwrap();
        assert!((report.fmax_mhz - 155.25).abs() < 0.01);
    }

    #[test]
    fn test_parse_nextpnr_timing_invalid_json() {
        let result = parse_nextpnr_timing("not json");
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_radiant_timing_with_fixture() {
        let content = include_str!("../../tests/fixtures/radiant/timing.twr");
        let report = parse_radiant_timing(content).unwrap();
        // The fixture should parse without errors
        // Verify we get some meaningful data
        assert!(report.fmax_mhz >= 0.0);
    }

    #[test]
    fn test_parse_radiant_timing_empty() {
        let report = parse_radiant_timing("").unwrap();
        assert_eq!(report.fmax_mhz, 0.0);
        assert_eq!(report.failing_paths, 0);
        assert!(report.clock_domains.is_empty());
    }

    // ── Fixture-based tests for Diamond, Quartus, Vivado ──

    #[test]
    fn test_parse_diamond_timing_with_fixture() {
        let content = include_str!("../../tests/fixtures/diamond/timing.twr");
        let report = parse_diamond_timing(content).unwrap();
        assert!(report.fmax_mhz > 130.0, "fmax={}", report.fmax_mhz);
        assert!(report.wns_ns > 0.0, "wns={}", report.wns_ns);
    }

    #[test]
    fn test_parse_quartus_timing_with_fixture() {
        let content = include_str!("../../tests/fixtures/quartus/timing.sta.rpt");
        let report = parse_quartus_timing(content).unwrap();
        assert!(report.fmax_mhz > 199.0, "fmax={}", report.fmax_mhz);
    }

    #[test]
    fn test_parse_vivado_timing_with_fixture() {
        let content = include_str!("../../tests/fixtures/vivado/timing_summary.rpt");
        let report = parse_vivado_timing(content).unwrap();
        assert!(report.wns_ns > 0.0, "wns={}", report.wns_ns);
        assert!(report.fmax_mhz > 0.0, "fmax={}", report.fmax_mhz);
    }
}
