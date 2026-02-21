use crate::backend::{BackendError, BackendResult, FpgaBackend};
use crate::types::*;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Achronix ACE (Achronix CAD Environment) backend.
/// Drives `ace -batch -script_file <tcl>` for Speedster7t FPGA families.
/// ACE 10+ has fully integrated synthesis; earlier versions require Synplify Pro.
pub struct AceBackend {
    version: String,
    install_dir: Option<PathBuf>,
}

impl AceBackend {
    pub fn new() -> Self {
        let (version, install_dir) = Self::detect_installation();
        Self {
            version,
            install_dir,
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
        // Try exact match first
        let exact = dir.join(format!("{}.acepro", top_module));
        if exact.exists() {
            return Some(exact);
        }
        // Scan for any .acepro file
        if let Ok(entries) = std::fs::read_dir(dir) {
            let mut matches: Vec<PathBuf> = entries
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.extension().map(|ext| ext == "acepro").unwrap_or(false))
                .collect();
            matches.sort();
            if !matches.is_empty() {
                return Some(matches.into_iter().next().unwrap());
            }
        }
        None
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

        // Open an existing .acepro or create a new project from sources
        if let Some(proj_file) = Self::find_project_file(project_dir, top_module) {
            let proj_path = proj_file.display().to_string();
            script.push_str(&format!("open_project \"{proj_path}\"\n"));
        } else {
            // Create project from scratch
            let proj_dir_str = project_dir.display().to_string();
            script.push_str(&format!(
                "create_project \
                 -name \"{top_module}\" \
                 -device \"{device}\" \
                 -impl \"impl1\" \
                 -dir \"{proj_dir_str}\"\n"
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
                let src_str = src.display().to_string();
                script.push_str(&format!("add_source_file \"{src_str}\"\n"));
            }

            // Add constraint files (.pdc / .sdc)
            let constraints = Self::scan_constraints(project_dir);
            for constr in &constraints {
                let constr_str = constr.display().to_string();
                script.push_str(&format!("add_constraint_file \"{constr_str}\"\n"));
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
        self.ace_path().is_some()
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

    fn parse_power_report(&self, _impl_dir: &Path) -> BackendResult<Option<PowerReport>> {
        // ACE does not generate a separate power report in the standard flow
        Ok(None)
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
}
