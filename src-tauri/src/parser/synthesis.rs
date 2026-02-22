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

/// Parse a Yosys synthesis log (synth.log) for resource statistics.
/// Extracts LUT/FF/BRAM/DSP counts from the "Printing statistics." section
/// and cell-type summary lines.
pub fn parse_yosys_synthesis(content: &str) -> BackendResult<SynthesisReport> {
    let mut lut_count: u64 = 0;
    let mut reg_count: u64 = 0;
    let mut ram_count: u64 = 0;
    let mut dsp_count: u64 = 0;

    // Count errors and warnings
    let mut errors: u32 = 0;
    let mut warnings: u32 = 0;

    // Track if we're in the "Printing statistics." section
    let mut in_stats = false;
    let mut stats_has_data = false; // Track if we've seen any data in the current stats section
    let mut last_stats_lut: u64 = 0;
    let mut last_stats_ff: u64 = 0;
    let mut last_stats_ram: u64 = 0;
    let mut last_stats_dsp: u64 = 0;

    // Match cell count lines: "     TRELLIS_SLICE   48" or "   $lut  12"
    // Applied to the raw (untrimmed) line to match leading whitespace
    let cell_count_re = Regex::new(r"^\s+(\S+)\s+(\d+)\s*$").unwrap();

    for line in content.lines() {
        let trimmed = line.trim();

        // Count warnings/errors
        if trimmed.starts_with("Warning:") || trimmed.contains("] Warning:") {
            warnings += 1;
        } else if trimmed.starts_with("ERROR:") || trimmed.starts_with("Error:") {
            errors += 1;
        }

        // Detect stats section — Yosys prints "Printing statistics." before each summary
        if trimmed == "Printing statistics." {
            in_stats = true;
            stats_has_data = false;
            last_stats_lut = 0;
            last_stats_ff = 0;
            last_stats_ram = 0;
            last_stats_dsp = 0;
            continue;
        }

        if in_stats {
            // Empty line after data or new section ends stats
            // But skip empty lines before any data in the section
            if trimmed.is_empty() {
                if stats_has_data {
                    lut_count = last_stats_lut;
                    reg_count = last_stats_ff;
                    ram_count = last_stats_ram;
                    dsp_count = last_stats_dsp;
                    in_stats = false;
                }
                continue;
            }
            if trimmed.starts_with("--") && !trimmed.contains("$") {
                lut_count = last_stats_lut;
                reg_count = last_stats_ff;
                ram_count = last_stats_ram;
                dsp_count = last_stats_dsp;
                in_stats = false;
                continue;
            }

            stats_has_data = true;

            // Parse cell lines like "   $lut              42"
            // Use the raw line (not trimmed) so the leading-whitespace regex matches
            if let Some(caps) = cell_count_re.captures(line) {
                let cell_name = caps.get(1).unwrap().as_str();
                let count: u64 = caps.get(2).unwrap().as_str().parse().unwrap_or(0);
                let cell_lower = cell_name.to_lowercase();

                // LUT variants
                if cell_lower.contains("lut")
                    || cell_lower == "trellis_slice"
                    || cell_lower == "sb_lut4"
                    || cell_lower == "lut4"
                    || cell_lower == "lut5"
                    || cell_lower == "lut6"
                    || cell_lower.starts_with("$lut")
                {
                    last_stats_lut += count;
                }
                // FF variants
                else if cell_lower.contains("dff")
                    || cell_lower.contains("ff")
                    || cell_lower == "trellis_ff"
                    || cell_lower == "sb_dff"
                    || cell_lower == "sb_dffe"
                    || cell_lower == "sb_dffsr"
                    || cell_lower == "sb_dffss"
                    || cell_lower.starts_with("$dff")
                    || cell_lower.starts_with("$sdff")
                    || cell_lower.starts_with("$adff")
                {
                    last_stats_ff += count;
                }
                // RAM/BRAM variants
                else if cell_lower.contains("bram")
                    || cell_lower.contains("ebr")
                    || cell_lower.contains("dp16kd")
                    || cell_lower.contains("pdp16kd")
                    || cell_lower.contains("sp16kd")
                    || cell_lower == "sb_ram40_4k"
                    || cell_lower == "sb_ram256x16"
                    || cell_lower.starts_with("$mem")
                {
                    last_stats_ram += count;
                }
                // DSP variants
                else if cell_lower.contains("dsp")
                    || cell_lower.contains("mult18")
                    || cell_lower.contains("alu54")
                    || cell_lower.contains("mult9")
                    || cell_lower.starts_with("$mul")
                {
                    last_stats_dsp += count;
                }
            }

            // "Number of wires:", "Number of cells:", etc. are summary lines
            // that appear before the individual cell breakdown — skip them.
        }
    }

    // If we ended while still in stats, commit
    if in_stats {
        lut_count = last_stats_lut;
        reg_count = last_stats_ff;
        ram_count = last_stats_ram;
        dsp_count = last_stats_dsp;
    }

    Ok(SynthesisReport {
        lut_count,
        reg_count,
        ram_count,
        dsp_count,
        fmax_estimate_mhz: 0.0, // Yosys doesn't provide timing estimates
        cpu_time_secs: 0.0,
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

    // ── Yosys synthesis parser tests ──

    #[test]
    fn test_parse_yosys_ecp5_synthesis() {
        let content = r#"
-- Running command `synth_ecp5 -top blinky -json build/out.json' --

Printing statistics.

   Number of wires:                 42
   Number of wire bits:            128
   Number of cells:                 65
     TRELLIS_SLICE                  48
     TRELLIS_FF                     16
     DP16KD                          1

"#;
        let report = parse_yosys_synthesis(content).unwrap();
        assert_eq!(report.lut_count, 48); // TRELLIS_SLICE
        assert_eq!(report.reg_count, 16); // TRELLIS_FF
        assert_eq!(report.ram_count, 1);  // DP16KD
        assert_eq!(report.errors, 0);
    }

    #[test]
    fn test_parse_yosys_ice40_synthesis() {
        let content = r#"
Printing statistics.

   Number of wires:                 20
   Number of wire bits:             64
   Number of cells:                 30
     SB_LUT4                        24
     SB_DFF                          6

"#;
        let report = parse_yosys_synthesis(content).unwrap();
        assert_eq!(report.lut_count, 24); // SB_LUT4
        assert_eq!(report.reg_count, 6);  // SB_DFF
    }

    #[test]
    fn test_parse_yosys_generic_cells() {
        let content = r#"
Printing statistics.

   Number of wires:                 10
   Number of cells:                 20
     $lut                           12
     $dff                            8

"#;
        let report = parse_yosys_synthesis(content).unwrap();
        assert_eq!(report.lut_count, 12);
        assert_eq!(report.reg_count, 8);
    }

    #[test]
    fn test_parse_yosys_with_warnings() {
        let content = r#"
Warning: Module foo has no top-level ports
Warning: Unused signal bar
Printing statistics.

   Number of cells:                 10
     $lut                           10

"#;
        let report = parse_yosys_synthesis(content).unwrap();
        assert_eq!(report.warnings, 2);
        assert_eq!(report.lut_count, 10);
    }

    #[test]
    fn test_parse_yosys_multiple_stats_sections() {
        // Yosys prints stats after each pass; we want the last one
        let content = r#"
Printing statistics.

   Number of cells:                 50
     $lut                           50

Printing statistics.

   Number of cells:                 30
     TRELLIS_SLICE                  25
     TRELLIS_FF                      5

"#;
        let report = parse_yosys_synthesis(content).unwrap();
        // Should use the last stats section
        assert_eq!(report.lut_count, 25);
        assert_eq!(report.reg_count, 5);
    }

    #[test]
    fn test_parse_yosys_empty() {
        let report = parse_yosys_synthesis("").unwrap();
        assert_eq!(report.lut_count, 0);
        assert_eq!(report.reg_count, 0);
        assert_eq!(report.ram_count, 0);
        assert_eq!(report.dsp_count, 0);
    }
}
