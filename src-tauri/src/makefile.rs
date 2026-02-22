use crate::backend::oss::OssArch;
use std::collections::HashMap;

/// Parsed configuration from a Makefile.
#[derive(Debug, Clone, Default)]
pub struct MakefileConfig {
    pub device: String,
    pub package: String,
    pub top_module: String,
    pub sources: Vec<String>,
    pub constraints: Vec<String>,
    pub build_dir: String,
    pub freq: String,
    pub yosys_flags: Vec<String>,
    pub nextpnr_flags: Vec<String>,
    pub packer_flags: Vec<String>,
    pub extra_vars: HashMap<String, String>,
}

/// Result of importing a Makefile into CovertEDA.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MakefileImportResult {
    pub device: String,
    pub top_module: String,
    pub source_patterns: Vec<String>,
    pub constraint_files: Vec<String>,
    pub build_dir: String,
    pub build_options: HashMap<String, String>,
    pub warnings: Vec<String>,
    pub summary: Vec<String>,
}

/// Parse a Makefile and extract configuration.
pub fn parse_makefile(content: &str) -> MakefileConfig {
    let mut vars: HashMap<String, String> = HashMap::new();

    // Join backslash-continuation lines
    let joined = content.replace("\\\n", " ").replace("\\\r\n", " ");

    for line in joined.lines() {
        let trimmed = line.trim();
        // Skip comments and empty lines
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        // Match variable assignments: VAR = val, VAR := val, VAR ?= val, VAR += val
        if let Some((key, op, val)) = parse_assignment(trimmed) {
            let val = val.trim().to_string();
            match op {
                "+=" => {
                    let existing = vars.get(&key).cloned().unwrap_or_default();
                    if existing.is_empty() {
                        vars.insert(key, val);
                    } else {
                        vars.insert(key, format!("{} {}", existing, val));
                    }
                }
                "?=" => {
                    vars.entry(key).or_insert(val);
                }
                _ => {
                    // = and := both do simple assignment
                    vars.insert(key, val);
                }
            }
        }
    }

    // Resolve simple $(VAR) / ${VAR} references (single pass)
    let resolved = resolve_vars(&vars);

    let mut config = MakefileConfig::default();

    // Map known variable names to struct fields
    for (key, val) in &resolved {
        let upper = key.to_uppercase();
        match upper.as_str() {
            "DEVICE" | "FPGA_DEVICE" => config.device = val.clone(),
            "PACKAGE" | "FPGA_PACKAGE" => config.package = val.clone(),
            "TOP" | "TOP_MODULE" | "TOPLEVEL" => config.top_module = val.clone(),
            "SOURCES" | "VERILOG_FILES" | "SRC" | "SRCS" => {
                config.sources = split_values(val);
            }
            "CONSTRAINTS" | "PCF" | "LPF" | "CST" | "PDC" => {
                config.constraints = split_values(val);
            }
            "BUILD_DIR" | "BUILDDIR" => config.build_dir = val.clone(),
            "FREQ" | "FREQUENCY" | "CLK_FREQ" => config.freq = val.clone(),
            "YOSYS_FLAGS" | "SYNTH_FLAGS" => {
                config.yosys_flags = split_values(val);
            }
            "NEXTPNR_FLAGS" | "PNR_FLAGS" => {
                config.nextpnr_flags = split_values(val);
            }
            "PACKER_FLAGS" | "PACK_FLAGS" => {
                config.packer_flags = split_values(val);
            }
            "SEED" => {
                config.nextpnr_flags.push(format!("--seed {}", val));
            }
            _ => {
                config.extra_vars.insert(key.clone(), val.clone());
            }
        }
    }

    config
}

