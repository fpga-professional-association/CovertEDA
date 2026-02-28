use crate::backend::{BackendError, BackendResult, FpgaBackend, DetectedVersion};
use crate::types::*;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Microchip Libero SoC backend.
///
/// Drives the `libero` CLI (TCL shell) for PolarFire, PolarFire SoC,
/// SmartFusion2, IGLOO2, and RTG4 device families.
///
/// Pipeline: Synthesis → Place & Route → Verify Timing → Generate Programming File
/// Constraint format: `.pdc` (physical/I/O) + `.sdc` (timing)
/// Bitstream: `.stp` programming file
pub struct LiberoBackend {
    version: String,
    install_dir: Option<PathBuf>,
}

impl LiberoBackend {
    pub fn new() -> Self {
        let (version, install_dir) = Self::detect_installation();
        Self {
            version,
            install_dir,
        }
    }

    /// Scan known Libero SoC installation paths and return (version, install_dir).
    fn detect_installation() -> (String, Option<PathBuf>) {
        let base_candidates: Vec<PathBuf> = if cfg!(target_os = "windows") {
            vec![
                PathBuf::from(r"C:\Microchip"),
                PathBuf::from(r"C:\Program Files\Microchip"),
            ]
        } else {
            vec![
                PathBuf::from("/usr/local/Microchip"),
                PathBuf::from("/opt/Microchip"),
                PathBuf::from("/mnt/c/Microchip"),
                PathBuf::from("/mnt/c/Program Files/Microchip"),
            ]
        };

        for base in &base_candidates {
            if let Ok(entries) = std::fs::read_dir(base) {
                let mut versions: Vec<(String, PathBuf)> = entries
                    .filter_map(|e| e.ok())
                    .filter(|e| e.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
                    .filter_map(|e| {
                        let name = e.file_name().to_string_lossy().to_string();
                        // Match "Libero_SoC_v12.6", "Libero_SoC_v2024.1", etc.
                        if name.starts_with("Libero_SoC_v") || name.starts_with("Libero_SoC_V") {
                            let ver = name
                                .trim_start_matches("Libero_SoC_v")
                                .trim_start_matches("Libero_SoC_V")
                                .to_string();
                            Some((ver, e.path()))
                        } else {
                            None
                        }
                    })
                    .collect();

                versions.sort_by(|a, b| a.0.cmp(&b.0));
                if let Some((ver, path)) = versions.last() {
                    return (ver.clone(), Some(path.clone()));
                }
            }
        }

        ("unknown".to_string(), None)
    }

    /// Path to the `libero` CLI executable.
    fn libero_exe(&self) -> Option<PathBuf> {
        let dir = self.install_dir.as_ref()?;
        let candidates = if cfg!(target_os = "windows") {
            vec![
                dir.join("bin").join("libero.exe"),
                dir.join("Libero").join("bin").join("libero.exe"),
            ]
        } else if dir.starts_with("/mnt/") {
            // WSL accessing a Windows install
            vec![
                dir.join("bin").join("libero.exe"),
                dir.join("Libero").join("bin").join("libero.exe"),
            ]
        } else {
            vec![
                dir.join("bin").join("libero"),
                dir.join("Libero").join("bin").join("libero"),
            ]
        };

        candidates.into_iter().find(|p| p.exists())
    }

    /// Recursively scan a directory for HDL source files, skipping testbenches.
    fn scan_sources(dir: &Path) -> Vec<PathBuf> {
        let mut results = Vec::new();
        let Ok(entries) = std::fs::read_dir(dir) else {
            return results;
        };
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_dir() {
                let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if name.starts_with('.') || name == "synthesis" || name == "impl" || name == "hdl" {
                    continue;
                }
                results.extend(Self::scan_sources(&path));
            } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                match ext {
                    "v" | "sv" | "vhd" | "vhdl" => {
                        let stem = path
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("")
                            .to_lowercase();
                        if stem.ends_with("_tb")
                            || stem.ends_with("_test")
                            || stem.ends_with("_testbench")
                            || stem.starts_with("tb_")
                            || stem.starts_with("test_")
                        {
                            continue;
                        }
                        results.push(path);
                    }
                    _ => {}
                }
            }
        }
        results
    }

    /// Recursively scan for constraint files (.sdc, .pdc).
    fn scan_constraints(dir: &Path) -> (Vec<PathBuf>, Vec<PathBuf>) {
        let mut sdc = Vec::new();
        let mut pdc = Vec::new();
        let Ok(entries) = std::fs::read_dir(dir) else {
            return (sdc, pdc);
        };
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_dir() {
                let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if name.starts_with('.') || name == "synthesis" || name == "impl" {
                    continue;
                }
                let (s, p) = Self::scan_constraints(&path);
                sdc.extend(s);
                pdc.extend(p);
            } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                match ext {
                    "sdc" => sdc.push(path),
                    "pdc" => pdc.push(path),
                    _ => {}
                }
            }
        }
        (sdc, pdc)
    }

    /// Convert a path to forward-slash TCL style, escaping braces.
    fn to_tcl_path(path: &Path) -> String {
        path.to_string_lossy().replace('\\', "/")
    }

    /// Find the impl directory for a Libero project.
    /// Libero projects use `<project_dir>/<project_name>/impl/` layout.
    #[allow(dead_code)]
    fn impl_dir(project_dir: &Path, top_module: &str) -> PathBuf {
        // Try <top_module>/impl/, then <top_module>/synthesis/
        let candidate = project_dir.join(top_module).join("impl");
        if candidate.is_dir() {
            return candidate;
        }
        project_dir.join("impl")
    }

    /// Find an existing Libero project file (.prjx) in the directory.
    fn find_project_file(project_dir: &Path) -> Option<PathBuf> {
        let Ok(entries) = std::fs::read_dir(project_dir) else {
            return None;
        };
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("prjx") {
                return Some(path);
            }
        }
        // Check one level deep (Libero creates a subdirectory with the project name)
        let Ok(entries2) = std::fs::read_dir(project_dir) else {
            return None;
        };
        for entry in entries2.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_dir() {
                let Ok(sub) = std::fs::read_dir(&path) else {
                    continue;
                };
                for sub_entry in sub.filter_map(|e| e.ok()) {
                    let sub_path = sub_entry.path();
                    if sub_path.extension().and_then(|e| e.to_str()) == Some("prjx") {
                        return Some(sub_path);
                    }
                }
            }
        }
        None
    }

    /// Return the single detected version (Libero rarely has multiple installs).
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
}

