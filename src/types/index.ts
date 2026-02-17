// ── Theme Colors ──
export const C = {
  bg: "#06080c",
  s1: "#0c1018",
  s2: "#121a26",
  s3: "#1a2438",
  b1: "#1c2840",
  b2: "#2a4060",
  t1: "#e8f0fa",
  t2: "#9ab0cc",
  t3: "#546880",
  accent: "#3b9eff",
  accentDim: "#122a48",
  ok: "#2ecc71",
  okDim: "#0a2816",
  warn: "#f0a030",
  warnDim: "#2a1c06",
  err: "#e74c3c",
  errDim: "#2a0c0c",
  cyan: "#22d3ee",
  purple: "#a78bfa",
  pink: "#f472b6",
  orange: "#fb923c",
} as const;

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

// ── File Tree ──
export interface ProjectFile {
  n: string;
  d: number;
  ty: string;
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
  | "resources"
  | "console";

export type ReportTab = "timing" | "util" | "power" | "drc" | "io";