/// Convert a MakefileConfig into a MakefileImportResult for the frontend.
pub fn makefile_config_to_import_result(config: &MakefileConfig) -> MakefileImportResult {
    let mut build_options: HashMap<String, String> = HashMap::new();
    let mut warnings: Vec<String> = Vec::new();
    let mut summary: Vec<String> = Vec::new();

    // Combine device + package
    let device = if config.package.is_empty() {
        config.device.clone()
    } else if config.device.contains(&config.package) {
        config.device.clone()
    } else {
        format!("{}-{}", config.device, config.package)
    };

    if !device.is_empty() {
        summary.push(format!("Device: {}", device));
    }
    if !config.top_module.is_empty() {
        summary.push(format!("Top module: {}", config.top_module));
    }
    if !config.freq.is_empty() {
        build_options.insert("pnr_freq".into(), config.freq.clone());
        summary.push(format!("Target frequency: {} MHz", config.freq));
    }

    // Parse Yosys flags into build options
    for flag in &config.yosys_flags {
        match flag.as_str() {
            "-noflatten" => { build_options.insert("syn_noflatten".into(), "true".into()); }
            "-nowidelut" => { build_options.insert("syn_nowidelut".into(), "true".into()); }
            "-noabc9" => { build_options.insert("syn_noabc9".into(), "true".into()); }
            "-abc2" => { build_options.insert("syn_abc2".into(), "true".into()); }
            "-dff" => { build_options.insert("syn_dff".into(), "true".into()); }
            "-retime" => { build_options.insert("syn_retime".into(), "true".into()); }
            "-nobram" => { build_options.insert("syn_nobram".into(), "true".into()); }
            "-nolutram" => { build_options.insert("syn_nolutram".into(), "true".into()); }
            "-nodsp" => { build_options.insert("syn_nodsp".into(), "true".into()); }
            "-noccu2" => { build_options.insert("syn_noccu2".into(), "true".into()); }
            "-nodffe" => { build_options.insert("syn_nodffe".into(), "true".into()); }
            "-no-rw-check" => { build_options.insert("syn_no_rw_check".into(), "true".into()); }
            other => {
                if other.contains("$(shell") || other.contains("${shell") {
                    warnings.push(format!("Unsupported $(shell ...) in yosys flags: {}", other));
                } else if !other.starts_with('-') {
                    // Not a flag, probably a file or something else
                } else {
                    warnings.push(format!("Unrecognized yosys flag: {}", other));
                }
            }
        }
    }

    // Parse nextpnr flags into build options
    let mut i = 0;
    let flags = &config.nextpnr_flags;
    while i < flags.len() {
        let flag = &flags[i];
        match flag.as_str() {
            "--seed" => {
                if let Some(val) = flags.get(i + 1) {
                    build_options.insert("pnr_seed".into(), val.clone());
                    i += 1;
                }
            }
            "--freq" => {
                if let Some(val) = flags.get(i + 1) {
                    build_options.insert("pnr_freq".into(), val.clone());
                    i += 1;
                }
            }
            "--placer" => {
                if let Some(val) = flags.get(i + 1) {
                    build_options.insert("pnr_placer".into(), val.clone());
                    i += 1;
                }
            }
            "--router" => {
                if let Some(val) = flags.get(i + 1) {
                    build_options.insert("pnr_router".into(), val.clone());
                    i += 1;
                }
            }
            "--threads" => {
                if let Some(val) = flags.get(i + 1) {
                    build_options.insert("pnr_threads".into(), val.clone());
                    i += 1;
                }
            }
            "--no-tmdriv" => { build_options.insert("pnr_no_tmdriv".into(), "true".into()); }
            "--timing-allow-fail" => { build_options.insert("pnr_timing_allow_fail".into(), "true".into()); }
            "--randomize-seed" => { build_options.insert("pnr_randomize_seed".into(), "true".into()); }
            "--parallel-refine" => { build_options.insert("pnr_parallel_refine".into(), "true".into()); }
            "--tmg-ripup" => { build_options.insert("pnr_tmg_ripup".into(), "true".into()); }
            "--no-promote-globals" => { build_options.insert("pnr_no_promote_globals".into(), "true".into()); }
            "--detailed-timing-report" => { build_options.insert("pnr_detailed_timing".into(), "true".into()); }
            "--lpf-allow-unconstrained" => { build_options.insert("pnr_lpf_allow_unconstrained".into(), "true".into()); }
            "--pcf-allow-unconstrained" => { build_options.insert("pnr_pcf_allow_unconstrained".into(), "true".into()); }
            "--quiet" => { build_options.insert("pnr_verbosity".into(), "quiet".into()); }
            "--verbose" => { build_options.insert("pnr_verbosity".into(), "verbose".into()); }
            other => {
                if other.contains("$(") || other.contains("${") {
                    warnings.push(format!("Unsupported variable reference in nextpnr flags: {}", other));
                } else if other.starts_with("--") && !is_device_flag(other) {
                    warnings.push(format!("Unrecognized nextpnr flag: {}", other));
                }
            }
        }
        i += 1;
    }

    // Convert source patterns: $(wildcard src/*.v) → src/*.v
    let source_patterns: Vec<String> = config.sources.iter().map(|s| {
        if let Some(inner) = extract_wildcard(s) {
            inner
        } else {
            s.clone()
        }
    }).collect();

    let constraint_files: Vec<String> = config.constraints.iter().map(|s| {
        if let Some(inner) = extract_wildcard(s) {
            inner
        } else {
            s.clone()
        }
    }).collect();

    if !source_patterns.is_empty() {
        summary.push(format!("Sources: {}", source_patterns.join(", ")));
    }
    if !constraint_files.is_empty() {
        summary.push(format!("Constraints: {}", constraint_files.join(", ")));
    }
    if !build_options.is_empty() {
        summary.push(format!("Build options imported: {}", build_options.len()));
    }

    MakefileImportResult {
        device,
        top_module: config.top_module.clone(),
        source_patterns,
        constraint_files,
        build_dir: if config.build_dir.is_empty() { "build".into() } else { config.build_dir.clone() },
        build_options,
        warnings,
        summary,
    }
}