impl FpgaBackend for LiberoBackend {
    fn id(&self) -> &str {
        "libero"
    }

    fn name(&self) -> &str {
        "Microchip Libero SoC"
    }

    fn short_name(&self) -> &str {
        "Libero"
    }

    fn version(&self) -> &str {
        &self.version
    }

    fn cli_tool(&self) -> &str {
        "libero"
    }

    fn default_device(&self) -> &str {
        "MPF300T"
    }

    fn constraint_ext(&self) -> &str {
        ".pdc"
    }

    fn pipeline_stages(&self) -> Vec<PipelineStage> {
        vec![
            PipelineStage {
                id: "synth".into(),
                label: "Synthesis".into(),
                cmd: "run_tool -name {SYNTHESIZE}".into(),
                detail: "RTL to technology mapping".into(),
            },
            PipelineStage {
                id: "par".into(),
                label: "Place & Route".into(),
                cmd: "run_tool -name {PLACEROUTE}".into(),
                detail: "Placement and routing".into(),
            },
            PipelineStage {
                id: "timing".into(),
                label: "Verify Timing".into(),
                cmd: "run_tool -name {VERIFYTIMING}".into(),
                detail: "Static timing analysis".into(),
            },
            PipelineStage {
                id: "progfile".into(),
                label: "Programming File".into(),
                cmd: "run_tool -name {GENERATEPROGRAMMINGFILE}".into(),
                detail: ".stp bitstream generation".into(),
            },
        ]
    }

