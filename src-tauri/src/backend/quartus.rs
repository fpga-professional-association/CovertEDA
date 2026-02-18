use crate::backend::{BackendError, BackendResult, FpgaBackend};
use crate::types::*;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Intel Quartus Prime backend — drives quartus_sh, quartus_syn, quartus_map,
/// quartus_fit, quartus_asm, quartus_sta (TCL shell and individual tool flow).
pub struct QuartusBackend {
    version: String,
    install_dir: Option<PathBuf>,
}

impl QuartusBackend {
    pub fn new() -> Self {
        let (version, install_dir) = Self::detect_installation();
        Self {
            version,
            install_dir,
        }
    }

    /// Scan known installation paths for Intel Quartus Prime.
    fn detect_installation() -> (String, Option<PathBuf>) {
        let candidates: Vec<PathBuf> = if cfg!(target_os = "windows") {
            vec![
                PathBuf::from(r"C:\intelFPGA_pro"),
                PathBuf::from(r"C:\intelFPGA"),
                PathBuf::from(r"C:\intelFPGA_lite"),
                PathBuf::from(r"C:\altera_pro"),
                PathBuf::from(r"C:\altera"),
            ]
        } else {
            // Linux + WSL paths
            vec![
                PathBuf::from("/mnt/c/intelFPGA_pro"),
                PathBuf::from("/mnt/c/intelFPGA"),
                PathBuf::from("/mnt/c/intelFPGA_lite"),
                PathBuf::from("/mnt/c/altera_pro"),
                PathBuf::from("/mnt/c/altera"),
                PathBuf::from("/opt/intelFPGA_pro"),
                PathBuf::from("/opt/intelFPGA"),
                PathBuf::from("/opt/intelFPGA_lite"),
                PathBuf::from("/opt/altera"),
            ]
        };

        for base in &candidates {
            if let Ok(entries) = std::fs::read_dir(base) {
                let mut versions: Vec<String> = entries
                    .filter_map(|e| e.ok())
                    .filter(|e| e.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
                    .filter_map(|e| {
                        let name = e.file_name().to_string_lossy().to_string();
                        if name.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
                            Some(name)
                        } else {
                            None
                        }
                    })
                    .collect();
                versions.sort();
                if let Some(ver) = versions.last() {
                    let install = base.join(ver);
                    // Verify quartus/ directory exists
                    if install.join("quartus").exists() {
                        return (ver.clone(), Some(install));
                    }
                }
            }
        }

        ("unknown".to_string(), None)
    }

    /// Path to quartus_sh executable.
    fn quartus_sh_path(&self) -> Option<PathBuf> {
        let dir = self.install_dir.as_ref()?;
        let bin = if cfg!(target_os = "windows") {
            dir.join("quartus").join("bin64").join("quartus_sh.exe")
        } else if dir.starts_with("/mnt/c") || dir.starts_with("/mnt/d") {
            // WSL accessing Windows install
            dir.join("quartus").join("bin64").join("quartus_sh.exe")
        } else {
            dir.join("quartus").join("bin").join("quartus_sh")
        };
        if bin.exists() {
            Some(bin)
        } else {
            None
        }
    }

    /// Public accessor for the quartus_sh executable path.
    pub fn quartus_sh_path_public(&self) -> Option<PathBuf> {
        self.quartus_sh_path()
    }

    /// Get the installation directory.
    pub fn install_dir(&self) -> Option<&Path> {
        self.install_dir.as_deref()
    }

    /// Find the .qpf (Quartus Project File) in a directory.
    pub fn find_qpf_file(project_dir: &Path, top_module: &str) -> Option<PathBuf> {
        // Try exact match first
        let exact = project_dir.join(format!("{}.qpf", top_module));
        if exact.exists() {
            return Some(exact);
        }
        // Scan for any .qpf file
        let qpfs: Vec<PathBuf> = std::fs::read_dir(project_dir)
            .ok()?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().map(|ext| ext == "qpf").unwrap_or(false))
            .collect();
        match qpfs.len() {
            0 => None,
            1 => Some(qpfs.into_iter().next().unwrap()),
            _ => qpfs.iter()
                .find(|p| p.file_stem().and_then(|s| s.to_str()).map(|s| s.contains(top_module)).unwrap_or(false))
                .cloned()
                .or_else(|| qpfs.into_iter().next()),
        }
    }
}

impl FpgaBackend for QuartusBackend {
    fn id(&self) -> &str {
        "quartus"
    }
    fn name(&self) -> &str {
        "Intel Quartus Prime"
    }
    fn short_name(&self) -> &str {
        "Quartus"
    }
    fn version(&self) -> &str {
        &self.version
    }
    fn cli_tool(&self) -> &str {
        "quartus_sh"
    }
    fn default_device(&self) -> &str {
        "10CX220YF780I5G"
    }
    fn constraint_ext(&self) -> &str {
        ".sdc"
    }

