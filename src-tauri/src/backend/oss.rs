use crate::backend::{BackendError, BackendResult, FpgaBackend, DetectedVersion};
use crate::types::*;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// FPGA architecture family detected from device string.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OssArch {
    Ecp5,
    Ice40,
    Gowin,
    Nexus,
    GateMate,
    MachXO2,
}

impl OssArch {
    /// Detect architecture from a device string.
    pub fn from_device(device: &str) -> Self {
        let d = device.to_uppercase();
        if d.starts_with("LFE5U") {
            OssArch::Ecp5
        } else if d.starts_with("ICE40") {
            OssArch::Ice40
        } else if d.starts_with("GW") {
            OssArch::Gowin
        } else if d.starts_with("LIFCL") {
            OssArch::Nexus
        } else if d.starts_with("CCGM") {
            OssArch::GateMate
        } else if d.starts_with("LCMXO2") {
            OssArch::MachXO2
        } else {
            OssArch::Ecp5 // default fallback
        }
    }

    /// Yosys synth command name for this architecture.
    pub fn synth_command(&self) -> &'static str {
        match self {
            OssArch::Ecp5 => "synth_ecp5",
            OssArch::Ice40 => "synth_ice40",
            OssArch::Gowin => "synth_gowin",
            OssArch::Nexus => "synth_nexus",
            OssArch::GateMate => "synth_gatemate",
            OssArch::MachXO2 => "synth_machxo2",
        }
    }

    /// nextpnr binary name for this architecture.
    pub fn nextpnr_bin(&self) -> &'static str {
        match self {
            OssArch::Ecp5 => "nextpnr-ecp5",
            OssArch::Ice40 => "nextpnr-ice40",
            OssArch::Gowin => "nextpnr-himbaechel",
            OssArch::Nexus => "nextpnr-nexus",
            OssArch::GateMate => "nextpnr-himbaechel",
            OssArch::MachXO2 => "nextpnr-machxo2",
        }
    }

    /// Bitstream packer binary name.
    pub fn packer_bin(&self) -> &'static str {
        match self {
            OssArch::Ecp5 => "ecppack",
            OssArch::Ice40 => "icepack",
            OssArch::Gowin => "gowin_pack",
            OssArch::Nexus => "prjoxide",
            OssArch::GateMate => "p_r", // CologneChip place-and-route (GateMate packer is integrated)
            OssArch::MachXO2 => "ecppack",
        }
    }

    /// Constraint file extension for this architecture.
    pub fn constraint_ext(&self) -> &'static str {
        match self {
            OssArch::Ecp5 => ".lpf",
            OssArch::Ice40 => ".pcf",
            OssArch::Gowin => ".cst",
            OssArch::Nexus => ".pdc",
            OssArch::GateMate => ".ccf",
            OssArch::MachXO2 => ".lpf",
        }
    }

    /// nextpnr output format extension.
    pub fn pnr_output_ext(&self) -> &'static str {
        match self {
            OssArch::Ecp5 => "config",   // textual config for ecppack
            OssArch::Ice40 => "asc",      // ASCII bitstream for icepack
            OssArch::Gowin => "json",     // packed JSON for gowin_pack (use fs suffix)
            OssArch::Nexus => "fasm",     // FASM for prjoxide
            OssArch::GateMate => "place",
            OssArch::MachXO2 => "config",
        }
    }

    /// Bitstream file extension.
    pub fn bitstream_ext(&self) -> &'static str {
        match self {
            OssArch::Ecp5 => "bit",
            OssArch::Ice40 => "bin",
            OssArch::Gowin => "fs",
            OssArch::Nexus => "bit",
            OssArch::GateMate => "bit",
            OssArch::MachXO2 => "bit",
        }
    }
}

/// Open-source CAD suite backend — Yosys + nextpnr + architecture-specific packers.
pub struct OssBackend {
    version: String,
    install_dir: Option<PathBuf>,
    deferred: bool,
}

impl OssBackend {
    pub fn new() -> Self {
        let (version, install_dir) = Self::detect_installation();
        Self {
            version,
            install_dir,
            deferred: false,
        }
    }

    pub fn new_deferred() -> Self {
        Self {
            version: String::new(),
            install_dir: None,
            deferred: true,
        }
    }

    /// Get the installation directory.
    pub fn install_dir(&self) -> Option<&Path> {
        self.install_dir.as_deref()
    }

    /// Return the single detected version (OSS CAD Suite is a single install).
    pub fn scan_all_versions() -> Vec<DetectedVersion> {
        let (ver, path) = Self::detect_installation();
        match path {
            Some(p) => vec![DetectedVersion {
                version: ver,
                install_path: p.display().to_string(),
                verified: true,
            }],
            None => vec![],
        }
    }

    /// Full path to yosys binary, if install_dir is known.
    pub fn yosys_path(&self) -> Option<PathBuf> {
        let dir = self.install_dir.as_ref()?;
        let p = dir.join("bin").join("yosys");
        if p.exists() { Some(p) } else { None }
    }

    /// Full path to nextpnr-ecp5 binary, if install_dir is known.
    pub fn nextpnr_ecp5_path(&self) -> Option<PathBuf> {
        let dir = self.install_dir.as_ref()?;
        let p = dir.join("bin").join("nextpnr-ecp5");
        if p.exists() { Some(p) } else { None }
    }

    /// Full path to ecppack binary, if install_dir is known.
    pub fn ecppack_path(&self) -> Option<PathBuf> {
        let dir = self.install_dir.as_ref()?;
        let p = dir.join("bin").join("ecppack");
        if p.exists() { Some(p) } else { None }
    }

    /// Detect OSS CAD Suite installation. Priority:
    /// 1. Config `tool_paths.oss_cad_suite`
    /// 2. Legacy config `tool_paths.yosys` (backward compat — trace to root)
    /// 3. `which::which("yosys")` — trace parent dirs to find root
    /// 4. Scan common installation locations
    /// 5. Scan $HOME subdirectories matching fpga/cad/eda keywords
    fn detect_installation() -> (String, Option<PathBuf>) {
        let config = crate::config::AppConfig::load();

        // 1. Explicit oss_cad_suite config path
        if let Some(ref configured) = config.tool_paths.oss_cad_suite {
            if let Some(root) = Self::normalize_to_root(configured) {
                let version = Self::read_version(&root);
                return (version, Some(root));
            }
        }

        // 2. Legacy yosys path — trace upward to find oss-cad-suite root
        if let Some(ref yosys_path) = config.tool_paths.yosys {
            if let Some(root) = Self::trace_to_root(yosys_path) {
                let version = Self::read_version(&root);
                return (version, Some(root));
            }
        }

        // 3. which::which("yosys") — trace to root
        if let Ok(yosys_bin) = which::which("yosys") {
            if let Some(root) = Self::trace_to_root(&yosys_bin) {
                let version = Self::read_version(&root);
                return (version, Some(root));
            }
        }

        // 4. Common installation locations
        let home = dirs::home_dir();
        let mut candidates: Vec<PathBuf> = vec![
            PathBuf::from("/opt/oss-cad-suite"),
            PathBuf::from("/usr/local/oss-cad-suite"),
        ];
        if let Some(ref h) = home {
            candidates.push(h.join("oss-cad-suite"));
            candidates.push(h.join(".local").join("share").join("oss-cad-suite"));
        }
        for candidate in &candidates {
            if Self::is_oss_root(candidate) {
                let version = Self::read_version(candidate);
                return (version, Some(candidate.clone()));
            }
        }

        // 5. Scan $HOME subdirectories matching fpga/cad/eda (up to 3 levels)
        if let Some(ref h) = home {
            if let Some(root) = Self::scan_home_dirs(h) {
                let version = Self::read_version(&root);
                return (version, Some(root));
            }
        }

        // Nothing found — fall back to bare PATH check for version
        let version = Self::detect_version_from_path();
        (version, None)
    }