    fn detect_tool(&self) -> bool {
        // Check if exe path resolves, or fall back to PATH
        if self.libero_exe().is_some() {
            return true;
        }
        which::which("libero").is_ok() || which::which("libero.exe").is_ok()
    }

    fn generate_build_script(
        &self,
        project_dir: &Path,
        device: &str,
        top_module: &str,
        stages: &[String],
        options: &HashMap<String, String>,
    ) -> BackendResult<String> {
        let run_stage = |id: &str| -> bool {
            stages.is_empty() || stages.iter().any(|s| s == id)
        };

        let proj_dir_tcl = Self::to_tcl_path(project_dir);
        let freq = options
            .get("frequency_mhz")
            .and_then(|v| v.parse::<f64>().ok())
            .unwrap_or(100.0);

        // Derive package from device or use option
        let package = options
            .get("package")
            .cloned()
            .unwrap_or_else(|| default_package(device).to_string());
        let speed = options
            .get("speed_grade")
            .cloned()
            .unwrap_or_else(|| "STD".to_string());

        let mut script = format!(
            "# CovertEDA \u{2014} Libero SoC Build Script\n\
             # Device: {device}\n\
             # Top module: {top_module}\n\
             # Frequency target: {freq} MHz\n\n"
        );

        // Open existing project or create from scratch
        if let Some(prjx) = Self::find_project_file(project_dir) {
            let prjx_tcl = Self::to_tcl_path(&prjx);
            script.push_str(&format!("open_project -file {{{prjx_tcl}}}\n\n"));
        } else {
            // Create a new project
            script.push_str(&format!(
                "new_project \\\n\
                 \t-location {{{proj_dir_tcl}/{top_module}}} \\\n\
                 \t-name {{{top_module}}} \\\n\
                 \t-project_description {{}} \\\n\
                 \t-die {{{device}}} \\\n\
                 \t-package {{{package}}} \\\n\
                 \t-speed {{{speed}}} \\\n\
                 \t-die_voltage {{1.0}} \\\n\
                 \t-hdl {{VERILOG}} \\\n\
                 \t-family {{{family}}}\n\n",
                family = device_family(device),
            ));

            // Import HDL sources
            let sources = Self::scan_sources(project_dir);
            if sources.is_empty() {
                return Err(BackendError::ConfigError(
                    "No HDL source files found in project directory".into(),
                ));
            }
            for src in &sources {
                let src_tcl = Self::to_tcl_path(src);
                script.push_str(&format!(
                    "import_files -hdl_source {{{src_tcl}}}\n"
                ));
            }
            script.push('\n');

            // Import constraints
            let (sdc_files, pdc_files) = Self::scan_constraints(project_dir);
            for pdc in &pdc_files {
                let pdc_tcl = Self::to_tcl_path(pdc);
                script.push_str(&format!("import_files -io_pdc {{{pdc_tcl}}}\n"));
            }
            for sdc in &sdc_files {
                let sdc_tcl = Self::to_tcl_path(sdc);
                script.push_str(&format!("import_files -sdc {{{sdc_tcl}}}\n"));
            }
            if !sdc_files.is_empty() || !pdc_files.is_empty() {
                script.push('\n');
            }

            // Set root/top module and build hierarchy
            script.push_str(&format!(
                "set_root -module {{{top_module}::work}}\n\
                 build_design_hierarchy\n\n"
            ));

            // Configure synthesis options
            script.push_str(&format!(
                "configure_tool \\\n\
                 \t-name {{SYNTHESIZE}} \\\n\
                 \t-params {{HDL_LANGUAGE:VERILOG}} \\\n\
                 \t-params {{TOP_MODULE:{top_module}}} \\\n\
                 \t-params {{FREQUENCY:{freq}}}\n\n"
            ));

            // Configure place & route options
            script.push_str(&format!(
                "configure_tool \\\n\
                 \t-name {{PLACEROUTE}} \\\n\
                 \t-params {{EFFORT_LEVEL:true}} \\\n\
                 \t-params {{TDPR:true}} \\\n\
                 \t-params {{IOREG_COMBINING:false}}\n\n"
            ));

            // Configure timing verification
            script.push_str(
                "configure_tool \\\n\
                 \t-name {VERIFYTIMING} \\\n\
                 \t-params {CONSTRAINTS_COVERAGE:1} \\\n\
                 \t-params {IRE:1} \\\n\
                 \t-params {ORS:1} \\\n\
                 \t-params {RAM_INIT:0}\n\n",
            );
        }

        // Run stages
        if run_stage("synth") {
            script.push_str(
                "puts \"\\n=== Synthesis ===\"\n\
                 run_tool -name {SYNTHESIZE}\n\n",
            );
        }
        if run_stage("par") {
            script.push_str(
                "puts \"\\n=== Place & Route ===\"\n\
                 run_tool -name {PLACEROUTE}\n\n",
            );
        }
        if run_stage("timing") {
            script.push_str(
                "puts \"\\n=== Verify Timing ===\"\n\
                 run_tool -name {VERIFYTIMING}\n\n",
            );
        }
        if run_stage("progfile") {
            script.push_str(
                "puts \"\\n=== Generate Programming File ===\"\n\
                 run_tool -name {GENERATEPROGRAMMINGFILE}\n\n",
            );
        }

        script.push_str("puts \"\\nCovertEDA: Build complete.\"\n");

        Ok(script)
    }