    fn pipeline_stages(&self) -> Vec<PipelineStage> {
        vec![
            PipelineStage {
                id: "synth".into(),
                label: "Synthesis".into(),
                cmd: "quartus_syn".into(),
                detail: "RTL synthesis to ALMs/LEs".into(),
            },
            PipelineStage {
                id: "fit".into(),
                label: "Fitter (Place & Route)".into(),
                cmd: "quartus_fit".into(),
                detail: "Placement and routing".into(),
            },
            PipelineStage {
                id: "sta".into(),
                label: "Timing Analysis".into(),
                cmd: "quartus_sta".into(),
                detail: "Static timing analysis".into(),
            },
            PipelineStage {
                id: "asm".into(),
                label: "Assembler".into(),
                cmd: "quartus_asm".into(),
                detail: "Generate .sof bitstream".into(),
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
        let project_path_tcl = to_quartus_tcl_path(project_dir);

        let _all_ids = ["synth", "fit", "sta", "asm"];
        let run_stage = |id: &str| -> bool {
            stages.is_empty() || stages.iter().any(|s| s == id)
        };

        let mut script = format!(
            r#"# CovertEDA — Quartus Prime Build Script
# Device: {device}
# Top: {top_module}

# Check if project exists, if not create it
if {{[catch {{project_open {project_path_tcl}/{top_module}}}]}} {{
    project_new {project_path_tcl}/{top_module}
}}

# Set device and top-level
set_global_assignment -name DEVICE {device}
set_global_assignment -name TOP_LEVEL_ENTITY {top_module}
"#,
        );

        // Add source files
        script.push_str(&format!(
            r#"
# Auto-add source files
foreach f [glob -nocomplain {project_path_tcl}/*.v {project_path_tcl}/*.sv {project_path_tcl}/*.vhd {project_path_tcl}/source/*.v {project_path_tcl}/source/*.sv] {{
    set_global_assignment -name VERILOG_FILE $f
}}

# Add constraint files
foreach f [glob -nocomplain {project_path_tcl}/*.sdc] {{
    set_global_assignment -name SDC_FILE $f
}}
"#,
        ));

        // Apply options
        if let Some(effort) = options.get("fit_effort") {
            if !effort.is_empty() {
                script.push_str(&format!(
                    "set_global_assignment -name FITTER_EFFORT \"{}\"\n", effort
                ));
            }
        }
        if let Some(opt_mode) = options.get("optimization_mode") {
            if !opt_mode.is_empty() {
                script.push_str(&format!(
                    "set_global_assignment -name OPTIMIZATION_MODE \"{}\"\n", opt_mode
                ));
            }
        }

        script.push('\n');

        // Run requested stages
        if run_stage("synth") {
            script.push_str("execute_module -tool syn\n");
        }
        if run_stage("fit") {
            script.push_str("execute_module -tool fit\n");
        }
        if run_stage("sta") {
            script.push_str("execute_module -tool sta\n");
        }
        if run_stage("asm") {
            script.push_str("execute_module -tool asm\n");
        }

        script.push_str("\nproject_close\n");
        Ok(script)
    }

    fn detect_tool(&self) -> bool {
        self.quartus_sh_path().is_some()
    }

    fn parse_timing_report(&self, impl_dir: &Path) -> BackendResult<TimingReport> {
        // Quartus Pro puts reports in output_files/<project>.sta.rpt
        let out_dir = impl_dir.join("output_files");
        let search_dir = if out_dir.exists() { &out_dir } else { impl_dir };

        let sta_file = std::fs::read_dir(search_dir)
            .map_err(|e| BackendError::IoError(e))?
            .filter_map(|e| e.ok())
            .find(|e| {
                e.path().to_str().map(|s| s.ends_with(".sta.rpt")).unwrap_or(false)
            })
            .map(|e| e.path())
            .ok_or_else(|| {
                BackendError::ReportNotFound("No .sta.rpt file found".to_string())
            })?;

        let content = std::fs::read_to_string(&sta_file)?;
        crate::parser::timing::parse_quartus_timing(&content)
    }

    fn parse_utilization_report(&self, impl_dir: &Path) -> BackendResult<ResourceReport> {
        let out_dir = impl_dir.join("output_files");
        let search_dir = if out_dir.exists() { &out_dir } else { impl_dir };

        let fit_file = std::fs::read_dir(search_dir)
            .map_err(|e| BackendError::IoError(e))?
            .filter_map(|e| e.ok())
            .find(|e| {
                e.path().to_str().map(|s| s.ends_with(".fit.rpt")).unwrap_or(false)
            })
            .map(|e| e.path())
            .ok_or_else(|| {
                BackendError::ReportNotFound("No .fit.rpt file found".to_string())
            })?;

        let content = std::fs::read_to_string(&fit_file)?;
        crate::parser::utilization::parse_quartus_utilization(&content, self.default_device())
    }

    fn parse_power_report(&self, _impl_dir: &Path) -> BackendResult<Option<PowerReport>> {
        Ok(None)
    }

    fn parse_drc_report(&self, _impl_dir: &Path) -> BackendResult<Option<DrcReport>> {
        Ok(None)
    }

    fn read_constraints(&self, constraint_file: &Path) -> BackendResult<Vec<PinConstraint>> {
        if !constraint_file.exists() {
            return Err(BackendError::ReportNotFound(
                constraint_file.display().to_string(),
            ));
        }
        let content = std::fs::read_to_string(constraint_file)?;
        crate::parser::constraints::parse_sdc(&content)
    }

    fn write_constraints(
        &self,
        constraints: &[PinConstraint],
        output_file: &Path,
    ) -> BackendResult<()> {
        let content = crate::parser::constraints::write_sdc(constraints);
        std::fs::write(output_file, content)?;
        Ok(())
    }

    fn generate_ip_script(
        &self,
        project_dir: &Path,
        device: &str,
        ip_name: &str,
        instance_name: &str,
        params: &HashMap<String, String>,
    ) -> BackendResult<(String, String)> {
        let ip_dir = project_dir.join("ip").join(instance_name);
        let ip_dir_tcl = to_quartus_tcl_path(&ip_dir);
        let _project_tcl = to_quartus_tcl_path(project_dir);

        // Determine the device family
        let family = if device.starts_with("5C") {
            "Cyclone V"
        } else if device.starts_with("10C") {
            "Cyclone 10 GX"
        } else if device.starts_with("10A") {
            "Arria 10"
        } else if device.starts_with("1S") {
            "Stratix 10"
        } else if device.starts_with("AG") {
            "Agilex"
        } else {
            "Cyclone V"
        };

        // Map common CovertEDA IP names to Quartus megafunction/IP names
        let quartus_ip_name = match ip_name {
            "RAM: 1-PORT" => "altsyncram",
            "RAM: 2-PORT" => "altsyncram",
            "FIFO" => "scfifo",
            "DCFIFO" => "dcfifo",
            "ROM: 1-PORT" => "altsyncram",
            "LPM_MULT" => "lpm_mult",
            "LPM_DIVIDE" => "lpm_divide",
            "ALTPLL" => "altpll",
            "ALTDDIO_IN" => "altddio_in",
            "ALTDDIO_OUT" => "altddio_out",
            _ => ip_name,
        };

        let mut script = format!(
            r#"# CovertEDA — Quartus Prime IP Generation Script
# IP: {ip_name} ({quartus_ip_name})
# Instance: {instance_name}
# Device: {device} (Family: {family})

package require -exact qsys 1.0

# Ensure output directory exists
file mkdir "{ip_dir_tcl}"

# Create a new Qsys system for this IP
create_system "{instance_name}"

set_project_property DEVICE_FAMILY "{family}"
set_project_property DEVICE "{device}"

# Add the IP instance
add_instance {instance_name} {quartus_ip_name}

"#,
        );

        // Set parameters
        for (key, value) in params {
            if !value.is_empty() {
                script.push_str(&format!(
                    "set_instance_parameter_value {instance_name} {key} \"{value}\"\n",
                ));
            }
        }

        script.push_str(&format!(
            r#"
# Save the system
save_system "{ip_dir_tcl}/{instance_name}.qsys"

# Generate the IP (HDL + synthesis files)
generate_system -hdl_language VERILOG -synthesis VERILOG

puts "CovertEDA: IP generation complete for {instance_name}"
puts "CovertEDA: Output directory: {ip_dir_tcl}"
"#,
        ));

        Ok((script, ip_dir_tcl))
    }
}

/// Convert a WSL path to a Windows-style path for use inside Quartus TCL.
fn to_quartus_tcl_path(path: &Path) -> String {
    let s = path.display().to_string();
    if s.starts_with("/mnt/") && s.len() > 6 {
        let drive = s.chars().nth(5).unwrap().to_uppercase().to_string();
        let rest = &s[6..];
        format!("{}:{}", drive, rest)
    } else {
        s.replace('\\', "/")
    }
}