    /// Check if a directory is an OSS CAD Suite root.
    /// Fingerprint: has `environment` file AND `bin/yosys`.
    fn is_oss_root(dir: &Path) -> bool {
        dir.join("environment").is_file() && dir.join("bin").join("yosys").exists()
    }

    /// Normalize a user-provided path to the oss-cad-suite root.
    /// Handles user pointing at either the root or the bin/ directory.
    fn normalize_to_root(path: &Path) -> Option<PathBuf> {
        // Direct root
        if Self::is_oss_root(path) {
            return Some(path.to_path_buf());
        }
        // User pointed at bin/ directory
        if path.ends_with("bin") {
            if let Some(parent) = path.parent() {
                if Self::is_oss_root(parent) {
                    return Some(parent.to_path_buf());
                }
            }
        }
        // User pointed at a binary inside bin/
        if let Some(parent) = path.parent() {
            if parent.ends_with("bin") {
                if let Some(root) = parent.parent() {
                    if Self::is_oss_root(root) {
                        return Some(root.to_path_buf());
                    }
                }
            }
        }
        None
    }

    /// Given a path to a binary (e.g., yosys), trace parent directories
    /// upward to find an oss-cad-suite root.
    fn trace_to_root(binary_path: &Path) -> Option<PathBuf> {
        let mut current = binary_path.to_path_buf();
        // Walk up at most 5 levels
        for _ in 0..5 {
            current = current.parent()?.to_path_buf();
            if Self::is_oss_root(&current) {
                return Some(current);
            }
        }
        None
    }

    /// Scan $HOME subdirectories for oss-cad-suite directories.
    /// Looks for directories matching fpga/cad/eda (case-insensitive), up to 3 levels.
    fn scan_home_dirs(home: &Path) -> Option<PathBuf> {
        Self::scan_for_oss_recursive(home, 0, 3)
    }

