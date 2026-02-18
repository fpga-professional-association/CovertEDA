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