    fn parse_timing_report(&self, impl_dir: &Path) -> BackendResult<TimingReport> {
        // Libero timing reports: <impl>/<top>_timing_<impl>.rpt
        // Also look for SmartTime-generated: <impl>/timing/*.rpt
        let report_path = find_timing_report(impl_dir);
        let content = match report_path {
            Some(p) => std::fs::read_to_string(&p).map_err(|e| {
                BackendError::IoError(e)
            })?,
            None => {
                return Err(BackendError::ReportNotFound(
                    "Libero timing report not found (run Verify Timing first)".into(),
                ))
            }
        };

        parse_libero_timing(&content)
    }

    fn parse_utilization_report(&self, impl_dir: &Path) -> BackendResult<ResourceReport> {
        // Libero synthesis/P&R resource reports
        let report_path = find_utilization_report(impl_dir);
        let content = match report_path {
            Some(p) => std::fs::read_to_string(&p).map_err(BackendError::IoError)?,
            None => {
                return Err(BackendError::ReportNotFound(
                    "Libero utilization report not found (run P&R first)".into(),
                ))
            }
        };

        parse_libero_utilization(&content, impl_dir.to_string_lossy().as_ref())
    }

    fn parse_power_report(&self, impl_dir: &Path) -> BackendResult<Option<PowerReport>> {
        let candidates = [
            impl_dir.join("power").join("power_report.rpt"),
            impl_dir.join("power_report.rpt"),
        ];
        for path in &candidates {
            if path.exists() {
                let content = std::fs::read_to_string(path).map_err(BackendError::IoError)?;
                return Ok(Some(parse_libero_power(&content)));
            }
        }
        Ok(None)
    }

    fn parse_drc_report(&self, impl_dir: &Path) -> BackendResult<Option<DrcReport>> {
        let candidates = [
            impl_dir.join("drc").join("drc_report.rpt"),
            impl_dir.join("drc_report.rpt"),
        ];
        for path in &candidates {
            if path.exists() {
                let content = std::fs::read_to_string(path).map_err(BackendError::IoError)?;
                return Ok(Some(parse_libero_drc(&content)));
            }
        }
        Ok(None)
    }

    fn read_constraints(&self, constraint_file: &Path) -> BackendResult<Vec<PinConstraint>> {
        let content = std::fs::read_to_string(constraint_file).map_err(BackendError::IoError)?;
        parse_pdc_constraints(&content)
    }

    fn write_constraints(
        &self,
        constraints: &[PinConstraint],
        output_file: &Path,
    ) -> BackendResult<()> {
        let content = format_pdc_constraints(constraints);
        std::fs::write(output_file, content).map_err(BackendError::IoError)
    }
}

// ── Report file discovery ────────────────────────────────────────────────────