    fn scan_for_oss_recursive(dir: &Path, depth: u32, max_depth: u32) -> Option<PathBuf> {
        if depth >= max_depth {
            return None;
        }
        let entries = std::fs::read_dir(dir).ok()?;
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_lowercase();
            // Skip hidden directories and common non-relevant ones
            if name.starts_with('.') {
                continue;
            }
            // Check if this IS an oss-cad-suite directory
            if name.contains("oss-cad-suite") || name.contains("oss_cad_suite") {
                if Self::is_oss_root(&path) {
                    return Some(path);
                }
            }
            // Recurse into directories that look FPGA/EDA-related
            if depth < max_depth - 1
                && (name.contains("fpga")
                    || name.contains("cad")
                    || name.contains("eda")
                    || name.contains("reverse_engineering")
                    || name.contains("tools")
                    || name.contains("electronics"))
            {
                if let Some(found) = Self::scan_for_oss_recursive(&path, depth + 1, max_depth) {
                    return Some(found);
                }
            }
        }
        None
    }

    /// Read version from the VERSION file in the install dir, or fall back to yosys --version.
    fn read_version(root: &Path) -> String {
        // Try VERSION file first
        let version_file = root.join("VERSION");
        if let Ok(content) = std::fs::read_to_string(&version_file) {
            let trimmed = content.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
        // Fall back to yosys --version
        let yosys = root.join("bin").join("yosys");
        if yosys.exists() {
            if let Ok(output) = crate::process::no_window_cmd(yosys.to_str().unwrap_or("yosys")).arg("--version").output() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let trimmed = stdout.trim();
                if !trimmed.is_empty() {
                    return trimmed.to_string();
                }
            }
        }
        "unknown".to_string()
    }

    /// Try to get version string from yosys on PATH (no install dir known).
    fn detect_version_from_path() -> String {
        if let Ok(yosys) = which::which("yosys") {
            if let Ok(output) = crate::process::no_window_cmd(yosys.to_str().unwrap_or("yosys")).arg("--version").output() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let trimmed = stdout.trim();
                if !trimmed.is_empty() {
                    return trimmed.to_string();
                }
            }
        }
        "unknown".to_string()
    }

    /// Resolve the full path for a tool binary. Uses install_dir if available,
    /// otherwise returns bare name for PATH lookup.
    fn resolve_tool(&self, name: &str) -> String {
        if let Some(ref dir) = self.install_dir {
            let full = dir.join("bin").join(name);
            if full.exists() {
                return full.display().to_string();
            }
        }
        name.to_string()
    }

    /// Parse ECP5 device string into (size_flag, package, speed).
    /// e.g. "LFE5U-85F-6BG381C" → ("85k", "CABGA381", "6")
    /// e.g. "LFE5UM5G-45F-8BG554" → ("um5g-45k", "CABGA554", "8")
    /// Strips trailing temperature grade suffix (C = commercial, I = industrial).
    fn parse_ecp5_device(device: &str) -> (String, String, String) {
        let dev_upper = device.to_uppercase();
        let prefix = if dev_upper.starts_with("LFE5UM5G") {
            "um5g-"
        } else if dev_upper.starts_with("LFE5UM") {
            "um-"
        } else {
            ""
        };
        let size_k = if dev_upper.contains("12F") { "12k" }
            else if dev_upper.contains("25F") { "25k" }
            else if dev_upper.contains("45F") { "45k" }
            else { "85k" };
        let size_flag = format!("{}{}", prefix, size_k);

        let parts: Vec<&str> = device.split('-').collect();
        let (spd, pkg) = if parts.len() >= 3 {
            let last = parts[parts.len() - 1];
            let speed_char = &last[..1];
            let pkg_raw = &last[1..];
            // Strip trailing temperature grade (C/I) — e.g. "BG381C" → "BG381"
            let pkg_stripped = pkg_raw.trim_end_matches(|c: char| c == 'C' || c == 'I' || c == 'c' || c == 'i');
            let package = if pkg_stripped.to_uppercase().starts_with("BG") {
                format!("CABGA{}", &pkg_stripped[2..])
            } else if pkg_stripped.to_uppercase().starts_with("TQFP") {
                format!("TQFP{}", &pkg_stripped[4..])
            } else {
                format!("CABGA{}", &pkg_stripped[2..])
            };
            (speed_char.to_string(), package)
        } else {
            ("6".to_string(), "CABGA381".to_string())
        };
        (size_flag, pkg, spd)
    }

    /// Parse iCE40 device string into nextpnr flags.
    /// e.g. "iCE40UP5K-SG48" → ("--up5k", "--package sg48")
    /// e.g. "iCE40HX8K-CM225" → ("--hx8k", "--package cm225")
    fn parse_ice40_device(device: &str) -> (String, String) {
        let d = device.to_uppercase();
        // Extract device variant: UP5K, LP8K, HX8K, LP1K, LP384, etc.
        let variant = if d.contains("UP5K") { "up5k" }
            else if d.contains("UP3K") { "up5k" } // UP3K uses up5k in nextpnr
            else if d.contains("LP8K") { "lp8k" }
            else if d.contains("LP4K") { "lp8k" } // LP4K uses lp8k
            else if d.contains("HX8K") { "hx8k" }
            else if d.contains("HX4K") { "hx8k" } // HX4K uses hx8k
            else if d.contains("HX1K") { "hx1k" }
            else if d.contains("LP1K") { "lp1k" }
            else if d.contains("LP384") { "lp384" }
            else { "up5k" };

        // Extract package from after the dash
        let package = device
            .split('-')
            .last()
            .unwrap_or("SG48")
            .to_lowercase();

        (format!("--{}", variant), format!("--package {}", package))
    }

    /// Parse Gowin device string into nextpnr-himbaechel flags.
    /// e.g. "GW1N-9-QFN88" → ("--device GW1N-UV9QN88C6/I5")
    fn parse_gowin_device(device: &str) -> String {
        // Gowin nextpnr-himbaechel expects the full device string
        // The device parts in our list are simplified; pass them through
        format!("--device {}", device)
    }

    /// Parse Nexus device string into nextpnr-nexus flags.
    /// e.g. "LIFCL-40-BG400" → ("--device LIFCL-40 --package QFN72")
    fn parse_nexus_device(device: &str) -> String {
        let parts: Vec<&str> = device.split('-').collect();
        if parts.len() >= 3 {
            let chip = format!("{}-{}", parts[0], parts[1]);
            let package = parts[2];
            format!("--device {} --package {}", chip, package)
        } else {
            format!("--device {}", device)
        }
    }

    /// Generate architecture-specific nextpnr flags for PnR.
    fn gen_pnr_device_flags(arch: OssArch, device: &str) -> String {
        match arch {
            OssArch::Ecp5 => {
                let (size, package, speed) = Self::parse_ecp5_device(device);
                format!("--{} --package {} --speed {}", size, package, speed)
            }
            OssArch::Ice40 => {
                let (variant, package) = Self::parse_ice40_device(device);
                format!("{} {}", variant, package)
            }
            OssArch::Gowin => {
                format!("--uarch gowin {}", Self::parse_gowin_device(device))
            }
            OssArch::Nexus => Self::parse_nexus_device(device),
            OssArch::GateMate => {
                format!("--uarch gatemate --device {}", device)
            }
            OssArch::MachXO2 => {
                format!("--device {}", device)
            }
        }
    }

    /// Public wrapper for parse_ecp5_device (used by makefile generation).
    pub fn parse_ecp5_device_pub(device: &str) -> (String, String, String) {
        Self::parse_ecp5_device(device)
    }

    /// Public wrapper for parse_ice40_device (used by makefile generation).
    pub fn parse_ice40_device_pub(device: &str) -> (String, String) {
        Self::parse_ice40_device(device)
    }

    /// Generate the bitstream packing command line.
    fn gen_pack_command(arch: OssArch, packer: &str, options: &HashMap<String, String>) -> String {
        let opt = |key: &str| -> String {
            options.get(key).cloned().unwrap_or_default()
        };

        match arch {
            OssArch::Ecp5 | OssArch::MachXO2 => {
                let mut flags = Vec::new();
                flags.push("build/out.config".to_string());
                flags.push(format!("--bit build/out.{}", arch.bitstream_ext()));

                if opt("bit_compress") != "false" {
                    flags.push("--compress".to_string());
                }
                let bit_spi = opt("bit_spimode");
                if !bit_spi.is_empty() && bit_spi != "Default" {
                    flags.push(format!("--spimode {}", bit_spi));
                }
                let bit_freq = opt("bit_freq");
                if !bit_freq.is_empty() {
                    flags.push(format!("--freq {}", bit_freq));
                }
                if opt("bit_svf") == "true" {
                    flags.push("--svf build/out.svf".to_string());
                }
                if opt("bit_background") == "true" {
                    flags.push("--background".to_string());
                }
                let bit_usercode = opt("bit_usercode");
                if !bit_usercode.is_empty() {
                    flags.push(format!("--usercode {}", bit_usercode));
                }
                let bit_bootaddr = opt("bit_bootaddr");
                if !bit_bootaddr.is_empty() {
                    flags.push(format!("--bootaddr {}", bit_bootaddr));
                }
                let bit_svf_rowsize = opt("bit_svf_rowsize");
                if !bit_svf_rowsize.is_empty() {
                    flags.push(format!("--svf-rowsize {}", bit_svf_rowsize));
                }
                format!("{} {}", packer, flags.join(" \\\n    "))
            }
            OssArch::Ice40 => {
                // icepack input.asc output.bin
                format!("{} build/out.asc build/out.bin", packer)
            }
            OssArch::Gowin => {
                // gowin_pack -d <family> -o output.fs input.json
                format!("{} -o build/out.fs build/out_pnr.json", packer)
            }
            OssArch::Nexus => {
                // prjoxide bitstream build/out.fasm build/out.bit
                format!("{} bitstream build/out.fasm build/out.bit", packer)
            }
            OssArch::GateMate => {
                // GateMate packing is done by p_r tool; just copy output
                format!("echo 'GateMate bitstream generated by P&R tool'\ncp build/out_00.cfg.bit build/out.bit 2>/dev/null || true")
            }
        }
    }
}

impl FpgaBackend for OssBackend {
    fn id(&self) -> &str {
        "opensource"
    }
    fn name(&self) -> &str {
        "OSS CAD Suite"
    }
    fn short_name(&self) -> &str {
        "OSS"
    }
    fn version(&self) -> &str {
        &self.version
    }
    fn cli_tool(&self) -> &str {
        "bash"
    }
    fn default_device(&self) -> &str {
        "LFE5U-85F-6BG381C"
    }
    fn constraint_ext(&self) -> &str {
        ".lpf"
    }

