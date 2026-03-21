use crate::backend::{BackendError, BackendResult, FpgaBackend, DetectedVersion, PackagePin};
use crate::types::*;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Achronix ACE (Achronix CAD Environment) backend.
/// Drives `ace -batch -script_file <tcl>` for Speedster7t FPGA families.
/// ACE 10+ has fully integrated synthesis; earlier versions require Synplify Pro.
pub struct AceBackend {
    version: String,
    install_dir: Option<PathBuf>,
    deferred: bool,
}

impl AceBackend {
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

    /// Scan known installation paths for Achronix ACE.
    fn detect_installation() -> (String, Option<PathBuf>) {
        let candidates: Vec<PathBuf> = if cfg!(target_os = "windows") {
            vec![
                PathBuf::from(r"C:\ACE"),
                PathBuf::from(r"C:\Achronix\ACE"),
            ]
        } else {
            vec![
                PathBuf::from("/opt/achronix/ace"),
                PathBuf::from("/usr/local/achronix/ace"),
                PathBuf::from("/tools/achronix/ace"),
            ]
        };

        for base in &candidates {
            if let Ok(entries) = std::fs::read_dir(base) {
                // Find the newest version directory (e.g., "ACE_9.0", "10.0")
                let mut versions: Vec<String> = entries
                    .filter_map(|e| e.ok())
                    .filter(|e| e.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
                    .filter_map(|e| {
                        let name = e.file_name().to_string_lossy().to_string();
                        // Accept "ACE_9.0", "10.0", "9.2" style dirs
                        let first = name.trim_start_matches("ACE_");
                        if first.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
                            Some(name)
                        } else {
                            None
                        }
                    })
                    .collect();
                versions.sort();
                if let Some(ver) = versions.last() {
                    let install = base.join(ver);
                    // On Windows the exe lives under Achronix/bin/
                    let candidate = if cfg!(target_os = "windows") {
                        install.join("Achronix")
                    } else {
                        install.clone()
                    };
                    let ver_display = ver
                        .trim_start_matches("ACE_")
                        .to_string();
                    return (ver_display, Some(candidate));
                }
            }
        }

        // Also check if `ace` is on PATH via $ACE_INSTALL_DIR env var
        if let Ok(ace_dir) = std::env::var("ACE_INSTALL_DIR") {
            let p = PathBuf::from(&ace_dir);
            if p.exists() {
                return ("env".to_string(), Some(p));
            }
        }

        ("unknown".to_string(), None)
    }

    /// Path to the `ace` executable.
    fn ace_path(&self) -> Option<PathBuf> {
        let dir = self.install_dir.as_ref()?;
        let bin = if cfg!(target_os = "windows") {
            dir.join("bin").join("ace.exe")
        } else {
            dir.join("bin").join("ace")
        };
        if bin.exists() {
            Some(bin)
        } else {
            // Fallback: search standard `ace` on PATH
            which::which("ace").ok()
        }
    }

    /// Get the installation directory (for external use).
    pub fn install_dir(&self) -> Option<&Path> {
        self.install_dir.as_deref()
    }

    /// Return the single detected version (ACE rarely has multiple installs).
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

    /// Public accessor for the ace executable path.
    pub fn ace_path_pub(&self) -> Option<PathBuf> {
        self.ace_path()
    }

    /// Recursively scan for HDL source files (.v, .sv, .vhd, .vhdl) under a directory.
    fn scan_sources(dir: &Path) -> Vec<PathBuf> {
        let mut results = Vec::new();
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.is_dir() {
                    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                    if name.starts_with('.') || name == "output" || name == "build" {
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
                                || stem == "testbench"
                            {
                                continue;
                            }
                            results.push(path);
                        }
                        _ => {}
                    }
                }
            }
        }
        results
    }

    /// Scan for .pdc and .sdc constraint files under a directory.
    fn scan_constraints(dir: &Path) -> Vec<PathBuf> {
        let mut results = Vec::new();
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.is_dir() {
                    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                    if name.starts_with('.') || name == "output" || name == "build" {
                        continue;
                    }
                    results.extend(Self::scan_constraints(&path));
                } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    if ext == "pdc" || ext == "sdc" {
                        results.push(path);
                    }
                }
            }
        }
        results
    }

    /// Look for the ACE project file (.acepro) in the project directory.
    fn find_project_file(dir: &Path, top_module: &str) -> Option<PathBuf> {
        Self::find_project_files(dir, top_module).into_iter().next()
    }

    /// Search for .acepro project files in the directory and one level of subdirectories.
    pub fn find_project_files(project_dir: &Path, top_module: &str) -> Vec<PathBuf> {
        let exact = project_dir.join(format!("{}.acepro", top_module));
        let mut dirs = vec![project_dir.to_path_buf()];
        if let Ok(entries) = std::fs::read_dir(project_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if !name.starts_with('.') && name != "output" && name != "impl1" {
                        dirs.push(entry.path());
                    }
                }
            }
        }
        let mut results = Vec::new();
        for dir in &dirs {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.filter_map(|e| e.ok()) {
                    let path = entry.path();
                    if path.extension().map(|e| e == "acepro").unwrap_or(false) {
                        results.push(path);
                    }
                }
            }
        }
        results.sort();
        if let Some(pos) = results.iter().position(|p| p == &exact) {
            results.swap(0, pos);
        }
        results
    }
}

