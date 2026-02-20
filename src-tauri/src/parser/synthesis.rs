use crate::backend::BackendResult;
use crate::types::SynthesisReport;
use regex::Regex;

/// Parse a Radiant synthesis report (.srr file).
/// Extracts LUT count, register count, RAM usage, warnings/errors.
pub fn parse_radiant_synthesis(content: &str) -> BackendResult<SynthesisReport> {
    let extract_u64 = |pattern: &str| -> u64 {
        Regex::new(pattern)
            .ok()
            .and_then(|re| re.captures(content))
            .and_then(|c| c.get(1))
            .and_then(|m| m.as_str().parse().ok())
            .unwrap_or(0)
    };

    let lut_count = extract_u64(r"(?i)(?:Number of|Total)\s+LUT4s?\s*[:=]\s*(\d+)");
    let reg_count = extract_u64(r"(?i)(?:Number of|Total)\s+(?:registers?|FFs?|DFFs?)\s*[:=]\s*(\d+)");
    let ram_count = extract_u64(r"(?i)(?:Number of|Total)\s+(?:block\s*RAMs?|EBRs?)\s*[:=]\s*(\d+)");
    let dsp_count = extract_u64(r"(?i)(?:Number of|Total)\s+(?:DSP\s*(?:blocks?|slices?)?|DSPs?|MULT18X18)\s*[:=]\s*(\d+)");

    // Count errors and warnings
    let error_re = Regex::new(r"(?i)^.*\berror\b").unwrap();
    let warn_re = Regex::new(r"(?i)^.*\bwarning\b").unwrap();
    let errors = content.lines().filter(|l| error_re.is_match(l)).count() as u32;
    let warnings = content.lines().filter(|l| warn_re.is_match(l)).count() as u32;

    // Try to extract timing estimate
    let fmax_est = Regex::new(r"(?i)(?:maximum|estimated)\s+(?:frequency|clock)\s*[:=]?\s*([\d.]+)\s*MHz")
        .ok()
        .and_then(|re| re.captures(content))
        .and_then(|c| c.get(1))
        .and_then(|m| m.as_str().parse().ok())
        .unwrap_or(0.0);

    // Extract CPU time
    let cpu_time = Regex::new(r"(?i)Total\s+CPU\s+Time[:\s]+([\d.]+)\s*secs?")
        .ok()
        .and_then(|re| re.captures(content))
        .and_then(|c| c.get(1))
        .and_then(|m| m.as_str().parse().ok())
        .unwrap_or(0.0);

    Ok(SynthesisReport {
        lut_count,
        reg_count,
        ram_count,
        dsp_count,
        fmax_estimate_mhz: fmax_est,
        cpu_time_secs: cpu_time,
        errors,
        warnings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_radiant_synthesis_with_data() {
        let content = r#"
Number of LUT4s: 120
Number of registers: 80
Number of block RAMs: 2
Number of DSP blocks: 1
Estimated frequency: 150.0 MHz
Total CPU Time: 5.2 secs
WARNING: some warning
WARNING: another warning
"#;
        let report = parse_radiant_synthesis(content).unwrap();
        assert_eq!(report.lut_count, 120);
        assert_eq!(report.reg_count, 80);
        assert_eq!(report.ram_count, 2);
        assert_eq!(report.dsp_count, 1);
        assert!((report.fmax_estimate_mhz - 150.0).abs() < 0.01);
        assert!((report.cpu_time_secs - 5.2).abs() < 0.01);
        assert_eq!(report.warnings, 2);
        assert_eq!(report.errors, 0);
    }

    #[test]
    fn test_parse_radiant_synthesis_empty() {
        let report = parse_radiant_synthesis("").unwrap();
        assert_eq!(report.lut_count, 0);
        assert_eq!(report.reg_count, 0);
        assert_eq!(report.ram_count, 0);
        assert_eq!(report.dsp_count, 0);
        assert_eq!(report.fmax_estimate_mhz, 0.0);
        assert_eq!(report.errors, 0);
        assert_eq!(report.warnings, 0);
    }

    #[test]
    fn test_parse_radiant_synthesis_counts_errors() {
        let content = "ERROR: synthesis failed\nERROR: another error\n";
        let report = parse_radiant_synthesis(content).unwrap();
        assert_eq!(report.errors, 2);
    }
}
