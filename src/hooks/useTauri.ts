/**
 * Tauri IPC hooks for communicating with the Rust backend.
 * Falls back gracefully when running in browser (dev without Tauri).
 */

// Check if we're running inside Tauri
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Invoke a Tauri command. Returns mock data when running outside Tauri.
 */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) {
    console.warn(`[Tauri IPC] Not in Tauri environment, command '${cmd}' skipped`, args);
    throw new Error("Not running in Tauri");
  }
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

/**
 * Listen to a Tauri event.
 */
export async function listen<T>(
  event: string,
  handler: (payload: T) => void
): Promise<() => void> {
  if (!isTauri) {
    console.warn(`[Tauri IPC] Not in Tauri environment, event '${event}' not bound`);
    return () => {};
  }
  const { listen: tauriListen } = await import("@tauri-apps/api/event");
  const unlisten = await tauriListen<T>(event, (e) => handler(e.payload));
  return unlisten;
}

/**
 * Open a URL in the user's default browser.
 * Uses a Rust command that handles WSL (cmd.exe /c start) and native Linux (xdg-open).
 * Falls back to window.open in browser dev mode.
 */
export async function openUrl(url: string): Promise<void> {
  if (isTauri) {
    await invoke<void>("open_url", { url });
  } else {
    window.open(url, "_blank");
  }
}

// ── Typed command wrappers ──

export async function getFileTree(projectDir: string) {
  return invoke<unknown[]>("get_file_tree", { projectDir });
}

export interface RustGitStatus {
  branch: string;
  commitHash: string;
  commitMessage: string;
  author: string;
  timeAgo: string;
  ahead: number;
  behind: number;
  staged: number;
  unstaged: number;
  untracked: number;
  stashes: number;
  dirty: boolean;
}

export async function getGitStatus(projectDir: string): Promise<RustGitStatus> {
  return invoke<RustGitStatus>("get_git_status", { projectDir });
}

export interface GitLogEntry {
  hash: string;
  message: string;
  author: string;
  timeAgo: string;
}

export async function gitLog(projectDir: string, maxCount: number = 20): Promise<GitLogEntry[]> {
  if (!isTauri) return [];
  return invoke<GitLogEntry[]>("git_log", { projectDir, maxCount });
}

export async function gitIsDirty(projectDir: string): Promise<boolean> {
  if (!isTauri) return false;
  return invoke<boolean>("git_is_dirty", { projectDir });
}

export async function gitCommit(projectDir: string, message: string): Promise<string> {
  if (!isTauri) return "mock123";
  return invoke<string>("git_commit", { projectDir, message });
}

export async function gitHeadHash(projectDir: string): Promise<string> {
  if (!isTauri) return "abc1234";
  return invoke<string>("git_head_hash", { projectDir });
}

// ── IP Generation ──

export interface IpGenerateResult {
  script: string;
  outputDir: string;
  cliTool: string;
}

export async function generateIpScript(
  backendId: string,
  projectDir: string,
  device: string,
  ipName: string,
  instanceName: string,
  params: Record<string, string>,
): Promise<IpGenerateResult> {
  if (!isTauri) {
    // Return mock TCL for browser dev mode
    const paramLines = Object.entries(params)
      .filter(([, v]) => v)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `  -param "${k}:${v}"`)
      .join(" \\\n");
    return {
      script: `# Mock IP generation TCL for ${ipName}\nsbp_design new -name "${instanceName}" -family "LIFCL" -device "${device}"\nsbp_configure -component "${ipName}" \\\n${paramLines}\nsbp_generate -lang "verilog"\nsbp_save\nsbp_close_design`,
      outputDir: `${projectDir}/ip_cores/${instanceName}`,
      cliTool: "radiantc",
    };
  }
  return invoke<IpGenerateResult>("generate_ip_script", {
    backendId, projectDir, device, ipName, instanceName, params,
  });
}

export async function executeIpGenerate(
  backendId: string,
  projectDir: string,
  script: string,
): Promise<string> {
  if (!isTauri) return "mock-gen-id";
  return invoke<string>("execute_ip_generate", { backendId, projectDir, script });
}

export async function startBuild(
  backendId: string,
  projectDir: string,
  stages: string[] = [],
  options: Record<string, string> = {},
) {
  return invoke<string>("start_build", { backendId, projectDir, stages, options });
}

export async function cancelBuild(buildId: string) {
  return invoke<void>("cancel_build", { buildId });
}

export async function cleanBuild(projectDir: string) {
  return invoke<number>("clean_build", { projectDir });
}

export async function checkSourcesStale(projectDir: string): Promise<boolean> {
  if (!isTauri) return false;
  return invoke<boolean>("check_sources_stale", { projectDir });
}

export async function switchBackend(backendId: string) {
  return invoke<void>("switch_backend", { backendId });
}

export async function getAvailableBackends() {
  return invoke<unknown[]>("get_available_backends", {});
}

export async function getTimingReport(backendId: string, implDir: string) {
  return invoke<RustTimingReport>("get_timing_report", { backendId, implDir });
}

export async function getUtilizationReport(backendId: string, implDir: string) {
  return invoke<RustResourceReport>("get_utilization_report", { backendId, implDir });
}

export async function getRawReport(projectDir: string, reportType: string): Promise<string> {
  if (!isTauri) return `[Mock] No raw ${reportType} report in browser mode.`;
  return invoke<string>("get_raw_report", { projectDir, reportType });
}

// ── Power / DRC / I/O report types ──

interface RustPowerReport {
  total_mw: number;
  junction_temp_c: number;
  ambient_temp_c: number;
  theta_ja: number;
  confidence: string;
  breakdown: { category: string; mw: number; percentage: number }[];
  by_rail: { rail: string; mw: number }[];
}