    fn pipeline_stages(&self) -> Vec<PipelineStage> {
        vec![
            PipelineStage {
                id: "synth".into(),
                label: "Yosys Synthesis".into(),
                cmd: "yosys -p 'synth_<arch> -json out.json' *.v".into(),
                detail: "Open-source synthesis (auto-detects arch from device)".into(),
            },
            PipelineStage {
                id: "pnr".into(),
                label: "nextpnr Place & Route".into(),
                cmd: "nextpnr-<arch> --json out.json".into(),
                detail: "Open-source place and route (auto-selects nextpnr variant)".into(),
            },
            PipelineStage {
                id: "pack".into(),
                label: "Bitstream Packing".into(),
                cmd: "ecppack/icepack/gowin_pack (auto-selected)".into(),
                detail: "Architecture-specific bitstream generation".into(),
            },
        ]
    }

    fn generate_build_script(
        &self,
        project_dir: &Path,
        device: &str,
        top_module: &str,
        _stages: &[String],
        options: &HashMap<String, String>,
    ) -> BackendResult<String> {
        let arch = OssArch::from_device(device);

        let yosys = self.resolve_tool("yosys");
        let nextpnr = self.resolve_tool(arch.nextpnr_bin());
        let packer = self.resolve_tool(arch.packer_bin());

        // Source the environment script for proper LD_LIBRARY_PATH etc.
        let source_env = if let Some(ref dir) = self.install_dir {
            let env_file = dir.join("environment");
            if env_file.exists() {
                format!("source \"{}\"\n\n", env_file.display())
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        let opt = |key: &str| -> String {
            options.get(key).cloned().unwrap_or_default()
        };

        // ── Yosys synthesis flags (architecture-universal + arch-specific) ──
        let mut synth_flags = Vec::new();
        synth_flags.push(format!("-top {}", top_module));
        synth_flags.push("-json build/out.json".to_string());

        if opt("syn_noflatten") == "true" {
            synth_flags.push("-noflatten".to_string());
        }
        if opt("syn_nowidelut") == "true" {
            synth_flags.push("-nowidelut".to_string());
        }
        if opt("syn_noabc9") == "true" {
            synth_flags.push("-noabc9".to_string());
        }
        if opt("syn_abc2") == "true" {
            synth_flags.push("-abc2".to_string());
        }
        if opt("syn_dff") == "true" {
            synth_flags.push("-dff".to_string());
        }
        if opt("syn_retime") == "true" {
            synth_flags.push("-retime".to_string());
        }
        if opt("syn_nobram") == "true" {
            synth_flags.push("-nobram".to_string());
        }
        if opt("syn_nolutram") == "true" {
            synth_flags.push("-nolutram".to_string());
        }
        if opt("syn_nodsp") == "true" {
            synth_flags.push("-nodsp".to_string());
        }
        // ECP5-specific synth flags
        if arch == OssArch::Ecp5 {
            if opt("syn_noccu2") == "true" {
                synth_flags.push("-noccu2".to_string());
            }
            if opt("syn_nodffe") == "true" {
                synth_flags.push("-nodffe".to_string());
            }
        }
        if opt("syn_no_rw_check") == "true" {
            synth_flags.push("-no-rw-check".to_string());
        }

        let abc9_timing = opt("syn_abc9_timing");
        let yosys_pre = if !abc9_timing.is_empty() {
            format!("scratchpad -set abc9.D {}; ", abc9_timing)
        } else {
            String::new()
        };

        let synth_cmd = synth_flags.join(" ");

        // ── Yosys verbosity/defines ──
        let mut yosys_flags = Vec::new();
        match opt("syn_verbosity").as_str() {
            "quiet" => yosys_flags.push("-q".to_string()),
            "verbose" => yosys_flags.push("-v 1".to_string()),
            _ => {}
        }
        let syn_defines = opt("syn_defines");
        if !syn_defines.is_empty() {
            for d in syn_defines.split_whitespace() {
                yosys_flags.push(format!("-D {}", d));
            }
        }
        let yosys_extra = if yosys_flags.is_empty() {
            String::new()
        } else {
            format!(" {}", yosys_flags.join(" "))
        };

        // ── nextpnr flags (architecture-specific device + universal options) ──
        let device_flags = Self::gen_pnr_device_flags(arch, device);
        let mut pnr_flags = Vec::new();
        pnr_flags.push(device_flags);
        pnr_flags.push("--json build/out.json".to_string());

        // Constraint file: use explicit path from options, or find via glob
        let constraint_ext = arch.constraint_ext();
        let constraint_cli_flag = match arch {
            OssArch::Ecp5 | OssArch::MachXO2 => "--lpf",
            OssArch::Ice40 => "--pcf",
            OssArch::Gowin => "--cst",
            OssArch::Nexus => "--pdc",
            OssArch::GateMate => "--ccf",
        };
        // Check if user specified a constraint file explicitly via build options
        let explicit_constraint = options.get("constraint_file").cloned().unwrap_or_default();
        if !explicit_constraint.is_empty() {
            pnr_flags.push(format!("{} {}", constraint_cli_flag, explicit_constraint));
        } else {
            // Use $CONSTRAINT_FILE which is resolved by bash glob in the script preamble
            pnr_flags.push(format!("{} $CONSTRAINT_FILE", constraint_cli_flag));
        }

        // Output flag varies by architecture
        let pnr_output_flag = match arch {
            OssArch::Ecp5 | OssArch::MachXO2 => format!("--textcfg build/out.{}", arch.pnr_output_ext()),
            OssArch::Ice40 => format!("--asc build/out.{}", arch.pnr_output_ext()),
            OssArch::Gowin => "--write build/out_pnr.json".to_string(),
            OssArch::Nexus => format!("--fasm build/out.{}", arch.pnr_output_ext()),
            OssArch::GateMate => "--write build/out_pnr.json".to_string(),
        };
        pnr_flags.push(pnr_output_flag);
        pnr_flags.push("--report build/report.json".to_string());

        // Universal PnR options
        let pnr_freq = opt("pnr_freq");
        if !pnr_freq.is_empty() {
            pnr_flags.push(format!("--freq {}", pnr_freq));
        }
        let pnr_seed = opt("pnr_seed");
        if !pnr_seed.is_empty() {
            pnr_flags.push(format!("--seed {}", pnr_seed));
        }
        let pnr_placer = opt("pnr_placer");
        if !pnr_placer.is_empty() {
            pnr_flags.push(format!("--placer {}", pnr_placer));
        }
        let pnr_router = opt("pnr_router");
        if !pnr_router.is_empty() {
            pnr_flags.push(format!("--router {}", pnr_router));
        }
        if opt("pnr_no_tmdriv") == "true" {
            pnr_flags.push("--no-tmdriv".to_string());
        }
        if opt("pnr_timing_allow_fail") == "true" {
            pnr_flags.push("--timing-allow-fail".to_string());
        }
        if opt("pnr_randomize_seed") == "true" {
            pnr_flags.push("--randomize-seed".to_string());
        }
        if opt("pnr_parallel_refine") == "true" {
            pnr_flags.push("--parallel-refine".to_string());
        }
        if opt("pnr_tmg_ripup") == "true" {
            pnr_flags.push("--tmg-ripup".to_string());
        }
        if opt("pnr_no_promote_globals") == "true" {
            pnr_flags.push("--no-promote-globals".to_string());
        }
        if opt("pnr_detailed_timing") == "true" {
            pnr_flags.push("--detailed-timing-report".to_string());
        }
        // Architecture-specific unconstrained flag
        if arch == OssArch::Ecp5 || arch == OssArch::MachXO2 {
            if opt("pnr_lpf_allow_unconstrained") == "true" {
                pnr_flags.push("--lpf-allow-unconstrained".to_string());
            }
        }
        if arch == OssArch::Ice40 {
            if opt("pnr_pcf_allow_unconstrained") == "true" {
                pnr_flags.push("--pcf-allow-unconstrained".to_string());
            }
        }

        let pnr_threads = opt("pnr_threads");
        if !pnr_threads.is_empty() {
            pnr_flags.push(format!("--threads {}", pnr_threads));
        }

        // HeAP placer tuning (available for all architectures)
        let heap_alpha = opt("pnr_heap_alpha");
        if !heap_alpha.is_empty() {
            pnr_flags.push(format!("--placer-heap-alpha {}", heap_alpha));
        }
        let heap_beta = opt("pnr_heap_beta");
        if !heap_beta.is_empty() {
            pnr_flags.push(format!("--placer-heap-beta {}", heap_beta));
        }
        let heap_critexp = opt("pnr_heap_critexp");
        if !heap_critexp.is_empty() {
            pnr_flags.push(format!("--placer-heap-critexp {}", heap_critexp));
        }
        let heap_timingweight = opt("pnr_heap_timingweight");
        if !heap_timingweight.is_empty() {
            pnr_flags.push(format!("--placer-heap-timingweight {}", heap_timingweight));
        }

        match opt("pnr_verbosity").as_str() {
            "quiet" => pnr_flags.push("--quiet".to_string()),
            "verbose" => pnr_flags.push("--verbose".to_string()),
            _ => {}
        }

        let pnr_cmd = pnr_flags.join(" \\\n    ");

        // ── Bitstream packing command ──
        let pack_cmd = Self::gen_pack_command(arch, &packer, options);

        let synth_label = arch.synth_command();
        let pnr_label = arch.nextpnr_bin();
        let pack_label = arch.packer_bin();
        let bitstream_ext = arch.bitstream_ext();

        // Generate constraint-finding block (only when using $CONSTRAINT_FILE)
        let constraint_find_block = if explicit_constraint.is_empty() {
            format!(
                r#"
# Find constraint file (*{ext})
CONSTRAINT_FILES=( constraints/*{ext} )
if [ ${{#CONSTRAINT_FILES[@]}} -eq 0 ]; then
    echo "ERROR: No constraint file (*{ext}) found in constraints/" >&2
    echo "  Create a constraint file or specify one in Build Options" >&2
    exit 1
fi
CONSTRAINT_FILE="${{CONSTRAINT_FILES[0]}}"
if [ ${{#CONSTRAINT_FILES[@]}} -gt 1 ]; then
    echo "Note: Multiple constraint files found, using $CONSTRAINT_FILE"
fi
echo "Using constraint file: $CONSTRAINT_FILE"
"#,
                ext = constraint_ext,
            )
        } else {
            String::new()
        };

        Ok(format!(
            r#"#!/bin/bash
# CovertEDA — OSS CAD Build Script
# Device: {device}  (arch: {synth_label})
# Top: {top_module}
set -eo pipefail
shopt -s nullglob

{source_env}cd {project_dir}

# Collect source files (Verilog and SystemVerilog)
SRC_FILES=( src/*.v src/*.sv )
if [ ${{#SRC_FILES[@]}} -eq 0 ]; then
    echo "ERROR: No source files found (*.v, *.sv) in src/" >&2
    exit 1
fi

mkdir -p build
{constraint_find_block}
echo "=== Yosys Synthesis ({synth_label}) ==="
{yosys}{yosys_extra} -p "{yosys_pre}{synth_label} {synth_cmd}" "${{SRC_FILES[@]}}" 2>&1 | tee build/synth.log

echo "=== {pnr_label} Place & Route ==="
{nextpnr} {pnr_cmd} 2>&1 | tee build/pnr.log

echo "=== {pack_label} Bitstream ==="
{pack_cmd} 2>&1 | tee build/bitstream.log

echo "=== Done (output: build/out.{bitstream_ext}) ==="
"#,
            project_dir = project_dir.display(),
        ))
    }

    fn install_path_str(&self) -> Option<String> {
        self.install_dir.as_ref().map(|p| p.display().to_string())
    }

    fn detect_tool(&self) -> bool {
        if self.deferred { return false; }
        // Yosys is always required; check installed path first, then PATH
        if self.yosys_path().is_some() {
            return true;
        }
        which::which("yosys").is_ok()
    }

    fn is_deferred(&self) -> bool { self.deferred }


    fn parse_timing_report(&self, impl_dir: &Path) -> BackendResult<TimingReport> {
        let report = impl_dir.join("build").join("report.json");
        if report.exists() {
            let content = std::fs::read_to_string(&report)?;
            return crate::parser::timing::parse_nextpnr_timing(&content);
        }

        // Fallback: extract fmax from nextpnr log output
        let pnr_log = impl_dir.join("build").join("pnr.log");
        if pnr_log.exists() {
            let content = std::fs::read_to_string(&pnr_log)?;
            return crate::parser::timing::parse_nextpnr_log_timing(&content);
        }

        Err(BackendError::ReportNotFound(report.display().to_string()))
    }

    fn parse_utilization_report(&self, impl_dir: &Path) -> BackendResult<ResourceReport> {
        let report = impl_dir.join("build").join("report.json");
        if report.exists() {
            let content = std::fs::read_to_string(&report)?;
            return crate::parser::utilization::parse_nextpnr_utilization(&content, self.default_device());
        }

        // Fallback: parse synth.log for Yosys resource counts
        let synth_log = impl_dir.join("build").join("synth.log");
        if synth_log.exists() {
            let content = std::fs::read_to_string(&synth_log)?;
            let synth = crate::parser::synthesis::parse_yosys_synthesis(&content)?;
            let mut items = vec![];
            if synth.lut_count > 0 {
                items.push(ResourceItem {
                    resource: "LUTs".into(),
                    used: synth.lut_count,
                    total: 0,
                    detail: Some("from synthesis (pre-PnR)".into()),
                });
            }
            if synth.reg_count > 0 {
                items.push(ResourceItem {
                    resource: "Registers/FFs".into(),
                    used: synth.reg_count,
                    total: 0,
                    detail: Some("from synthesis (pre-PnR)".into()),
                });
            }
            if synth.ram_count > 0 {
                items.push(ResourceItem {
                    resource: "Block RAM".into(),
                    used: synth.ram_count,
                    total: 0,
                    detail: Some("from synthesis (pre-PnR)".into()),
                });
            }
            if synth.dsp_count > 0 {
                items.push(ResourceItem {
                    resource: "DSP Blocks".into(),
                    used: synth.dsp_count,
                    total: 0,
                    detail: Some("from synthesis (pre-PnR)".into()),
                });
            }
            if !items.is_empty() {
                return Ok(ResourceReport {
                    device: self.default_device().to_string(),
                    categories: vec![ResourceCategory {
                        name: "Logic (Synthesis Estimate)".into(),
                        items,
                    }],
                    by_module: vec![],
                });
            }
        }

        Err(BackendError::ReportNotFound(report.display().to_string()))
    }

    fn parse_power_report(&self, impl_dir: &Path) -> BackendResult<Option<PowerReport>> {
        // Provide a rough power estimate based on utilization data.
        // OSS tools don't have real power analysis, so we estimate from resource counts.
        let report_path = impl_dir.join("build").join("report.json");
        if !report_path.exists() {
            return Ok(None);
        }
        let content = std::fs::read_to_string(&report_path)?;
        let json: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| BackendError::ParseError(format!("JSON parse error: {}", e)))?;

        // Extract utilization from report.json
        let utilization = json.get("utilisation").or_else(|| json.get("utilization"));
        let mut lut_count: f64 = 0.0;
        let mut ff_count: f64 = 0.0;
        let mut bram_count: f64 = 0.0;

        if let Some(util) = utilization {
            // nextpnr report.json has utilisation as object with resource types
            if let Some(obj) = util.as_object() {
                for (key, val) in obj {
                    let lower = key.to_lowercase();
                    if let Some(used_obj) = val.as_object() {
                        let used = used_obj.get("used")
                            .and_then(|v| v.as_f64())
                            .unwrap_or(0.0);
                        if lower.contains("lut") || lower.contains("slice") || lower.contains("lc") {
                            lut_count += used;
                        } else if lower.contains("ff") || lower.contains("dff") || lower.contains("reg") {
                            ff_count += used;
                        } else if lower.contains("bram") || lower.contains("ebr") || lower.contains("ram") {
                            bram_count += used;
                        }
                    }
                }
            }
        }

        // If no utilization found, return None
        if lut_count == 0.0 && ff_count == 0.0 && bram_count == 0.0 {
            return Ok(None);
        }

        // Simple heuristic power model (very rough estimates):
        // - Static: ~50mW base
        // - LUT dynamic: ~0.01 mW per LUT
        // - FF dynamic: ~0.005 mW per FF
        // - BRAM: ~5 mW per block
        let static_mw = 50.0;
        let lut_mw = lut_count * 0.01;
        let ff_mw = ff_count * 0.005;
        let bram_mw = bram_count * 5.0;
        let total_mw = static_mw + lut_mw + ff_mw + bram_mw;

        let breakdown = vec![
            PowerBreakdown { category: "Static".into(), mw: static_mw, percentage: (static_mw / total_mw) * 100.0 },
            PowerBreakdown { category: "Logic (LUTs)".into(), mw: lut_mw, percentage: (lut_mw / total_mw) * 100.0 },
            PowerBreakdown { category: "Registers (FFs)".into(), mw: ff_mw, percentage: (ff_mw / total_mw) * 100.0 },
            PowerBreakdown { category: "Block RAM".into(), mw: bram_mw, percentage: (bram_mw / total_mw) * 100.0 },
        ];

        Ok(Some(PowerReport {
            total_mw,
            junction_temp_c: 25.0,
            ambient_temp_c: 25.0,
            theta_ja: 0.0,
            confidence: "Estimate".into(),
            breakdown,
            by_rail: vec![
                PowerRail { rail: "VCCIO".into(), mw: total_mw * 0.3 },
                PowerRail { rail: "VCCINT".into(), mw: total_mw * 0.7 },
            ],
        }))
    }

    fn parse_drc_report(&self, impl_dir: &Path) -> BackendResult<Option<DrcReport>> {
        // Parse warnings/errors from yosys synth.log, nextpnr pnr.log, and packer bitstream.log
        let synth_log = impl_dir.join("build").join("synth.log");
        let pnr_log = impl_dir.join("build").join("pnr.log");
        let bitstream_log = impl_dir.join("build").join("bitstream.log");

        let mut items = Vec::new();
        let mut errors = 0u32;
        let mut warnings = 0u32;
        let mut critical_warnings = 0u32;
        let mut info_count = 0u32;

        for (log_path, source) in [
            (synth_log, "yosys"),
            (pnr_log, "nextpnr"),
            (bitstream_log, "packer"),
        ] {
            if let Ok(content) = std::fs::read_to_string(&log_path) {
                for line in content.lines() {
                    let trimmed = line.trim();
                    if trimmed.starts_with("Warning:") || trimmed.contains("] Warning:") {
                        let msg = trimmed
                            .splitn(2, "Warning:")
                            .nth(1)
                            .unwrap_or(trimmed)
                            .trim()
                            .to_string();

                        // Promote timing-related warnings to critical warnings
                        let lower = msg.to_lowercase();
                        if source == "nextpnr" && (lower.contains("timing") || lower.contains("slack") || lower.contains("frequency")) {
                            critical_warnings += 1;
                            items.push(DrcItem {
                                severity: DrcSeverity::CriticalWarning,
                                code: format!("{}-CW", source.to_uppercase()),
                                message: msg,
                                location: source.to_string(),
                                action: "Review timing warning".to_string(),
                            });
                        } else {
                            warnings += 1;
                            items.push(DrcItem {
                                severity: DrcSeverity::Warning,
                                code: format!("{}-W", source.to_uppercase()),
                                message: msg,
                                location: source.to_string(),
                                action: "Review warning".to_string(),
                            });
                        }
                    } else if trimmed.starts_with("ERROR:")
                        || trimmed.starts_with("Error:")
                        || trimmed.contains("] ERROR:")
                    {
                        errors += 1;
                        let msg = trimmed
                            .splitn(2, "rror:")
                            .nth(1)
                            .unwrap_or(trimmed)
                            .trim()
                            .to_string();
                        items.push(DrcItem {
                            severity: DrcSeverity::Error,
                            code: format!("{}-E", source.to_uppercase()),
                            message: msg,
                            location: source.to_string(),
                            action: "Fix error".to_string(),
                        });
                    } else if trimmed.starts_with("Info:") || trimmed.contains("] Info:") {
                        // Capture notable info messages
                        let lower = trimmed.to_lowercase();
                        if lower.contains("constraint") || lower.contains("unplaced")
                            || lower.contains("unrouted") || lower.contains("critical")
                        {
                            info_count += 1;
                            let msg = trimmed
                                .splitn(2, "Info:")
                                .nth(1)
                                .unwrap_or(trimmed)
                                .trim()
                                .to_string();

                            // Unplaced cells are worth a critical warning
                            if lower.contains("unplaced") {
                                critical_warnings += 1;
                                items.push(DrcItem {
                                    severity: DrcSeverity::CriticalWarning,
                                    code: format!("{}-CW", source.to_uppercase()),
                                    message: msg,
                                    location: source.to_string(),
                                    action: "Check unplaced cells".to_string(),
                                });
                            } else {
                                items.push(DrcItem {
                                    severity: DrcSeverity::Info,
                                    code: format!("{}-I", source.to_uppercase()),
                                    message: msg,
                                    location: source.to_string(),
                                    action: "Review".to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }

        if items.is_empty() && errors == 0 && warnings == 0 {
            return Ok(Some(DrcReport {
                errors: 0,
                critical_warnings: 0,
                warnings: 0,
                info: 0,
                waived: 0,
                items: vec![],
            }));
        }

        Ok(Some(DrcReport {
            errors,
            critical_warnings,
            warnings,
            info: info_count,
            waived: 0,
            items,
        }))
    }

    fn read_constraints(&self, constraint_file: &Path) -> BackendResult<Vec<PinConstraint>> {
        if !constraint_file.exists() {
            return Err(BackendError::ReportNotFound(
                constraint_file.display().to_string(),
            ));
        }
        let content = std::fs::read_to_string(constraint_file)?;
        if constraint_file
            .extension()
            .is_some_and(|ext| ext == "pcf")
        {
            crate::parser::constraints::parse_pcf(&content)
        } else {
            crate::parser::constraints::parse_lpf(&content)
        }
    }

    fn write_constraints(
        &self,
        constraints: &[PinConstraint],
        output_file: &Path,
    ) -> BackendResult<()> {
        let content = if output_file
            .extension()
            .is_some_and(|ext| ext == "pcf")
        {
            crate::parser::constraints::write_pcf(constraints)
        } else {
            crate::parser::constraints::write_lpf(constraints)
        };
        std::fs::write(output_file, content)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_oss_id_and_name() {
        let b = OssBackend {
            version: "test".to_string(),
            install_dir: None,
            deferred: false,
        };
        assert_eq!(b.id(), "opensource");
        assert_eq!(b.name(), "OSS CAD Suite");
    }

    #[test]
    fn test_oss_cli_tool_is_bash() {
        let b = OssBackend {
            version: "test".to_string(),
            install_dir: None,
            deferred: false,
        };
        assert_eq!(b.cli_tool(), "bash");
    }

    #[test]
    fn test_oss_pipeline_has_three_stages() {
        let b = OssBackend {
            version: "test".to_string(),
            install_dir: None,
            deferred: false,
        };
        let stages = b.pipeline_stages();
        assert_eq!(stages.len(), 3);
        assert_eq!(stages[0].id, "synth");
        assert_eq!(stages[1].id, "pnr");
        assert_eq!(stages[2].id, "pack");
    }

    #[test]
    fn test_oss_build_script_is_bash() {
        let b = OssBackend {
            version: "test".to_string(),
            install_dir: None,
            deferred: false,
        };
        let tmp = tempfile::tempdir().unwrap();
        let script = b.generate_build_script(
            tmp.path(), "LFE5U-85F", "top", &[], &std::collections::HashMap::new(),
        ).unwrap();
        assert!(script.starts_with("#!/bin/bash"));
    }

    #[test]
    fn test_oss_build_script_contains_tools() {
        let b = OssBackend {
            version: "test".to_string(),
            install_dir: None,
            deferred: false,
        };
        let tmp = tempfile::tempdir().unwrap();
        let script = b.generate_build_script(
            tmp.path(), "LFE5U-85F", "top", &[], &std::collections::HashMap::new(),
        ).unwrap();
        assert!(script.contains("yosys"));
        assert!(script.contains("nextpnr"));
        assert!(script.contains("ecppack"));
    }

    #[test]
    fn test_oss_build_script_ice40() {
        let b = OssBackend {
            version: "test".to_string(),
            install_dir: None,
            deferred: false,
        };
        let tmp = tempfile::tempdir().unwrap();
        let script = b.generate_build_script(
            tmp.path(), "iCE40UP5K-SG48", "top", &[], &HashMap::new(),
        ).unwrap();
        assert!(script.contains("synth_ice40"));
        assert!(script.contains("nextpnr-ice40"));
        assert!(script.contains("--up5k"));
        assert!(script.contains("--package sg48"));
        assert!(script.contains("icepack"));
        assert!(script.contains("--pcf $CONSTRAINT_FILE"));
        assert!(script.contains("*.pcf"));
    }

    #[test]
    fn test_oss_build_script_gowin() {
        let b = OssBackend {
            version: "test".to_string(),
            install_dir: None,
            deferred: false,
        };
        let tmp = tempfile::tempdir().unwrap();
        let script = b.generate_build_script(
            tmp.path(), "GW1N-9-QFN88", "top", &[], &HashMap::new(),
        ).unwrap();
        assert!(script.contains("synth_gowin"));
        assert!(script.contains("nextpnr-himbaechel"));
        assert!(script.contains("--uarch gowin"));
        assert!(script.contains("gowin_pack"));
        assert!(script.contains("--cst $CONSTRAINT_FILE"));
        assert!(script.contains("*.cst"));
    }

    #[test]
    fn test_oss_build_script_nexus() {
        let b = OssBackend {
            version: "test".to_string(),
            install_dir: None,
            deferred: false,
        };
        let tmp = tempfile::tempdir().unwrap();
        let script = b.generate_build_script(
            tmp.path(), "LIFCL-40-BG400", "top", &[], &HashMap::new(),
        ).unwrap();
        assert!(script.contains("synth_nexus"));
        assert!(script.contains("nextpnr-nexus"));
        assert!(script.contains("prjoxide"));
        assert!(script.contains("--pdc $CONSTRAINT_FILE"));
        assert!(script.contains("*.pdc"));
    }

    #[test]
    fn test_oss_build_script_uses_full_paths_when_installed() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        // Create fake oss-cad-suite structure
        std::fs::create_dir_all(root.join("bin")).unwrap();
        std::fs::write(root.join("environment"), "# env\n").unwrap();
        std::fs::write(root.join("bin").join("yosys"), "").unwrap();
        std::fs::write(root.join("bin").join("nextpnr-ecp5"), "").unwrap();
        std::fs::write(root.join("bin").join("ecppack"), "").unwrap();

        let b = OssBackend {
            version: "test".to_string(),
            install_dir: Some(root.to_path_buf()),
            deferred: false,
        };
        let project_tmp = tempfile::tempdir().unwrap();
        let script = b.generate_build_script(
            project_tmp.path(), "LFE5U-85F", "top", &[], &HashMap::new(),
        ).unwrap();
        // Should contain full paths
        assert!(script.contains(&root.join("bin").join("yosys").display().to_string()));
        assert!(script.contains(&root.join("bin").join("nextpnr-ecp5").display().to_string()));
        assert!(script.contains(&root.join("bin").join("ecppack").display().to_string()));
        // Should source the environment file
        assert!(script.contains("source"));
        assert!(script.contains("environment"));
    }

    #[test]
    fn test_arch_detection() {
        assert_eq!(OssArch::from_device("LFE5U-85F-6BG381"), OssArch::Ecp5);
        assert_eq!(OssArch::from_device("LFE5UM5G-45F-8BG554"), OssArch::Ecp5);
        assert_eq!(OssArch::from_device("iCE40UP5K-SG48"), OssArch::Ice40);
        assert_eq!(OssArch::from_device("iCE40HX8K-BG121"), OssArch::Ice40);
        assert_eq!(OssArch::from_device("GW1N-9-QFN88"), OssArch::Gowin);
        assert_eq!(OssArch::from_device("GW2A-18-QFN88"), OssArch::Gowin);
        assert_eq!(OssArch::from_device("LIFCL-40-BG400"), OssArch::Nexus);
        assert_eq!(OssArch::from_device("CCGM1A1-QFN48"), OssArch::GateMate);
        assert_eq!(OssArch::from_device("LCMXO2-7000HE-4TG144I"), OssArch::MachXO2);
    }

    #[test]
    fn test_ecp5_device_parsing() {
        let (size, pkg, spd) = OssBackend::parse_ecp5_device("LFE5U-85F-6BG381");
        assert_eq!(size, "85k");
        assert_eq!(pkg, "CABGA381");
        assert_eq!(spd, "6");

        // Temperature grade suffix C (commercial) must be stripped
        let (size, pkg, spd) = OssBackend::parse_ecp5_device("LFE5U-85F-6BG381C");
        assert_eq!(size, "85k");
        assert_eq!(pkg, "CABGA381");
        assert_eq!(spd, "6");

        // Temperature grade suffix I (industrial) must be stripped
        let (_, pkg, _) = OssBackend::parse_ecp5_device("LFE5U-85F-6BG381I");
        assert_eq!(pkg, "CABGA381");

        let (size, pkg, spd) = OssBackend::parse_ecp5_device("LFE5UM5G-45F-8BG554");
        assert_eq!(size, "um5g-45k");
        assert_eq!(pkg, "CABGA554");
        assert_eq!(spd, "8");

        let (size, _pkg, _spd) = OssBackend::parse_ecp5_device("LFE5U-12F-7TQFP144");
        assert_eq!(size, "12k");
    }

    #[test]
    fn test_ice40_device_parsing() {
        let (variant, package) = OssBackend::parse_ice40_device("iCE40UP5K-SG48");
        assert_eq!(variant, "--up5k");
        assert_eq!(package, "--package sg48");

        let (variant, package) = OssBackend::parse_ice40_device("iCE40HX8K-BG121");
        assert_eq!(variant, "--hx8k");
        assert_eq!(package, "--package bg121");

        let (variant, _) = OssBackend::parse_ice40_device("iCE40LP384-CM49");
        assert_eq!(variant, "--lp384");
    }

    #[test]
    fn test_is_oss_root() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        // Not a root yet
        assert!(!OssBackend::is_oss_root(root));
        // Add environment file but no bin/yosys
        std::fs::write(root.join("environment"), "# env\n").unwrap();
        assert!(!OssBackend::is_oss_root(root));
        // Add bin/yosys
        std::fs::create_dir_all(root.join("bin")).unwrap();
        std::fs::write(root.join("bin").join("yosys"), "").unwrap();
        assert!(OssBackend::is_oss_root(root));
    }

    #[test]
    fn test_normalize_to_root_direct() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        std::fs::create_dir_all(root.join("bin")).unwrap();
        std::fs::write(root.join("environment"), "").unwrap();
        std::fs::write(root.join("bin").join("yosys"), "").unwrap();

        let result = OssBackend::normalize_to_root(root);
        assert_eq!(result, Some(root.to_path_buf()));
    }

    #[test]
    fn test_normalize_to_root_from_bin() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        std::fs::create_dir_all(root.join("bin")).unwrap();
        std::fs::write(root.join("environment"), "").unwrap();
        std::fs::write(root.join("bin").join("yosys"), "").unwrap();

        let bin_dir = root.join("bin");
        let result = OssBackend::normalize_to_root(&bin_dir);
        assert_eq!(result, Some(root.to_path_buf()));
    }

    #[test]
    fn test_normalize_to_root_from_binary() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        std::fs::create_dir_all(root.join("bin")).unwrap();
        std::fs::write(root.join("environment"), "").unwrap();
        std::fs::write(root.join("bin").join("yosys"), "").unwrap();

        let yosys_path = root.join("bin").join("yosys");
        let result = OssBackend::normalize_to_root(&yosys_path);
        assert_eq!(result, Some(root.to_path_buf()));
    }

    #[test]
    fn test_trace_to_root() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("oss-cad-suite");
        std::fs::create_dir_all(root.join("bin")).unwrap();
        std::fs::write(root.join("environment"), "").unwrap();
        std::fs::write(root.join("bin").join("yosys"), "").unwrap();

        let yosys_path = root.join("bin").join("yosys");
        let result = OssBackend::trace_to_root(&yosys_path);
        assert_eq!(result, Some(root));
    }

    #[test]
    fn test_read_version_from_file() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        std::fs::create_dir_all(root.join("bin")).unwrap();
        std::fs::write(root.join("environment"), "").unwrap();
        std::fs::write(root.join("bin").join("yosys"), "").unwrap();
        std::fs::write(root.join("VERSION"), "2024-02-15").unwrap();

        let version = OssBackend::read_version(root);
        assert_eq!(version, "2024-02-15");
    }

    #[test]
    fn test_install_dir_accessors() {
        let b = OssBackend {
            version: "test".to_string(),
            install_dir: Some(PathBuf::from("/opt/oss-cad-suite")),
            deferred: false,
        };
        assert_eq!(b.install_dir(), Some(Path::new("/opt/oss-cad-suite")));

        let b2 = OssBackend {
            version: "test".to_string(),
            install_dir: None,
            deferred: false,
        };
        assert!(b2.install_dir().is_none());
    }
}
