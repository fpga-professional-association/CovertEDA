use serde::{Deserialize, Serialize};

// ── Build Pipeline ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineStage {
    pub id: String,
    pub label: String,
    pub cmd: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BuildStatus {
    Idle,
    Running,
    Success,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildEvent {
    pub build_id: String,
    pub stage_idx: usize,
    pub status: BuildStatus,
    pub message: String,
}

// ── Timing Report ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimingReport {
    pub fmax_mhz: f64,
    pub target_mhz: f64,
    pub wns_ns: f64,
    pub tns_ns: f64,
    pub whs_ns: f64,
    pub ths_ns: f64,
    pub failing_paths: u32,
    pub total_paths: u32,
    pub clock_domains: Vec<ClockDomain>,
    pub critical_paths: Vec<CriticalPath>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClockDomain {
    pub name: String,
    pub period_ns: f64,
    pub frequency_mhz: f64,
    pub source: String,
    pub clock_type: String,
    pub wns_ns: f64,
    pub path_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CriticalPath {
    pub rank: u32,
    pub from: String,
    pub to: String,
    pub slack_ns: f64,
    pub required_ns: f64,
    pub delay_ns: f64,
    pub logic_levels: u32,
    pub clock: String,
    pub path_type: String,
}

// ── Resource Utilization Report ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceReport {
    pub device: String,
    pub categories: Vec<ResourceCategory>,
    pub by_module: Vec<ModuleUtilization>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceCategory {
    pub name: String,
    pub items: Vec<ResourceItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceItem {
    pub resource: String,
    pub used: u64,
    pub total: u64,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleUtilization {
    pub module: String,
    pub lut: u64,
    pub ff: u64,
    pub ebr: u64,
    pub percentage: f64,
}

// ── Power Report ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PowerReport {
    pub total_mw: f64,
    pub junction_temp_c: f64,
    pub ambient_temp_c: f64,
    pub theta_ja: f64,
    pub confidence: String,
    pub breakdown: Vec<PowerBreakdown>,
    pub by_rail: Vec<PowerRail>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PowerBreakdown {
    pub category: String,
    pub mw: f64,
    pub percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PowerRail {
    pub rail: String,
    pub mw: f64,
}

// ── DRC Report ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrcReport {
    pub errors: u32,
    pub critical_warnings: u32,
    pub warnings: u32,
    pub info: u32,
    pub waived: u32,
    pub items: Vec<DrcItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrcItem {
    pub severity: DrcSeverity,
    pub code: String,
    pub message: String,
    pub location: String,
    pub action: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DrcSeverity {
    Error,
    CriticalWarning,
    Warning,
    Info,
    Waived,
}

// ── Synthesis Report ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SynthesisReport {
    pub lut_count: u64,
    pub reg_count: u64,
    pub ram_count: u64,
    pub dsp_count: u64,
    pub fmax_estimate_mhz: f64,
    pub cpu_time_secs: f64,
    pub errors: u32,
    pub warnings: u32,
}

// ── PAR Report ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParReport {
    pub routing_pct: f64,
    pub slice_used: u64,
    pub slice_total: u64,
    pub signals: u64,
    pub connections: u64,
    pub placement_time_secs: f64,
    pub routing_time_secs: f64,
    pub total_time_secs: f64,
    pub peak_memory_mb: f64,
    pub par_errors: u32,
    pub run_status: String,
}

// ── Constraints ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PinConstraint {
    pub pin: String,
    pub net: String,
    pub direction: String,
    pub io_standard: String,
    pub bank: String,
    pub locked: bool,
    pub extra: Vec<(String, String)>,
}

// ── I/O Banking ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IoReport {
    pub banks: Vec<IoBank>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IoBank {
    pub id: String,
    pub vccio: String,
    pub used: u32,
    pub total: u32,
    pub pins: Vec<IoBankPin>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IoBankPin {
    pub pin: String,
    pub net: String,
    pub direction: String,
}

// ── Pad Report (post-build pinout) ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PadReport {
    pub assigned_pins: Vec<PadPinEntry>,
    pub vccio_banks: Vec<PadBankVccio>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PadPinEntry {
    pub port_name: String,
    pub pin: String,
    pub bank: String,
    pub buffer_type: String,
    pub site: String,
    pub io_standard: String,
    pub drive: String,
    pub direction: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PadBankVccio {
    pub bank: String,
    pub vccio: String,
}

// ── Report File Discovery ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportFileEntry {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub modified_epoch_ms: u64,
    pub extension: String,
}

// ── File Content (read-only viewer) ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub path: String,
    pub content: String,
    pub size_bytes: u64,
    pub is_binary: bool,
    pub line_count: u32,
}

// ── File Tree ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub depth: u32,
    pub file_type: FileType,
    pub git_status: Option<String>,
    pub in_synthesis: bool,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileType {
    Rtl,
    Testbench,
    Constraint,
    Ip,
    Output,
    Config,
    Doc,
    Other,
}

// ── Git Status ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub branch: String,
    pub commit_hash: String,
    pub commit_message: String,
    pub author: String,
    pub time_ago: String,
    pub ahead: u32,
    pub behind: u32,
    pub staged: u32,
    pub unstaged: u32,
    pub untracked: u32,
    pub stashes: u32,
    pub dirty: bool,
}

// ── Git Log Entry ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitLogEntry {
    pub hash: String,
    pub message: String,
    pub author: String,
    pub time_ago: String,
}

// ── Backend Info ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackendInfo {
    pub id: String,
    pub name: String,
    pub short: String,
    pub version: String,
    pub cli: String,
    pub default_device: String,
    pub constraint_ext: String,
    pub pipeline: Vec<PipelineStage>,
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub install_path: Option<String>,
}

// ── License ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseInfo {
    pub feature: String,
    pub status: String,
    pub expires: String,
    pub seats_available: u32,
    pub seats_total: u32,
    pub server: String,
    pub vendor: String,
}
