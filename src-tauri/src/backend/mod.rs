pub mod ace;
pub mod diamond;
pub mod libero;
pub mod oss;
pub mod quartus;
pub mod radiant;
pub mod vivado;

use crate::types::*;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use thiserror::Error;

/// Convert a filesystem path to a TCL-safe string.
///
/// TCL interprets backslashes as escape characters (`\t` → tab, `\n` → newline),
/// which silently corrupts Windows paths like `C:\top.ldf` → `C:<tab>op.ldf`.
/// This function converts all paths to forward slashes and handles WSL path
/// translation for Windows-native vendor tools.
///
/// Examples:
/// - `C:\Users\foo\project` → `C:/Users/foo/project`
/// - `/mnt/c/Users/foo`    → `C:/Users/foo`  (WSL → Windows drive)
/// - `/home/user/project`  → `//wsl.localhost/<distro>/home/user/project` (WSL native → UNC, if WSL detected)
pub fn to_tcl_path(path: &Path) -> String {
    let s = path.display().to_string();
    if s.starts_with("/mnt/") && s.len() > 6 {
        // WSL mount: /mnt/c/Users/... → C:/Users/...
        let drive = s.chars().nth(5).unwrap().to_uppercase().to_string();
        let rest = &s[6..];
        format!("{}:{}", drive, rest)
    } else if s.starts_with('/') {
        // WSL-native path — Windows tools need UNC access
        if let Ok(distro) = std::env::var("WSL_DISTRO_NAME") {
            format!("//wsl.localhost/{}{}", distro, s)
        } else {
            s
        }
    } else {
        // Windows native path — flip backslashes to forward slashes
        s.replace('\\', "/")
    }
}

/// Parse package pins from a Lattice IBIS `.pkg` file's `[Pin Numbers]` section.
/// This works for both Diamond and Radiant device families.
///
/// Searches for a matching `.pkg` file across multiple IBIS directories, matching
/// on the device family-size prefix and package ball count.
pub fn parse_lattice_ibis_pins(device: &str, ibis_dirs: &[PathBuf]) -> BackendResult<Vec<PackagePin>> {
    // Parse device string: "LIFCL-40-7BG400I" or "LAV-AT-E30-9ASG410C"
    let dev_lower = device.to_lowercase();
    let parts: Vec<&str> = dev_lower.split('-').collect();
    if parts.len() < 2 {
        return Err(BackendError::ConfigError(format!(
            "Cannot parse device '{}'. Expected format like LIFCL-40-7BG400I", device
        )));
    }

    // Fix 1: Dynamic prefix — join all segments except the last (package) segment.
    // "lifcl-40-7bg400i" → "lifcl-40", "lav-at-e30-9asg410c" → "lav-at-e30"
    let family_size = parts[..parts.len() - 1].join("-");

    // Extract package code and ball count from last segment:
    // "7bg400i" → pkg_code="bg", balls="400"
    // "9asg256c" → pkg_code="asg", balls="256"
    let pkg_part = parts.last().unwrap();
    let without_speed: &str = pkg_part.trim_start_matches(|c: char| c.is_ascii_digit());
    let pkg_code: String = without_speed
        .chars()
        .take_while(|c| c.is_ascii_alphabetic())
        .collect();
    let ball_count: String = without_speed
        .chars()
        .skip_while(|c| c.is_ascii_alphabetic())
        .take_while(|c| c.is_ascii_digit())
        .collect();

    if ball_count.is_empty() {
        return Err(BackendError::ConfigError(format!(
            "Cannot extract package ball count from device '{}'", device
        )));
    }

    // Search all provided IBIS directories for the best matching .pkg file
    let mut searched_dirs = Vec::new();
    for ibis_dir in ibis_dirs {
        if !ibis_dir.exists() { continue; }
        searched_dirs.push(ibis_dir.display().to_string());

        // Collect candidates that match the family-size prefix with boundary check
        let entries: Vec<PathBuf> = std::fs::read_dir(ibis_dir)
            .map_err(BackendError::IoError)?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .collect();

        let mut best_score = 0u32;
        let mut best_path: Option<&PathBuf> = None;

        for path in &entries {
            let name = match path.file_name().and_then(|n| n.to_str()) {
                Some(n) => n.to_lowercase(),
                None => continue,
            };
            if !name.ends_with(".pkg") { continue; }
            if !name.starts_with(&family_size) { continue; }

            // Fix 3: Boundary check — next char after prefix must be '-' or '_'
            // Prevents "lav-at-e30" matching "lav-at-e30b-asg410.pkg"
            let after_prefix = &name[family_size.len()..];
            if !after_prefix.starts_with('-') && !after_prefix.starts_with('_') {
                continue;
            }

            // Extract the package segment: strip prefix + separator, strip ".pkg"
            let segment = &after_prefix[1..after_prefix.len() - 4]; // skip '-', drop '.pkg'

            // Fix 2: Scored matching using both pkg_code and ball_count
            let score = if segment == format!("{}{}", pkg_code, ball_count) {
                // Exact match: "asg256" == "asg256"
                100
            } else if !pkg_code.is_empty()
                && segment.contains(&pkg_code)
                && segment.ends_with(&ball_count)
            {
                // Substring match: "cabga400" contains "bg" and ends with "400"
                50
            } else if segment.ends_with(&ball_count) {
                // Fallback: ball count only
                10
            } else {
                0
            };

            if score > best_score {
                best_score = score;
                best_path = Some(path);
            }
        }

        if let Some(pkg_file) = best_path {
            return parse_ibis_pkg_file(pkg_file, device);
        }
    }

    Err(BackendError::ConfigError(format!(
        "No IBIS package file found for device '{}' (looked for {}-{}*{}*.pkg in [{}])",
        device, family_size, pkg_code, ball_count,
        searched_dirs.join(", ")
    )))
}

/// Collect all Lattice IBIS directories: Radiant, Diamond, and any sibling installs.
pub fn find_lattice_ibis_dirs(primary_install: &Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    // Primary install's IBIS dir
    let primary_ibis = primary_install.join("cae_library").join("ibis");
    if primary_ibis.exists() {
        dirs.push(primary_ibis);
    }

    // Search sibling Lattice installs (e.g. /mnt/c/lscc/ contains both radiant/ and diamond/)
    if let Some(parent) = primary_install.parent().and_then(|p| p.parent()) {
        // parent is e.g. /mnt/c/lscc/
        if let Ok(entries) = std::fs::read_dir(parent) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if !path.is_dir() { continue; }
                // Look for version subdirs (e.g. /mnt/c/lscc/diamond/3.13/)
                if let Ok(versions) = std::fs::read_dir(&path) {
                    for ver in versions.filter_map(|e| e.ok()) {
                        let ibis = ver.path().join("cae_library").join("ibis");
                        if ibis.exists() && !dirs.contains(&ibis) {
                            dirs.push(ibis);
                        }
                    }
                }
                // Also check direct path (e.g. /mnt/c/lscc/diamond/cae_library/ibis)
                let ibis = path.join("cae_library").join("ibis");
                if ibis.exists() && !dirs.contains(&ibis) {
                    dirs.push(ibis);
                }
            }
        }
    }

    dirs
}