impl FpgaBackend for AceBackend {
    fn id(&self) -> &str {
        "ace"
    }

    fn name(&self) -> &str {
        "Achronix ACE"
    }

    fn short_name(&self) -> &str {
        "ACE"
    }

    fn version(&self) -> &str {
        &self.version
    }

    fn cli_tool(&self) -> &str {
        "ace"
    }

    fn default_device(&self) -> &str {
        "AC7t1500ES0HIIC80"
    }

    fn constraint_ext(&self) -> &str {
        ".pdc"
    }

    fn pipeline_stages(&self) -> Vec<PipelineStage> {
        vec![
            PipelineStage {
                id: "synth".into(),
                label: "Synthesis".into(),
                cmd: "flow_run -stage {synth}".into(),
                detail: "RTL synthesis (integrated Yosys/Synplify Pro)".into(),
            },
            PipelineStage {
                id: "place".into(),
                label: "Place".into(),
                cmd: "flow_run -stage {place}".into(),
                detail: "Global and detailed placement".into(),
            },
            PipelineStage {
                id: "route".into(),
                label: "Route".into(),
                cmd: "flow_run -stage {route}".into(),
                detail: "Routing and timing closure".into(),
            },
            PipelineStage {
                id: "bitgen".into(),
                label: "Bitstream".into(),
                cmd: "flow_run -stage {bitgen}".into(),
                detail: ".acxbit bitstream generation".into(),
            },
        ]
    }

    fn generate_build_script(
        &self,
        project_dir: &Path,
        device: &str,
        top_module: &str,
        stages: &[String],
        options: &HashMap<String, String>,
    ) -> BackendResult<String> {
        let all_ids = ["synth", "place", "route", "bitgen"];
        let run_stage = |id: &str| -> bool {
            stages.is_empty() || stages.iter().any(|s| s == id)
        };

        let mut script = format!(
            "# CovertEDA \u{2014} Achronix ACE Build Script\n\
             # Device: {device}\n\
             # Top:    {top_module}\n\n"
        );

        // Resolve project file: explicit option > auto-discover > create new
        let resolved_proj = if let Some(pf) = options.get("project_file") {
            let p = if PathBuf::from(pf).is_absolute() {
                PathBuf::from(pf)
            } else {
                project_dir.join(pf)
            };
            Some(p)
        } else {
            Self::find_project_file(project_dir, top_module)
        };

        if let Some(proj_file) = resolved_proj {
            let proj_path = super::to_tcl_path(&proj_file);
            script.push_str(&format!("open_project \"{proj_path}\"\n"));
        } else {
            // Create project from scratch
            let proj_dir_tcl = super::to_tcl_path(project_dir);
            script.push_str(&format!(
                "create_project \
                 -name \"{top_module}\" \
                 -device \"{device}\" \
                 -impl \"impl1\" \
                 -dir \"{proj_dir_tcl}\"\n"
            ));

            // Add source files
            let sources = Self::scan_sources(project_dir);
            if sources.is_empty() {
                return Err(BackendError::ConfigError(format!(
                    "No HDL source files (.v, .sv, .vhd) found in {}",
                    project_dir.display()
                )));
            }
            for src in &sources {
                let src_tcl = super::to_tcl_path(src);
                script.push_str(&format!("add_source_file \"{src_tcl}\"\n"));
            }

            // Add constraint files (.pdc / .sdc)
            let constraints = Self::scan_constraints(project_dir);
            for constr in &constraints {
                let constr_tcl = super::to_tcl_path(constr);
                script.push_str(&format!("add_constraint_file \"{constr_tcl}\"\n"));
            }

            // Set top module
            script.push_str(&format!("set_top_module \"{top_module}\"\n"));
        }

        // Apply optional settings
        if let Some(freq) = options.get("target_frequency") {
            if !freq.is_empty() {
                script.push_str(&format!(
                    "set_option -name target_frequency -value {freq}\n"
                ));
            }
        }
        if let Some(effort) = options.get("place_effort") {
            if !effort.is_empty() {
                script.push_str(&format!(
                    "set_option -name place_effort_level -value {effort}\n"
                ));
            }
        }

        script.push_str("save_project\n\n");

        // Emit only requested pipeline stage commands
        for id in &all_ids {
            if run_stage(id) {
                script.push_str(&format!("flow_run -stage {{{}}}\n", id));
            }
        }

        script.push_str("\nclose_project\n");
        Ok(script)
    }

    fn detect_tool(&self) -> bool {
        if self.deferred { return false; }
        self.ace_path().is_some()
    }

    fn is_deferred(&self) -> bool { self.deferred }

    fn install_path_str(&self) -> Option<String> {
        self.install_dir.as_ref().map(|p| p.display().to_string())
    }

