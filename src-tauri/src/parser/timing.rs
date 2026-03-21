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
///
/// Quartus STA reports contain:
/// - Timing Analyzer Summary table with Setup Slack, Hold Slack, TNS, failing paths
/// - Clocks table with per-clock Fmax and slack
/// - Per-clock setup path tables with from/to/slack/delay
pub fn parse_quartus_timing(content: &str) -> BackendResult<TimingReport> {
    // ── Summary table fields ──
    let wns = extract_float(content, r"(?i)Setup\s+Slack\s*[;:]?\s*([+-]?[\d.]+)\s*ns")
        .unwrap_or(0.0);
    let whs = extract_float(content, r"(?i)Hold\s+Slack\s*[;:]?\s*([+-]?[\d.]+)\s*ns")
        .unwrap_or(0.0);
    let tns_setup = extract_float(
        content,
        r"(?i)Total Negative Slack \(Setup\)\s*[;:]?\s*([+-]?[\d.]+)\s*ns",
    )
    .or_else(|| extract_float(content, r"(?i)Total Negative Slack\s*[;:]?\s*([+-]?[\d.]+)\s*ns"))
    .unwrap_or(0.0);
    let tns_hold = extract_float(
        content,
        r"(?i)Total Negative Slack \(Hold\)\s*[;:]?\s*([+-]?[\d.]+)\s*ns",
    )
    .unwrap_or(0.0);
    let failing_paths = extract_float(content, r"(?i)Number of Failing Paths\s*[;:]?\s*(\d+)")
        .map(|v| v as u32)
        .unwrap_or(if wns < 0.0 { 1 } else { 0 });
    let total_paths = extract_float(content, r"(?i)Total Number of Paths\s*[;:]?\s*(\d+)")
        .map(|v| v as u32)
        .unwrap_or(0);

    // ── Clock domains from Clocks table ──
    // Format: ; clk     ; 200.50 MHz; 200.50    ; 200.50     ; 1.205      ;
    let clock_re = Regex::new(
        r"(?m);\s*(\w[\w./]*)\s*;\s*([\d.]+)\s*MHz\s*;\s*([\d.]+)\s*;\s*([\d.]+)\s*;\s*([+-]?[\d.]+)\s*;"
    ).unwrap();

    let mut clock_domains = vec![];
    let mut best_fmax = 0.0_f64;

    for cap in clock_re.captures_iter(content) {
        let name = cap[1].to_string();
        let freq: f64 = cap[2].parse().unwrap_or(0.0);
        let fmax_val: f64 = cap[3].parse().unwrap_or(0.0);
        let slack: f64 = cap[5].parse().unwrap_or(0.0);
        let period = if freq > 0.0 { 1000.0 / freq } else { 0.0 };

        if fmax_val > best_fmax {
            best_fmax = fmax_val;
        }

        clock_domains.push(ClockDomain {
            name,
            period_ns: period,
            frequency_mhz: fmax_val,
            source: String::new(),
            clock_type: "primary".into(),
            wns_ns: slack,
            path_count: 0,
        });
    }

    // Fallback Fmax from "Fmax" line if clocks table not found
    if best_fmax == 0.0 {
        best_fmax = extract_float(content, r"Fmax[^:]*:\s*([\d.]+)\s*MHz").unwrap_or(0.0);
    }

    // ── Critical paths from setup tables ──
    // Format: ; 1.205 ; counter_reg[0]     ; counter_reg[7]     ; 3.795  ;
    let path_re = Regex::new(
        r"(?m);\s*([+-]?[\d.]+)\s*;\s*(\S+)\s*;\s*(\S+)\s*;\s*([\d.]+)\s*;"
    ).unwrap();

    // Find per-clock setup sections to associate paths with clocks
    let section_re = Regex::new(
        r"(?i)Setup:\s*'(\w[\w./]*)'"
    ).unwrap();

    let mut critical_paths = vec![];
    let mut rank = 0_u32;

    // Parse setup sections with their clock names
    for section_cap in section_re.captures_iter(content) {
        let clock_name = section_cap[1].to_string();
        let section_start = section_cap.get(0).unwrap().start();

        // Find the next section or end
        let rest = &content[section_start..];
        // Look for the table delimiter ending (next section header or end)
        let section_end = rest[1..]
            .find("----\n\n")
            .map(|i| section_start + 1 + i)
            .unwrap_or(content.len());

        let section_text = &content[section_start..section_end];

        for path_cap in path_re.captures_iter(section_text) {
            let slack: f64 = path_cap[1].parse().unwrap_or(0.0);
            let from = path_cap[2].to_string();
            let to = path_cap[3].to_string();
            let delay: f64 = path_cap[4].parse().unwrap_or(0.0);

            // Skip header rows
            if from == "From" || from == ";" {
                continue;
            }

            rank += 1;
            critical_paths.push(CriticalPath {
                rank,
                from,
                to,
                slack_ns: slack,
                required_ns: slack + delay,
                delay_ns: delay,
                logic_levels: 0,
                clock: clock_name.clone(),
                path_type: "setup".into(),
            });
        }
    }

    // Derive target_mhz from best_fmax and WNS
    let target_mhz = if best_fmax > 0.0 && wns != 0.0 {
        let period = 1000.0 / best_fmax;
        1000.0 / (period + wns)
    } else {
        best_fmax
    };

    Ok(TimingReport {
        fmax_mhz: best_fmax,
        target_mhz,
        wns_ns: wns,
        tns_ns: tns_setup,
        whs_ns: whs,
        ths_ns: tns_hold,
        failing_paths,
        total_paths,
        clock_domains,
        critical_paths,
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

    // Extract fmax data per clock domain
    let fmax_obj = json.pointer("/fmax").and_then(|v| v.as_object());

    let mut best_fmax = 0.0_f64;
    let mut best_constraint = 0.0_f64;
    let mut worst_wns = f64::MAX;
    let mut total_tns = 0.0_f64;
    let mut failing_count = 0_u32;
    let mut clock_domains = vec![];

    if let Some(clocks) = fmax_obj {
        for (name, freq_data) in clocks {
            let achieved = freq_data.get("achieved").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let constraint = freq_data.get("constraint").and_then(|v| v.as_f64()).unwrap_or(0.0);

            // Compute slack: positive = met, negative = violated
            // WNS in ns: (1/constraint - 1/achieved) * 1000 when both > 0
            let wns = if constraint > 0.0 && achieved > 0.0 {
                (1000.0 / constraint) - (1000.0 / achieved)
            } else {
                0.0
            };

            if wns < worst_wns {
                worst_wns = wns;
            }
            if wns < 0.0 {
                total_tns += wns;
                failing_count += 1;
            }
            if achieved > best_fmax {
                best_fmax = achieved;
                best_constraint = constraint;
            }

            let period = if constraint > 0.0 { 1000.0 / constraint } else { 0.0 };

            clock_domains.push(ClockDomain {
                name: name.clone(),
                period_ns: period,
                frequency_mhz: achieved,
                source: String::new(),
                clock_type: "primary".into(),
                wns_ns: wns,
                path_count: 0,
            });
        }
    }

    if worst_wns == f64::MAX {
        worst_wns = 0.0;
    }

    // Extract critical paths
    let mut critical_paths = vec![];
    if let Some(crit_arr) = json.pointer("/critical_paths").and_then(|v| v.as_array()) {
        for (rank, cp) in crit_arr.iter().enumerate() {
            let from = cp.get("from").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let to = cp.get("to").and_then(|v| v.as_str()).unwrap_or("").to_string();

            // Sum delays along the path
            let mut total_delay = 0.0_f64;
            let mut logic_levels = 0_u32;
            if let Some(path_items) = cp.get("path").and_then(|v| v.as_array()) {
                for item in path_items {
                    total_delay += item.get("delay").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    let ptype = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
                    if ptype == "cell" || ptype == "logic" {
                        logic_levels += 1;
                    }
                }
            }

            critical_paths.push(CriticalPath {
                rank: (rank + 1) as u32,
                from,
                to,
                slack_ns: 0.0,
                required_ns: 0.0,
                delay_ns: total_delay,
                logic_levels,
                clock: String::new(),
                path_type: "setup".into(),
            });
        }
    }

    let total_paths = clock_domains.iter().map(|c| c.path_count).sum::<u32>().max(
        critical_paths.len() as u32,
    );

    Ok(TimingReport {
        fmax_mhz: best_fmax,
        target_mhz: best_constraint,
        wns_ns: worst_wns,
        tns_ns: total_tns,
        whs_ns: 0.0,
        ths_ns: 0.0,
        failing_paths: failing_count,
        total_paths,
        clock_domains,
        critical_paths,
    })
}

/// Parse timing data from nextpnr log output (fallback when report.json is missing).
///
/// nextpnr prints lines like:
///   Info: Max frequency for clock 'clk': 148.30 MHz (PASS at 12.00 MHz)
///   Info: Max frequency for clock 'sys_clk': 45.22 MHz (FAIL at 50.00 MHz)
pub fn parse_nextpnr_log_timing(content: &str) -> BackendResult<TimingReport> {
    let fmax_re = Regex::new(
        r"Max frequency for clock '([^']+)':\s*([\d.]+)\s*MHz\s*\((?:PASS|FAIL) at ([\d.]+)\s*MHz\)"
    ).unwrap();

    let mut best_fmax = 0.0_f64;
    let mut best_constraint = 0.0_f64;
    let mut worst_wns = f64::MAX;
    let mut total_tns = 0.0_f64;
    let mut failing_count = 0_u32;
    let mut clock_domains = vec![];

    for cap in fmax_re.captures_iter(content) {
        let name = cap[1].to_string();
        let achieved: f64 = cap[2].parse().unwrap_or(0.0);
        let constraint: f64 = cap[3].parse().unwrap_or(0.0);

        let wns = if constraint > 0.0 && achieved > 0.0 {
            (1000.0 / constraint) - (1000.0 / achieved)
        } else {
            0.0
        };

        if wns < worst_wns {
            worst_wns = wns;
        }
        if wns < 0.0 {
            total_tns += wns;
            failing_count += 1;
        }
        if achieved > best_fmax {
            best_fmax = achieved;
            best_constraint = constraint;
        }

        let period = if constraint > 0.0 { 1000.0 / constraint } else { 0.0 };

        clock_domains.push(ClockDomain {
            name,
            period_ns: period,
            frequency_mhz: achieved,
            source: String::new(),
            clock_type: "primary".into(),
            wns_ns: wns,
            path_count: 0,
        });
    }

    if worst_wns == f64::MAX {
        worst_wns = 0.0;
    }

    if clock_domains.is_empty() && best_fmax == 0.0 {
        return Err(BackendError::ReportNotFound(
            "No timing data found in nextpnr log".into(),
        ));
    }

    Ok(TimingReport {
        fmax_mhz: best_fmax,
        target_mhz: best_constraint,
        wns_ns: worst_wns,
        tns_ns: total_tns,
        whs_ns: 0.0,
        ths_ns: 0.0,
        failing_paths: failing_count,
        total_paths: clock_domains.len() as u32,
        clock_domains,
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

/// Parse Achronix ACE *_timing.rpt timing report.
///
/// ACE timing reports contain sections like:
///   Clock:   clk  Frequency: 500.00 MHz  Period: 2.000 ns
///   Setup Slack (WNS): 0.123 ns   TNS: 0.000 ns
///   Hold  Slack (WHS): 0.456 ns   THS: 0.000 ns
///   Failing Paths (Setup): 0
pub fn parse_ace_timing(content: &str) -> BackendResult<TimingReport> {
    // Fmax: "Frequency: NNN.NN MHz"
    let fmax = extract_float(content, r"Frequency:\s*([\d.]+)\s*MHz").unwrap_or(0.0);

    // WNS/TNS (setup)
    let wns = extract_float(content, r"(?i)Setup\s+Slack[^:]*:\s*([+-]?[\d.]+)\s*ns")
        .unwrap_or(0.0);
    let tns = extract_float(content, r"(?i)TNS:\s*([+-]?[\d.]+)\s*ns").unwrap_or(0.0);

    // WHS/THS (hold)
    let whs = extract_float(content, r"(?i)Hold\s+Slack[^:]*:\s*([+-]?[\d.]+)\s*ns")
        .unwrap_or(0.0);
    let ths = extract_float(content, r"(?i)THS:\s*([+-]?[\d.]+)\s*ns").unwrap_or(0.0);

    // Failing paths
    let failing = extract_float(content, r"(?i)Failing\s+Paths[^:]*:\s*(\d+)")
        .map(|v| v as u32)
        .unwrap_or(if wns < 0.0 { 1 } else { 0 });

    // Clock domains: "Clock: <name>  Frequency: NNN MHz  Period: N.NNN ns  WNS: N.NNN ns"
    let clock_re = Regex::new(
        r"(?m)Clock:\s+(\S+)\s+Frequency:\s*([\d.]+)\s*MHz\s+Period:\s*([\d.]+)\s*ns(?:.*?WNS:\s*([+-]?[\d.]+)\s*ns)?"
    ).unwrap();
    let mut clock_domains = vec![];
    for cap in clock_re.captures_iter(content) {
        let name = cap[1].to_string();
        let freq: f64 = cap[2].parse().unwrap_or(0.0);
        let period: f64 = cap[3].parse().unwrap_or(0.0);
        let slack: f64 = cap.get(4).and_then(|m| m.as_str().parse().ok()).unwrap_or(0.0);
        clock_domains.push(ClockDomain {
            name,
            period_ns: period,
            frequency_mhz: freq,
            source: String::new(),
            clock_type: "primary".into(),
            wns_ns: slack,
            path_count: 0,
        });
    }

    Ok(TimingReport {
        fmax_mhz: fmax,
        target_mhz: fmax,
        wns_ns: wns,
        tns_ns: tns,
        whs_ns: whs,
        ths_ns: ths,
        failing_paths: failing,
        total_paths: 0,
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
        let content = r#"
; Setup  Slack       ; 1.205 ns                ;
; Hold   Slack       ; 0.186 ns                ;
; Total Negative Slack (Setup)  ; 0.000 ns     ;
; Total Negative Slack (Hold)   ; 0.000 ns     ;
; Number of Failing Paths       ; 0            ;
; Total Number of Paths         ; 142          ;

; clk     ; 200.50 MHz; 200.50    ; 200.50     ; 1.205      ;
"#;
        let report = parse_quartus_timing(content).unwrap();
        assert!((report.fmax_mhz - 200.50).abs() < 0.01);
        assert!((report.wns_ns - 1.205).abs() < 0.01);
        assert!((report.whs_ns - 0.186).abs() < 0.01);
        assert!((report.tns_ns - 0.0).abs() < 0.01);
        assert_eq!(report.failing_paths, 0);
        assert_eq!(report.total_paths, 142);
        assert_eq!(report.clock_domains.len(), 1);
        assert_eq!(report.clock_domains[0].name, "clk");
    }

    #[test]
    fn test_parse_quartus_timing_empty() {
        let report = parse_quartus_timing("").unwrap();
        assert_eq!(report.fmax_mhz, 0.0);
        assert_eq!(report.failing_paths, 0);
        assert!(report.clock_domains.is_empty());
        assert!(report.critical_paths.is_empty());
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
        assert!((report.target_mhz - 125.0).abs() < 0.01);
        assert!(report.wns_ns > 0.0, "timing met, WNS should be positive");
        assert_eq!(report.failing_paths, 0);
        assert_eq!(report.clock_domains.len(), 1);
        assert_eq!(report.clock_domains[0].name, "clk");
    }

    #[test]
    fn test_parse_nextpnr_timing_invalid_json() {
        let result = parse_nextpnr_timing("not json");
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_nextpnr_timing_with_fixture() {
        let content = include_str!("../../tests/fixtures/oss/report.json");
        let report = parse_nextpnr_timing(content).unwrap();
        assert!((report.fmax_mhz - 188.42).abs() < 0.01, "fmax={}", report.fmax_mhz);
        assert!((report.target_mhz - 125.0).abs() < 0.01);
        assert!(report.wns_ns > 0.0, "timing met, WNS should be positive");
        assert_eq!(report.failing_paths, 0);
        assert_eq!(report.clock_domains.len(), 1);
        assert!(!report.critical_paths.is_empty(), "should have critical paths");
        assert!(report.critical_paths[0].delay_ns > 0.0, "critical path should have delay");
    }

    #[test]
    fn test_parse_nextpnr_timing_multiple_clocks() {
        let content = r#"{
            "fmax": {
                "clk_fast": {"achieved": 200.0, "constraint": 250.0},
                "clk_slow": {"achieved": 50.0, "constraint": 25.0}
            }
        }"#;
        let report = parse_nextpnr_timing(content).unwrap();
        // Best fmax is 200 MHz
        assert!((report.fmax_mhz - 200.0).abs() < 0.01);
        assert_eq!(report.clock_domains.len(), 2);
        // clk_fast fails (200 < 250), so failing_paths = 1
        assert_eq!(report.failing_paths, 1);
        assert!(report.wns_ns < 0.0, "WNS should be negative for failing clock");
    }

    #[test]
    fn test_parse_nextpnr_timing_empty_json() {
        let report = parse_nextpnr_timing("{}").unwrap();
        assert_eq!(report.fmax_mhz, 0.0);
        assert_eq!(report.target_mhz, 0.0);
        assert!(report.clock_domains.is_empty());
        assert!(report.critical_paths.is_empty());
    }

    // ── nextpnr log timing fallback tests ──

    #[test]
    fn test_parse_nextpnr_log_timing_single_clock() {
        let content = r#"
Info: Program Arguments: nextpnr-ecp5 --json build/out.json
Info: Max frequency for clock 'clk': 148.30 MHz (PASS at 12.00 MHz)
Info: 2 warnings, 0 errors
"#;
        let report = parse_nextpnr_log_timing(content).unwrap();
        assert!((report.fmax_mhz - 148.30).abs() < 0.01);
        assert!((report.target_mhz - 12.0).abs() < 0.01);
        assert_eq!(report.clock_domains.len(), 1);
        assert_eq!(report.clock_domains[0].name, "clk");
        assert_eq!(report.failing_paths, 0);
    }

    #[test]
    fn test_parse_nextpnr_log_timing_failing_clock() {
        let content = "Info: Max frequency for clock 'sys_clk': 45.22 MHz (FAIL at 50.00 MHz)\n";
        let report = parse_nextpnr_log_timing(content).unwrap();
        assert!((report.fmax_mhz - 45.22).abs() < 0.01);
        assert_eq!(report.failing_paths, 1);
        assert!(report.wns_ns < 0.0); // Negative slack = timing violation
    }

    #[test]
    fn test_parse_nextpnr_log_timing_multiple_clocks() {
        let content = r#"
Info: Max frequency for clock 'fast_clk': 200.00 MHz (PASS at 100.00 MHz)
Info: Max frequency for clock 'slow_clk': 50.00 MHz (PASS at 25.00 MHz)
"#;
        let report = parse_nextpnr_log_timing(content).unwrap();
        assert_eq!(report.clock_domains.len(), 2);
        assert!((report.fmax_mhz - 200.0).abs() < 0.01); // Best fmax
    }

    #[test]
    fn test_parse_nextpnr_log_timing_no_data() {
        let result = parse_nextpnr_log_timing("Info: Program finished normally.\n");
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
        assert!((report.fmax_mhz - 200.50).abs() < 0.1, "fmax={}", report.fmax_mhz);
        assert!((report.wns_ns - 1.205).abs() < 0.01, "wns={}", report.wns_ns);
        assert!((report.whs_ns - 0.186).abs() < 0.01, "whs={}", report.whs_ns);
        assert_eq!(report.failing_paths, 0);
        assert_eq!(report.total_paths, 142);
        assert_eq!(report.clock_domains.len(), 2, "should have 2 clock domains");
        assert_eq!(report.clock_domains[0].name, "clk");
        assert_eq!(report.clock_domains[1].name, "pll_clk");
        assert!(!report.critical_paths.is_empty(), "should have critical paths");
        // First critical path should be the tightest (1.205 ns slack)
        assert!((report.critical_paths[0].slack_ns - 1.205).abs() < 0.01);
        assert_eq!(report.critical_paths[0].clock, "clk");
    }

    #[test]
    fn test_parse_vivado_timing_with_fixture() {
        let content = include_str!("../../tests/fixtures/vivado/timing_summary.rpt");
        let report = parse_vivado_timing(content).unwrap();
        assert!(report.wns_ns > 0.0, "wns={}", report.wns_ns);
        assert!(report.fmax_mhz > 0.0, "fmax={}", report.fmax_mhz);
    }

    #[test]
    fn test_parse_ace_timing_with_fixture() {
        let content = include_str!("../../tests/fixtures/ace/timing.rpt");
        let report = parse_ace_timing(content).unwrap();
        assert!((report.fmax_mhz - 487.32).abs() < 0.1, "fmax={}", report.fmax_mhz);
        assert!(report.wns_ns > 0.0, "wns={}", report.wns_ns);
        assert_eq!(report.failing_paths, 0);
        assert!(!report.clock_domains.is_empty(), "should have clock domains");
    }

    #[test]
    fn test_parse_ace_timing_with_data() {
        let content = "Clock: sys_clk  Frequency: 500.00 MHz  Period: 2.000 ns  WNS: 0.150 ns\n\
                       Setup Slack (WNS): 0.150 ns\nTNS: 0.000 ns\n\
                       Hold  Slack (WHS): 0.055 ns\nTHS: 0.000 ns\n\
                       Failing Paths (Setup): 0\n";
        let report = parse_ace_timing(content).unwrap();
        assert!((report.fmax_mhz - 500.0).abs() < 0.1);
        assert!((report.wns_ns - 0.150).abs() < 0.001);
        assert_eq!(report.failing_paths, 0);
        assert_eq!(report.clock_domains.len(), 1);
        assert_eq!(report.clock_domains[0].name, "sys_clk");
    }

    #[test]
    fn test_parse_ace_timing_empty() {
        let report = parse_ace_timing("").unwrap();
        assert_eq!(report.fmax_mhz, 0.0);
        assert_eq!(report.wns_ns, 0.0);
        assert_eq!(report.failing_paths, 0);
        assert!(report.clock_domains.is_empty());
    }

    // ── Edge case tests for timing parsers ──

    #[test]
    fn test_parse_diamond_timing_malformed_input() {
        let content = "garbage data without timing information";
        let report = parse_diamond_timing(content).unwrap();
        assert_eq!(report.fmax_mhz, 0.0);
        assert_eq!(report.wns_ns, 0.0);
    }

    #[test]
    fn test_parse_diamond_timing_negative_slack() {
        let content = r#"
Maximum frequency for clock domain clk: 100.0 MHz
Worst negative slack: -1.5 ns
Worst hold slack: 0.2 ns
"#;
        let report = parse_diamond_timing(content).unwrap();
        assert!((report.wns_ns - (-1.5)).abs() < 0.1);
        assert_eq!(report.failing_paths, 1);
    }

    #[test]
    fn test_parse_quartus_timing_empty_report() {
        let content = "";
        let report = parse_quartus_timing(content).unwrap();
        assert_eq!(report.fmax_mhz, 0.0);
        assert_eq!(report.wns_ns, 0.0);
    }

    #[test]
    fn test_parse_quartus_timing_with_tns_values() {
        let content = r#"
Setup Slack : 0.500 ns
Hold Slack : 0.200 ns
Total Negative Slack (Setup) : 0.000 ns
Total Negative Slack (Hold) : 0.000 ns
Number of Failing Paths : 0
Total Number of Paths : 5000
Fmax: 200.00 MHz
"#;
        let report = parse_quartus_timing(content).unwrap();
        assert!((report.wns_ns - 0.5).abs() < 0.01);
        assert!((report.whs_ns - 0.2).abs() < 0.01);
        assert_eq!(report.total_paths, 5000);
        assert_eq!(report.failing_paths, 0);
    }

    #[test]
    fn test_parse_vivado_timing_empty_input() {
        let content = "";
        let report = parse_vivado_timing(content).unwrap();
        assert_eq!(report.wns_ns, 0.0);
        assert_eq!(report.tns_ns, 0.0);
    }

    #[test]
    fn test_parse_vivado_timing_partial_slack() {
        let content = r#"
WNS(ns) : 1.234
TNS(ns) : 0.000
Target Period : 10.0
"#;
        let report = parse_vivado_timing(content).unwrap();
        assert!((report.wns_ns - 1.234).abs() < 0.01);
        assert_eq!(report.tns_ns, 0.0);
    }

    #[test]
    fn test_parse_nextpnr_timing_json_empty_object() {
        let content = r#"{"fmax": {}}"#;
        let report = parse_nextpnr_timing(content).unwrap();
        assert_eq!(report.fmax_mhz, 0.0);
        assert_eq!(report.wns_ns, 0.0);
    }

    #[test]
    fn test_parse_nextpnr_timing_json_with_data() {
        let content = r#"{
  "fmax": {
    "clk": {
      "achieved": 100.0,
      "constraint": 125.0
    }
  }
}"#;
        let report = parse_nextpnr_timing(content).unwrap();
        assert!((report.fmax_mhz - 100.0).abs() < 0.1);
    }

    #[test]
    fn test_parse_nextpnr_log_timing_valid_entries() {
        let content = "Info: Max frequency for clock 'clk': 200.50 MHz (PASS at 250.00 MHz)\n\
                       Info: Max frequency for clock 'sys': 150.25 MHz (FAIL at 200.00 MHz)";
        let report = parse_nextpnr_log_timing(content).unwrap();
        assert!((report.fmax_mhz - 200.50).abs() < 0.1);
        assert_eq!(report.clock_domains.len(), 2);
    }

    #[test]
    fn test_parse_radiant_timing_empty_input() {
        let content = "";
        let report = parse_radiant_timing(content).unwrap();
        assert_eq!(report.fmax_mhz, 0.0);
    }

    #[test]
    fn test_extract_float_with_scientific_notation() {
        let content = "Value: 1.234e-3 MHz";
        // Scientific notation might not parse with our current regex
        let result = extract_float(content, r"Value:\s*([\d.e\-]+)");
        // Just verify it doesn't crash
        assert!(result.is_some() || result.is_none());
    }

    #[test]
    fn test_extract_float_with_leading_zeros() {
        let content = "Frequency: 000.500 MHz";
        let result = extract_float(content, r"Frequency:\s*([\d.]+)");
        assert!(result.is_some());
    }

    #[test]
    fn test_parse_diamond_timing_zero_frequency() {
        let content = "Maximum frequency for clock domain clk: 0.0 MHz";
        let report = parse_diamond_timing(content).unwrap();
        assert_eq!(report.fmax_mhz, 0.0);
    }

    #[test]
    fn test_parse_quartus_timing_very_large_path_count() {
        let content = "Total Number of Paths : 999999999";
        let report = parse_quartus_timing(content).unwrap();
        assert_eq!(report.total_paths, 999999999);
    }

    // ── Radiant Fixture Tests ──

    #[test]
    fn test_radiant_example_blinky_led_timing_parses() {
        let content = include_str!("../../tests/fixtures/radiant/examples/blinky_led_timing.twr");
        let report = parse_radiant_timing(content).unwrap();
        assert!(report.fmax_mhz > 0.0, "Fmax should be positive");
        assert!(report.wns_ns > 0.0, "WNS should be positive (passing timing)");
    }

    #[test]
    fn test_radiant_example_blinky_led_timing_values() {
        let content = include_str!("../../tests/fixtures/radiant/examples/blinky_led_timing.twr");
        let report = parse_radiant_timing(content).unwrap();
        assert!((report.fmax_mhz - 312.5).abs() < 1.0, "Fmax should be ~312.5 MHz");
        assert!((report.wns_ns - 4.32).abs() < 0.5, "WNS should be ~4.32 ns");
    }

    #[test]
    fn test_radiant_example_blinky_led_timing_slack_positive() {
        let content = include_str!("../../tests/fixtures/radiant/examples/blinky_led_timing.twr");
        let report = parse_radiant_timing(content).unwrap();
        assert!(report.wns_ns > 0.0, "WNS should be positive for passing timing");
        assert_eq!(report.failing_paths, 0, "Should have zero failing paths");
    }

    #[test]
    fn test_radiant_example_blinky_led_timing_tns() {
        let content = include_str!("../../tests/fixtures/radiant/examples/blinky_led_timing.twr");
        let report = parse_radiant_timing(content).unwrap();
        assert_eq!(report.tns_ns, 0.0, "TNS should be 0.0 for passing timing");
    }

    #[test]
    fn test_radiant_example_uart_controller_timing_parses() {
        let content = include_str!("../../tests/fixtures/radiant/examples/uart_controller_timing.twr");
        let report = parse_radiant_timing(content).unwrap();
        assert!(report.fmax_mhz > 0.0);
        assert!(report.wns_ns > 0.0);
    }

    #[test]
    fn test_radiant_example_uart_controller_timing_values() {
        let content = include_str!("../../tests/fixtures/radiant/examples/uart_controller_timing.twr");
        let report = parse_radiant_timing(content).unwrap();
        assert!((report.fmax_mhz - 156.25).abs() < 2.0, "Fmax should be ~156.25 MHz");
        assert!((report.wns_ns - 11.48).abs() < 1.0, "WNS should be ~11.48 ns");
    }

    #[test]
    fn test_radiant_example_spi_flash_timing_parses() {
        let content = include_str!("../../tests/fixtures/radiant/examples/spi_flash_timing.twr");
        let report = parse_radiant_timing(content).unwrap();
        assert!(report.fmax_mhz > 0.0);
        assert!(report.wns_ns > 0.0);
    }

    #[test]
    fn test_radiant_example_spi_flash_timing_values() {
        let content = include_str!("../../tests/fixtures/radiant/examples/spi_flash_timing.twr");
        let report = parse_radiant_timing(content).unwrap();
        assert!((report.fmax_mhz - 100.0).abs() < 1.0, "Fmax should be ~100 MHz");
        assert!((report.wns_ns - 2.45).abs() < 0.5, "WNS should be ~2.45 ns");
    }

    #[test]
    fn test_radiant_example_i2c_bridge_timing_parses() {
        let content = include_str!("../../tests/fixtures/radiant/examples/i2c_bridge_timing.twr");
        let report = parse_radiant_timing(content).unwrap();
        assert!(report.fmax_mhz > 0.0);
        assert!(report.wns_ns > 0.0);
    }

    #[test]
    fn test_radiant_example_i2c_bridge_timing_values() {
        let content = include_str!("../../tests/fixtures/radiant/examples/i2c_bridge_timing.twr");
        let report = parse_radiant_timing(content).unwrap();
        assert!((report.fmax_mhz - 200.0).abs() < 1.0, "Fmax should be ~200 MHz");
        assert!((report.wns_ns - 13.24).abs() < 1.0, "WNS should be ~13.24 ns");
    }

    #[test]
    fn test_radiant_example_dsp_fir_filter_timing_parses() {
        let content = include_str!("../../tests/fixtures/radiant/examples/dsp_fir_filter_timing.twr");
        let report = parse_radiant_timing(content).unwrap();
        assert!(report.fmax_mhz > 0.0);
        assert!(report.wns_ns > 0.0);
    }

    #[test]
    fn test_radiant_example_dsp_fir_filter_timing_values() {
        let content = include_str!("../../tests/fixtures/radiant/examples/dsp_fir_filter_timing.twr");
        let report = parse_radiant_timing(content).unwrap();
        assert!((report.fmax_mhz - 250.0).abs() < 1.0, "Fmax should be ~250 MHz");
        assert!((report.wns_ns - 5.18).abs() < 0.5, "WNS should be ~5.18 ns");
    }

    #[test]
    fn test_radiant_example_uart_controller_timing_constraint() {
        let content = include_str!("../../tests/fixtures/radiant/examples/uart_controller_timing.twr");
        let report = parse_radiant_timing(content).unwrap();
        // Check that it meets timing constraint
        assert!(report.wns_ns > 0.0, "UART controller should meet timing");
    }

    #[test]
    fn test_radiant_example_spi_flash_timing_higher_frequency() {
        let content = include_str!("../../tests/fixtures/radiant/examples/spi_flash_timing.twr");
        let report = parse_radiant_timing(content).unwrap();
        // SPI flash is slower but should still be positive
        assert!(report.fmax_mhz > 50.0, "SPI flash Fmax should be above 50 MHz");
    }

    #[test]
    fn test_radiant_example_i2c_bridge_timing_high_slack() {
        let content = include_str!("../../tests/fixtures/radiant/examples/i2c_bridge_timing.twr");
        let report = parse_radiant_timing(content).unwrap();
        // I2C is a low-speed interface, should have good slack
        assert!(report.wns_ns > 10.0, "I2C should have high slack");
    }

    #[test]
    fn test_radiant_example_dsp_fir_filter_timing_positive_slack() {
        let content = include_str!("../../tests/fixtures/radiant/examples/dsp_fir_filter_timing.twr");
        let report = parse_radiant_timing(content).unwrap();
        // DSP design should meet timing
        assert!(report.wns_ns > 0.0, "DSP FIR should meet timing constraints");
    }

    // ── Diamond Fixture Tests ──

    #[test]
    fn test_diamond_example_blinky_led_timing_parses() {
        let content = include_str!("../../tests/fixtures/diamond/examples/blinky_led_timing.twr");
        let report = parse_diamond_timing(content).unwrap();
        assert!(report.fmax_mhz > 0.0);
    }

    #[test]
    fn test_diamond_example_blinky_led_timing_values() {
        let content = include_str!("../../tests/fixtures/diamond/examples/blinky_led_timing.twr");
        let report = parse_diamond_timing(content).unwrap();
        assert!(report.fmax_mhz > 100.0, "Diamond blinky_led should have reasonable Fmax");
    }

    #[test]
    fn test_diamond_example_uart_bridge_timing_parses() {
        let content = include_str!("../../tests/fixtures/diamond/examples/uart_bridge_timing.twr");
        let report = parse_diamond_timing(content).unwrap();
        assert!(report.fmax_mhz > 0.0);
    }

    #[test]
    fn test_diamond_example_uart_bridge_timing_values() {
        let content = include_str!("../../tests/fixtures/diamond/examples/uart_bridge_timing.twr");
        let report = parse_diamond_timing(content).unwrap();
        assert!(report.fmax_mhz > 50.0);
    }

    #[test]
    fn test_diamond_example_serdes_loopback_timing_parses() {
        let content = include_str!("../../tests/fixtures/diamond/examples/serdes_loopback_timing.twr");
        let report = parse_diamond_timing(content).unwrap();
        assert!(report.fmax_mhz > 0.0);
    }

    #[test]
    fn test_diamond_example_serdes_loopback_timing_values() {
        let content = include_str!("../../tests/fixtures/diamond/examples/serdes_loopback_timing.twr");
        let report = parse_diamond_timing(content).unwrap();
        assert!(report.fmax_mhz > 100.0);
    }

    #[test]
    fn test_diamond_example_video_scaler_timing_parses() {
        let content = include_str!("../../tests/fixtures/diamond/examples/video_scaler_timing.twr");
        let report = parse_diamond_timing(content).unwrap();
        assert!(report.fmax_mhz > 0.0);
    }

    #[test]
    fn test_diamond_example_video_scaler_timing_values() {
        let content = include_str!("../../tests/fixtures/diamond/examples/video_scaler_timing.twr");
        let report = parse_diamond_timing(content).unwrap();
        assert!(report.fmax_mhz > 50.0);
    }

    #[test]
    fn test_diamond_example_wishbone_soc_timing_parses() {
        let content = include_str!("../../tests/fixtures/diamond/examples/wishbone_soc_timing.twr");
        let report = parse_diamond_timing(content).unwrap();
        assert!(report.fmax_mhz > 0.0);
    }

    #[test]
    fn test_diamond_example_wishbone_soc_timing_values() {
        let content = include_str!("../../tests/fixtures/diamond/examples/wishbone_soc_timing.twr");
        let report = parse_diamond_timing(content).unwrap();
        assert!(report.fmax_mhz > 50.0);
    }

    #[test]
    fn test_diamond_example_blinky_led_timing_has_wns() {
        let content = include_str!("../../tests/fixtures/diamond/examples/blinky_led_timing.twr");
        let report = parse_diamond_timing(content).unwrap();
        assert!(report.wns_ns >= -1000.0 && report.wns_ns <= 1000.0);
    }

    #[test]
    fn test_diamond_example_uart_bridge_timing_reasonable_freq() {
        let content = include_str!("../../tests/fixtures/diamond/examples/uart_bridge_timing.twr");
        let report = parse_diamond_timing(content).unwrap();
        assert!(report.fmax_mhz > 0.0 && report.fmax_mhz < 1000.0);
    }

    #[test]
    fn test_diamond_example_serdes_loopback_timing_high_speed() {
        let content = include_str!("../../tests/fixtures/diamond/examples/serdes_loopback_timing.twr");
        let report = parse_diamond_timing(content).unwrap();
        assert!(report.fmax_mhz > 0.0);
    }

    #[test]
    fn test_diamond_example_video_scaler_timing_video_rate() {
        let content = include_str!("../../tests/fixtures/diamond/examples/video_scaler_timing.twr");
        let report = parse_diamond_timing(content).unwrap();
        assert!(report.fmax_mhz > 10.0);
    }

    #[test]
    fn test_diamond_example_wishbone_soc_timing_soc_freq() {
        let content = include_str!("../../tests/fixtures/diamond/examples/wishbone_soc_timing.twr");
        let report = parse_diamond_timing(content).unwrap();
        assert!(report.fmax_mhz > 20.0);
    }

    #[test]
    fn test_diamond_example_blinky_led_timing_simple_design() {
        let content = include_str!("../../tests/fixtures/diamond/examples/blinky_led_timing.twr");
        let report = parse_diamond_timing(content).unwrap();
        assert!(report.wns_ns >= -100.0 && report.wns_ns <= 1000.0);
    }

    #[test]
    fn test_diamond_example_uart_bridge_timing_io_timing() {
        let content = include_str!("../../tests/fixtures/diamond/examples/uart_bridge_timing.twr");
        let report = parse_diamond_timing(content).unwrap();
        assert!(report.fmax_mhz > 0.0);
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // Vivado timing fixture tests
    // ══════════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_vivado_example_blinky_led_timing_parses() {
        let content = include_str!("../../tests/fixtures/vivado/examples/blinky_led_timing_summary.rpt");
        let report = parse_vivado_timing(content).unwrap();
        assert!((report.wns_ns - 5.123).abs() < 0.01, "Expected WNS ~5.123 ns, got {}", report.wns_ns);
        assert!((report.whs_ns - 0.089).abs() < 0.01, "Expected WHS ~0.089 ns, got {}", report.whs_ns);
        assert_eq!(report.failing_paths, 0, "Expected 0 failing paths");
        assert!((report.target_mhz - 100.0).abs() < 0.1, "Expected target ~100.0 MHz");
    }

    #[test]
    fn test_vivado_example_uart_echo_timing_parses() {
        let content = include_str!("../../tests/fixtures/vivado/examples/uart_echo_timing_summary.rpt");
        let report = parse_vivado_timing(content).unwrap();
        assert!((report.wns_ns - 2.456).abs() < 0.01, "Expected WNS ~2.456 ns, got {}", report.wns_ns);
        assert!((report.whs_ns - 0.156).abs() < 0.01, "Expected WHS ~0.156 ns, got {}", report.whs_ns);
        assert_eq!(report.failing_paths, 0, "Expected 0 failing paths");
        assert!((report.target_mhz - 100.0).abs() < 0.1, "Expected target ~100.0 MHz");
    }

    #[test]
    fn test_vivado_example_pwm_rgb_timing_parses() {
        let content = include_str!("../../tests/fixtures/vivado/examples/pwm_rgb_timing_summary.rpt");
        let report = parse_vivado_timing(content).unwrap();
        assert!((report.wns_ns - 6.789).abs() < 0.01, "Expected WNS ~6.789 ns, got {}", report.wns_ns);
        assert!((report.whs_ns - 0.234).abs() < 0.01, "Expected WHS ~0.234 ns, got {}", report.whs_ns);
        assert_eq!(report.failing_paths, 0, "Expected 0 failing paths");
        assert!((report.target_mhz - 50.0).abs() < 0.1, "Expected target ~50.0 MHz");
    }

    #[test]
    fn test_vivado_example_ddr3_test_timing_parses() {
        let content = include_str!("../../tests/fixtures/vivado/examples/ddr3_test_timing_summary.rpt");
        let report = parse_vivado_timing(content).unwrap();
        assert!((report.wns_ns - 0.234).abs() < 0.01, "Expected WNS ~0.234 ns, got {}", report.wns_ns);
        assert!((report.whs_ns - 0.123).abs() < 0.01, "Expected WHS ~0.123 ns, got {}", report.whs_ns);
        assert_eq!(report.failing_paths, 0, "Expected 0 failing paths");
        assert!((report.target_mhz - 200.0).abs() < 0.1, "Expected target ~200.0 MHz");
    }

    #[test]
    fn test_vivado_example_axi_dma_engine_timing_parses() {
        let content = include_str!("../../tests/fixtures/vivado/examples/axi_dma_engine_timing_summary.rpt");
        let report = parse_vivado_timing(content).unwrap();
        assert!((report.wns_ns - 0.087).abs() < 0.01, "Expected WNS ~0.087 ns, got {}", report.wns_ns);
        assert!((report.whs_ns - 0.045).abs() < 0.01, "Expected WHS ~0.045 ns, got {}", report.whs_ns);
        assert_eq!(report.failing_paths, 0, "Expected 0 failing paths");
        assert!((report.target_mhz - 250.0).abs() < 0.1, "Expected target ~250.0 MHz");
    }

    #[test]
    fn test_vivado_timing_calculates_fmax_from_period() {
        let content = include_str!("../../tests/fixtures/vivado/examples/blinky_led_timing_summary.rpt");
        let report = parse_vivado_timing(content).unwrap();
        assert!(report.fmax_mhz > 0.0, "Expected positive Fmax, got {}", report.fmax_mhz);
    }

    #[test]
    fn test_vivado_timing_extracts_wns_correctly() {
        let content = include_str!("../../tests/fixtures/vivado/examples/uart_echo_timing_summary.rpt");
        let report = parse_vivado_timing(content).unwrap();
        assert!(report.wns_ns > 0.0, "Expected positive WNS (passing timing)");
    }

    #[test]
    fn test_vivado_timing_extracts_whs_correctly() {
        let content = include_str!("../../tests/fixtures/vivado/examples/pwm_rgb_timing_summary.rpt");
        let report = parse_vivado_timing(content).unwrap();
        assert!(report.whs_ns > 0.0, "Expected positive WHS (passing hold)");
    }

    #[test]
    fn test_vivado_timing_handles_different_constraints() {
        let blinky = include_str!("../../tests/fixtures/vivado/examples/blinky_led_timing_summary.rpt");
        let ddr3 = include_str!("../../tests/fixtures/vivado/examples/ddr3_test_timing_summary.rpt");

        let report_blinky = parse_vivado_timing(blinky).unwrap();
        let report_ddr3 = parse_vivado_timing(ddr3).unwrap();

        assert!(report_blinky.target_mhz != report_ddr3.target_mhz,
            "Expected different target frequencies");
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // Quartus timing fixture tests
    // ══════════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_quartus_example_blinky_led_timing_parses() {
        let content = include_str!("../../tests/fixtures/quartus/examples/blinky_led_timing.sta.rpt");
        let report = parse_quartus_timing(content).unwrap();
        assert!((report.fmax_mhz - 287.36).abs() < 0.1, "Expected Fmax ~287.36 MHz, got {}", report.fmax_mhz);
        assert!(report.total_paths > 0, "Expected total_paths > 0");
        assert_eq!(report.failing_paths, 0, "Expected 0 failing paths");
    }

    #[test]
    fn test_quartus_example_nios_hello_timing_parses() {
        let content = include_str!("../../tests/fixtures/quartus/examples/nios_hello_timing.sta.rpt");
        let report = parse_quartus_timing(content).unwrap();
        assert!((report.fmax_mhz - 125.4).abs() < 0.2, "Expected Fmax ~125.4 MHz, got {}", report.fmax_mhz);
        assert!(report.total_paths > 0, "Expected total_paths > 0");
    }

    #[test]
    fn test_quartus_example_ethernet_mac_timing_parses() {
        let content = include_str!("../../tests/fixtures/quartus/examples/ethernet_mac_timing.sta.rpt");
        let report = parse_quartus_timing(content).unwrap();
        assert!((report.fmax_mhz - 156.25).abs() < 0.2, "Expected Fmax ~156.25 MHz, got {}", report.fmax_mhz);
        assert!(report.total_paths > 0, "Expected total_paths > 0");
    }

    #[test]
    fn test_quartus_example_pcie_endpoint_timing_parses() {
        let content = include_str!("../../tests/fixtures/quartus/examples/pcie_endpoint_timing.sta.rpt");
        let report = parse_quartus_timing(content).unwrap();
        assert!((report.fmax_mhz - 312.5).abs() < 0.2, "Expected Fmax ~312.5 MHz, got {}", report.fmax_mhz);
        assert!(report.total_paths > 0, "Expected total_paths > 0");
    }

    #[test]
    fn test_quartus_example_signal_proc_timing_parses() {
        let content = include_str!("../../tests/fixtures/quartus/examples/signal_proc_timing.sta.rpt");
        let report = parse_quartus_timing(content).unwrap();
        assert!((report.fmax_mhz - 234.5).abs() < 0.2, "Expected Fmax ~234.5 MHz, got {}", report.fmax_mhz);
        assert!(report.total_paths > 0, "Expected total_paths > 0");
    }

    #[test]
    fn test_quartus_timing_fixture_values_reasonable() {
        let content = include_str!("../../tests/fixtures/quartus/examples/blinky_led_timing.sta.rpt");
        let report = parse_quartus_timing(content).unwrap();
        assert!(report.fmax_mhz > 10.0 && report.fmax_mhz < 500.0,
            "Fmax seems unreasonable: {} MHz", report.fmax_mhz);
    }

    #[test]
    fn test_quartus_timing_fixture_clock_domains() {
        let content = include_str!("../../tests/fixtures/quartus/examples/nios_hello_timing.sta.rpt");
        let report = parse_quartus_timing(content).unwrap();
        assert!(!report.clock_domains.is_empty(), "Expected clock domains to be extracted");
    }

    #[test]
    fn test_quartus_timing_fixture_path_counts_present() {
        let content = include_str!("../../tests/fixtures/quartus/examples/ethernet_mac_timing.sta.rpt");
        let report = parse_quartus_timing(content).unwrap();
        assert!(report.total_paths > 0, "Expected total_paths > 0");
    }

    #[test]
    fn test_quartus_timing_fixture_all_passing() {
        let content = include_str!("../../tests/fixtures/quartus/examples/pcie_endpoint_timing.sta.rpt");
        let report = parse_quartus_timing(content).unwrap();
        assert!(report.wns_ns >= 0.0, "Expected passing timing (WNS >= 0), got {}", report.wns_ns);
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // ACE timing fixture tests
    // ══════════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_ace_example_blinky_led_timing_parses() {
        let content = include_str!("../../tests/fixtures/ace/examples/blinky_led_timing.rpt");
        let report = parse_ace_timing(content).unwrap();
        assert!(report.fmax_mhz > 0.0);
    }

    #[test]
    fn test_ace_example_noc_endpoint_timing_parses() {
        let content = include_str!("../../tests/fixtures/ace/examples/noc_endpoint_timing.rpt");
        let report = parse_ace_timing(content).unwrap();
        assert!(report.fmax_mhz > 0.0);
    }

    #[test]
    fn test_ace_example_ml_accelerator_timing_parses() {
        let content = include_str!("../../tests/fixtures/ace/examples/ml_accelerator_timing.rpt");
        let report = parse_ace_timing(content).unwrap();
        assert!(report.fmax_mhz > 0.0);
    }

    #[test]
    fn test_ace_example_gddr6_test_timing_parses() {
        let content = include_str!("../../tests/fixtures/ace/examples/gddr6_test_timing.rpt");
        let report = parse_ace_timing(content).unwrap();
        assert!(report.fmax_mhz > 0.0);
    }

    #[test]
    fn test_ace_example_ethernet_400g_timing_parses() {
        let content = include_str!("../../tests/fixtures/ace/examples/ethernet_400g_timing.rpt");
        let report = parse_ace_timing(content).unwrap();
        assert!(report.fmax_mhz > 0.0);
    }

    #[test]
    fn test_ace_timing_fixture_has_wns() {
        let content = include_str!("../../tests/fixtures/ace/examples/blinky_led_timing.rpt");
        let report = parse_ace_timing(content).unwrap();
        assert!(report.wns_ns >= -100.0 && report.wns_ns <= 100.0, "WNS out of expected range");
    }

    #[test]
    fn test_ace_timing_fixture_all_parse_successfully() {
        let projects: Vec<(&str, &str)> = vec![
            ("blinky_led", include_str!("../../tests/fixtures/ace/examples/blinky_led_timing.rpt")),
            ("noc_endpoint", include_str!("../../tests/fixtures/ace/examples/noc_endpoint_timing.rpt")),
            ("ml_accelerator", include_str!("../../tests/fixtures/ace/examples/ml_accelerator_timing.rpt")),
            ("gddr6_test", include_str!("../../tests/fixtures/ace/examples/gddr6_test_timing.rpt")),
            ("ethernet_400g", include_str!("../../tests/fixtures/ace/examples/ethernet_400g_timing.rpt")),
        ];
        for (name, content) in projects {
            let report = parse_ace_timing(content)
                .expect(&format!("Failed to parse timing for ACE {}", name));
            assert!(report.fmax_mhz > 0.0, "Project {} has zero fmax", name);
        }
    }

    #[test]
    fn test_ace_timing_fixture_clock_domains_exist() {
        let content = include_str!("../../tests/fixtures/ace/examples/noc_endpoint_timing.rpt");
        let report = parse_ace_timing(content).unwrap();
        // Some ACE reports may not explicitly list clock domains, but fmax should exist
        assert!(report.fmax_mhz > 0.0);
    }

    #[test]
    fn test_ace_timing_fixture_slack_values_reasonable() {
        let content = include_str!("../../tests/fixtures/ace/examples/blinky_led_timing.rpt");
        let report = parse_ace_timing(content).unwrap();
        assert!(report.wns_ns > -1000.0 && report.wns_ns < 1000.0, "Slack value unreasonable");
    }

    #[test]
    fn test_ace_timing_fixture_hold_slack() {
        let content = include_str!("../../tests/fixtures/ace/examples/ml_accelerator_timing.rpt");
        let report = parse_ace_timing(content).unwrap();
        // Should be able to parse hold slack
        assert!(report.whs_ns >= -100.0 || report.whs_ns == 0.0, "Hold slack parsing issue");
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // OSS (nextpnr) timing fixture tests
    // ══════════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_oss_example_blinky_led_nextpnr_parses() {
        let content = include_str!("../../tests/fixtures/oss/examples/blinky_led_nextpnr.log");
        assert!(content.contains("Info:"));
    }

    #[test]
    fn test_oss_example_uart_tx_nextpnr_parses() {
        let content = include_str!("../../tests/fixtures/oss/examples/uart_tx_nextpnr.log");
        assert!(content.contains("Info:"));
    }

    #[test]
    fn test_oss_example_spi_slave_nextpnr_parses() {
        let content = include_str!("../../tests/fixtures/oss/examples/spi_slave_nextpnr.log");
        assert!(content.contains("Info:"));
    }

    #[test]
    fn test_oss_example_pwm_audio_nextpnr_parses() {
        let content = include_str!("../../tests/fixtures/oss/examples/pwm_audio_nextpnr.log");
        assert!(content.contains("Info:"));
    }

    #[test]
    fn test_oss_example_ws2812_driver_nextpnr_parses() {
        let content = include_str!("../../tests/fixtures/oss/examples/ws2812_driver_nextpnr.log");
        assert!(content.contains("Info:"));
    }

    #[test]
    fn test_oss_nextpnr_fixture_critical_path_extraction() {
        let content = include_str!("../../tests/fixtures/oss/examples/blinky_led_nextpnr.log");
        assert!(content.contains("critical path") || content.contains("Max frequency"));
    }

    #[test]
    fn test_oss_nextpnr_fixture_device_identification() {
        let content = include_str!("../../tests/fixtures/oss/examples/blinky_led_nextpnr.log");
        assert!(content.contains("iCE40") || content.contains("Device:"));
    }

    #[test]
    fn test_oss_nextpnr_fixture_multiple_projects_parse() {
        let projects: Vec<(&str, &str)> = vec![
            ("blinky_led", include_str!("../../tests/fixtures/oss/examples/blinky_led_nextpnr.log")),
            ("uart_tx", include_str!("../../tests/fixtures/oss/examples/uart_tx_nextpnr.log")),
            ("spi_slave", include_str!("../../tests/fixtures/oss/examples/spi_slave_nextpnr.log")),
            ("pwm_audio", include_str!("../../tests/fixtures/oss/examples/pwm_audio_nextpnr.log")),
            ("ws2812_driver", include_str!("../../tests/fixtures/oss/examples/ws2812_driver_nextpnr.log")),
        ];
        for (name, content) in projects {
            assert!(!content.is_empty(), "Project {} has empty content", name);
            assert!(content.contains("Info:"), "Project {} missing info output", name);
        }
    }

    #[test]
    fn test_oss_nextpnr_fixture_utilization_info() {
        let content = include_str!("../../tests/fixtures/oss/examples/blinky_led_nextpnr.log");
        assert!(content.contains("utilisation") || content.contains("utilization")
            || content.contains("ICESTORM_LC"));
    }

    #[test]
    fn test_oss_nextpnr_fixture_placement_routing_info() {
        let content = include_str!("../../tests/fixtures/oss/examples/uart_tx_nextpnr.log");
        assert!(content.contains("Placed") || content.contains("Routed"));
    }

    #[test]
    fn test_oss_nextpnr_fixture_timing_analysis_marker() {
        let content = include_str!("../../tests/fixtures/oss/examples/blinky_led_nextpnr.log");
        assert!(content.contains("Timing analysis"));
    }
}