/// Parse a single IBIS `.pkg` file and extract pins from its `[Pin Numbers]` section.
fn parse_ibis_pkg_file(pkg_file: &Path, device: &str) -> BackendResult<Vec<PackagePin>> {
    let content = std::fs::read_to_string(pkg_file)
        .map_err(|e| BackendError::IoError(e))?;

    let mut pins = Vec::new();
    let mut in_section = false;
    for line in content.lines() {
        if line.contains("[Pin Numbers]") {
            in_section = true;
            continue;
        }
        if in_section && line.starts_with('[') {
            break;
        }
        if !in_section { continue; }

        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('|') { continue; }

        let segments: Vec<&str> = line.split('|').collect();
        if segments.len() < 2 { continue; }

        let pin_name = segments[0].trim();
        if pin_name.is_empty() { continue; }

        let rest: Vec<&str> = segments[1].split_whitespace().collect();
        if rest.len() < 2 { continue; }
        let net_name = rest[1];

        let (function, bank, diff_pair) = classify_lattice_pin(net_name);

        pins.push(PackagePin {
            pin: pin_name.to_string(),
            bank,
            function,
            diff_pair,
            r_ohms: None,
            l_nh: None,
            c_pf: None,
        });
    }

    if pins.is_empty() {
        return Err(BackendError::ConfigError(format!(
            "No pins parsed from {:?}. Check device part number '{}'.",
            pkg_file, device
        )));
    }

    // Parse R/L/C matrices and merge into pins
    parse_rlc_matrices(&content, &mut pins);

    Ok(pins)
}

/// Parse [Resistance Matrix], [Inductance Matrix], and [Capacitance Matrix] from
/// IBIS .pkg file content and merge values into the pin vector.
fn parse_rlc_matrices(content: &str, pins: &mut [PackagePin]) {
    // Build pin name → index lookup (owned keys to avoid borrow conflict)
    let pin_idx: HashMap<String, usize> = pins.iter().enumerate()
        .map(|(i, p)| (p.pin.clone(), i))
        .collect();

    #[derive(Clone, Copy)]
    enum MatrixKind { Resistance, Inductance, Capacitance }

    let mut current_matrix: Option<MatrixKind> = None;
    let mut current_pin: Option<usize> = None;
    let mut got_value = false;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('|') { continue; }

        // Section detection and [Row] handling
        if trimmed.starts_with('[') {
            if trimmed.contains("[Resistance Matrix]") {
                current_matrix = Some(MatrixKind::Resistance);
                current_pin = None;
                got_value = false;
            } else if trimmed.contains("[Inductance Matrix]") {
                current_matrix = Some(MatrixKind::Inductance);
                current_pin = None;
                got_value = false;
            } else if trimmed.contains("[Capacitance Matrix]") {
                current_matrix = Some(MatrixKind::Capacitance);
                current_pin = None;
                got_value = false;
            } else if trimmed.starts_with("[Row]") && current_matrix.is_some() {
                let row_pin = trimmed["[Row]".len()..].trim();
                current_pin = pin_idx.get(row_pin).copied();
                got_value = false;
            } else if trimmed.starts_with("[Bandwidth]") || trimmed.starts_with("[Row]") {
                // Known sub-section tags — ignore without ending current matrix
            } else if current_matrix.is_some() {
                // Unknown section header — end of current matrix
                current_matrix = None;
                current_pin = None;
            }
            continue;
        }

        // After [Row], the first numeric value on a data line is the self-impedance
        if let (Some(kind), Some(idx)) = (current_matrix, current_pin) {
            if got_value { continue; }
            // Parse first float on the line
            if let Some(val) = trimmed.split_whitespace()
                .find_map(|tok| tok.parse::<f64>().ok())
            {
                match kind {
                    MatrixKind::Resistance => pins[idx].r_ohms = Some(val),
                    MatrixKind::Inductance => pins[idx].l_nh = Some(val * 1e9),     // H → nH
                    MatrixKind::Capacitance => pins[idx].c_pf = Some(val * 1e12),   // F → pF
                }
                got_value = true;
            }
        }
    }
}

/// Parse a Lattice `.ibs` file's `[Pin]` section to extract I/O standard and drive
/// strength capabilities from model names. Reads only the header sections (<2000 lines)
/// — does NOT read the multi-MB model data.
pub fn parse_lattice_ibis_capabilities(device: &str, ibis_dirs: &[PathBuf])
    -> (Vec<String>, Vec<String>)
{
    let dev_lower = device.to_lowercase();
    // Extract family prefix (e.g., "lifcl" from "lifcl-40-7bg400i")
    let family = dev_lower.split('-').next().unwrap_or(&dev_lower);

    // Find the best matching .ibs file
    let mut best_path: Option<PathBuf> = None;
    let mut best_len = 0usize;

    for dir in ibis_dirs {
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            let name = match path.file_name().and_then(|n| n.to_str()) {
                Some(n) => n.to_lowercase(),
                None => continue,
            };
            if !name.ends_with(".ibs") { continue; }
            let stem = &name[..name.len() - 4];
            // Match: stem is a prefix of device family or vice versa
            if dev_lower.starts_with(stem) || family.starts_with(stem) || stem.starts_with(family) {
                if stem.len() > best_len {
                    best_len = stem.len();
                    best_path = Some(path);
                }
            }
        }
    }

    let ibs_path = match best_path {
        Some(p) => p,
        None => return (vec![], vec![]),
    };

    // Read line-by-line, stopping after [Pin] section (or [Diff pin])
    use std::collections::HashSet;
    use std::io::{BufRead, BufReader};

    let file = match std::fs::File::open(&ibs_path) {
        Ok(f) => f,
        Err(_) => return (vec![], vec![]),
    };

    let reader = BufReader::new(file);
    let mut in_pin_section = false;
    let mut models: HashSet<String> = HashSet::new();
    let mut lines_read = 0u32;

    for line_result in reader.lines() {
        let line = match line_result {
            Ok(l) => l,
            Err(_) => break,
        };
        lines_read += 1;
        // Safety: stop after 5000 lines (well before model data)
        if lines_read > 5000 && in_pin_section { break; }

        let trimmed = line.trim();
        if trimmed.starts_with('[') {
            if trimmed.contains("[Pin]") {
                in_pin_section = true;
                continue;
            } else if in_pin_section {
                // End of [Pin] section
                break;
            }
            continue;
        }

        if !in_pin_section { continue; }
        if trimmed.is_empty() || trimmed.starts_with('|') { continue; }

        // [Pin] line format: <pin_name> <signal_name> <model_name> [R/C values...]
        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.len() >= 3 {
            let model = parts[2];
            // Only decode 20-char model names (skip GND, POWER, NC, etc.)
            if model.len() >= 12 {
                models.insert(model.to_lowercase());
            }
        }
    }

    // Decode model names into I/O standards and drive strengths
    let mut io_set: HashSet<String> = HashSet::new();
    let mut drive_set: HashSet<String> = HashSet::new();

    for model in &models {
        if model.len() < 12 { continue; }
        let chars: Vec<char> = model.chars().collect();

        // Chars [0:3]: I/O standard code
        let std_code: String = chars[..3].iter().collect();
        // Chars [3:6]: Voltage code
        let volt_code: String = chars[3..6].iter().collect();
        // Chars [7:10]: Drive strength (if model long enough)
        let drive_code: String = if chars.len() >= 10 {
            chars[7..10].iter().collect()
        } else {
            String::new()
        };

        let std_name = match std_code.as_str() {
            "lvt" => "LVTTL",
            "lvc" => "LVCMOS",
            "lvs" => "LVDS",
            "slv" => "SUBLVDS",
            "svs" => "SLVS",
            "mip" => "MIPI_DPHY",
            "ss1" => "SSTL_I",
            "ss2" => "SSTL_II",
            "hs1" => "HSTL_I",
            "lve" => "LVPECL",
            "lvh" => "HSUL",
            _ => continue,
        };

        let volt_suffix = match volt_code.as_str() {
            "330" => "33",
            "250" => "25",
            "180" => "18",
            "150" => "15",
            "135" => "135",
            "120" => "12",
            "100" => "10",
            _ => "",
        };

        // Some standards (LVDS, SUBLVDS, SLVS, MIPI_DPHY) don't need a voltage suffix
        let full_std = if volt_suffix.is_empty()
            || matches!(std_name, "LVDS" | "SUBLVDS" | "SLVS" | "MIPI_DPHY")
        {
            std_name.to_string()
        } else {
            format!("{}{}", std_name, volt_suffix)
        };
        io_set.insert(full_std);

        // Also add voltage-qualified variants for standards that take them
        if !volt_suffix.is_empty() && !matches!(std_name, "LVDS" | "SUBLVDS" | "SLVS" | "MIPI_DPHY") {
            io_set.insert(format!("{}{}", std_name, volt_suffix));
        }

        // Decode drive strength
        let drive_label = match drive_code.as_str() {
            "020" => "2mA",
            "040" => "4mA",
            "060" => "6mA",
            "080" => "8mA",
            "100" => "10mA",
            "120" => "12mA",
            "160" => "16mA",
            "r50" => "50\u{03A9}",
            _ => "",
        };
        if !drive_label.is_empty() {
            drive_set.insert(drive_label.to_string());
        }
    }

    // Sort for deterministic output
    let mut io_standards: Vec<String> = io_set.into_iter().collect();
    io_standards.sort();
    let mut drive_strengths: Vec<String> = drive_set.into_iter().collect();
    // Sort numerically by extracting the number
    drive_strengths.sort_by(|a, b| {
        let na: u32 = a.chars().take_while(|c| c.is_ascii_digit()).collect::<String>().parse().unwrap_or(999);
        let nb: u32 = b.chars().take_while(|c| c.is_ascii_digit()).collect::<String>().parse().unwrap_or(999);
        na.cmp(&nb)
    });

    (io_standards, drive_strengths)
}