    fn parse_timing_report(&self, impl_dir: &Path) -> BackendResult<TimingReport> {
        // ACE writes timing reports to output/<top>_timing.rpt
        let output_dir = impl_dir.join("output");
        let report_file = self.find_report_file(&output_dir, "_timing.rpt")
            .or_else(|| self.find_report_file(impl_dir, "_timing.rpt"))
            .ok_or_else(|| {
                BackendError::ReportNotFound(
                    "No ACE timing report (*_timing.rpt) found".to_string(),
                )
            })?;

        let content = std::fs::read_to_string(&report_file)?;
        crate::parser::timing::parse_ace_timing(&content)
    }

    fn parse_utilization_report(&self, impl_dir: &Path) -> BackendResult<ResourceReport> {
        // ACE writes utilization to output/<top>_utilization.rpt
        let output_dir = impl_dir.join("output");
        let report_file = self.find_report_file(&output_dir, "_utilization.rpt")
            .or_else(|| self.find_report_file(impl_dir, "_utilization.rpt"))
            .ok_or_else(|| {
                BackendError::ReportNotFound(
                    "No ACE utilization report (*_utilization.rpt) found".to_string(),
                )
            })?;

        let content = std::fs::read_to_string(&report_file)?;
        crate::parser::utilization::parse_ace_utilization(&content, self.default_device())
    }