/// Generate a portable Makefile from project settings.
pub fn generate_makefile(
    device: &str,
    top_module: &str,
    sources: &[String],
    constraints: &[String],
    build_dir: &str,
    build_options: &HashMap<String, String>,
) -> String {
    let arch = OssArch::from_device(device);
    let synth_cmd = arch.synth_command();
    let nextpnr_bin = arch.nextpnr_bin();
    let packer_bin = arch.packer_bin();
    let constraint_ext = arch.constraint_ext();
    let pnr_output_ext = arch.pnr_output_ext();
    let bitstream_ext = arch.bitstream_ext();

    let opt = |key: &str| -> String {
        build_options.get(key).cloned().unwrap_or_default()
    };

    // Source files default
    let src_str = if sources.is_empty() {
        "$(wildcard src/*.v) $(wildcard src/*.sv)".to_string()
    } else {
        sources.join(" ")
    };

    // Constraint files default
    let constr_str = if constraints.is_empty() {
        format!("$(wildcard constraints/*{})", constraint_ext)
    } else {
        constraints.join(" ")
    };

    let build_dir_str = if build_dir.is_empty() { "build" } else { build_dir };

    // Build Yosys synth flags
    let mut synth_flags = Vec::new();
    synth_flags.push(format!("-top $(TOP)"));
    synth_flags.push("-json $(BUILD_DIR)/out.json".to_string());
    for (key, opt_flag) in &[
        ("syn_noflatten", "-noflatten"),
        ("syn_nowidelut", "-nowidelut"),
        ("syn_noabc9", "-noabc9"),
        ("syn_abc2", "-abc2"),
        ("syn_dff", "-dff"),
        ("syn_retime", "-retime"),
        ("syn_nobram", "-nobram"),
        ("syn_nolutram", "-nolutram"),
        ("syn_nodsp", "-nodsp"),
        ("syn_noccu2", "-noccu2"),
        ("syn_nodffe", "-nodffe"),
        ("syn_no_rw_check", "-no-rw-check"),
    ] {
        if opt(key) == "true" {
            synth_flags.push(opt_flag.to_string());
        }
    }
    let synth_flags_str = synth_flags.join(" ");

    // Build nextpnr flags
    let mut pnr_flags = Vec::new();
    let freq = opt("pnr_freq");
    if !freq.is_empty() {
        pnr_flags.push(format!("--freq {}", freq));
    }
    let seed = opt("pnr_seed");
    if !seed.is_empty() {
        pnr_flags.push(format!("--seed {}", seed));
    }
    let placer = opt("pnr_placer");
    if !placer.is_empty() {
        pnr_flags.push(format!("--placer {}", placer));
    }
    let router = opt("pnr_router");
    if !router.is_empty() {
        pnr_flags.push(format!("--router {}", router));
    }
    let threads = opt("pnr_threads");
    if !threads.is_empty() {
        pnr_flags.push(format!("--threads {}", threads));
    }
    for (key, flag) in &[
        ("pnr_no_tmdriv", "--no-tmdriv"),
        ("pnr_timing_allow_fail", "--timing-allow-fail"),
        ("pnr_randomize_seed", "--randomize-seed"),
        ("pnr_parallel_refine", "--parallel-refine"),
        ("pnr_tmg_ripup", "--tmg-ripup"),
        ("pnr_no_promote_globals", "--no-promote-globals"),
        ("pnr_detailed_timing", "--detailed-timing-report"),
    ] {
        if opt(key) == "true" {
            pnr_flags.push(flag.to_string());
        }
    }
    let extra_pnr_flags = if pnr_flags.is_empty() {
        String::new()
    } else {
        format!(" {}", pnr_flags.join(" "))
    };

    // Device flags for nextpnr
    let device_flags = match arch {
        OssArch::Ecp5 => {
            let (size, package, speed) = crate::backend::oss::OssBackend::parse_ecp5_device_pub(device);
            format!("--{} --package {} --speed {}", size, package, speed)
        }
        OssArch::Ice40 => {
            let (variant, package) = crate::backend::oss::OssBackend::parse_ice40_device_pub(device);
            format!("{} {}", variant, package)
        }
        OssArch::Gowin => format!("--uarch gowin --device {}", device),
        OssArch::Nexus => {
            let parts: Vec<&str> = device.split('-').collect();
            if parts.len() >= 3 {
                format!("--device {}-{} --package {}", parts[0], parts[1], parts[2])
            } else {
                format!("--device {}", device)
            }
        }
        OssArch::GateMate => format!("--uarch gatemate --device {}", device),
        OssArch::MachXO2 => format!("--device {}", device),
    };

    // Constraint flag for nextpnr
    let constr_flag = match arch {
        OssArch::Ecp5 | OssArch::MachXO2 => "--lpf",
        OssArch::Ice40 => "--pcf",
        OssArch::Gowin => "--cst",
        OssArch::Nexus => "--pdc",
        OssArch::GateMate => "--ccf",
    };

    // PnR output flag
    let pnr_out_flag = match arch {
        OssArch::Ecp5 | OssArch::MachXO2 => format!("--textcfg $(BUILD_DIR)/out.{}", pnr_output_ext),
        OssArch::Ice40 => format!("--asc $(BUILD_DIR)/out.{}", pnr_output_ext),
        OssArch::Gowin => "--write $(BUILD_DIR)/out_pnr.json".to_string(),
        OssArch::Nexus => format!("--fasm $(BUILD_DIR)/out.{}", pnr_output_ext),
        OssArch::GateMate => "--write $(BUILD_DIR)/out_pnr.json".to_string(),
    };

    // Pack command
    let pack_cmd = match arch {
        OssArch::Ecp5 | OssArch::MachXO2 => {
            let mut flags = vec![
                format!("$(BUILD_DIR)/out.{}", pnr_output_ext),
                format!("--bit $(BUILD_DIR)/out.{}", bitstream_ext),
            ];
            if opt("bit_compress") != "false" {
                flags.push("--compress".to_string());
            }
            let spi = opt("bit_spimode");
            if !spi.is_empty() && spi != "Default" {
                flags.push(format!("--spimode {}", spi));
            }
            if opt("bit_svf") == "true" {
                flags.push("--svf $(BUILD_DIR)/out.svf".to_string());
            }
            format!("\t$(PACKER) {}", flags.join(" "))
        }
        OssArch::Ice40 => {
            format!("\t$(PACKER) $(BUILD_DIR)/out.asc $(BUILD_DIR)/out.bin")
        }
        OssArch::Gowin => {
            format!("\t$(PACKER) -o $(BUILD_DIR)/out.fs $(BUILD_DIR)/out_pnr.json")
        }
        OssArch::Nexus => {
            format!("\t$(PACKER) bitstream $(BUILD_DIR)/out.fasm $(BUILD_DIR)/out.bit")
        }
        OssArch::GateMate => {
            "\t@echo 'GateMate bitstream generated by P&R tool'\n\tcp $(BUILD_DIR)/out_00.cfg.bit $(BUILD_DIR)/out.bit 2>/dev/null || true".to_string()
        }
    };

    // Programming command
    let prog_cmd = match arch {
        OssArch::Ecp5 | OssArch::MachXO2 => {
            format!("\topenFPGALoader --board $(BOARD) $(BUILD_DIR)/out.{}", bitstream_ext)
        }
        OssArch::Ice40 => {
            "\ticeprog $(BUILD_DIR)/out.bin".to_string()
        }
        OssArch::Gowin => {
            "\topenFPGALoader -b $(BOARD) $(BUILD_DIR)/out.fs".to_string()
        }
        OssArch::Nexus => {
            format!("\topenFPGALoader --board $(BOARD) $(BUILD_DIR)/out.{}", bitstream_ext)
        }
        OssArch::GateMate => {
            "\topenFPGALoader --board $(BOARD) $(BUILD_DIR)/out.bit".to_string()
        }
    };

    format!(
        r#"# Generated by CovertEDA — portable OSS CAD Suite Makefile
# Architecture: {synth_cmd}
# Edit variables below to customize your build

# ── Configuration ──
DEVICE   ?= {device}
TOP      ?= {top_module}
SOURCES  ?= {src_str}
CONSTRAINTS ?= {constr_str}
BUILD_DIR ?= {build_dir_str}
BOARD    ?= # Set your board name for programming

# ── Tools ──
YOSYS    ?= yosys
NEXTPNR  ?= {nextpnr_bin}
PACKER   ?= {packer_bin}

# ── Targets ──
.PHONY: all synth pnr pack prog clean

all: pack

synth: $(BUILD_DIR)/out.json
pnr: $(BUILD_DIR)/out.{pnr_output_ext}
pack: $(BUILD_DIR)/out.{bitstream_ext}

$(BUILD_DIR)/out.json: $(SOURCES)
	@mkdir -p $(BUILD_DIR)
	$(YOSYS) -p "{synth_cmd} {synth_flags_str}" $(SOURCES)

$(BUILD_DIR)/out.{pnr_output_ext}: $(BUILD_DIR)/out.json $(CONSTRAINTS)
	$(NEXTPNR) {device_flags} \
	  --json $(BUILD_DIR)/out.json \
	  {constr_flag} $(CONSTRAINTS) \
	  {pnr_out_flag} \
	  --report $(BUILD_DIR)/report.json{extra_pnr_flags}

$(BUILD_DIR)/out.{bitstream_ext}: $(BUILD_DIR)/out.{pnr_output_ext}
{pack_cmd}

prog: $(BUILD_DIR)/out.{bitstream_ext}
{prog_cmd}

clean:
	rm -rf $(BUILD_DIR)
"#
    )
}