/// Classify a Lattice IBIS net name into (function, bank, diff_pair).
/// Works for both Radiant (Nexus) and Diamond (MachXO/ECP) device families.
fn classify_lattice_pin(net_name: &str) -> (String, Option<String>, Option<String>) {
    // User I/O pins: P{B|L|R|T}{number}{A|B} (Nexus) or PIO{bank}_{num}{A|B} (legacy)
    if net_name.len() >= 3 && net_name.starts_with('P') {
        let second = net_name.chars().nth(1);
        // Nexus style: PB4A, PL2B, PR9A, PT26A
        if matches!(second, Some('B' | 'L' | 'R' | 'T')) {
            let rest = &net_name[2..];
            let has_diff = rest.ends_with('A') || rest.ends_with('B');
            let bank_num: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();

            let bank_name = match second {
                Some('B') => format!("Bank {} (Bottom)", bank_num),
                Some('L') => format!("Bank {} (Left)", bank_num),
                Some('R') => format!("Bank {} (Right)", bank_num),
                Some('T') => format!("Bank {} (Top)", bank_num),
                _ => bank_num.clone(),
            };

            let diff_pair = if has_diff {
                let partner = if rest.ends_with('A') { 'B' } else { 'A' };
                let base = &rest[..rest.len() - 1];
                Some(format!("P{}{}{}", second.unwrap(), base, partner))
            } else {
                None
            };

            return ("User I/O".to_string(), Some(bank_name), diff_pair);
        }
        // Legacy Diamond style: PIO0_02A, PT11A, PB2A, etc.
        if net_name.starts_with("PIO") || net_name.starts_with("PL") || net_name.starts_with("PR")
            || net_name.starts_with("PB") || net_name.starts_with("PT") {
            // Already handled Nexus PB/PL/PR/PT above, this catches PIO
            let bank = net_name.chars().skip(3)
                .take_while(|c| c.is_ascii_digit())
                .collect::<String>();
            let bank_label = if bank.is_empty() { None } else { Some(format!("Bank {}", bank)) };
            return ("User I/O".to_string(), bank_label, None);
        }
    }

    // Power pins
    if net_name.starts_with("VCC") || net_name.starts_with("VSS") || net_name == "GND"
        || net_name.starts_with("VREF") {
        return (format!("Power ({})", net_name), None, None);
    }

    // Config/JTAG pins
    if net_name.starts_with("JTAG") || net_name.starts_with("TCK") || net_name.starts_with("TDI")
        || net_name.starts_with("TDO") || net_name.starts_with("TMS") || net_name.starts_with("PROGRAMN")
        || net_name.starts_with("INITN") || net_name.starts_with("DONE") || net_name.starts_with("CFG")
        || net_name.starts_with("CCLK") || net_name.starts_with("CSSPIN")
        || net_name.starts_with("SN") || net_name == "SI" || net_name == "SO" {
        return ("Config".to_string(), None, None);
    }

    // MIPI D-PHY pins
    if net_name.starts_with("DPHY") {
        let diff = if net_name.contains("_DN") {
            Some(net_name.replace("_DN", "_DP"))
        } else if net_name.contains("_DP") {
            Some(net_name.replace("_DP", "_DN"))
        } else if net_name.contains("CKN") {
            Some(net_name.replace("CKN", "CKP"))
        } else if net_name.contains("CKP") {
            Some(net_name.replace("CKP", "CKN"))
        } else {
            None
        };
        return ("MIPI D-PHY".to_string(), None, diff);
    }

    // SERDES pins
    if net_name.starts_with("SD") || net_name.starts_with("HDIN") || net_name.starts_with("HDOUT")
        || net_name.starts_with("REFCLK") {
        return ("SERDES".to_string(), None, None);
    }

    // ADC pins
    if net_name.starts_with("ADC_") {
        return ("ADC".to_string(), None, None);
    }

    // Catch-all
    (net_name.to_string(), None, None)
}

/// A package pin from the device pinout.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackagePin {
    pub pin: String,
    pub bank: Option<String>,
    pub function: String, // "User I/O", "GND", "VCCIO", "CLK", "Config"
    pub diff_pair: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub r_ohms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub l_nh: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub c_pf: Option<f64>,
}

/// Extended pin data response including I/O capabilities from IBIS files.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DevicePinData {
    pub pins: Vec<PackagePin>,
    pub io_standards: Vec<String>,
    pub drive_strengths: Vec<String>,
}

/// A detected tool version found during filesystem scanning.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedVersion {
    pub version: String,
    pub install_path: String,
    pub verified: bool,
}

#[derive(Error, Debug)]
pub enum BackendError {
    #[error("Tool not found: {0}")]
    ToolNotFound(String),
    #[error("Build failed at stage '{stage}': {message}")]
    BuildFailed { stage: String, message: String },
    #[error("Report not found: {0}")]
    ReportNotFound(String),
    #[error("Parse error: {0}")]
    ParseError(String),
    #[error("Configuration error: {0}")]
    ConfigError(String),
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
}