fn find_timing_report(impl_dir: &Path) -> Option<PathBuf> {
    // Libero SmartTime output: <impl>/timing/*.rpt or <impl>/*_timing*.rpt
    let candidates = [
        impl_dir.join("timing").join("timing_report.rpt"),
        impl_dir.join("timing").join("timing_summary.rpt"),
    ];
    for c in &candidates {
        if c.exists() {
            return Some(c.clone());
        }
    }
    // Glob for *_timing*.rpt in impl_dir
    if let Ok(entries) = std::fs::read_dir(impl_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if name.contains("timing") && name.ends_with(".rpt") {
                return Some(path);
            }
        }
    }
    // Check timing subdirectory
    if let Ok(entries) = std::fs::read_dir(impl_dir.join("timing")) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("rpt") {
                return Some(path);
            }
        }
    }
    None
}

fn find_utilization_report(impl_dir: &Path) -> Option<PathBuf> {
    let candidates = [
        impl_dir.join("designer_reports").join("designer_report.rpt"),
        impl_dir.join("synthesis").join("synth_report.rpt"),
        impl_dir.join("resource_utilization.rpt"),
    ];
    for c in &candidates {
        if c.exists() {
            return Some(c.clone());
        }
    }
    // Glob for *_resource*.rpt or *designer*.rpt
    if let Ok(entries) = std::fs::read_dir(impl_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if (name.contains("resource") || name.contains("utilization") || name.contains("designer"))
                && name.ends_with(".rpt")
            {
                return Some(path);
            }
        }
    }
    None
}

// ── Report parsers ───────────────────────────────────────────────────────────

fn parse_libero_timing(content: &str) -> BackendResult<TimingReport> {
    use regex::Regex;

    // SmartTime timing report format:
    // "Fmax Summary" section with lines like:
    //   Constraint    | Actual Fmax | Required Fmax | Met
    //   CLK           | 125.50 MHz  | 100.00 MHz    | Yes
    let fmax_re = Regex::new(r"(\d+(?:\.\d+)?)\s*MHz\s*\|\s*(\d+(?:\.\d+)?)\s*MHz")
        .map_err(|e| BackendError::ParseError(e.to_string()))?;

    // WNS / TNS from timing summary table
    let wns_re = Regex::new(r"WNS\s*[:\|]\s*(-?\d+(?:\.\d+)?)")
        .map_err(|e| BackendError::ParseError(e.to_string()))?;
    let tns_re = Regex::new(r"TNS\s*[:\|]\s*(-?\d+(?:\.\d+)?)")
        .map_err(|e| BackendError::ParseError(e.to_string()))?;

    // Clock domain from "Clock Domain" or "Constraint" column
    let clock_re =
        Regex::new(r"(?m)^[ \t]*(\w[\w/]+)\s*\|\s*(\d+\.\d+)\s*MHz\s*\|\s*(\d+\.\d+)\s*MHz")
            .map_err(|e| BackendError::ParseError(e.to_string()))?;

    let mut fmax_mhz = 0.0f64;
    let mut target_mhz = 0.0f64;
    let mut clock_domains = Vec::new();

    for cap in clock_re.captures_iter(content) {
        let name = cap[1].trim().to_string();
        let actual: f64 = cap[2].parse().unwrap_or(0.0);
        let required: f64 = cap[3].parse().unwrap_or(0.0);
        if actual > fmax_mhz {
            fmax_mhz = actual;
            target_mhz = required;
        }
        clock_domains.push(ClockDomain {
            name,
            period_ns: if actual > 0.0 { 1000.0 / actual } else { 0.0 },
            frequency_mhz: actual,
            source: String::new(),
            clock_type: "register".into(),
            wns_ns: if actual >= required {
                1000.0 / actual - 1000.0 / required
            } else {
                1000.0 / required - 1000.0 / actual
            },
            path_count: 0,
        });
    }

    // If no structured table found, try simple Fmax line
    if fmax_mhz == 0.0 {
        if let Some(cap) = fmax_re.captures(content) {
            fmax_mhz = cap[1].parse().unwrap_or(0.0);
            target_mhz = cap[2].parse().unwrap_or(0.0);
        }
    }

    let wns_ns = wns_re
        .captures(content)
        .and_then(|c| c[1].parse().ok())
        .unwrap_or_else(|| if fmax_mhz >= target_mhz { 1.0 } else { -1.0 });
    let tns_ns = tns_re
        .captures(content)
        .and_then(|c| c[1].parse().ok())
        .unwrap_or(0.0);

    // Failing paths
    let fail_re = Regex::new(r"Failing Paths\s*[:\|]\s*(\d+)")
        .map_err(|e| BackendError::ParseError(e.to_string()))?;
    let total_re = Regex::new(r"Total Paths\s*[:\|]\s*(\d+)")
        .map_err(|e| BackendError::ParseError(e.to_string()))?;
    let failing_paths = fail_re
        .captures(content)
        .and_then(|c| c[1].parse().ok())
        .unwrap_or(0);
    let total_paths = total_re
        .captures(content)
        .and_then(|c| c[1].parse().ok())
        .unwrap_or(0);

    Ok(TimingReport {
        fmax_mhz,
        target_mhz,
        wns_ns,
        tns_ns,
        whs_ns: 0.0,
        ths_ns: 0.0,
        failing_paths,
        total_paths,
        clock_domains,
        critical_paths: vec![],
    })
}