// ── Internal helpers ──

/// Parse a Makefile assignment line into (key, operator, value).
fn parse_assignment(line: &str) -> Option<(String, &'static str, String)> {
    // Try each operator in order (longest first to avoid misparse)
    for op in &[":=", "?=", "+=", "="] {
        if let Some(pos) = line.find(op) {
            let key = line[..pos].trim().to_string();
            if key.is_empty() || key.contains(' ') || key.contains('\t') {
                continue;
            }
            let val = line[pos + op.len()..].to_string();
            return Some((key, op, val));
        }
    }
    None
}

/// Resolve $(VAR) and ${VAR} references in variable values (single pass).
fn resolve_vars(vars: &HashMap<String, String>) -> HashMap<String, String> {
    let mut resolved = HashMap::new();
    for (key, val) in vars {
        let mut result = val.clone();
        // Resolve $(VAR) patterns
        for (ref_key, ref_val) in vars {
            let patterns = [
                format!("$({})", ref_key),
                format!("${{{}}}", ref_key),
            ];
            for pat in &patterns {
                result = result.replace(pat, ref_val);
            }
        }
        resolved.insert(key.clone(), result);
    }
    resolved
}

/// Split a value string into individual items, keeping $(...)  groups together.
fn split_values(val: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut chars = val.chars().peekable();
    let mut current = String::new();
    let mut paren_depth = 0;

    while let Some(ch) = chars.next() {
        if ch == '$' {
            if let Some(&next) = chars.peek() {
                if next == '(' {
                    paren_depth += 1;
                    current.push(ch);
                    current.push(chars.next().unwrap());
                    continue;
                }
            }
            current.push(ch);
        } else if ch == ')' && paren_depth > 0 {
            paren_depth -= 1;
            current.push(ch);
            if paren_depth == 0 {
                // End of $(...)
                let token = current.trim().to_string();
                if !token.is_empty() {
                    result.push(token);
                }
                current.clear();
            }
        } else if (ch == ' ' || ch == '\t') && paren_depth == 0 {
            let token = current.trim().to_string();
            if !token.is_empty() {
                result.push(token);
            }
            current.clear();
        } else {
            current.push(ch);
        }
    }
    let token = current.trim().to_string();
    if !token.is_empty() {
        result.push(token);
    }
    result
}