pub type BackendResult<T> = Result<T, BackendError>;

/// Core trait that every FPGA vendor backend must implement.
/// CovertEDA never runs synthesis/PnR itself — it generates TCL/shell scripts
/// and spawns vendor CLIs as subprocesses.
pub trait FpgaBackend: Send + Sync {
    /// Backend identifier (e.g., "diamond", "quartus", "vivado", "opensource")
    fn id(&self) -> &str;

    /// Human-readable name
    fn name(&self) -> &str;

    /// Short display name
    fn short_name(&self) -> &str;

    /// Version string of the detected vendor tool
    fn version(&self) -> &str;

    /// CLI executable name
    fn cli_tool(&self) -> &str;

    /// Default device string
    fn default_device(&self) -> &str;

    /// Constraint file extension
    fn constraint_ext(&self) -> &str;

    /// Ordered list of build pipeline stages
    fn pipeline_stages(&self) -> Vec<PipelineStage>;

    /// Generate the build script content (TCL or shell).
    /// `stages` selects which pipeline stages to run (empty = all).
    /// `options` passes backend-specific build options (e.g. frequency, optimization).
    fn generate_build_script(
        &self,
        project_dir: &Path,
        device: &str,
        top_module: &str,
        stages: &[String],
        options: &HashMap<String, String>,
    ) -> BackendResult<String>;

    /// Check if the vendor tool is installed and available on this system
    fn detect_tool(&self) -> bool;

    /// Return the install directory path as a string, if known.
    fn install_path_str(&self) -> Option<String> {
        None
    }

    /// Whether this backend was created in deferred (zero-I/O) mode.
    fn is_deferred(&self) -> bool {
        false
    }

    /// Parse a timing report from the implementation directory
    fn parse_timing_report(&self, impl_dir: &Path) -> BackendResult<TimingReport>;

    /// Parse a resource utilization report
    fn parse_utilization_report(&self, impl_dir: &Path) -> BackendResult<ResourceReport>;

    /// Parse a power report (optional — not all backends produce one)
    fn parse_power_report(&self, impl_dir: &Path) -> BackendResult<Option<PowerReport>>;

    /// Parse DRC results
    fn parse_drc_report(&self, impl_dir: &Path) -> BackendResult<Option<DrcReport>>;

    /// Read pin constraints from a constraint file
    fn read_constraints(&self, constraint_file: &Path) -> BackendResult<Vec<PinConstraint>>;

    /// Write pin constraints to a constraint file
    fn write_constraints(
        &self,
        constraints: &[PinConstraint],
        output_file: &Path,
    ) -> BackendResult<()>;

    /// Verify a device part number using the vendor CLI.
    /// Returns Ok(true) if the part is valid, Ok(false) if invalid,
    /// or Err if the CLI is not available or verification is unsupported.
    fn verify_device_part(&self, _part: &str) -> BackendResult<bool> {
        Err(BackendError::ConfigError(
            "CLI device verification not supported for this backend".into(),
        ))
    }

    /// Parse post-build pad/pinout report from the implementation directory.
    /// Returns None if no pad report is found.
    fn parse_pad_report(&self, _impl_dir: &Path) -> BackendResult<Option<PadReport>> {
        Ok(None)
    }

    /// List package pins for a device. Returns pin names, banks, functions.
    /// Default implementation returns an error (not supported).
    fn list_package_pins(&self, _device: &str) -> BackendResult<Vec<PackagePin>> {
        Err(BackendError::ConfigError(format!(
            "Pin listing not supported for {} backend",
            self.name()
        )))
    }

    /// List package pins with I/O capabilities (standards, drive strengths).
    /// Default wraps list_package_pins with empty capability lists.
    fn list_device_pin_data(&self, device: &str) -> BackendResult<DevicePinData> {
        Ok(DevicePinData {
            pins: self.list_package_pins(device)?,
            io_standards: vec![],
            drive_strengths: vec![],
        })
    }

    /// Generate a TCL/shell script to create and configure an IP core.
    /// Returns the script content and the expected output directory.
    /// `ip_name` is the vendor IP component name (e.g., "FIFO_DC", "altsyncram").
    /// `instance_name` is the user-chosen instance name.
    /// `params` maps parameter keys to values.
    fn generate_ip_script(
        &self,
        project_dir: &Path,
        device: &str,
        ip_name: &str,
        instance_name: &str,
        params: &HashMap<String, String>,
    ) -> BackendResult<(String, String)> {
        let _ = (project_dir, device, ip_name, instance_name, params);
        Err(BackendError::ConfigError(format!(
            "IP generation not supported for {} backend",
            self.name()
        )))
    }

    /// Get backend info for the frontend.
    /// Deferred backends skip pipeline_stages() allocation for fast startup.
    fn info(&self) -> BackendInfo {
        BackendInfo {
            id: self.id().to_string(),
            name: self.name().to_string(),
            short: self.short_name().to_string(),
            version: self.version().to_string(),
            cli: self.cli_tool().to_string(),
            default_device: self.default_device().to_string(),
            constraint_ext: self.constraint_ext().to_string(),
            pipeline: if self.is_deferred() { vec![] } else { self.pipeline_stages() },
            available: self.detect_tool(),
            install_path: self.install_path_str(),
        }
    }
}

/// Registry of all available backends
pub struct BackendRegistry {
    backends: Vec<Box<dyn FpgaBackend>>,
    active_idx: usize,
}

impl BackendRegistry {
    /// Create registry with full detection — scans filesystem for all tools.
    /// Use for `detect_tools` / `refresh_tools` commands.
    pub fn new() -> Self {
        Self {
            backends: vec![
                Box::new(diamond::DiamondBackend::new()),
                Box::new(radiant::RadiantBackend::new()),
                Box::new(quartus::QuartusBackend::new()),
                Box::new(quartus::QuartusBackend::new_pro()),
                Box::new(vivado::VivadoBackend::new()),
                Box::new(libero::LiberoBackend::new()),
                Box::new(oss::OssBackend::new()),
                Box::new(ace::AceBackend::new()),
            ],
            active_idx: 0,
        }
    }

    /// Create registry instantly with no filesystem I/O.
    /// Backends report version="" and available=false until `detect_tools` runs.
    pub fn new_deferred() -> Self {
        Self {
            backends: vec![
                Box::new(diamond::DiamondBackend::new_deferred()),
                Box::new(radiant::RadiantBackend::new_deferred()),
                Box::new(quartus::QuartusBackend::new_deferred()),
                Box::new(quartus::QuartusBackend::new_pro_deferred()),
                Box::new(vivado::VivadoBackend::new_deferred()),
                Box::new(libero::LiberoBackend::new_deferred()),
                Box::new(oss::OssBackend::new_deferred()),
                Box::new(ace::AceBackend::new_deferred()),
            ],
            active_idx: 0,
        }
    }

    pub fn active(&self) -> &dyn FpgaBackend {
        self.backends[self.active_idx].as_ref()
    }

    pub fn switch(&mut self, id: &str) -> bool {
        if let Some(idx) = self.backends.iter().position(|b| b.id() == id) {
            self.active_idx = idx;
            true
        } else {
            false
        }
    }

    pub fn list(&self) -> Vec<BackendInfo> {
        self.backends.iter().map(|b| b.info()).collect()
    }