fn parse_libero_utilization(content: &str, device: &str) -> BackendResult<ResourceReport> {
    use regex::Regex;

    // Libero Designer resource report format:
    // | Resource Type                       | Used | Available | Utilization |
    // | 4LUT                                |  128 |    299008 |       0.04% |
    // | D Flip-Flop (DFF)                   |   64 |    299008 |       0.02% |
    // | RAM (LSRAM, width 18)               |    0 |      2016 |       0.00% |
    // | DSP (MACC)                          |    0 |      1404 |       0.00% |
    // | I/O Used                            |   12 |       484 |       2.48% |

    let row_re = Regex::new(r"\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|")
        .map_err(|e| BackendError::ParseError(e.to_string()))?;

    let mut logic_items = Vec::new();
    let mut memory_items = Vec::new();
    let mut dsp_items = Vec::new();
    let mut io_items = Vec::new();

    for cap in row_re.captures_iter(content) {
        let name = cap[1].trim().to_string();
        let used: u64 = cap[2].parse().unwrap_or(0);
        let total: u64 = cap[3].parse().unwrap_or(0);

        if name.is_empty() || name.starts_with('-') || name.to_lowercase().contains("resource") {
            continue;
        }

        let item = ResourceItem {
            resource: name.clone(),
            used,
            total,
            detail: None,
        };

        let name_lower = name.to_lowercase();
        if name_lower.contains("lut") || name_lower.contains("flip-flop") || name_lower.contains("dff") || name_lower.contains("register") {
            logic_items.push(item);
        } else if name_lower.contains("ram") || name_lower.contains("fifo") || name_lower.contains("memory") {
            memory_items.push(item);
        } else if name_lower.contains("dsp") || name_lower.contains("macc") || name_lower.contains("mul") {
            dsp_items.push(item);
        } else if name_lower.contains("i/o") || name_lower.contains("io") || name_lower.contains("pad") {
            io_items.push(item);
        } else {
            logic_items.push(item);
        }
    }

    let mut categories = Vec::new();
    if !logic_items.is_empty() {
        categories.push(ResourceCategory { name: "Logic".into(), items: logic_items });
    }
    if !memory_items.is_empty() {
        categories.push(ResourceCategory { name: "Memory".into(), items: memory_items });
    }
    if !dsp_items.is_empty() {
        categories.push(ResourceCategory { name: "DSP".into(), items: dsp_items });
    }
    if !io_items.is_empty() {
        categories.push(ResourceCategory { name: "I/O".into(), items: io_items });
    }

    Ok(ResourceReport {
        device: device.to_string(),
        categories,
        by_module: vec![],
    })
}