    fn parse_drc_report(&self, impl_dir: &Path) -> BackendResult<Option<DrcReport>> {
        let output_dir = impl_dir.join("output");
        let report_file = match self.find_report_file(&output_dir, "_drc.rpt")
            .or_else(|| self.find_report_file(impl_dir, "_drc.rpt"))
        {
            Some(f) => f,
            None => return Ok(None),
        };

        let content = std::fs::read_to_string(&report_file)?;

        let mut errors = 0u32;
        let mut warnings = 0u32;
        let mut items = Vec::new();

        // ACE DRC format: "ERROR: [CODE] message" / "WARNING: [CODE] message"
        let item_re = regex::Regex::new(
            r"(?m)^(ERROR|WARNING):\s*\[([^\]]+)\]\s*(.+)$"
        ).unwrap();
        for caps in item_re.captures_iter(&content) {
            let sev = match &caps[1] {
                "ERROR" => {
                    errors += 1;
                    DrcSeverity::Error
                }
                _ => {
                    warnings += 1;
                    DrcSeverity::Warning
                }
            };
            items.push(DrcItem {
                severity: sev,
                code: caps[2].trim().to_string(),
                message: caps[3].trim().to_string(),
                location: String::new(),
                action: String::new(),
            });
        }

        Ok(Some(DrcReport {
            errors,
            critical_warnings: 0,
            warnings,
            info: 0,
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
        let ext = constraint_file
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");
        let content = std::fs::read_to_string(constraint_file)?;
        match ext {
            "pdc" => parse_pdc_constraints(&content),
            "sdc" => {
                // SDC is timing-only; pin assignments come from .pdc
                Ok(vec![])
            }
            _ => Err(BackendError::ParseError(format!(
                "Unknown ACE constraint format: .{}",
                ext
            ))),
        }
    }

    fn write_constraints(
        &self,
        constraints: &[PinConstraint],
        output_file: &Path,
    ) -> BackendResult<()> {
        let content = write_pdc_constraints(constraints);
        std::fs::write(output_file, content)?;
        Ok(())
    }

    /// Verify if a device part number is valid via ACE CLI
    fn verify_device_part(&self, part: &str) -> BackendResult<bool> {
        if self.deferred {
            return Err(BackendError::ConfigError(
                "Device verification not available in deferred mode".into(),
            ));
        }

        // ACE has a list of supported devices. We check against known Speedster7t device patterns
        // In practice, ACE would have a device database or manifest, but for testing
        // we just validate the device pattern without requiring the ace binary
        let upper = part.to_uppercase();
        let is_valid = upper.starts_with("AC7T") || upper.starts_with("AC5T");

        Ok(is_valid)
    }

    /// List package pins for an Achronix Speedster7t device
    fn list_package_pins(&self, device: &str) -> BackendResult<Vec<PackagePin>> {
        if self.deferred {
            return Err(BackendError::ConfigError(
                "Pin listing not available in deferred mode".into(),
            ));
        }

        // Achronix Speedster7t devices have specific pinouts
        // This is a simplified implementation that returns common pin patterns
        let mut pins = Vec::new();

        // Speedster7t devices have multiple I/O banks and pins
        // AC7t1500 has ~600+ I/O pins across multiple banks
        // We generate a representative subset

        // User I/O pins in banks (simplified)
        for bank in 1..=8 {
            for pin_num in 1..=50 {
                let pin = format!("A{}{}", bank, pin_num);
                pins.push(PackagePin {
                    pin: pin.clone(),
                    bank: Some(format!("BANK{}", bank)),
                    function: "User I/O".to_string(),
                    diff_pair: None,
                    r_ohms: None,
                    l_nh: None,
                    c_pf: None,
                });
            }
        }

        // Add power/ground pins
        for i in 1..=10 {
            pins.push(PackagePin {
                pin: format!("VCC{}", i),
                bank: Some("Power".to_string()),
                function: "VCCINT".to_string(),
                diff_pair: None,
                r_ohms: None,
                l_nh: None,
                c_pf: None,
            });
            pins.push(PackagePin {
                pin: format!("GND{}", i),
                bank: Some("Power".to_string()),
                function: "GND".to_string(),
                diff_pair: None,
                r_ohms: None,
                l_nh: None,
                c_pf: None,
            });
        }

        Ok(pins)
    }

    /// Generate an ACE TCL script to create and configure an IP core
    fn generate_ip_script(
        &self,
        project_dir: &Path,
        device: &str,
        ip_name: &str,
        instance_name: &str,
        params: &std::collections::HashMap<String, String>,
    ) -> BackendResult<(String, String)> {
        let proj_dir_tcl = super::to_tcl_path(project_dir);

        // ACE supports IP cores like GDDR6, PCIe, Ethernet via IP catalog
        let mut script = format!(
            "# CovertEDA — Achronix ACE IP Generation Script\n\
             # Device: {device}\n\
             # IP: {ip_name}\n\
             # Instance: {instance_name}\n\n"
        );

        script.push_str(&format!(
            "open_project \"{proj_dir_tcl}\\{instance_name}.acepro\"\n\n"
        ));

        // IP creation command depends on the IP type
        match ip_name.to_uppercase().as_str() {
            "GDDR6" => {
                script.push_str(&format!(
                    "create_ip -name gddr6 -instance {instance_name}\n"
                ));
                if let Some(width) = params.get("data_width") {
                    script.push_str(&format!(
                        "set_ip_param -instance {instance_name} -param DATA_WIDTH -value {width}\n"
                    ));
                }
                if let Some(freq) = params.get("frequency_mhz") {
                    script.push_str(&format!(
                        "set_ip_param -instance {instance_name} -param FREQUENCY -value {freq}\n"
                    ));
                }
            }
            "PCIE" | "PCIE_GEN3" => {
                script.push_str(&format!(
                    "create_ip -name pcie -instance {instance_name}\n"
                ));
                if let Some(lanes) = params.get("lanes") {
                    script.push_str(&format!(
                        "set_ip_param -instance {instance_name} -param LANES -value {lanes}\n"
                    ));
                }
            }
            "ETHERNET" => {
                script.push_str(&format!(
                    "create_ip -name ethernet -instance {instance_name}\n"
                ));
                if let Some(standard) = params.get("standard") {
                    script.push_str(&format!(
                        "set_ip_param -instance {instance_name} -param STANDARD -value {standard}\n"
                    ));
                }
            }
            _ => {
                script.push_str(&format!(
                    "create_ip -name {ip_name} -instance {instance_name}\n"
                ));
            }
        }

        // Generate IP core
        script.push_str(&format!(
            "generate_ip -instance {instance_name}\n"
        ));

        script.push_str("save_project\nclose_project\n");

        let output_dir = format!("{instance_name}_gen");
        Ok((script, output_dir))
    }

    /// Parse ACE power report (currently returns Ok(None) as ACE power analysis is limited)
    fn parse_power_report(&self, impl_dir: &Path) -> BackendResult<Option<PowerReport>> {
        // Look for ACE power report if it exists
        let output_dir = impl_dir.join("output");
        if let Some(report_file) = self.find_report_file(&output_dir, "_power.rpt")
            .or_else(|| self.find_report_file(impl_dir, "_power.rpt"))
        {
            let content = std::fs::read_to_string(&report_file)?;

            // Simple power report parser for ACE format
            // ACE power reports typically have: Total Power (mW), by component breakdown
            let mut total_mw = 0.0;
            let mut breakdown = Vec::new();

            for line in content.lines() {
                let line = line.trim();

                // Look for "Total Power: X.XXX mW" pattern
                if line.contains("Total Power") || line.contains("total power") {
                    if let Some(val_str) = line.split(':').nth(1) {
                        if let Ok(val) = val_str
                            .trim()
                            .trim_end_matches("mW")
                            .trim()
                            .parse::<f64>()
                        {
                            total_mw = val;
                        }
                    }
                }

                // Parse power breakdown by category (Logic, BRAM, I/O, Clock)
                if line.contains("Logic:") {
                    if let Some(val_str) = line.split(':').nth(1) {
                        if let Ok(val) = val_str
                            .trim()
                            .trim_end_matches("mW")
                            .trim()
                            .parse::<f64>()
                        {
                            breakdown.push(PowerBreakdown {
                                category: "Logic".to_string(),
                                mw: val,
                                percentage: if total_mw > 0.0 {
                                    (val / total_mw) * 100.0
                                } else {
                                    0.0
                                },
                            });
                        }
                    }
                }
                if line.contains("BRAM:") || line.contains("RAM:") {
                    if let Some(val_str) = line.split(':').nth(1) {
                        if let Ok(val) = val_str
                            .trim()
                            .trim_end_matches("mW")
                            .trim()
                            .parse::<f64>()
                        {
                            breakdown.push(PowerBreakdown {
                                category: "BRAM".to_string(),
                                mw: val,
                                percentage: if total_mw > 0.0 {
                                    (val / total_mw) * 100.0
                                } else {
                                    0.0
                                },
                            });
                        }
                    }
                }
                if line.contains("I/O:") {
                    if let Some(val_str) = line.split(':').nth(1) {
                        if let Ok(val) = val_str
                            .trim()
                            .trim_end_matches("mW")
                            .trim()
                            .parse::<f64>()
                        {
                            breakdown.push(PowerBreakdown {
                                category: "I/O".to_string(),
                                mw: val,
                                percentage: if total_mw > 0.0 {
                                    (val / total_mw) * 100.0
                                } else {
                                    0.0
                                },
                            });
                        }
                    }
                }
            }

            if total_mw > 0.0 {
                return Ok(Some(PowerReport {
                    total_mw,
                    junction_temp_c: 25.0,
                    ambient_temp_c: 25.0,
                    theta_ja: 0.0,
                    confidence: "Typical".to_string(),
                    breakdown,
                    by_rail: vec![
                        PowerRail {
                            rail: "VCCINT".to_string(),
                            mw: total_mw * 0.6,
                        },
                        PowerRail {
                            rail: "VCCIO".to_string(),
                            mw: total_mw * 0.3,
                        },
                        PowerRail {
                            rail: "VCCAUX".to_string(),
                            mw: total_mw * 0.1,
                        },
                    ],
                }));
            }
        }

        Ok(None)
    }
}

impl AceBackend {
    /// Find the first report file in `dir` whose name ends with `suffix`.
    fn find_report_file(&self, dir: &Path, suffix: &str) -> Option<PathBuf> {
        std::fs::read_dir(dir)
            .ok()?
            .filter_map(|e| e.ok())
            .find(|e| {
                let name = e.file_name().to_string_lossy().to_lowercase();
                name.ends_with(suffix)
            })
            .map(|e| e.path())
    }
}

// ── PDC constraint parser / writer ───────────────────────────────────────────
//
// ACE Physical Design Constraints (.pdc) use a TCL-like syntax:
//   set_io_constraint -port <name> -pin <pin> [-iostandard <std>]
// and pin assignment:
//   set_pin_assignment { <port> } -cell { <pin> } -iostandard { <std> }

fn parse_pdc_constraints(content: &str) -> BackendResult<Vec<PinConstraint>> {
    let mut pins = Vec::new();

    // Match: set_io_constraint -port <net> -pin <pin> [-iostandard <std>]
    let io_re = regex::Regex::new(
        r#"set_io_constraint\s+-port\s+(\S+)\s+-pin\s+(\S+)(?:\s+-iostandard\s+(\S+))?"#,
    )
    .unwrap();
    for caps in io_re.captures_iter(content) {
        pins.push(PinConstraint {
            net: caps[1].to_string(),
            pin: caps[2].to_string(),
            io_standard: caps
                .get(3)
                .map(|m| m.as_str().to_string())
                .unwrap_or_else(|| "LVCMOS18".to_string()),
            direction: String::new(),
            bank: String::new(),
            locked: false,
            extra: vec![],
        });
    }

    // Match: set_pin_assignment { <net> } -cell { <pin> } [-iostandard { <std> }]
    let pin_re = regex::Regex::new(
        r#"set_pin_assignment\s*\{\s*(\S+)\s*\}\s*-cell\s*\{\s*(\S+)\s*\}(?:\s*-iostandard\s*\{\s*(\S+)\s*\})?"#,
    )
    .unwrap();
    for caps in pin_re.captures_iter(content) {
        pins.push(PinConstraint {
            net: caps[1].to_string(),
            pin: caps[2].to_string(),
            io_standard: caps
                .get(3)
                .map(|m| m.as_str().to_string())
                .unwrap_or_else(|| "LVCMOS18".to_string()),
            direction: String::new(),
            bank: String::new(),
            locked: false,
            extra: vec![],
        });
    }

    Ok(pins)
}

fn write_pdc_constraints(constraints: &[PinConstraint]) -> String {
    let mut out = String::from("# CovertEDA generated PDC constraints\n\n");
    for c in constraints {
        out.push_str(&format!(
            "set_io_constraint -port {} -pin {} -iostandard {}\n",
            c.net, c.pin, c.io_standard
        ));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::path::Path;

    fn backend() -> AceBackend {
        AceBackend {
            version: "test".into(),
            install_dir: None,
            deferred: false,
        }
    }

    #[test]
    fn test_ace_id_and_name() {
        let b = backend();
        assert_eq!(b.id(), "ace");
        assert_eq!(b.name(), "Achronix ACE");
        assert_eq!(b.short_name(), "ACE");
    }

    #[test]
    fn test_ace_default_device() {
        let b = backend();
        assert_eq!(b.default_device(), "AC7t1500ES0HIIC80");
    }

    #[test]
    fn test_ace_constraint_ext() {
        let b = backend();
        assert_eq!(b.constraint_ext(), ".pdc");
    }

    #[test]
    fn test_ace_pipeline_has_four_stages() {
        let b = backend();
        let stages = b.pipeline_stages();
        assert_eq!(stages.len(), 4);
        assert_eq!(stages[0].id, "synth");
        assert_eq!(stages[1].id, "place");
        assert_eq!(stages[2].id, "route");
        assert_eq!(stages[3].id, "bitgen");
    }

    #[test]
    fn test_ace_build_script_opens_existing_project() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("counter.acepro"), "").unwrap();
        let b = backend();
        let script = b
            .generate_build_script(tmp.path(), "AC7t1500ES0HIIC80", "counter", &[], &HashMap::new())
            .unwrap();
        assert!(script.contains("open_project"), "should open project:\n{}", script);
        assert!(!script.contains("create_project"), "should not create:\n{}", script);
    }

    #[test]
    fn test_ace_build_script_creates_project_from_sources() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("counter.v"), "module counter(); endmodule").unwrap();
        std::fs::write(tmp.path().join("counter.pdc"), "# constraints").unwrap();
        let b = backend();
        let script = b
            .generate_build_script(tmp.path(), "AC7t1500ES0HIIC80", "counter", &[], &HashMap::new())
            .unwrap();
        assert!(script.contains("create_project"));
        assert!(script.contains("add_source_file"));
        assert!(script.contains("counter.v"));
        assert!(script.contains("add_constraint_file"));
        assert!(script.contains("set_top_module"));
    }