interface RustDrcReport {
  errors: number;
  critical_warnings: number;
  warnings: number;
  info: number;
  waived: number;
  items: {
    severity: string;
    code: string;
    message: string;
    location: string;
    action: string;
  }[];
}

interface RustIoReport {
  banks: {
    id: string;
    vccio: string;
    used: number;
    total: number;
    pins: { pin: string; net: string; direction: string }[];
  }[];
}

export async function getPowerReport(backendId: string, implDir: string) {
  return invoke<RustPowerReport | null>("get_power_report", { backendId, implDir });
}

export async function getDrcReport(backendId: string, implDir: string) {
  return invoke<RustDrcReport | null>("get_drc_report", { backendId, implDir });
}

export async function getIoReport(backendId: string, projectDir: string) {
  if (!isTauri) {
    return {
      banks: [
        { id: "0", vccio: "3.3V", used: 8, total: 52, pins: [
          { pin: "A4", net: "led_out[0]", direction: "OUT" },
          { pin: "B4", net: "led_out[1]", direction: "OUT" },
          { pin: "C5", net: "led_out[2]", direction: "OUT" },
          { pin: "D5", net: "led_out[3]", direction: "OUT" },
          { pin: "E6", net: "led_out[4]", direction: "OUT" },
          { pin: "F6", net: "led_out[5]", direction: "OUT" },
          { pin: "G7", net: "led_out[6]", direction: "OUT" },
          { pin: "H7", net: "led_out[7]", direction: "OUT" },
        ]},
        { id: "1", vccio: "3.3V", used: 6, total: 48, pins: [
          { pin: "J2", net: "data_in[0]", direction: "IN" },
          { pin: "K3", net: "data_in[1]", direction: "IN" },
          { pin: "L3", net: "data_in[2]", direction: "IN" },
          { pin: "M4", net: "data_in[3]", direction: "IN" },
          { pin: "N4", net: "enable", direction: "IN" },
          { pin: "P5", net: "reset_n", direction: "IN" },
        ]},
        { id: "2", vccio: "2.5V", used: 2, total: 52, pins: [
          { pin: "R1", net: "debug_tx", direction: "OUT" },
          { pin: "T1", net: "debug_rx", direction: "IN" },
        ]},
        { id: "3", vccio: "1.8V", used: 2, total: 54, pins: [
          { pin: "A1", net: "sys_clk", direction: "IN" },
          { pin: "B1", net: "pll_ref", direction: "IN" },
        ]},
      ],
    } satisfies RustIoReport;
  }
  return invoke<RustIoReport | null>("get_io_report", { backendId, projectDir });
}

// ── Runtime backend loading ──

interface RustBackendInfo {
  id: string;
  name: string;
  short: string;
  version: string;
  cli: string;
  default_device: string;
  constraint_ext: string;
  pipeline: PipelineStage[];
  available: boolean;
}

export async function getRuntimeBackends(): Promise<RuntimeBackend[]> {
  if (!isTauri) {
    return BACKEND_META.map((m) => ({
      id: m.id,
      name: m.name,
      short: m.short,
      color: m.color,
      icon: m.icon,
      version: "mock",
      cli: "",
      defaultDev: m.defaultDevice,
      constrExt: "",
      pipeline: [],
      available: false,
    }));
  }
  const infos = await invoke<RustBackendInfo[]>("get_available_backends", {});
  return infos.map((info) => {
    const meta = BACKEND_META.find((m) => m.id === info.id);
    return {
      id: info.id,
      name: info.name,
      short: info.short,
      color: meta?.color ?? "#888",
      icon: meta?.icon ?? "?",
      version: info.version,
      cli: info.cli,
      defaultDev: info.default_device,
      constrExt: info.constraint_ext,
      pipeline: info.pipeline,
      available: info.available,
    };
  });
}

// ── Project management wrappers ──

import type {
  ProjectConfig, RecentProject, DetectedTool, LicenseCheckResult,
  FileContent, ProjectFile, TimingReportData, UtilizationReportData,
  PowerReportData, DrcReportData, IoBankData,
  RuntimeBackend, PipelineStage,
  SourceDirSuggestion, VendorImportResult, RemoteDirEntry,
} from "../types";
import { MOCK_RECENT_PROJECTS, MOCK_PROJECT_CONFIG, BACKEND_META } from "../data/mockData";

// ── Rust type interfaces (snake_case from serde) ──

interface RustFileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  depth: number;
  file_type: string;
  git_status: string | null;
  in_synthesis: boolean;
  size_bytes: number;
}

interface RustTimingReport {
  fmax_mhz: number;
  target_mhz: number;
  wns_ns: number;
  tns_ns: number;
  whs_ns: number;
  ths_ns: number;
  failing_paths: number;
  total_paths: number;
  clock_domains: {
    name: string;
    period_ns: number;
    frequency_mhz: number;
    source: string;
    clock_type: string;
    wns_ns: number;
    path_count: number;
  }[];
  critical_paths: {
    rank: number;
    from: string;
    to: string;
    slack_ns: number;
    required_ns: number;
    delay_ns: number;
    logic_levels: number;
    clock: string;
    path_type: string;
  }[];
}

interface RustResourceReport {
  device: string;
  categories: {
    name: string;
    items: {
      resource: string;
      used: number;
      total: number;
      detail: string | null;
    }[];
  }[];
  by_module: {
    module: string;
    lut: number;
    ff: number;
    ebr: number;
    percentage: number;
  }[];
}

export async function getRecentProjects(): Promise<RecentProject[]> {
  if (!isTauri) return MOCK_RECENT_PROJECTS;
  return invoke<RecentProject[]>("get_recent_projects");
}