    pub fn active_id(&self) -> &str {
        self.backends[self.active_idx].id()
    }

    pub fn get(&self, id: &str) -> Option<&dyn FpgaBackend> {
        self.backends
            .iter()
            .find(|b| b.id() == id)
            .map(|b| b.as_ref())
    }
}

impl Default for BackendRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_registry_new_has_eight_backends() {
        let reg = BackendRegistry::new();
        assert_eq!(reg.list().len(), 8);
    }

    #[test]
    fn test_registry_default_active_is_diamond() {
        let reg = BackendRegistry::new();
        assert_eq!(reg.active_id(), "diamond");
    }

    #[test]
    fn test_registry_switch_to_radiant() {
        let mut reg = BackendRegistry::new();
        assert!(reg.switch("radiant"));
        assert_eq!(reg.active_id(), "radiant");
    }

    #[test]
    fn test_registry_switch_to_quartus() {
        let mut reg = BackendRegistry::new();
        assert!(reg.switch("quartus"));
        assert_eq!(reg.active_id(), "quartus");
    }

    #[test]
    fn test_registry_switch_invalid() {
        let mut reg = BackendRegistry::new();
        assert!(!reg.switch("nonexistent"));
        assert_eq!(reg.active_id(), "diamond");
    }

    #[test]
    fn test_registry_get_known_backend() {
        let reg = BackendRegistry::new();
        assert!(reg.get("vivado").is_some());
        assert_eq!(reg.get("vivado").unwrap().id(), "vivado");
    }

    #[test]
    fn test_registry_get_unknown_backend() {
        let reg = BackendRegistry::new();
        assert!(reg.get("nonexistent").is_none());
    }

    #[test]
    fn test_registry_list_contains_all_ids() {
        let reg = BackendRegistry::new();
        let ids: Vec<String> = reg.list().iter().map(|b| b.id.clone()).collect();
        assert!(ids.contains(&"diamond".to_string()));
        assert!(ids.contains(&"radiant".to_string()));
        assert!(ids.contains(&"quartus".to_string()));
        assert!(ids.contains(&"quartus_pro".to_string()));
        assert!(ids.contains(&"vivado".to_string()));
        assert!(ids.contains(&"libero".to_string()));
        assert!(ids.contains(&"opensource".to_string()));
        assert!(ids.contains(&"ace".to_string()));
    }

    #[test]
    fn test_backend_info_fields_nonempty() {
        let reg = BackendRegistry::new();
        for info in reg.list() {
            assert!(!info.id.is_empty(), "id empty for {}", info.name);
            assert!(!info.name.is_empty(), "name empty for {}", info.id);
            assert!(!info.short.is_empty(), "short empty for {}", info.id);
            assert!(!info.cli.is_empty(), "cli empty for {}", info.id);
            assert!(!info.pipeline.is_empty(), "pipeline empty for {}", info.id);
        }
    }

    #[test]
    fn test_to_tcl_path_wsl_mount() {
        let path = std::path::Path::new("/mnt/c/Engr_CodeRepo/meg_hpm_fpga/top.ldf");
        let result = to_tcl_path(path);
        assert_eq!(result, "C:/Engr_CodeRepo/meg_hpm_fpga/top.ldf");
    }

    #[test]
    fn test_to_tcl_path_linux_native() {
        let path = std::path::Path::new("/home/user/project/top.v");
        let result = to_tcl_path(path);
        if std::env::var("WSL_DISTRO_NAME").is_ok() {
            assert!(result.starts_with("//wsl.localhost/"));
            assert!(result.ends_with("/home/user/project/top.v"));
        } else {
            assert_eq!(result, "/home/user/project/top.v");
        }
    }

    #[test]
    fn test_to_tcl_path_no_backslash_escapes() {
        // Ensure \t and \n in paths are NOT interpreted as tab/newline
        // This is the exact bug reported: C:\top.ldf → C:<tab>op.ldf in TCL
        let path = std::path::Path::new("/mnt/c/Users/tcove/projects/test/top.ldf");
        let result = to_tcl_path(path);
        assert!(!result.contains('\\'), "TCL path must not contain backslashes: {}", result);
        assert!(result.contains("top.ldf"), "path must preserve filename: {}", result);
    }

    // --- IBIS .pkg matching tests ---

    /// Write a minimal IBIS .pkg file with a single pin in [Pin Numbers].
    fn write_mock_pkg(dir: &Path, filename: &str, pin_name: &str) {
        let content = format!(
            "[Pin Numbers]\n{} | pin_model {}NET\n[END]\n",
            pin_name, pin_name
        );
        std::fs::write(dir.join(filename), content).unwrap();
    }

    #[test]
    fn test_ibis_match_basic() {
        // LIFCL-40-7BG400I should match lifcl-40-cabga400.pkg
        let tmp = tempfile::tempdir().unwrap();
        write_mock_pkg(tmp.path(), "lifcl-40-cabga400.pkg", "A1");
        let dirs = vec![tmp.path().to_path_buf()];
        let pins = parse_lattice_ibis_pins("LIFCL-40-7BG400I", &dirs).unwrap();
        assert_eq!(pins.len(), 1);
        assert_eq!(pins[0].pin, "A1");
    }

    #[test]
    fn test_ibis_match_collision_asg_vs_cbg() {
        // LFCPNX-100-9ASG256C should pick asg256 over cbg256
        let tmp = tempfile::tempdir().unwrap();
        write_mock_pkg(tmp.path(), "lfcpnx-100-asg256.pkg", "A1");
        write_mock_pkg(tmp.path(), "lfcpnx-100-cbg256.pkg", "B2");
        let dirs = vec![tmp.path().to_path_buf()];
        let pins = parse_lattice_ibis_pins("LFCPNX-100-9ASG256C", &dirs).unwrap();
        assert_eq!(pins[0].pin, "A1", "should pick asg256 for ASG device");
    }

    #[test]
    fn test_ibis_match_collision_bbg_vs_bfg() {
        // LFCPNX-100-8BBG484I should pick bbg484 over bfg484
        let tmp = tempfile::tempdir().unwrap();
        write_mock_pkg(tmp.path(), "lfcpnx-100-bbg484.pkg", "C3");
        write_mock_pkg(tmp.path(), "lfcpnx-100-bfg484.pkg", "D4");
        let dirs = vec![tmp.path().to_path_buf()];
        let pins = parse_lattice_ibis_pins("LFCPNX-100-8BBG484I", &dirs).unwrap();
        assert_eq!(pins[0].pin, "C3", "should pick bbg484 for BBG device");
    }

    #[test]
    fn test_ibis_match_lifcl_bg_to_cabga() {
        // LIFCL-17-7BG256C — pkg_code="bg", file="cabga256" → substring match
        let tmp = tempfile::tempdir().unwrap();
        write_mock_pkg(tmp.path(), "lifcl-17-cabga256.pkg", "E5");
        write_mock_pkg(tmp.path(), "lifcl-17-wlcsp72.pkg", "F6");
        let dirs = vec![tmp.path().to_path_buf()];
        let pins = parse_lattice_ibis_pins("LIFCL-17-7BG256C", &dirs).unwrap();
        assert_eq!(pins[0].pin, "E5", "BG should match cabga (contains 'bg')");
    }

    #[test]
    fn test_ibis_match_avant_4segment() {
        // LAV-AT-E30-9ASG410C — 4-segment device, prefix = "lav-at-e30"
        let tmp = tempfile::tempdir().unwrap();
        write_mock_pkg(tmp.path(), "lav-at-e30-asg410.pkg", "G7");
        let dirs = vec![tmp.path().to_path_buf()];
        let pins = parse_lattice_ibis_pins("LAV-AT-E30-9ASG410C", &dirs).unwrap();
        assert_eq!(pins[0].pin, "G7");
    }

    #[test]
    fn test_ibis_match_avant_asg_vs_asga() {
        // LAV-AT-E30-9ASG410C should prefer exact "asg410" over substring "asga410"
        let tmp = tempfile::tempdir().unwrap();
        write_mock_pkg(tmp.path(), "lav-at-e30-asg410.pkg", "H8");
        write_mock_pkg(tmp.path(), "lav-at-e30-asga410.pkg", "I9");
        let dirs = vec![tmp.path().to_path_buf()];
        let pins = parse_lattice_ibis_pins("LAV-AT-E30-9ASG410C", &dirs).unwrap();
        assert_eq!(pins[0].pin, "H8", "exact asg410 should beat substring asga410");
    }

    #[test]
    fn test_ibis_match_boundary_e30_vs_e30b() {
        // LAV-AT-E30-9ASG410C must NOT match "lav-at-e30b-asg410.pkg"
        let tmp = tempfile::tempdir().unwrap();
        write_mock_pkg(tmp.path(), "lav-at-e30-asg410.pkg", "J10");
        write_mock_pkg(tmp.path(), "lav-at-e30b-asg410.pkg", "K11");
        let dirs = vec![tmp.path().to_path_buf()];
        let pins = parse_lattice_ibis_pins("LAV-AT-E30-9ASG410C", &dirs).unwrap();
        assert_eq!(pins[0].pin, "J10", "e30 must not match e30b file");
    }

    #[test]
    fn test_ibis_match_uug_vs_wlcsp() {
        // LIFCL-17-7UUG36I — pkg_code="uug", balls="36"
        let tmp = tempfile::tempdir().unwrap();
        write_mock_pkg(tmp.path(), "lifcl-17-uug36.pkg", "L12");
        write_mock_pkg(tmp.path(), "lifcl-17-wlcsp36.pkg", "M13");
        let dirs = vec![tmp.path().to_path_buf()];
        let pins = parse_lattice_ibis_pins("LIFCL-17-7UUG36I", &dirs).unwrap();
        assert_eq!(pins[0].pin, "L12", "uug36 should match exactly for UUG device");
    }

    #[test]
    fn test_ibis_match_invalid_device() {
        // Single-segment device string should return ConfigError
        let tmp = tempfile::tempdir().unwrap();
        let dirs = vec![tmp.path().to_path_buf()];
        let result = parse_lattice_ibis_pins("INVALID", &dirs);
        assert!(result.is_err());
        match result.unwrap_err() {
            BackendError::ConfigError(msg) => assert!(msg.contains("Cannot parse")),
            other => panic!("expected ConfigError, got {:?}", other),
        }
    }

    /// Comprehensive integration test: parse every real IBIS .pkg file in the
    /// Radiant installation. Covers all Radiant-supported families including
    /// CLI-confirmed parts and license-gated families (Avant, Certus-N2, Nexus2).
    /// Skips gracefully if Radiant is not installed.
    #[test]
    fn test_ibis_all_radiant_parts() {
        let ibis_dir = PathBuf::from("/mnt/c/lscc/radiant/2025.2/cae_library/ibis");
        if !ibis_dir.exists() {
            eprintln!("Skipping: Radiant IBIS dir not found");
            return;
        }
        let dirs = vec![ibis_dir];

        // (device_part_number, expected_ibis_filename)
        // CLI-confirmed parts (from `dev_list_*` queries — authoritative)
        let cli_confirmed: &[(&str, &str)] = &[
            // CertusPro-NX (LFCPNX)
            ("LFCPNX-100-7ASG256A", "lfcpnx-100-asg256.pkg"),
            ("LFCPNX-100-7BBG484A", "lfcpnx-100-bbg484.pkg"),
            ("LFCPNX-100-7BFG484C", "lfcpnx-100-bfg484.pkg"),
            ("LFCPNX-100-7CBG256A", "lfcpnx-100-cbg256.pkg"),
            ("LFCPNX-100-7LFG672C", "lfcpnx-100-lfg672.pkg"),
            ("LFCPNX-50-7ASG256A", "lfcpnx-50-asg256.pkg"),
            ("LFCPNX-50-7BBG484A", "lfcpnx-50-bbg484.pkg"),
            ("LFCPNX-50-7BFG484C", "lfcpnx-50-bfg484.pkg"),
            ("LFCPNX-50-7CBG256A", "lfcpnx-50-cbg256.pkg"),
            // MachXO4 (LFMXO4)
            ("LFMXO4-010HC-5BSG132A", "lfmxo4-010hc-bsg132.pkg"),
            ("LFMXO4-010HC-5TSG100A", "lfmxo4-010hc-tsg100.pkg"),
            ("LFMXO4-010HC-5TSG144C", "lfmxo4-010hc-tsg144.pkg"),
            ("LFMXO4-010HE-5BSG132A", "lfmxo4-010he-bsg132.pkg"),
            ("LFMXO4-010HE-5TSG100A", "lfmxo4-010he-tsg100.pkg"),
            ("LFMXO4-010HE-5TSG144C", "lfmxo4-010he-tsg144.pkg"),
            ("LFMXO4-015HC-5BBG256A", "lfmxo4-015hc-bbg256.pkg"),
            ("LFMXO4-015HC-5BFG256C", "lfmxo4-015hc-bfg256.pkg"),
            ("LFMXO4-015HC-5BSG132A", "lfmxo4-015hc-bsg132.pkg"),
            ("LFMXO4-015HC-5TSG100A", "lfmxo4-015hc-tsg100.pkg"),
            ("LFMXO4-015HC-5TSG144C", "lfmxo4-015hc-tsg144.pkg"),
            ("LFMXO4-015HE-5BBG256A", "lfmxo4-015he-bbg256.pkg"),
            ("LFMXO4-015HE-5BFG256C", "lfmxo4-015he-bfg256.pkg"),
            ("LFMXO4-015HE-5BSG132A", "lfmxo4-015he-bsg132.pkg"),
            ("LFMXO4-015HE-5TSG100A", "lfmxo4-015he-tsg100.pkg"),
            ("LFMXO4-015HE-5TSG144C", "lfmxo4-015he-tsg144.pkg"),
            ("LFMXO4-015HE-5UUG36C", "lfmxo4-015he-uug36.pkg"),
            ("LFMXO4-025HC-5BBG256A", "lfmxo4-025hc-bbg256.pkg"),
            ("LFMXO4-025HC-5BFG256C", "lfmxo4-025hc-bfg256.pkg"),
            ("LFMXO4-025HC-5BSG132A", "lfmxo4-025hc-bsg132.pkg"),
            ("LFMXO4-025HC-5TSG100A", "lfmxo4-025hc-tsg100.pkg"),
            ("LFMXO4-025HC-5TSG144C", "lfmxo4-025hc-tsg144.pkg"),
            ("LFMXO4-025HE-5BBG256A", "lfmxo4-025he-bbg256.pkg"),
            ("LFMXO4-025HE-5BFG256C", "lfmxo4-025he-bfg256.pkg"),
            ("LFMXO4-025HE-5BSG132A", "lfmxo4-025he-bsg132.pkg"),
            ("LFMXO4-025HE-5TSG100A", "lfmxo4-025he-tsg100.pkg"),
            ("LFMXO4-025HE-5TSG144C", "lfmxo4-025he-tsg144.pkg"),
            ("LFMXO4-025HE-5UUG49C", "lfmxo4-025he-uug49.pkg"),
            ("LFMXO4-050HC-5BBG256A", "lfmxo4-050hc-bbg256.pkg"),
            ("LFMXO4-050HC-5BBG400C", "lfmxo4-050hc-bbg400.pkg"),
            ("LFMXO4-050HC-5BFG256C", "lfmxo4-050hc-bfg256.pkg"),
            ("LFMXO4-050HC-5BSG132A", "lfmxo4-050hc-bsg132.pkg"),
            ("LFMXO4-050HC-5TSG144C", "lfmxo4-050hc-tsg144.pkg"),
            ("LFMXO4-050HE-5BBG256A", "lfmxo4-050he-bbg256.pkg"),
            ("LFMXO4-050HE-5BBG400C", "lfmxo4-050he-bbg400.pkg"),
            ("LFMXO4-050HE-5BFG256C", "lfmxo4-050he-bfg256.pkg"),
            ("LFMXO4-050HE-5BSG132A", "lfmxo4-050he-bsg132.pkg"),
            ("LFMXO4-050HE-5TSG144A", "lfmxo4-050he-tsg144.pkg"),
            ("LFMXO4-050HE-5UUG81C", "lfmxo4-050he-uug81.pkg"),
            ("LFMXO4-080HC-5BBG256C", "lfmxo4-080hc-bbg256.pkg"),
            ("LFMXO4-080HC-5BBG400C", "lfmxo4-080hc-bbg400.pkg"),
            ("LFMXO4-080HE-5BBG256C", "lfmxo4-080he-bbg256.pkg"),
            ("LFMXO4-080HE-5BBG400C", "lfmxo4-080he-bbg400.pkg"),
            ("LFMXO4-110HC-5BBG256C", "lfmxo4-110hc-bbg256.pkg"),
            ("LFMXO4-110HC-5BBG400C", "lfmxo4-110hc-bbg400.pkg"),
            ("LFMXO4-110HC-5BBG484C", "lfmxo4-110hc-bbg484.pkg"),
            ("LFMXO4-110HE-5BBG256C", "lfmxo4-110he-bbg256.pkg"),
            ("LFMXO4-110HE-5BBG400C", "lfmxo4-110he-bbg400.pkg"),
            ("LFMXO4-110HE-5BBG484C", "lfmxo4-110he-bbg484.pkg"),
            // MachXO5-NX (LFMXO5)
            ("LFMXO5-25-7BBG256C", "lfmxo5-25-bbg256.pkg"),
            ("LFMXO5-25-7BBG400C", "lfmxo5-25-bbg400.pkg"),
            ("LFMXO5-35T-7BBG256C", "lfmxo5-35t-bbg256.pkg"),
            ("LFMXO5-35T-7BBG484C", "lfmxo5-35t-bbg484.pkg"),
            ("LFMXO5-55T-7BBG400C", "lfmxo5-55t-bbg400.pkg"),
            ("LFMXO5-65T-7BBG256C", "lfmxo5-65t-bbg256.pkg"),
            ("LFMXO5-65T-7BBG484C", "lfmxo5-65t-bbg484.pkg"),
            ("LFMXO5-100T-7BBG400C", "lfmxo5-100t-bbg400.pkg"),
            // Certus-NX / CrossLink-NX (LIFCL)
            ("LIFCL-17-7CABGA256A", "lifcl-17-cabga256.pkg"),
            ("LIFCL-17-7CSFBGA121A", "lifcl-17-csfbga121.pkg"),
            ("LIFCL-17-7QFN72C", "lifcl-17-qfn72.pkg"),
            ("LIFCL-17-8WLCSP72C", "lifcl-17-wlcsp72.pkg"),
            ("LIFCL-33-8WLCSP84C", "lifcl-33-wlcsp84.pkg"),
            ("LIFCL-33U-7FCCSP104C", "lifcl-33u-fccsp104.pkg"),
            ("LIFCL-33U-8WLCSP84C", "lifcl-33u-wlcsp84.pkg"),
            ("LIFCL-40-7CABGA256A", "lifcl-40-cabga256.pkg"),
            ("LIFCL-40-7CABGA400C", "lifcl-40-cabga400.pkg"),
            ("LIFCL-40-7CSBGA289C", "lifcl-40-csbga289.pkg"),
            ("LIFCL-40-7CSFBGA121A", "lifcl-40-csfbga121.pkg"),
            ("LIFCL-40-7QFN72C", "lifcl-40-qfn72.pkg"),
        ];

        // License-gated parts (IBIS files exist but not in our license)
        let license_gated: &[(&str, &str)] = &[
            // Avant-E (LAV-AT-E)
            ("LAV-AT-E30-7ASG410I", "lav-at-e30-asg410.pkg"),
            ("LAV-AT-E30-7ASGA410I", "lav-at-e30-asga410.pkg"),
            ("LAV-AT-E30-7CBG484I", "lav-at-e30-cbg484.pkg"),
            ("LAV-AT-E30B-7ASG410I", "lav-at-e30b-asg410.pkg"),
            ("LAV-AT-E30B-7ASGA410I", "lav-at-e30b-asga410.pkg"),
            ("LAV-AT-E30B-7CBG484I", "lav-at-e30b-cbg484.pkg"),
            ("LAV-AT-E70-7CSG841I", "lav-at-e70-csg841.pkg"),
            ("LAV-AT-E70-7LFG1156I", "lav-at-e70-lfg1156.pkg"),
            ("LAV-AT-E70-7LFG676I", "lav-at-e70-lfg676.pkg"),
            ("LAV-AT-E70B-7LFG1156I", "lav-at-e70b-lfg1156.pkg"),
            ("LAV-AT-E70B-7LFG676I", "lav-at-e70b-lfg676.pkg"),
            ("LAV-AT-E70ES1-7CSG841I", "lav-at-e70es1-csg841.pkg"),
            ("LAV-AT-E70ES1-7LFG1156I", "lav-at-e70es1-lfg1156.pkg"),
            ("LAV-AT-E70ES1-7LFG676I", "lav-at-e70es1-lfg676.pkg"),
            // Avant-G (LAV-AT-G)
            ("LAV-AT-G70-7LFG1156I", "lav-at-g70-lfg1156.pkg"),
            ("LAV-AT-G70-7LFG676I", "lav-at-g70-lfg676.pkg"),
            ("LAV-AT-G70ES-7LFG1156I", "lav-at-g70es-lfg1156.pkg"),
            ("LAV-AT-G70ES-7LFG676I", "lav-at-g70es-lfg676.pkg"),
            // Avant-X (LAV-AT-X)
            ("LAV-AT-X70-7LFG1156I", "lav-at-x70-lfg1156.pkg"),
            ("LAV-AT-X70-7LFG676I", "lav-at-x70-lfg676.pkg"),
            ("LAV-AT-X70ES-7LFG1156I", "lav-at-x70es-lfg1156.pkg"),
            ("LAV-AT-X70ES-7LFG676I", "lav-at-x70es-lfg676.pkg"),
            // Certus-N2 (LFD2NX)
            ("LFD2NX-9-7CABGA196I", "lfd2nx-9-cabga196.pkg"),
            ("LFD2NX-9-7CSFBGA121I", "lfd2nx-9-csfbga121.pkg"),
            ("LFD2NX-15-7BBG400I", "lfd2nx-15-bbg400.pkg"),
            ("LFD2NX-17-7CABGA196I", "lfd2nx-17-cabga196.pkg"),
            ("LFD2NX-17-7CSFBGA121I", "lfd2nx-17-csfbga121.pkg"),
            ("LFD2NX-25-7BBG400I", "lfd2nx-25-bbg400.pkg"),
            ("LFD2NX-28-7CABGA196I", "lfd2nx-28-cabga196.pkg"),
            ("LFD2NX-28-7CABGA256I", "lfd2nx-28-cabga256.pkg"),
            ("LFD2NX-28-7CSFBGA121I", "lfd2nx-28-csfbga121.pkg"),
            ("LFD2NX-35-7BBG484I", "lfd2nx-35-bbg484.pkg"),
            ("LFD2NX-40-7CABGA196I", "lfd2nx-40-cabga196.pkg"),
            ("LFD2NX-40-7CABGA256I", "lfd2nx-40-cabga256.pkg"),
            ("LFD2NX-40-7CSFBGA121I", "lfd2nx-40-csfbga121.pkg"),
            ("LFD2NX-65-7BBG484I", "lfd2nx-65-bbg484.pkg"),
            // MachXO4 extra packages (no HC/HE suffix variants)
            ("LFMXO4-015-7WLCSP36I", "lfmxo4-015-wlcsp36.pkg"),
            ("LFMXO4-015HC-7UUG36I", "lfmxo4-015hc-uug36.pkg"),
            ("LFMXO4-015HC-7WLCSP36I", "lfmxo4-015hc-wlcsp36.pkg"),
            ("LFMXO4-015HE-7WLCSP36I", "lfmxo4-015he-wlcsp36.pkg"),
            ("LFMXO4-025-7WLCSP49I", "lfmxo4-025-wlcsp49.pkg"),
            ("LFMXO4-025HC-7UUG49I", "lfmxo4-025hc-uug49.pkg"),
            ("LFMXO4-025HC-7WLCSP49I", "lfmxo4-025hc-wlcsp49.pkg"),
            ("LFMXO4-025HE-7WLCSP49I", "lfmxo4-025he-wlcsp49.pkg"),
            ("LFMXO4-050-7WLCSP81I", "lfmxo4-050-wlcsp81.pkg"),
            ("LFMXO4-050HC-7UUG81I", "lfmxo4-050hc-uug81.pkg"),
            ("LFMXO4-050HC-7WLCSP81I", "lfmxo4-050hc-wlcsp81.pkg"),
            ("LFMXO4-050HE-7WLCSP81I", "lfmxo4-050he-wlcsp81.pkg"),
            ("LFMXO4-110-7CABGA256I", "lfmxo4-110-cabga256.pkg"),
            ("LFMXO4-110-7CABGA400I", "lfmxo4-110-cabga400.pkg"),
            ("LFMXO4-110-7CABGA484I", "lfmxo4-110-cabga484.pkg"),
            ("LFMXO4-110HC-7CABGA256I", "lfmxo4-110hc-cabga256.pkg"),
            ("LFMXO4-110HC-7CABGA400I", "lfmxo4-110hc-cabga400.pkg"),
            ("LFMXO4-110HC-7CABGA484I", "lfmxo4-110hc-cabga484.pkg"),
            ("LFMXO4-110HE-7CABGA256I", "lfmxo4-110he-cabga256.pkg"),
            ("LFMXO4-110HE-7CABGA400I", "lfmxo4-110he-cabga400.pkg"),
            ("LFMXO4-110HE-7CABGA484I", "lfmxo4-110he-cabga484.pkg"),
            // MachXO5-NX extras (TD/TDQ/15D/AQA/HBN variants)
            ("LFMXO5-15D-7BBG256I", "lfmxo5-15d-bbg256.pkg"),
            ("LFMXO5-15D-7BBG400I", "lfmxo5-15d-bbg400.pkg"),
            ("LFMXO5-15D-AQA-7BBG400I", "lfmxo5-15d-aqa-bbg400.pkg"),
            ("LFMXO5-15D-HBN-7BBG400I", "lfmxo5-15d-hbn-bbg400.pkg"),
            ("LFMXO5-35-7BBG256I", "lfmxo5-35-bbg256.pkg"),
            ("LFMXO5-35-7BBG484I", "lfmxo5-35-bbg484.pkg"),
            ("LFMXO5-55TD-7BBG400I", "lfmxo5-55td-bbg400.pkg"),
            ("LFMXO5-55TDQ-7BBG400I", "lfmxo5-55tdq-bbg400.pkg"),
            ("LFMXO5-65-7BBG256I", "lfmxo5-65-bbg256.pkg"),
            ("LFMXO5-65-7BBG484I", "lfmxo5-65-bbg484.pkg"),
            // Nexus2 (LN2)
            ("LN2-CT-16-7ASGA410I", "ln2-ct-16-asga410.pkg"),
            ("LN2-CT-16-7CBG484I", "ln2-ct-16_cbg484.pkg"),
            ("LN2-CT-20-7ASGA410I", "ln2-ct-20-asga410.pkg"),
            ("LN2-CT-20-7CBG484I", "ln2-ct-20_cbg484.pkg"),
            ("LN2-MH-16-7CBG484I", "ln2-mh-16_cbg484.pkg"),
            ("LN2-MH-20-7CBG484I", "ln2-mh-20_cbg484.pkg"),
            // Ultra Tiny (UT24C)
            ("UT24C40-7CABGA256I", "ut24c40-cabga256.pkg"),
            ("UT24CP100-7BBG484I", "ut24cp100-bbg484.pkg"),
        ];

        let mut passed = 0;
        let mut failed = Vec::new();

        for (device, expected_ibis) in cli_confirmed.iter().chain(license_gated.iter()) {
            match parse_lattice_ibis_pins(device, &dirs) {
                Ok(pins) => {
                    assert!(
                        !pins.is_empty(),
                        "{}: parsed 0 pins from {}",
                        device, expected_ibis,
                    );
                    // Verify we got the right file by checking pin count is reasonable
                    assert!(
                        pins.len() >= 10,
                        "{}: only {} pins (expected 10+) from {}",
                        device, pins.len(), expected_ibis,
                    );
                    passed += 1;
                }
                Err(e) => {
                    failed.push(format!("{} -> {}: {}", device, expected_ibis, e));
                }
            }
        }

        let total = cli_confirmed.len() + license_gated.len();
        eprintln!(
            "IBIS pin test: {}/{} passed ({} CLI-confirmed, {} license-gated)",
            passed, total, cli_confirmed.len(), license_gated.len()
        );
        if !failed.is_empty() {
            panic!(
                "{}/{} IBIS lookups failed:\n  {}",
                failed.len(),
                total,
                failed.join("\n  ")
            );
        }
    }
}
