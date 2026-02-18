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
    let dsp_count = extract_u64(r"(?i)(?:Number of|Total)\s+(?:DSPs?|MULT18X18)\s*[:=]\s*(\d+)");

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