export async function createProject(
  dir: string,
  name: string,
  backendId: string,
  device: string,
  topModule: string,
  sourcePatterns?: string[],
  constraintFiles?: string[],
): Promise<ProjectConfig> {
  if (!isTauri) return { ...MOCK_PROJECT_CONFIG, name, backendId, device, topModule };
  return invoke<ProjectConfig>("create_project", {
    dir, name, backendId, device, topModule,
    sourcePatterns: sourcePatterns ?? null,
    constraintFiles: constraintFiles ?? null,
  });
}

export async function openProject(dir: string): Promise<ProjectConfig> {
  if (!isTauri) return MOCK_PROJECT_CONFIG;
  return invoke<ProjectConfig>("open_project", { dir });
}

export async function checkProjectDir(dir: string): Promise<ProjectConfig | null> {
  if (!isTauri) return null;
  return invoke<ProjectConfig | null>("check_project_dir", { dir });
}

export async function saveProject(dir: string, config: ProjectConfig): Promise<void> {
  if (!isTauri) return;
  return invoke<void>("save_project", { dir, config });
}

export async function getProjectConfigAtHead(dir: string): Promise<ProjectConfig | null> {
  if (!isTauri) return null;
  return invoke<ProjectConfig | null>("get_project_config_at_head", { dir });
}

export async function removeRecentProject(path: string): Promise<void> {
  if (!isTauri) return;
  return invoke<void>("remove_recent_project", { path });
}

export async function detectTools(): Promise<DetectedTool[]> {
  if (!isTauri) {
    return [
      { backendId: "radiant", name: "Lattice Radiant", version: "2025.2", installPath: "/mnt/c/lscc/radiant/2025.2", available: true },
      { backendId: "diamond", name: "Lattice Diamond", version: "3.13", installPath: null, available: false },
      { backendId: "quartus", name: "Intel Quartus Prime", version: "23.1", installPath: null, available: false },
      { backendId: "quartus_pro", name: "Intel Quartus Prime Pro", version: "25.3", installPath: null, available: false },
      { backendId: "vivado", name: "AMD Vivado", version: "2024.1", installPath: null, available: false },
      { backendId: "opensource", name: "OSS CAD Suite", version: "yosys 0.40", installPath: null, available: false },
      { backendId: "libero", name: "Microchip Libero SoC", version: "", installPath: null, available: false },
      { backendId: "ace", name: "Achronix ACE", version: "", installPath: null, available: false },
      { backendId: "gowin", name: "GOWIN EDA", version: "", installPath: null, available: false },
      { backendId: "efinity", name: "Efinix Efinity", version: null, installPath: null, available: false },
      { backendId: "quicklogic", name: "QuickLogic Aurora", version: null, installPath: null, available: false },
      { backendId: "flexlogix", name: "Flex Logix EFLX", version: null, installPath: null, available: false },
    ];
  }
  return invoke<DetectedTool[]>("detect_tools");
}

export async function refreshTools(): Promise<DetectedTool[]> {
  if (!isTauri) return detectTools();
  return invoke<DetectedTool[]>("refresh_tools");
}

export interface WhichResult {
  whichPath: string | null;
  detectedBinDir: string | null;
}

export async function whichTool(backendId: string): Promise<WhichResult> {
  if (!isTauri) return { whichPath: null, detectedBinDir: null };
  return invoke<WhichResult>("which_tool", { backendId });
}

export async function addToolToPath(backendId: string): Promise<string> {
  if (!isTauri) throw new Error("Not in Tauri");
  return invoke<string>("add_tool_to_path", { backendId });
}

// ── Multi-version tool detection ──

export interface DetectedVersion {
  version: string;
  installPath: string;
  verified: boolean;
}

export async function listToolVersions(backendId: string): Promise<DetectedVersion[]> {
  if (!isTauri) return [];
  return invoke<DetectedVersion[]>("list_tool_versions", { backendId });
}

export async function selectToolVersion(backendId: string, installPath: string, version: string): Promise<void> {
  if (!isTauri) return;
  return invoke<void>("select_tool_version", { backendId, installPath, version });
}

export async function checkLicenses(): Promise<LicenseCheckResult> {
  if (!isTauri) {
    return {
      licenseFiles: [
        { backend: "radiant", path: "/mnt/c/Users/tcove/license.dat" },
        { backend: "quartus", path: "/mnt/c/intelFPGA_pro/23.1/licenses/license.dat" },
      ],
      features: [
        { feature: "LSC_RADIANT", vendor: "lattice", expires: "26-dec-2026", hostId: "9c6b00c1a932", status: "active" },
        { feature: "LSC_SYNPLIFYPRO1", vendor: "lattice", expires: "26-dec-2026", hostId: "9c6b00c1a932", status: "active" },
        { feature: "quartus_pro", vendor: "intel", expires: "permanent", hostId: "ANY", status: "active" },
        { feature: "ip_base", vendor: "intel", expires: "permanent", hostId: "ANY", status: "active" },
      ],
    };
  }
  return invoke<LicenseCheckResult>("check_licenses");
}

// ── Secure AI API Key (OS keyring) ──

export async function getAiApiKey(): Promise<string | null> {
  if (!isTauri) {
    try { return localStorage.getItem("coverteda_ai_key"); } catch { return null; }
  }
  return invoke<string | null>("get_ai_api_key");
}

export async function setAiApiKey(key: string | null): Promise<void> {
  if (!isTauri) {
    try {
      if (key) localStorage.setItem("coverteda_ai_key", key);
      else localStorage.removeItem("coverteda_ai_key");
    } catch { /* ignore */ }
    return;
  }
  return invoke<void>("set_ai_api_key", { key });
}

// ── Per-Provider AI API Keys ──

export async function getAiApiKeyForProvider(provider: string): Promise<string | null> {
  if (!isTauri) {
    try { return localStorage.getItem(`coverteda_ai_key_${provider}`); } catch { return null; }
  }
  return invoke<string | null>("get_ai_api_key_for_provider", { provider });
}

