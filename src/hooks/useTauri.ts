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
  dirty: boolean;
}

export async function getGitStatus(projectDir: string): Promise<RustGitStatus> {
  return invoke<RustGitStatus>("get_git_status", { projectDir });
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
  RuntimeBackend, PipelineStage, ExampleProject,
} from "../types";
import { MOCK_RECENT_PROJECTS, MOCK_PROJECT_CONFIG, BACKEND_META, EXAMPLE_PROJECTS } from "../data/mockData";

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

export async function getBundledExamples(): Promise<ExampleProject[]> {
  if (!isTauri) return EXAMPLE_PROJECTS;
  return invoke<ExampleProject[]>("list_bundled_examples");
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
): Promise<ProjectConfig> {
  if (!isTauri) return { ...MOCK_PROJECT_CONFIG, name, backendId, device, topModule };
  return invoke<ProjectConfig>("create_project", { dir, name, backendId, device, topModule });
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

// ── App Config ──

export interface AppConfig {
  tool_paths: {
    diamond: string | null;
    radiant: string | null;
    quartus: string | null;
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
  ai_api_key: string | null;
  ai_model: string | null;
  ai_provider: string | null;
  ai_base_url: string | null;
}

export async function getAppConfig(): Promise<AppConfig> {
  if (!isTauri) {
    return {
      tool_paths: { diamond: null, radiant: null, quartus: null, vivado: null, yosys: null, nextpnr: null, oss_cad_suite: null },
      license_servers: [],
      default_backend: "radiant",
      theme: "dark",
      scale_factor: 1.0,
      license_file: null,
      ai_api_key: null,
      ai_model: null,
      ai_provider: null,
      ai_base_url: null,
    };
  }
  return invoke<AppConfig>("get_app_config");
}

export async function saveAppConfig(config: AppConfig): Promise<void> {
  if (!isTauri) return;
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
