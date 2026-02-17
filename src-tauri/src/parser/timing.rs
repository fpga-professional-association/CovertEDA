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

fn extract_float(content: &str, pattern: &str) -> Option<f64> {
    Regex::new(pattern)
        .ok()?
        .captures(content)?
        .get(1)?
        .as_str()
        .parse()
        .ok()
}
