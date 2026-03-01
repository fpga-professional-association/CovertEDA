// ── Theme Colors (backward compat re-export from theme.ts) ──
export { DARK as C } from "../theme";
export type { ThemeColors } from "../theme";

// ── Fonts ──
export const MONO = "'IBM Plex Mono', monospace";
export const SANS = "'Outfit', sans-serif";

// ── Backend ──
export interface PipelineStage {
  id: string;
  label: string;
  cmd: string;
  detail: string;
}

export interface BackendResource {
  label: string;
  used: number;
  total: number;
  unit?: string;
}

export interface BackendTiming {
  fmax: string;
  target: string;
  setup: string;
  hold: string;
}

export interface LogEntry {
  t: "cmd" | "info" | "ok" | "warn" | "err" | "out";
  m: string;
}

export interface BuildHistoryEntry {
  time: string;
  ok: boolean;
  fmax: string;
  util: string;
  w: number;
}

export interface PinConstraint {
  pin: string;
  net: string;
  dir: string;
  std: string;
  bank: string;
  lock: boolean;
}

export interface CriticalPathEntry {
  from: string;
  to: string;
  slack: string;
  lvl: number;
}

export interface IPCategory {
  cat: string;
  items: IPItem[];
}

export interface IPItem {
  name: string;
  desc: string;
  params: string[];
}

export interface LicenseEntry {
  tool: string;
  feature: string;
  status: "active" | "warning" | "expired" | "open";
  expires: string;
  seats: string;
  server: string;
  mac: string;
  vendor: string;
}

export interface Backend {
  id: string;
  name: string;
  short: string;
  color: string;
  icon: string;
  version: string;
  cli: string;
  defaultDev: string;
  constrExt: string;
  pipeline: PipelineStage[];
  resources: BackendResource[];
  timing: BackendTiming;
  constraints: PinConstraint[];
  paths: CriticalPathEntry[];
  history: BuildHistoryEntry[];
  log: LogEntry[];
  ipCatalog: IPCategory[];
}

// ── Report Types ──
export interface TimingReportData {
  title: string;
  generated: string;
  tool: string;
  summary: {
    status: string;
    fmax: string;
    target: string;
    margin: string;
    wns: string;
    tns: string;
    whs: string;
    ths: string;
    failingPaths: number;
    totalPaths: number;
    clocks: number;
  };
  clocks: {
    name: string;
    period: string;
    freq: string;
    source: string;
    type: string;
    wns: string;
    paths: number;
  }[];
  criticalPaths: {
    rank: number;
    from: string;
    to: string;
    slack: string;
    req: string;
    delay: string;
    levels: number;
    clk: string;
    type: string;
  }[];
  holdPaths: {
    rank: number;
    from: string;
    to: string;
    slack: string;
    levels: number;
    type: string;
  }[];
  unconstrained: string[];
}

export interface UtilizationReportData {
  title: string;
  generated: string;
  device: string;
  summary: {
    cat: string;
    items: {
      r: string;
      used: number;
      total: number;
      detail: string;
    }[];
  }[];
  byModule: {
    module: string;
    lut: number;
    ff: number;
    ebr: number;
    pct: string;
  }[];
}

export interface PowerReportData {
  title: string;
  generated: string;
  junction: string;
  ambient: string;
  theta_ja: string;
  total: string;
  confidence: string;
  breakdown: {
    cat: string;
    mw: number;
    pct: number;
    color: string;
  }[];
  byRail: { rail: string; mw: number }[];
}

export interface DrcReportData {
  title: string;
  generated: string;
  summary: {
    errors: number;
    critWarns: number;
    warnings: number;
    info: number;
    waived: number;
  };
  items: {
    sev: string;
    code: string;
    msg: string;
    loc: string;
    action: string;
  }[];
}

export interface IoBankData {
  id: string;
  vccio: string;
  used: number;
  total: number;
  pins: string[];
}

// ── Git ──
export interface GitState {
  branch: string;
  commit: string;
  commitMsg: string;
  author: string;
  time: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  staged: number;
  unstaged: number;
  untracked: number;
  stashes: number;
  tags: string[];
  recentCommits: {
    hash: string;
    msg: string;
    time: string;
    author: string;
  }[];
}

// ── File Content (read-only viewer) ──
export interface FileContent {
  path: string;
  content: string;
  sizeBytes: number;
  isBinary: boolean;
  lineCount: number;
}

// ── File Tree ──
export interface ProjectFile {
  n: string;
  d: number;
  ty: string;
  path?: string;
  open?: boolean;
  saved?: boolean;
  git?: string;
  synth?: boolean;
  sim?: boolean;
  lines?: number;
  lang?: string;
}

// ── Section types ──
export type Section =
  | "build"
  | "reports"
  | "ip"
  | "interconnect"
  | "ai"
  | "regmap"
  | "constraints"
  | "console"
  | "license"
  | "history"
  | "programmer"
  | "docs";

export type ReportTab = "timing" | "util" | "power" | "drc" | "io" | "timing-analysis" | "synth" | "map" | "par" | "bitstream" | "files";

export interface ReportFileEntry {
  name: string;
  path: string;
  sizeBytes: number;
  modifiedEpochMs: number;
  extension: string;
}

// ── Project Config (.coverteda) ──
export interface ProjectConfig {
  name: string;
  description?: string;
  backendId: string;
  device: string;
  topModule: string;
  sourcePatterns: string[];
  constraintFiles: string[];
  implDir: string;
  backendConfig: Record<string, string>;
  buildStages: string[];
  buildOptions: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface RecentProject {
  path: string;
  name: string;
  backendId: string;
  device: string;
  lastOpened: string;
}

// ── Backend metadata (lightweight, for start screen) ──
export interface BackendMeta {
  id: string;
  name: string;
  short: string;
  color: string;
  icon: string;
  defaultDevice: string;
}

export type AppView = "start" | "ide";

// ── Runtime Backend (live data, no mock) ──
export interface RuntimeBackend {
  id: string;
  name: string;
  short: string;
  color: string;
  icon: string;
  version: string;
  cli: string;
  defaultDev: string;
  constrExt: string;
  pipeline: PipelineStage[];
  available: boolean;
}

// ── Tool Detection ──
export interface DetectedTool {
  backendId: string;
  name: string;
  version: string | null;
  installPath: string | null;
  available: boolean;
}

// ── Source Directory Scanning ──
export interface SourceDirSuggestion {
  dir: string;
  fileCount: number;
  extensions: string[];
}

// ── Vendor Project Import ──
export interface VendorImportResult {
  found: boolean;
  vendorFile: string;
  vendorType: string;
  backendId: string;
  device: string;
  topModule: string;
  sourceFiles: string[];
  constraintFiles: string[];
  projectName: string;
  warnings: string[];
  summary: string[];
}

export interface LicenseFeature {
  feature: string;
  vendor: string;
  expires: string;
  hostId: string;
  status: string;
}

export interface LicenseFileInfo {
  backend: string;
  path: string;
}

export interface LicenseCheckResult {
  licenseFiles: LicenseFileInfo[];
  features: LicenseFeature[];
}