fn parse_libero_power(content: &str) -> PowerReport {
    use regex::Regex;

    let total_re = Regex::new(r"Total Power\s*[:\|]\s*(\d+(?:\.\d+)?)\s*mW").ok();
    let total_mw = total_re
        .and_then(|r| r.captures(content))
        .and_then(|c| c[1].parse().ok())
        .unwrap_or(0.0);

    let temp_re = Regex::new(r"Junction Temperature\s*[:\|]\s*(\d+(?:\.\d+)?)").ok();
    let junction_temp_c = temp_re
        .and_then(|r| r.captures(content))
        .and_then(|c| c[1].parse().ok())
        .unwrap_or(25.0);

    PowerReport {
        total_mw,
        junction_temp_c,
        ambient_temp_c: 25.0,
        theta_ja: 20.0,
        confidence: "medium".into(),
        breakdown: vec![],
        by_rail: vec![],
    }
}

fn parse_libero_drc(content: &str) -> DrcReport {
    use regex::Regex;

    let err_re = Regex::new(r"(?i)errors?\s*[:\|]\s*(\d+)").ok();
    let warn_re = Regex::new(r"(?i)warnings?\s*[:\|]\s*(\d+)").ok();

    let errors = err_re
        .and_then(|r| r.captures(content))
        .and_then(|c| c[1].parse().ok())
        .unwrap_or(0);
    let warnings = warn_re
        .and_then(|r| r.captures(content))
        .and_then(|c| c[1].parse().ok())
        .unwrap_or(0);

    DrcReport {
        errors,
        critical_warnings: 0,
        warnings,
        info: 0,
        waived: 0,
        items: vec![],
    }
}

// ── PDC constraint parser ────────────────────────────────────────────────────

/// Parse Libero `.pdc` (Physical Design Constraints) file.
/// Format: `set_io {net} -pinname {pin} -fixed true -io_std {LVCMOS33}`
fn parse_pdc_constraints(content: &str) -> BackendResult<Vec<PinConstraint>> {
    use regex::Regex;

    // Net names may include brackets (e.g., led[0]), so we use [^}\s]+ to match.
    let set_io_re = Regex::new(
        r#"(?i)set_io\s+\{?([^}\s]+)\}?\s+(?:.*?)-pinname\s+\{?([A-Z0-9_]+)\}?(?:.*?-io_std\s+\{?(\w+)\}?)?"#,
    )
    .map_err(|e| BackendError::ParseError(e.to_string()))?;

    let mut constraints = Vec::new();

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('#') || trimmed.is_empty() {
            continue;
        }
        if let Some(cap) = set_io_re.captures(trimmed) {
            let net = cap[1].to_string();
            let pin = cap[2].to_string();
            let io_std = cap
                .get(3)
                .map(|m| m.as_str().to_string())
                .unwrap_or_else(|| "LVCMOS33".to_string());

            // Guess direction from net name heuristics
            let direction = if net.to_lowercase().contains("clk") || net.to_lowercase().contains("reset") {
                "IN".to_string()
            } else {
                "INOUT".to_string()
            };

            constraints.push(PinConstraint {
                pin,
                net,
                direction,
                io_standard: io_std,
                bank: String::new(),
                locked: trimmed.contains("-fixed true") || trimmed.contains("-FIXED TRUE"),
                extra: vec![],
            });
        }
    }

    Ok(constraints)
}

/// Format pin constraints as Libero `.pdc` content.
fn format_pdc_constraints(constraints: &[PinConstraint]) -> String {
    let mut out = String::from("# Libero SoC I/O Physical Constraints\n# Generated by CovertEDA\n\n");
    for c in constraints {
        out.push_str(&format!(
            "set_io {{{}}} -pinname {{{}}} -fixed true -io_std {{{}}}\n",
            c.net, c.pin, c.io_standard
        ));
    }
    out
}

// ── Device helpers ───────────────────────────────────────────────────────────

/// Return the Libero device family string for a given die name.
fn device_family(device: &str) -> &'static str {
    let d = device.to_uppercase();
    if d.starts_with("MPFS") {
        "PolarFireSoC"
    } else if d.starts_with("MPF") || d.starts_with("M2MPF") {
        "PolarFire"
    } else if d.starts_with("M2S") {
        "SmartFusion2"
    } else if d.starts_with("M2GL") {
        "IGLOO2"
    } else if d.starts_with("RT4G") {
        "RTG4"
    } else {
        "PolarFire"
    }
}