export async function setAiApiKeyForProvider(provider: string, key: string | null): Promise<void> {
  if (!isTauri) {
    try {
      if (key) localStorage.setItem(`coverteda_ai_key_${provider}`, key);
      else localStorage.removeItem(`coverteda_ai_key_${provider}`);
    } catch { /* ignore */ }
    return;
  }
  return invoke<void>("set_ai_api_key_for_provider", { provider, key });
}

export async function listAiProvidersWithKeys(): Promise<string[]> {
  if (!isTauri) {
    try {
      const result: string[] = [];
      for (const p of ["anthropic", "openai", "google", "mistral", "xai", "deepseek"]) {
        if (localStorage.getItem(`coverteda_ai_key_${p}`)) result.push(p);
      }
      return result;
    } catch { return []; }
  }
  return invoke<string[]>("list_ai_providers_with_keys");
}

// ── Git Panel commands ──

export interface BranchInfo {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  ahead: number;
  behind: number;
  lastCommitHash: string;
  lastCommitMsg: string;
  lastCommitTime: string;
}

export interface TagInfo {
  name: string;
  targetHash: string;
  message: string | null;
  tagger: string | null;
  timeAgo: string | null;
}

export async function gitListBranches(projectDir: string): Promise<BranchInfo[]> {
  if (!isTauri) return [];
  return invoke<BranchInfo[]>("git_list_branches", { projectDir });
}

export async function gitListTags(projectDir: string): Promise<TagInfo[]> {
  if (!isTauri) return [];
  return invoke<TagInfo[]>("git_list_tags", { projectDir });
}

export async function gitPull(projectDir: string): Promise<string> {
  if (!isTauri) return "mock pull";
  return invoke<string>("git_pull", { projectDir });
}

export async function gitPush(projectDir: string): Promise<string> {
  if (!isTauri) return "mock push";
  return invoke<string>("git_push", { projectDir });
}

export async function gitCheckout(projectDir: string, branch: string): Promise<void> {
  if (!isTauri) return;
  return invoke<void>("git_checkout", { projectDir, branch });
}

// ── App Config ──

export interface AppConfig {
  tool_paths: {
    diamond: string | null;
    radiant: string | null;
    quartus: string | null;
    quartus_pro: string | null;
    vivado: string | null;
    yosys: string | null;
    nextpnr: string | null;
    oss_cad_suite: string | null;
  };
  license_servers: { vendor: string; address: string }[];
  default_backend: string;
  theme: string;
  scale_factor: number;
  license_file: string | null;
  license_files: Record<string, string>;
  ai_api_key: string | null;
  ai_model: string | null;
  ai_provider: string | null;
  ai_base_url: string | null;
  selected_versions: Record<string, string>;
  preferred_editor: string | null;
}

const DEFAULT_APP_CONFIG: AppConfig = {
  tool_paths: { diamond: null, radiant: null, quartus: null, quartus_pro: null, vivado: null, yosys: null, nextpnr: null, oss_cad_suite: null },
  license_servers: [],
  default_backend: "radiant",
  theme: "dark",
  scale_factor: 1.0,
  license_file: null,
  license_files: {},
  ai_api_key: null,
  ai_model: null,
  ai_provider: null,
  ai_base_url: null,
  selected_versions: {},
  preferred_editor: null,
};

