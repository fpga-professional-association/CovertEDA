use crate::backend::BackendResult;
use crate::types::ParReport;
use regex::Regex;

/// Parse a Radiant PAR report (.par file).
/// Extracts routing utilization, placement/routing times, device info.
pub fn parse_radiant_par(content: &str) -> BackendResult<ParReport> {
    let extract_f64 = |pattern: &str| -> f64 {
        Regex::new(pattern)
            .ok()
            .and_then(|re| re.captures(content))
            .and_then(|c| c.get(1))
            .and_then(|m| m.as_str().parse().ok())
            .unwrap_or(0.0)
    };

    let extract_u64 = |pattern: &str| -> u64 {
        Regex::new(pattern)
            .ok()
            .and_then(|re| re.captures(content))
            .and_then(|c| c.get(1))
            .and_then(|m| m.as_str().parse().ok())
            .unwrap_or(0)
    };

    // Routing: "56 routed (100.00%); 0 unrouted."
    let total_connections = extract_u64(r"(\d+)\s+routed\s*\([\d.]+%\);\s*\d+\s+unrouted");
    let unrouted = extract_u64(r"\d+\s+routed\s*\([\d.]+%\);\s*(\d+)\s+unrouted");
    let routing_pct = if total_connections > 0 {
        ((total_connections - unrouted) as f64 / total_connections as f64) * 100.0
    } else {
        // Try direct extraction: "56 routed (100.00%)"
        extract_f64(r"\d+\s+routed\s*\(([\d.]+)%\)")
    };

    // SLICE utilization: "SLICE              6/16128        <1% used"
    let slice_used = extract_u64(r"SLICE\s+(\d+)/\d+");
    let slice_total = extract_u64(r"SLICE\s+\d+/(\d+)");

    // Placement time: "Total Placer CPU time: 8 secs"
    let placement_time_secs = extract_f64(r"Total Placer (?:CPU|REAL) time[:\s]+([\d.]+)\s*secs?");

    // Router time: "Total Router CPU time 3 secs"
    let routing_time_secs = extract_f64(r"Total Router (?:CPU|REAL) time[:\s]+([\d.]+)\s*secs?");

    // Total time: "Total REAL Time: 20 secs"
    let total_time_secs = extract_f64(r"Total REAL Time[:\s]+([\d.]+)\s*secs?");

    // Peak memory: "Peak Memory Usage: 588.76 MB"
    let peak_memory_mb = extract_f64(r"Peak Memory Usage[:\s]+([\d.]+)\s*MB");

    // Number of signals/connections
    let signals = extract_u64(r"Number of Signals:\s*(\d+)");
    let connections = extract_u64(r"Number of Connections:\s*(\d+)");

    // PAR_SUMMARY errors
    let par_errors = extract_u64(r"PAR_SUMMARY::Number of errors\s*=\s*(\d+)");

    // Run status
    let run_status = Regex::new(r"PAR_SUMMARY::Run status\s*=\s*(\w+)")
        .ok()
        .and_then(|re| re.captures(content))
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    Ok(ParReport {
        routing_pct,
        slice_used,
        slice_total,
        signals,
        connections,
        placement_time_secs,
        routing_time_secs,
        total_time_secs,
        peak_memory_mb,
        par_errors: par_errors as u32,
        run_status,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_radiant_par_with_fixture() {
        let content = include_str!("../../tests/fixtures/radiant/par.rpt");
        let report = parse_radiant_par(content).unwrap();
        // Fixture should parse without errors
        assert!(report.routing_pct >= 0.0);
    }

    #[test]
    fn test_parse_radiant_par_routing_percentage() {
        let content = "56 routed (100.00%); 0 unrouted.";
        let report = parse_radiant_par(content).unwrap();
        assert!((report.routing_pct - 100.0).abs() < 0.01);
    }

    #[test]
    fn test_parse_radiant_par_slice_usage() {
        let content = "SLICE              6/16128        <1% used";
        let report = parse_radiant_par(content).unwrap();
        assert_eq!(report.slice_used, 6);
        assert_eq!(report.slice_total, 16128);
    }

    #[test]
    fn test_parse_radiant_par_peak_memory() {
        let content = "Peak Memory Usage: 588.76 MB";
        let report = parse_radiant_par(content).unwrap();
        assert!((report.peak_memory_mb - 588.76).abs() < 0.01);
    }

    #[test]
    fn test_parse_radiant_par_run_status() {
        let content = "PAR_SUMMARY::Run status = completed";
        let report = parse_radiant_par(content).unwrap();
        assert_eq!(report.run_status, "completed");
    }

    #[test]
    fn test_parse_radiant_par_empty() {
        let report = parse_radiant_par("").unwrap();
        assert_eq!(report.routing_pct, 0.0);
        assert_eq!(report.slice_used, 0);
        assert_eq!(report.run_status, "Unknown");
    }
}