/// Return a sensible default package for a given die.
fn default_package(device: &str) -> &'static str {
    let d = device.to_uppercase();
    if d.starts_with("MPF300") {
        "FCG1152"
    } else if d.starts_with("MPF100") || d.starts_with("MPF200") {
        "FCG484"
    } else if d.starts_with("MPFS") {
        "FCVG484"
    } else if d.starts_with("M2S") || d.starts_with("M2GL") {
        "FBGA256"
    } else {
        "FCG484"
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_backend_id() {
        let b = LiberoBackend::new();
        assert_eq!(b.id(), "libero");
    }

    #[test]
    fn test_pipeline_stages() {
        let b = LiberoBackend::new();
        let stages = b.pipeline_stages();
        assert_eq!(stages.len(), 4);
        assert_eq!(stages[0].id, "synth");
        assert_eq!(stages[1].id, "par");
        assert_eq!(stages[2].id, "timing");
        assert_eq!(stages[3].id, "progfile");
    }

    #[test]
    fn test_device_family() {
        assert_eq!(device_family("MPF300T"), "PolarFire");
        assert_eq!(device_family("MPFS250T"), "PolarFireSoC");
        assert_eq!(device_family("M2S050"), "SmartFusion2");
        assert_eq!(device_family("M2GL050"), "IGLOO2");
        assert_eq!(device_family("RT4G150"), "RTG4");
    }

    #[test]
    fn test_parse_pdc_constraints() {
        let pdc = r#"
# I/O constraints
set_io {clk} -pinname {T2} -fixed true -io_std {LVCMOS33}
set_io {led[0]} -pinname {C16} -fixed true -io_std {LVCMOS33}
set_io {reset_n} -pinname {G14} -fixed true -io_std {LVCMOS33}
"#;
        let constraints = parse_pdc_constraints(pdc).unwrap();
        assert_eq!(constraints.len(), 3);
        assert_eq!(constraints[0].net, "clk");
        assert_eq!(constraints[0].pin, "T2");
        assert_eq!(constraints[0].io_standard, "LVCMOS33");
        assert!(constraints[0].locked);
    }

    #[test]
    fn test_format_pdc_constraints() {
        let constraints = vec![PinConstraint {
            pin: "T2".into(),
            net: "clk".into(),
            direction: "IN".into(),
            io_standard: "LVCMOS33".into(),
            bank: String::new(),
            locked: true,
            extra: vec![],
        }];
        let pdc = format_pdc_constraints(&constraints);
        assert!(pdc.contains("set_io {clk}"));
        assert!(pdc.contains("-pinname {T2}"));
        assert!(pdc.contains("LVCMOS33"));
    }

    #[test]
    fn test_parse_utilization_empty() {
        let result = parse_libero_utilization("", "MPF300T");
        assert!(result.is_ok());
        assert!(result.unwrap().categories.is_empty());
    }

    #[test]
    fn test_parse_utilization_table() {
        let report = r#"
+--------------------------------------+------+-----------+-------------+
| Resource Type                        | Used | Available | Utilization |
+--------------------------------------+------+-----------+-------------+
| 4LUT                                 |  128 |    299008 |       0.04% |
| D Flip-Flop (DFF)                    |   64 |    299008 |       0.02% |
| RAM (LSRAM, width 18)                |    0 |      2016 |       0.00% |
| DSP (MACC)                           |    0 |      1404 |       0.00% |
| I/O Used                             |   12 |       484 |       2.48% |
+--------------------------------------+------+-----------+-------------+
"#;
        let result = parse_libero_utilization(report, "MPF300T").unwrap();
        let lut = result
            .categories
            .iter()
            .find(|c| c.name == "Logic")
            .unwrap();
        assert!(lut.items.iter().any(|i| i.resource.contains("4LUT") && i.used == 128));
    }
}