export async function getAppConfig(): Promise<AppConfig> {
  if (!isTauri) {
    try {
      const raw = localStorage.getItem("coverteda_config");
      if (raw) return { ...DEFAULT_APP_CONFIG, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return { ...DEFAULT_APP_CONFIG };
  }
  return invoke<AppConfig>("get_app_config");
}

export async function saveAppConfig(config: AppConfig): Promise<void> {
  if (!isTauri) {
    try { localStorage.setItem("coverteda_config", JSON.stringify(config)); } catch { /* ignore */ }
    return;
  }
  return invoke<void>("save_app_config", { config });
}

export async function pickFile(filters?: { name: string; extensions: string[] }[]): Promise<string | null> {
  if (!isTauri) {
    return window.prompt("Enter file path:") || null;
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: false,
    multiple: false,
    filters: filters ?? [],
  });
  return selected as string | null;
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  if (!isTauri) { console.log("Mock write:", path); return; }
  return invoke<void>("write_text_file", { path, content });
}

export async function scanProjectFiles(
  projectDir: string,
  backendId: string,
  topModule: string,
): Promise<string[]> {
  if (!isTauri) return [];
  return invoke<string[]>("scan_project_files", { projectDir, backendId, topModule });
}

export async function pickSaveFile(filters?: { name: string; extensions: string[] }[]): Promise<string | null> {
  if (!isTauri) {
    return window.prompt("Enter save file path:") || null;
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  const selected = await save({
    filters: filters ?? [],
  });
  return selected as string | null;
}

export async function deleteFile(path: string): Promise<void> {
  if (!isTauri) return;
  return invoke<void>("delete_file", { path });
}

export async function deleteDirectory(path: string): Promise<void> {
  if (!isTauri) return;
  return invoke<void>("delete_directory", { path });
}

export async function pickDirectory(): Promise<string | null> {
  if (!isTauri) {
    return window.prompt("Enter project directory path:") || null;
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({ directory: true, multiple: false });
  return selected as string | null;
}

// ── File reading ──

export async function readFile(path: string): Promise<FileContent> {
  if (!isTauri) {
    return {
      path,
      content: `// Mock content for ${path}\n// Running outside Tauri`,
      sizeBytes: 0,
      isBinary: false,
      lineCount: 2,
    };
  }
  return invoke<FileContent>("read_file", { path });
}

export async function readBuildLog(projectDir: string): Promise<string> {
  if (!isTauri) return "";
  return invoke<string>("read_build_log", { projectDir });
}

// ── File tree mapping ──

const FILE_TYPE_MAP: Record<string, string> = {
  rtl: "rtl",
  testbench: "tb",
  constraint: "constr",
  ip: "ip",
  output: "output",
  config: "config",
  doc: "doc",
  other: "other",
};

const LANG_MAP: Record<string, string> = {
  ".v": "Verilog",
  ".sv": "SystemVerilog",
  ".vhd": "VHDL",
  ".vhdl": "VHDL",
  ".tcl": "TCL",
  ".pdc": "PDC",
  ".sdc": "SDC",
  ".lpf": "LPF",
  ".xdc": "XDC",
};

export async function getFileTreeMapped(projectDir: string): Promise<ProjectFile[]> {
  if (!isTauri) return [];
  const raw = await invoke<RustFileEntry[]>("get_file_tree", { projectDir });
  return raw.map((e) => {
    const ext = "." + e.name.split(".").pop()?.toLowerCase();
    return {
      n: e.name,
      d: e.depth - 1, // Rust depth starts at 1 for top-level
      ty: e.is_dir ? "folder" : (FILE_TYPE_MAP[e.file_type] ?? "other"),
      path: e.path,
      open: e.is_dir ? true : undefined,
      saved: true,
      git: e.git_status ?? "clean",
      synth: e.in_synthesis,
      lines: e.size_bytes > 0 && !e.is_dir ? undefined : undefined,
      lang: LANG_MAP[ext] ?? undefined,
    };
  });
}

// ── Report mapping ──

export function mapTimingReport(r: RustTimingReport, backendName: string): TimingReportData {
  const fmaxStr = r.fmax_mhz > 0 ? `${r.fmax_mhz.toFixed(2)} MHz` : "Unconstrained";
  const targetStr = r.target_mhz > 0 ? `${r.target_mhz.toFixed(2)} MHz` : "None";
  const margin = r.target_mhz > 0 ? `${(r.fmax_mhz - r.target_mhz).toFixed(2)} MHz` : "N/A";
  const status = r.failing_paths === 0
    ? (r.fmax_mhz > 0 ? "MET" : "UNCONSTRAINED")
    : "VIOLATED";

  return {
    title: "Timing Report",
    generated: new Date().toISOString(),
    tool: backendName,
    summary: {
      status,
      fmax: fmaxStr,
      target: targetStr,
      margin,
      wns: `${r.wns_ns.toFixed(3)} ns`,
      tns: `${r.tns_ns.toFixed(3)} ns`,
      whs: `${r.whs_ns.toFixed(3)} ns`,
      ths: `${r.ths_ns.toFixed(3)} ns`,
      failingPaths: r.failing_paths,
      totalPaths: r.total_paths,
      clocks: r.clock_domains.length,
    },
    clocks: r.clock_domains.map((c) => ({
      name: c.name,
      period: `${c.period_ns.toFixed(3)} ns`,
      freq: `${c.frequency_mhz.toFixed(2)} MHz`,
      source: c.source,
      type: c.clock_type,
      wns: `${c.wns_ns.toFixed(3)} ns`,
      paths: c.path_count,
    })),
    criticalPaths: r.critical_paths.map((p) => ({
      rank: p.rank,
      from: p.from,
      to: p.to,
      slack: `${p.slack_ns.toFixed(3)} ns`,
      req: `${p.required_ns.toFixed(3)} ns`,
      delay: `${p.delay_ns.toFixed(3)} ns`,
      levels: p.logic_levels,
      clk: p.clock,
      type: p.path_type,
    })),
    holdPaths: [],
    unconstrained: [],
  };
}

// ── Build History persistence ──

import type { BuildRecord } from "../components/BuildHistory";

/**
 * Append a build record to the project's .coverteda_history.json.
 * Creates the file if it doesn't exist. Keeps the last 100 records.
 */
export async function saveBuildRecord(projectDir: string, record: BuildRecord): Promise<void> {
  const historyPath = `${projectDir}/.coverteda_history.json`;
  let records: BuildRecord[] = [];
  try {
    const fc = await readFile(historyPath);
    const parsed = JSON.parse(fc.content);
    if (Array.isArray(parsed)) records = parsed;
  } catch {
    /* file doesn't exist yet — start fresh */
  }
  records.push(record);
  // Keep last 100 builds
  if (records.length > 100) records = records.slice(-100);
  await writeTextFile(historyPath, JSON.stringify(records, null, 2));
}

export function mapUtilizationReport(r: RustResourceReport): UtilizationReportData {
  return {
    title: "Utilization Report",
    generated: new Date().toISOString(),
    device: r.device,
    summary: r.categories.map((c) => ({
      cat: c.name,
      items: c.items.map((i) => ({
        r: i.resource,
        used: i.used,
        total: i.total,
        detail: i.detail ?? "",
      })),
    })),
    byModule: r.by_module.map((m) => ({
      module: m.module,
      lut: m.lut,
      ff: m.ff,
      ebr: m.ebr,
      pct: `${m.percentage.toFixed(1)}%`,
    })),
  };
}

const POWER_COLORS = ["#f59e0b", "#ef4444", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899"];

export function mapPowerReport(r: RustPowerReport): PowerReportData {
  return {
    title: "Power Estimation",
    generated: new Date().toISOString(),
    junction: `${r.junction_temp_c.toFixed(1)}\u00B0C`,
    ambient: `${r.ambient_temp_c.toFixed(1)}\u00B0C`,
    theta_ja: `${r.theta_ja.toFixed(1)}\u00B0C/W`,
    total: `${r.total_mw.toFixed(1)} mW`,
    confidence: r.confidence,
    breakdown: r.breakdown.map((b, i) => ({
      cat: b.category,
      mw: Math.round(b.mw * 10) / 10,
      pct: Math.round(b.percentage),
      color: POWER_COLORS[i % POWER_COLORS.length],
    })),
    byRail: r.by_rail.map((rail) => ({
      rail: rail.rail,
      mw: Math.round(rail.mw * 10) / 10,
    })),
  };
}

export function mapDrcReport(r: RustDrcReport): DrcReportData {
  return {
    title: "Design Rule Checks",
    generated: new Date().toISOString(),
    summary: {
      errors: r.errors,
      critWarns: r.critical_warnings,
      warnings: r.warnings,
      info: r.info,
      waived: r.waived,
    },
    items: r.items.map((item) => ({
      sev: item.severity,
      code: item.code,
      msg: item.message,
      loc: item.location || "\u2014",
      action: item.action,
    })),
  };
}

export function mapIoReport(r: RustIoReport): { title: string; generated: string; banks: IoBankData[] } {
  return {
    title: "I/O Pin Assignments",
    generated: new Date().toISOString(),
    banks: r.banks.map((b) => ({
      id: b.id,
      vccio: b.vccio,
      used: b.used,
      total: b.total,
      pins: b.pins.map((p) => `${p.pin} ${p.net} ${p.direction}`),
    })),
  };
}

// ── Auto-detect report loading ──

interface RustAutoReports {
  timing: RustTimingReport | null;
  utilization: RustResourceReport | null;
  power: RustPowerReport | null;
  drc: RustDrcReport | null;
}

export interface MappedAutoReports {
  timing: TimingReportData | null;
  utilization: UtilizationReportData | null;
  power: PowerReportData | null;
  drc: DrcReportData | null;
}

export async function autoLoadReports(projectDir: string, backendName: string): Promise<MappedAutoReports> {
  if (!isTauri) {
    // Return realistic mock report data for browser preview
    return {
      timing: {
        title: "Timing Report", generated: "2025-01-15 10:30", tool: backendName,
        summary: {
          status: "MET", fmax: "125.50 MHz", target: "100.00 MHz", margin: "25.50 MHz",
          wns: "2.500 ns", tns: "0.000 ns", whs: "0.180 ns", ths: "0.000 ns",
          failingPaths: 0, totalPaths: 284, clocks: 1,
        },
        clocks: [
          { name: "sys_clk", period: "10.000 ns", freq: "100.00 MHz", source: "clk_pin", type: "Primary", wns: "2.500 ns", paths: 284 },
        ],
        criticalPaths: [
          { rank: 1, from: "counter_reg[0]", to: "counter_reg[7]", slack: "2.500 ns", req: "10.000 ns", delay: "7.500 ns", levels: 4, clk: "sys_clk", type: "setup" },
          { rank: 2, from: "state_reg[0]", to: "led_out[3]", slack: "3.120 ns", req: "10.000 ns", delay: "6.880 ns", levels: 3, clk: "sys_clk", type: "setup" },
          { rank: 3, from: "counter_reg[4]", to: "overflow_flag", slack: "4.200 ns", req: "10.000 ns", delay: "5.800 ns", levels: 2, clk: "sys_clk", type: "setup" },
        ],
        holdPaths: [
          { rank: 1, from: "counter_reg[0]", to: "counter_reg[1]", slack: "0.180 ns", levels: 1, type: "hold" },
        ],
        unconstrained: [],
      },
      utilization: {
        title: "Utilization Report", generated: "2025-01-15 10:30", device: "LCMXO3LF-6900C-5BG256C",
        summary: [
          { cat: "Logic", items: [
            { r: "LUT4", used: 120, total: 6864, detail: "Combinational logic" },
            { r: "Registers", used: 48, total: 6864, detail: "Sequential elements" },
            { r: "Carry Chain", used: 8, total: 3432, detail: "" },
          ]},
          { cat: "Memory", items: [
            { r: "EBR (9K)", used: 0, total: 26, detail: "Embedded Block RAM" },
            { r: "Distributed RAM", used: 0, total: 1716, detail: "Slice-based" },
          ]},
          { cat: "I/O", items: [
            { r: "PIO", used: 18, total: 206, detail: "8 IN, 8 OUT, 2 BIDIR" },
          ]},
          { cat: "DSP", items: [
            { r: "DSP Blocks", used: 0, total: 12, detail: "" },
          ]},
          { cat: "Clock", items: [
            { r: "PLL", used: 0, total: 2, detail: "" },
            { r: "Global Buffers", used: 1, total: 16, detail: "sys_clk" },
          ]},
        ],
        byModule: [
          { module: "counter_8bit", lut: 80, ff: 32, ebr: 0, pct: "66.7%" },
          { module: "led_driver", lut: 24, ff: 8, ebr: 0, pct: "20.0%" },
          { module: "top_level", lut: 16, ff: 8, ebr: 0, pct: "13.3%" },
        ],
      },
      power: {
        title: "Power Report", generated: "2025-01-15 10:30",
        junction: "27.3 \u00B0C", ambient: "25.0 \u00B0C", theta_ja: "29.2 \u00B0C/W",
        total: "18.4 mW", confidence: "Low (no activity)",
        breakdown: [
          { cat: "Static (Leakage)", mw: 8.2, pct: 45, color: "#5b8cf0" },
          { cat: "Dynamic (Core)", mw: 6.1, pct: 33, color: "#f5a623" },
          { cat: "Dynamic (I/O)", mw: 3.4, pct: 18, color: "#4ecdc4" },
          { cat: "PLL", mw: 0.7, pct: 4, color: "#c084fc" },
        ],
        byRail: [
          { rail: "VCC (1.2V)", mw: 14.3 },
          { rail: "VCCIO (3.3V)", mw: 3.4 },
          { rail: "VCC_PLL", mw: 0.7 },
        ],
      },
      drc: {
        title: "DRC Report", generated: "2025-01-15 10:30",
        summary: { errors: 0, critWarns: 2, warnings: 5, info: 3, waived: 1 },
        items: [
          { sev: "crit_warn", code: "DRC-101", msg: "Unplaced I/O port 'debug_pin' has no location constraint", loc: "top.v:42", action: "Add LOC constraint or remove port" },
          { sev: "crit_warn", code: "DRC-102", msg: "Clock net 'sys_clk' not on dedicated clock routing", loc: "top.v:8", action: "Assign to PLL or global clock buffer" },
          { sev: "warning", code: "DRC-201", msg: "Unused EBR block at location R2C5", loc: "\u2014", action: "Informational only" },
          { sev: "warning", code: "DRC-202", msg: "I/O standard LVCMOS33 may have excessive ground bounce with 8 simultaneous switching outputs", loc: "Bank 0", action: "Consider staggered output enable or series termination" },
          { sev: "warning", code: "DRC-203", msg: "No input delay constraint on port 'data_in[0]'", loc: "top.v:15", action: "Add set_input_delay if timing critical" },
          { sev: "warning", code: "DRC-204", msg: "No output delay constraint on port 'led_out[0]'", loc: "top.v:18", action: "Add set_output_delay if timing critical" },
          { sev: "warning", code: "DRC-205", msg: "Register counter_reg[7] has no reset", loc: "counter.v:22", action: "Add synchronous reset for reliable startup" },
          { sev: "info", code: "DRC-301", msg: "Design uses 1.7% of available LUT4 resources", loc: "\u2014", action: "No action required" },
          { sev: "info", code: "DRC-302", msg: "All constrained clocks meet timing requirements", loc: "\u2014", action: "No action required" },
          { sev: "info", code: "DRC-303", msg: "Power estimation based on default activity rates", loc: "\u2014", action: "Provide VCD for accurate estimation" },
          { sev: "waived", code: "DRC-401", msg: "Unused PLL instance (design choice)", loc: "\u2014", action: "Waived by user" },
        ],
      },
    };
  }
  const raw = await invoke<RustAutoReports>("auto_load_reports", { projectDir });
  return {
    timing: raw.timing ? mapTimingReport(raw.timing, backendName) : null,
    utilization: raw.utilization ? mapUtilizationReport(raw.utilization) : null,
    power: raw.power ? mapPowerReport(raw.power) : null,
    drc: raw.drc ? mapDrcReport(raw.drc) : null,
  };
}

// ── Makefile Import/Export ──

export interface MakefileImportResult {
  device: string;
  topModule: string;
  sourcePatterns: string[];
  constraintFiles: string[];
  buildDir: string;
  buildOptions: Record<string, string>;
  warnings: string[];
  summary: string[];
}

export async function importMakefile(path: string): Promise<MakefileImportResult> {
  if (!isTauri) {
    return {
      device: "LFE5U-85F-6BG381C", topModule: "blinky",
      sourcePatterns: ["src/*.v"], constraintFiles: ["constraints/pins.lpf"],
      buildDir: "build", buildOptions: {}, warnings: [], summary: ["Mock import"],
    };
  }
  return invoke<MakefileImportResult>("import_makefile", { path });
}

export async function exportMakefile(
  projectDir: string, device: string, topModule: string,
  sources: string[], constraints: string[], buildDir: string,
  buildOptions: Record<string, string>,
): Promise<string> {
  if (!isTauri) return "# Mock Makefile";
  return invoke<string>("export_makefile", {
    projectDir, device, topModule, sources, constraints, buildDir, buildOptions,
  });
}

// ── Source Directory Scanning ──

export async function scanSourceDirectories(projectDir: string): Promise<SourceDirSuggestion[]> {
  if (!isTauri) return [];
  return invoke<SourceDirSuggestion[]>("scan_source_directories", { projectDir });
}

export async function detectTopModule(projectDir: string, sourcePatterns: string[]): Promise<string | null> {
  if (!isTauri) return null;
  return invoke<string | null>("detect_top_module", { projectDir, sourcePatterns });
}

// ── Package Pin Listing ──

export interface PackagePin {
  pin: string;
  bank: string | null;
  function: string;
  diffPair: string | null;
  rOhms?: number;
  lNh?: number;
  cPf?: number;
}

export interface DevicePinData {
  pins: PackagePin[];
  ioStandards: string[];
  driveStrengths: string[];
}

export async function listPackagePins(backendId: string, device: string): Promise<DevicePinData> {
  if (!isTauri) return { pins: [], ioStandards: [], driveStrengths: [] };
  return invoke<DevicePinData>("list_package_pins", { backendId, device });
}

// ── Pad Report (post-build pinout) ──

export interface PadPinEntry {
  portName: string;
  pin: string;
  bank: string;
  bufferType: string;
  site: string;
  ioStandard: string;
  drive: string;
  direction: string;
}

export interface PadBankVccio {
  bank: string;
  vccio: string;
}

export interface PadReport {
  assignedPins: PadPinEntry[];
  vccioBanks: PadBankVccio[];
}

export async function getPadReport(backendId: string, implDir: string): Promise<PadReport | null> {
  if (!isTauri) return null;
  return invoke<PadReport | null>("get_pad_report", { backendId, implDir });
}

// ── Vendor Project Import ──

export async function importVendorProject(dir: string): Promise<VendorImportResult> {
  if (!isTauri) {
    return {
      found: false, vendorFile: "", vendorType: "", backendId: "",
      device: "", topModule: "", sourceFiles: [], constraintFiles: [],
      projectName: "", warnings: [], summary: [],
    };
  }
  return invoke<VendorImportResult>("import_vendor_project", { dir });
}

// ── Device Part Verification ──

import type { VerifyDeviceResult } from "../types";
import { validatePart } from "../data/deviceParts";

export async function verifyDevicePart(backendId: string, part: string): Promise<VerifyDeviceResult> {
  if (!isTauri) {
    // Browser fallback: use local validation
    const result = validatePart(backendId, part);
    return { valid: result.valid, cliVerified: false, error: null };
  }
  return invoke<VerifyDeviceResult>("verify_device_part", { backendId, part });
}

// ── Tool Edition Detection ──

export async function detectToolEdition(backendId: string): Promise<string | null> {
  if (!isTauri) return null;
  return invoke<string | null>("detect_tool_edition", { backendId });
}

// ── Git Init ──

export async function gitInit(projectDir: string): Promise<string> {
  if (!isTauri) return "mock123";
  return invoke<string>("git_init", { projectDir });
}

// ── Programmer commands ──

export interface ProgrammerCable {
  index: number;
  name: string;
  port: string;
}

export async function detectProgrammerCables(): Promise<ProgrammerCable[]> {
  if (!isTauri) return [];
  return invoke<ProgrammerCable[]>("detect_programmer_cables");
}

export async function findBitstreams(): Promise<string[]> {
  if (!isTauri) return [];
  return invoke<string[]>("find_bitstreams");
}

export async function programDevice(
  bitstream: string,
  device: string,
  cablePort: string,
  operation: string,
): Promise<string> {
  return invoke<string>("program_device", { bitstream, device, cablePort, operation });
}

// ── File manager ──

export async function openInFileManager(path: string): Promise<void> {
  if (!isTauri) {
    // Browser fallback: copy path to clipboard
    try { await navigator.clipboard.writeText(path); } catch { /* ignore */ }
    return;
  }
  return invoke<void>("open_in_file_manager", { path });
}

// ── Open in external editor ──

export async function openInEditor(path: string): Promise<void> {
  if (!isTauri) { console.log("Mock open in editor:", path); return; }
  return invoke<void>("open_in_editor", { path });
}

// ── System stats (for Stats for Nerds) ──

export interface SystemStats {
  cpuPct: number;
  memUsedMb: number;
  memTotalMb: number;
  memPct: number;
  diskWriteBytes: number;
  diskWritePct: number;
}

// ── Report file discovery ──

import type { ReportFileEntry } from "../types";

export async function listReportFiles(projectDir: string): Promise<ReportFileEntry[]> {
  if (!isTauri) return [];
  return invoke<ReportFileEntry[]>("list_report_files", { projectDir });
}

// ── Exit app ──

export async function exitApp(): Promise<void> {
  if (!isTauri) return;
  const { exit } = await import("@tauri-apps/plugin-process");
  exit(0);
}

export async function getSystemStats(): Promise<SystemStats | null> {
  if (!isTauri) return null;
  const r = await invoke<{
    cpu_pct: number;
    mem_used_mb: number;
    mem_total_mb: number;
    mem_pct: number;
    disk_write_bytes: number;
    disk_write_pct: number;
  }>("get_system_stats");
  return {
    cpuPct: r.cpu_pct,
    memUsedMb: r.mem_used_mb,
    memTotalMb: r.mem_total_mb,
    memPct: r.mem_pct,
    diskWriteBytes: r.disk_write_bytes,
    diskWritePct: r.disk_write_pct,
  };
}

// ── SSH Remote Build ──

import type { SshConfig, SshConnectionInfo, RemoteToolInfo } from "../types";

export async function sshTestConnection(
  host: string,
  port: number,
  user: string,
  tool: string,
  keyPath?: string,
  customSsh?: string,
  customScp?: string,
): Promise<SshConnectionInfo> {
  if (!isTauri) return { ok: false, error: "Not running in Tauri" };
  return invoke<SshConnectionInfo>("ssh_test_connection", {
    host, port, user, tool,
    keyPath: keyPath ?? null,
    customSsh: customSsh ?? null,
    customScp: customScp ?? null,
  });
}

export async function sshSaveConfig(config: SshConfig): Promise<void> {
  if (!isTauri) return;
  return invoke<void>("ssh_save_config", { config });
}

export async function sshLoadConfig(): Promise<SshConfig | null> {
  if (!isTauri) return null;
  return invoke<SshConfig | null>("ssh_load_config");
}

export async function sshDetectTools(): Promise<RemoteToolInfo[]> {
  if (!isTauri) return [];
  return invoke<RemoteToolInfo[]>("ssh_detect_tools");
}

export async function sshSetPassword(password: string): Promise<void> {
  if (!isTauri) return;
  return invoke<void>("ssh_set_password", { password });
}

export async function sshGetPassword(): Promise<string | null> {
  if (!isTauri) return null;
  return invoke<string | null>("ssh_get_password");
}

export async function sshRemoteFileTree(): Promise<unknown[]> {
  if (!isTauri) return [];
  return invoke<unknown[]>("ssh_remote_file_tree");
}

export async function sshReadRemoteFile(path: string): Promise<string> {
  if (!isTauri) return "";
  return invoke<string>("ssh_read_remote_file", { path });
}

export async function sshBrowseDirectory(dir: string): Promise<RemoteDirEntry[]> {
  if (!isTauri) return [];
  return invoke<RemoteDirEntry[]>("ssh_browse_directory", { dir });
}

export async function sshCheckProjectDir(dir: string): Promise<ProjectConfig | null> {
  if (!isTauri) return null;
  return invoke<ProjectConfig | null>("ssh_check_project", { dir });
}

export async function sshCreateProject(
  dir: string,
  name: string,
  backendId: string,
  device: string,
  topModule: string,
  sourcePatterns?: string[],
  constraintFiles?: string[],
): Promise<ProjectConfig> {
  return invoke<ProjectConfig>("ssh_create_project", {
    dir,
    name,
    backendId,
    device,
    topModule,
    sourcePatterns: sourcePatterns ?? null,
    constraintFiles: constraintFiles ?? null,
  });
}