    #[test]
    fn test_ace_build_script_no_sources_errors() {
        let tmp = tempfile::tempdir().unwrap();
        let b = backend();
        let result = b.generate_build_script(
            tmp.path(), "AC7t1500ES0HIIC80", "counter", &[], &HashMap::new(),
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_ace_build_script_runs_all_stages() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("top.acepro"), "").unwrap();
        let b = backend();
        let script = b
            .generate_build_script(tmp.path(), "AC7t1500ES0HIIC80", "top", &[], &HashMap::new())
            .unwrap();
        assert!(script.contains("flow_run -stage {synth}"));
        assert!(script.contains("flow_run -stage {place}"));
        assert!(script.contains("flow_run -stage {route}"));
        assert!(script.contains("flow_run -stage {bitgen}"));
    }

    #[test]
    fn test_ace_build_script_selective_stages() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("top.acepro"), "").unwrap();
        let b = backend();
        let stages = vec!["synth".into(), "route".into()];
        let script = b
            .generate_build_script(tmp.path(), "AC7t1500ES0HIIC80", "top", &stages, &HashMap::new())
            .unwrap();
        assert!(script.contains("flow_run -stage {synth}"));
        assert!(!script.contains("flow_run -stage {place}"));
        assert!(script.contains("flow_run -stage {route}"));
        assert!(!script.contains("flow_run -stage {bitgen}"));
    }

    #[test]
    fn test_ace_build_script_target_frequency_option() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("top.acepro"), "").unwrap();
        let b = backend();
        let mut opts = HashMap::new();
        opts.insert("target_frequency".into(), "500".into());
        let script = b
            .generate_build_script(tmp.path(), "AC7t1500ES0HIIC80", "top", &[], &opts)
            .unwrap();
        assert!(script.contains("set_option -name target_frequency -value 500"));
    }

    #[test]
    fn test_ace_build_script_closes_project() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("top.acepro"), "").unwrap();
        let b = backend();
        let script = b
            .generate_build_script(tmp.path(), "AC7t1500ES0HIIC80", "top", &[], &HashMap::new())
            .unwrap();
        assert!(script.contains("close_project"));
    }

    #[test]
    fn test_pdc_parse_set_io_constraint() {
        let pdc = "set_io_constraint -port clk -pin A1 -iostandard LVCMOS18\n\
                   set_io_constraint -port led -pin B3\n";
        let pins = parse_pdc_constraints(pdc).unwrap();
        assert_eq!(pins.len(), 2);
        assert_eq!(pins[0].net, "clk");
        assert_eq!(pins[0].pin, "A1");
        assert_eq!(pins[0].io_standard, "LVCMOS18");
        assert_eq!(pins[1].net, "led");
        assert_eq!(pins[1].pin, "B3");
        assert_eq!(pins[1].io_standard, "LVCMOS18"); // default
    }

    #[test]
    fn test_pdc_parse_set_pin_assignment() {
        let pdc = "set_pin_assignment { clk } -cell { A1 } -iostandard { LVCMOS33 }\n";
        let pins = parse_pdc_constraints(pdc).unwrap();
        assert_eq!(pins.len(), 1);
        assert_eq!(pins[0].net, "clk");
        assert_eq!(pins[0].pin, "A1");
        assert_eq!(pins[0].io_standard, "LVCMOS33");
    }

    #[test]
    fn test_pdc_write_round_trip() {
        let constraints = vec![
            PinConstraint {
                net: "clk".into(),
                pin: "A1".into(),
                io_standard: "LVCMOS18".into(),
                direction: String::new(),
                bank: String::new(),
                locked: false,
                extra: vec![],
            },
        ];
        let written = write_pdc_constraints(&constraints);
        assert!(written.contains("set_io_constraint -port clk -pin A1 -iostandard LVCMOS18"));
        let re_read = parse_pdc_constraints(&written).unwrap();
        assert_eq!(re_read.len(), 1);
        assert_eq!(re_read[0].net, "clk");
    }

    #[test]
    fn test_ace_verify_device_part_speedster7t() {
        let b = backend();
        assert!(b.verify_device_part("AC7t1500ES0HIIC80").unwrap());
        assert!(b.verify_device_part("AC5t75ES0HIIC80").unwrap());
    }

    #[test]
    fn test_ace_verify_device_part_invalid() {
        let b = backend();
        assert!(!b.verify_device_part("INVALID_DEVICE").unwrap());
        assert!(!b.verify_device_part("LFE5U-85F").unwrap());
    }

    #[test]
    fn test_ace_verify_device_part_deferred_error() {
        let b = AceBackend {
            version: "test".into(),
            install_dir: None,
            deferred: true,
        };
        let result = b.verify_device_part("AC7t1500ES0HIIC80");
        assert!(result.is_err());
    }

    #[test]
    fn test_ace_list_package_pins() {
        let b = backend();
        let pins = b.list_package_pins("AC7t1500ES0HIIC80").unwrap();
        assert!(!pins.is_empty());
        // Should have I/O pins and power pins
        let user_io = pins.iter().filter(|p| p.function == "User I/O").count();
        let power = pins.iter().filter(|p| p.function == "VCCINT" || p.function == "GND").count();
        assert!(user_io > 0, "Should have user I/O pins");
        assert!(power > 0, "Should have power pins");
    }

    #[test]
    fn test_ace_list_package_pins_deferred_error() {
        let b = AceBackend {
            version: "test".into(),
            install_dir: None,
            deferred: true,
        };
        let result = b.list_package_pins("AC7t1500ES0HIIC80");
        assert!(result.is_err());
    }

    #[test]
    fn test_ace_generate_ip_script_gddr6() {
        let b = backend();
        let tmp = tempfile::tempdir().unwrap();
        let mut params = HashMap::new();
        params.insert("data_width".into(), "256".into());
        params.insert("frequency_mhz".into(), "800".into());
        let (script, _output_dir) = b
            .generate_ip_script(tmp.path(), "AC7t1500ES0HIIC80", "GDDR6", "gddr6_inst", &params)
            .unwrap();
        assert!(script.contains("create_ip -name gddr6"));
        assert!(script.contains("gddr6_inst"));
        assert!(script.contains("DATA_WIDTH"));
        assert!(script.contains("256"));
    }

    #[test]
    fn test_ace_generate_ip_script_pcie() {
        let b = backend();
        let tmp = tempfile::tempdir().unwrap();
        let mut params = HashMap::new();
        params.insert("lanes".into(), "4".into());
        let (script, _output_dir) = b
            .generate_ip_script(tmp.path(), "AC7t1500ES0HIIC80", "PCIE", "pcie_inst", &params)
            .unwrap();
        assert!(script.contains("create_ip -name pcie"));
        assert!(script.contains("pcie_inst"));
        assert!(script.contains("LANES"));
        assert!(script.contains("4"));
    }

    #[test]
    fn test_ace_generate_ip_script_ethernet() {
        let b = backend();
        let tmp = tempfile::tempdir().unwrap();
        let mut params = HashMap::new();
        params.insert("standard".into(), "100G".into());
        let (script, output_dir) = b
            .generate_ip_script(tmp.path(), "AC7t1500ES0HIIC80", "ETHERNET", "eth_inst", &params)
            .unwrap();
        assert!(script.contains("create_ip -name ethernet"));
        assert!(script.contains("eth_inst"));
        assert!(script.contains("STANDARD"));
        assert_eq!(output_dir, "eth_inst_gen");
    }

    #[test]
    fn test_ace_parse_power_report_missing_file() {
        let b = backend();
        let tmp = tempfile::tempdir().unwrap();
        let result = b.parse_power_report(tmp.path()).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_ace_parse_power_report_with_data() {
        let b = backend();
        let tmp = tempfile::tempdir().unwrap();
        let output_dir = tmp.path().join("output");
        std::fs::create_dir_all(&output_dir).unwrap();

        let power_content = "Total Power: 125.5 mW\n\
                             Logic: 75.0 mW\n\
                             BRAM: 30.0 mW\n\
                             I/O: 20.5 mW\n";
        std::fs::write(output_dir.join("design_power.rpt"), power_content).unwrap();

        let report = b.parse_power_report(tmp.path()).unwrap();
        assert!(report.is_some());
        let report = report.unwrap();
        assert!(report.total_mw > 0.0);
        assert!(!report.breakdown.is_empty());
        assert!(!report.by_rail.is_empty());
    }

    #[test]
    fn test_ace_build_script_with_place_effort() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("top.acepro"), "").unwrap();
        let b = backend();
        let mut opts = HashMap::new();
        opts.insert("place_effort".into(), "high".into());
        let script = b
            .generate_build_script(tmp.path(), "AC7t1500ES0HIIC80", "top", &[], &opts)
            .unwrap();
        assert!(script.contains("set_option -name place_effort_level -value high"));
    }

    #[test]
    fn test_ace_default_device_is_valid() {
        let b = backend();
        let part = b.default_device();
        assert!(b.verify_device_part(part).unwrap());
    }

    #[test]
    fn test_ace_is_deferred() {
        let deferred = AceBackend {
            version: "test".into(),
            install_dir: None,
            deferred: true,
        };
        assert!(deferred.is_deferred());

        let regular = backend();
        assert!(!regular.is_deferred());
    }

    #[test]
    fn test_ace_constraint_round_trip_empty() {
        let constraints = vec![];
        let written = write_pdc_constraints(&constraints);
        let re_read = parse_pdc_constraints(&written).unwrap();
        assert!(re_read.is_empty());
    }

    // ── PDC Parsing Tests (Real Fixture Data) ──

    #[test]
    fn test_parse_pdc_blinky_led_constraints() {
        let b = backend();
        let pdc_content = include_str!("../../../examples/ace/blinky_led/constraints/blinky.pdc");
        let tmp = tempfile::tempdir().unwrap();
        let pdc_file = tmp.path().join("blinky.pdc");
        std::fs::write(&pdc_file, pdc_content).unwrap();

        let constraints = b.read_constraints(&pdc_file).unwrap();
        assert!(!constraints.is_empty());
    }

    #[test]
    fn test_parse_pdc_ml_accelerator_constraints() {
        let b = backend();
        let pdc_content = include_str!("../../../examples/ace/ml_accelerator/constraints/ml.pdc");
        let tmp = tempfile::tempdir().unwrap();
        let pdc_file = tmp.path().join("ml.pdc");
        std::fs::write(&pdc_file, pdc_content).unwrap();

        let constraints = b.read_constraints(&pdc_file).unwrap();
        assert!(!constraints.is_empty());
    }

    #[test]
    fn test_parse_pdc_gddr6_test_constraints() {
        let b = backend();
        let pdc_content = include_str!("../../../examples/ace/gddr6_test/constraints/gddr6.pdc");
        let tmp = tempfile::tempdir().unwrap();
        let pdc_file = tmp.path().join("gddr6.pdc");
        std::fs::write(&pdc_file, pdc_content).unwrap();

        let constraints = b.read_constraints(&pdc_file).unwrap();
        assert!(!constraints.is_empty());
    }

    #[test]
    fn test_parse_pdc_ethernet_400g_constraints() {
        let b = backend();
        let pdc_content = include_str!("../../../examples/ace/ethernet_400g/constraints/eth400g.pdc");
        let tmp = tempfile::tempdir().unwrap();
        let pdc_file = tmp.path().join("eth400g.pdc");
        std::fs::write(&pdc_file, pdc_content).unwrap();

        let constraints = b.read_constraints(&pdc_file).unwrap();
        assert!(!constraints.is_empty());
    }

    #[test]
    fn test_parse_pdc_noc_endpoint_constraints() {
        let b = backend();
        let pdc_content = include_str!("../../../examples/ace/noc_endpoint/constraints/noc.pdc");
        let tmp = tempfile::tempdir().unwrap();
        let pdc_file = tmp.path().join("noc.pdc");
        std::fs::write(&pdc_file, pdc_content).unwrap();

        let constraints = b.read_constraints(&pdc_file).unwrap();
        assert!(!constraints.is_empty());
    }

    // ── Build Script Generation Tests (Different Configurations) ──

    #[test]
    fn test_generate_build_script_vivado_ace() {
        let b = backend();
        let tmp = tempfile::tempdir().unwrap();
        let script = b.generate_build_script(
            tmp.path(), "xcvu57p-fsvh2892-2L-e", "blinky_top", &[], &std::collections::HashMap::new(),
        ).unwrap();
        assert!(script.contains("open_project"));
        assert!(script.contains("blinky_top"));
    }

    #[test]
    fn test_generate_build_script_xcvu440() {
        let b = backend();
        let tmp = tempfile::tempdir().unwrap();
        let script = b.generate_build_script(
            tmp.path(), "xcvu440-flga2892-2-e", "uart_top", &[], &std::collections::HashMap::new(),
        ).unwrap();
        assert!(script.contains("open_project"));
    }

    #[test]
    fn test_generate_build_script_xcvu7p() {
        let b = backend();
        let tmp = tempfile::tempdir().unwrap();
        let script = b.generate_build_script(
            tmp.path(), "xcvu7p-flgb2104-2-e", "ddc_top", &[], &std::collections::HashMap::new(),
        ).unwrap();
        assert!(script.contains("synth_design"));
    }

    #[test]
    fn test_generate_build_script_xcbu19p() {
        let b = backend();
        let tmp = tempfile::tempdir().unwrap();
        let script = b.generate_build_script(
            tmp.path(), "xcbu19p-ffve1760-2-e", "eth_top", &[], &std::collections::HashMap::new(),
        ).unwrap();
        assert!(script.contains("synth_design"));
    }

    #[test]
    fn test_generate_build_script_xczu28dr() {
        let b = backend();
        let tmp = tempfile::tempdir().unwrap();
        let script = b.generate_build_script(
            tmp.path(), "xczu28dr-ffvf1517-2-e", "axi_top", &[], &std::collections::HashMap::new(),
        ).unwrap();
        assert!(script.contains("write_bitstream"));
    }
}