/// Extract the inner pattern from $(wildcard ...).
fn extract_wildcard(s: &str) -> Option<String> {
    if s.starts_with("$(wildcard") && s.ends_with(')') {
        let inner = s.trim_start_matches("$(wildcard").trim_end_matches(')').trim();
        if !inner.is_empty() {
            return Some(inner.to_string());
        }
    }
    None
}

/// Check if a flag is a device-related nextpnr flag (not worth warning about).
fn is_device_flag(flag: &str) -> bool {
    matches!(flag,
        "--up5k" | "--hx8k" | "--hx1k" | "--lp8k" | "--lp1k" | "--lp384"
        | "--package" | "--device" | "--json" | "--asc" | "--textcfg"
        | "--write" | "--fasm" | "--report" | "--uarch"
        | "--lpf" | "--pcf" | "--cst" | "--pdc" | "--ccf"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_ecp5_blinky_makefile() {
        let content = r#"
# ECP5 blinky project
DEVICE = LFE5U-85F-6BG381C
TOP = blinky
SOURCES = src/blinky.v src/pll.v
CONSTRAINTS = constraints/pins.lpf
BUILD_DIR = build
FREQ = 100

YOSYS_FLAGS = -nowidelut
NEXTPNR_FLAGS = --seed 42 --timing-allow-fail
"#;
        let config = parse_makefile(content);
        assert_eq!(config.device, "LFE5U-85F-6BG381C");
        assert_eq!(config.top_module, "blinky");
        assert_eq!(config.sources, vec!["src/blinky.v", "src/pll.v"]);
        assert_eq!(config.constraints, vec!["constraints/pins.lpf"]);
        assert_eq!(config.build_dir, "build");
        assert_eq!(config.freq, "100");
        assert_eq!(config.yosys_flags, vec!["-nowidelut"]);
        assert_eq!(config.nextpnr_flags, vec!["--seed", "42", "--timing-allow-fail"]);
    }

    #[test]
    fn test_parse_ice40_makefile() {
        let content = r#"
DEVICE := iCE40UP5K-SG48
TOP := top_module
SRC := src/top.v
PCF := constraints/pins.pcf
SEED = 1234
"#;
        let config = parse_makefile(content);
        assert_eq!(config.device, "iCE40UP5K-SG48");
        assert_eq!(config.top_module, "top_module");
        assert_eq!(config.sources, vec!["src/top.v"]);
        assert_eq!(config.constraints, vec!["constraints/pins.pcf"]);
        // SEED should be converted to nextpnr flag
        assert!(config.nextpnr_flags.iter().any(|f| f.contains("--seed 1234")));
    }

    #[test]
    fn test_parse_wildcard_sources() {
        let content = r#"
DEVICE = LFE5U-25F-6BG256
TOP = main
SOURCES = $(wildcard src/*.v) $(wildcard src/*.sv)
LPF = constraints/pins.lpf
"#;
        let config = parse_makefile(content);
        assert_eq!(config.sources.len(), 2);
        assert!(config.sources[0].contains("$(wildcard"));

        let result = makefile_config_to_import_result(&config);
        assert_eq!(result.source_patterns, vec!["src/*.v", "src/*.sv"]);
    }

    #[test]
    fn test_continuation_lines() {
        let content = "SOURCES = src/a.v \\\n  src/b.v \\\n  src/c.v\nTOP = main\n";
        let config = parse_makefile(content);
        assert_eq!(config.sources, vec!["src/a.v", "src/b.v", "src/c.v"]);
    }

    #[test]
    fn test_variable_resolution() {
        let content = r#"
PROJECT = blinky
TOP = $(PROJECT)
BUILD_DIR = build/$(PROJECT)
"#;
        let config = parse_makefile(content);
        assert_eq!(config.top_module, "blinky");
        assert_eq!(config.build_dir, "build/blinky");
    }

    #[test]
    fn test_conditional_assignment() {
        let content = r#"
DEVICE ?= LFE5U-25F
DEVICE ?= SHOULD_NOT_OVERRIDE
"#;
        let config = parse_makefile(content);
        assert_eq!(config.device, "LFE5U-25F");
    }

    #[test]
    fn test_append_assignment() {
        let content = r#"
SOURCES = src/a.v
SOURCES += src/b.v
"#;
        let config = parse_makefile(content);
        assert_eq!(config.sources, vec!["src/a.v", "src/b.v"]);
    }

    #[test]
    fn test_import_result_warnings() {
        let content = r#"
DEVICE = LFE5U-85F-6BG381C
TOP = test
NEXTPNR_FLAGS = --unknown-flag --seed 42
"#;
        let config = parse_makefile(content);
        let result = makefile_config_to_import_result(&config);
        assert!(result.warnings.iter().any(|w| w.contains("unknown-flag")));
        assert_eq!(result.build_options.get("pnr_seed"), Some(&"42".to_string()));
    }

    #[test]
    fn test_import_result_summary() {
        let content = r#"
DEVICE = LFE5U-85F-6BG381C
TOP = blinky
SOURCES = src/blinky.v
FREQ = 100
"#;
        let config = parse_makefile(content);
        let result = makefile_config_to_import_result(&config);
        assert!(!result.summary.is_empty());
        assert!(result.summary.iter().any(|s| s.contains("Device")));
        assert!(result.summary.iter().any(|s| s.contains("blinky")));
    }

    #[test]
    fn test_generate_makefile_ecp5() {
        let options = HashMap::new();
        let makefile = generate_makefile(
            "LFE5U-85F-6BG381C", "blinky",
            &["src/blinky.v".into()], &["constraints/pins.lpf".into()],
            "build", &options,
        );
        assert!(makefile.contains("DEVICE   ?= LFE5U-85F-6BG381C"));
        assert!(makefile.contains("TOP      ?= blinky"));
        assert!(makefile.contains("synth_ecp5"));
        assert!(makefile.contains("nextpnr-ecp5"));
        assert!(makefile.contains("ecppack"));
        assert!(makefile.contains(".PHONY"));
        assert!(makefile.contains("Generated by CovertEDA"));
    }

    #[test]
    fn test_generate_makefile_ice40() {
        let options = HashMap::new();
        let makefile = generate_makefile(
            "iCE40UP5K-SG48", "top",
            &[], &[],
            "build", &options,
        );
        assert!(makefile.contains("synth_ice40"));
        assert!(makefile.contains("nextpnr-ice40"));
        assert!(makefile.contains("icepack"));
        assert!(makefile.contains("--up5k"));
    }

    #[test]
    fn test_generate_makefile_with_options() {
        let mut options = HashMap::new();
        options.insert("pnr_seed".into(), "42".into());
        options.insert("pnr_freq".into(), "100".into());
        options.insert("syn_nobram".into(), "true".into());
        let makefile = generate_makefile(
            "LFE5U-85F-6BG381C", "test",
            &[], &[],
            "build", &options,
        );
        assert!(makefile.contains("--seed 42"));
        assert!(makefile.contains("--freq 100"));
        assert!(makefile.contains("-nobram"));
    }

    #[test]
    fn test_parse_assignment_operators() {
        assert!(parse_assignment("VAR = val").is_some());
        assert!(parse_assignment("VAR := val").is_some());
        assert!(parse_assignment("VAR ?= val").is_some());
        assert!(parse_assignment("VAR += val").is_some());
        assert!(parse_assignment("# comment").is_none());
        assert!(parse_assignment("target: deps").is_none());
    }

    #[test]
    fn test_empty_makefile() {
        let config = parse_makefile("");
        assert!(config.device.is_empty());
        assert!(config.sources.is_empty());
    }

    #[test]
    fn test_comments_ignored() {
        let content = r#"
# This is a comment
DEVICE = LFE5U-25F  # inline comment gets included (Makefile behavior)
# TOP = wrong
"#;
        let config = parse_makefile(content);
        // Note: in real Make, inline comments are part of the value
        // We don't strip inline comments to match Makefile semantics
        assert!(config.device.contains("LFE5U-25F"));
        assert!(config.top_module.is_empty()); // commented out line should be skipped
    }
}
