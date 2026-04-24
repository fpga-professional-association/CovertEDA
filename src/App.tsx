import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from "react";
import { Section, ReportTab, LogEntry, AppView, ProjectConfig, ProjectFile, FileContent, TimingReportData, UtilizationReportData, PowerReportData, DrcReportData, IoBankData, RuntimeBackend, LicenseCheckResult, GitState } from "./types";
import { useTheme } from "./context/ThemeContext";
import { Btn, NavBtn } from "./components/shared";
import {
  Chip, Zap, Doc, Box, Brain, Link, MapIcon, Pin, Term, Key, Settings,
  Play, Stop, Search, Clock, Download, Git, Server,
} from "./components/Icons";
import GitStatusBar from "./components/GitStatusBar";
import FileTree from "./components/FileTree";
import StartScreen from "./components/StartScreen";
import PerfOverlay from "./components/PerfOverlay";
import ContextMenu, { ContextMenuItem } from "./components/ContextMenu";
import type { BuildRecord } from "./components/BuildHistory";

// Lazy-loaded section components — only fetched when first rendered
const BuildPipeline = lazy(() => import("./components/BuildPipeline"));
const ReportViewer = lazy(() => import("./components/ReportViewer"));
const Console = lazy(() => import("./components/Console"));
const CommandPalette = lazy(() => import("./components/CommandPalette"));
const FileViewer = lazy(() => import("./components/FileViewer"));
const SettingsPanel = lazy(() => import("./components/SettingsPanel"));
const AiAssistant = lazy(() => import("./components/AiAssistant"));
const ConstraintEditor = lazy(() => import("./components/ConstraintEditor"));
const Programmer = lazy(() => import("./components/Programmer"));
const BuildHistory = lazy(() => import("./components/BuildHistory"));
const Documentation = lazy(() => import("./components/Documentation"));
const KeyboardShortcuts = lazy(() => import("./components/KeyboardShortcuts"));
const IpCatalogSection = lazy(() => import("./components/IpCatalogSection"));
const GitPanel = lazy(() => import("./components/GitPanel"));
const SshPanel = lazy(() => import("./components/SshPanel"));
const PowerCalculator = lazy(() => import("./components/PowerCalculator"));
const RevealDebug = lazy(() => import("./components/RevealDebug"));
const RunManager = lazy(() => import("./components/RunManager"));
const EcoEditor = lazy(() => import("./components/EcoEditor"));
const SimWizard = lazy(() => import("./components/SimWizard"));
const SourceTemplates = lazy(() => import("./components/SourceTemplates"));
import {
  startBuild as tauriStartBuild,
  listen,
  readFile,
  readBuildLog,
  openProject,
  getFileTreeMapped,
  getIoReport,
  mapIoReport,
  autoLoadReports,
  getRuntimeBackends,
  getAppConfig,
  deleteFile,
  deleteDirectory,
  checkLicenses,
  cancelBuild,
  cleanBuild,
  checkSourcesStale,
  saveProject,
  gitCommit,
  getGitStatus,
  gitLog,
  saveBuildRecord,
  getProjectConfigAtHead,
  detectToolEdition,
  openInEditor,
} from "./hooks/useTauri";
import type { RustGitStatus, GitLogEntry } from "./hooks/useTauri";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function mapGitStatus(r: RustGitStatus, logEntries?: GitLogEntry[]): GitState {
  return {
    branch: r.branch,
    commit: r.commitHash,
    commitMsg: r.commitMessage,
    author: r.author,
    time: r.timeAgo,
    ahead: r.ahead,
    behind: r.behind,
    dirty: r.dirty,
    staged: r.staged,
    unstaged: r.unstaged,
    untracked: r.untracked,
    stashes: r.stashes ?? 0,
    tags: [],
    recentCommits: (logEntries ?? []).map((e) => ({
      hash: e.hash,
      msg: e.message,
      time: e.timeAgo,
      author: e.author,
    })),
  };
}

// Backend-specific name for the integrated logic analyzer. Each vendor
// has a different product for in-system signal capture; the nav label
// reflects what the user can actually drive on the active backend.
const DEBUG_TOOL_LABEL: Record<string, string> = {
  radiant: "Reveal",
  diamond: "Reveal",
  quartus: "SignalTap",
  vivado:  "ILA",
  libero:  "SmartDebug",
  ace:     "SnapShot",
  oss:     "Debug",
};
const DEBUG_TOOL_TOOLTIP: Record<string, string> = {
  radiant: "Reveal Debug — Lattice Radiant integrated logic analyzer",
  diamond: "Reveal — Lattice Diamond integrated logic analyzer",
  quartus: "SignalTap II — Intel/Altera integrated logic analyzer",
  vivado:  "Integrated Logic Analyzer (ILA) — AMD/Xilinx signal capture",
  libero:  "SmartDebug — Microchip Libero integrated logic analyzer",
  ace:     "SnapShot — Achronix ACE integrated logic analyzer",
  oss:     "Debug — generic signal capture (no vendor-native ILA)",
};

// Fallback backend when none loaded yet
const FALLBACK_BACKEND: RuntimeBackend = {
  id: "radiant",
  name: "Lattice Radiant",
  short: "Radiant",
  color: "#a855f7",
  icon: "\u2756",
  version: "",
  cli: "radiantc",
  defaultDev: "LIFCL-40-7BG400I",
  constrExt: ".pdc",
  pipeline: [
    { id: "synth", label: "Synthesis (LSE)", cmd: "prj_run_synthesis", detail: "RTL synthesis" },
    { id: "map", label: "Map", cmd: "prj_run_map", detail: "Technology mapping" },
    { id: "par", label: "Place & Route", cmd: "prj_run_par", detail: "Placement + routing" },
    { id: "bitgen", label: "Bitstream", cmd: "prj_run_bitstream", detail: ".bit generation" },
  ],
  available: false,
};

// ── Startup performance helpers ──
const perfOnce = new Set<string>();
function perf(name: string) {
  if (perfOnce.has(name)) return;
  perfOnce.add(name);
  performance.mark(`app:${name}`);
}
function perfSummary() {
  const marks = performance.getEntriesByType("mark")
    .filter((m) => m.name.startsWith("app:"))
    .sort((a, b) => a.startTime - b.startTime);
  if (marks.length === 0) return;
  const first = marks[0].startTime;
  const lines = marks.map((m) => {
    const fromOrigin = Math.round(m.startTime);
    const fromFirst = Math.round(m.startTime - first);
    return `  ${m.name.replace("app:", "").padEnd(20)} ${String(fromOrigin).padStart(5)}ms (origin)  +${String(fromFirst).padStart(5)}ms`;
  });
  const total = Math.round(marks[marks.length - 1].startTime - first);
  console.log(
    `%c[CovertEDA Startup] ${total}ms total\n` +
    `%c  ${"milestone".padEnd(20)} ${"abs".padStart(5)}          ${"delta".padStart(6)}\n` +
    lines.join("\n"),
    "color: #58a6ff; font-weight: bold",
    "color: #8b949e",
  );
}

export default function App() {
  const { C, MONO, SANS, setThemeId, scaleFactor, setScaleFactor } = useTheme();
  perf("app_render");

  // ── View routing ──
  const [view, setView] = useState<AppView>("start");
  const [project, setProject] = useState<ProjectConfig | null>(null);
  const [projectDir, setProjectDir] = useState<string>("");

  // ── Backend state ──
  const [backends, setBackends] = useState<RuntimeBackend[]>([]);
  const [bid, setBid] = useState("radiant");

  // ── IDE state ──
  const [sec, setSec] = useState<Section>("build");
  const [visitedSecs, setVisitedSecs] = useState<Set<Section>>(() => new Set(["build"]));
  const [building, setBuilding] = useState(false);
  const [buildId, setBuildId] = useState<string | null>(null);
  const [bStep, setBStep] = useState(-1);
  const [_stageResults, setStageResults] = useState<Record<number, "success" | "failed">>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsRef = useRef<LogEntry[]>([]);
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const navHistory = useRef<Section[]>([]);
  const buildStartTime = useRef<number>(0);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const [aFile, setAFile] = useState("");
  const [showFiles, setShowFiles] = useState(true);
  const [fileTreeWidth, setFileTreeWidth] = useState(250);
  const [rptTab, setRptTab] = useState<ReportTab>("timing");
  const [gitExpanded, setGitExpanded] = useState(false);
  const [gitState, setGitState] = useState<GitState | null>(null);
  const [realFiles, setRealFiles] = useState<ProjectFile[] | null>(null);
  const [viewingFile, setViewingFile] = useState<FileContent | null>(null);
  const [realTimingReport, setRealTimingReport] = useState<TimingReportData | null>(null);
  const [realUtilReport, setRealUtilReport] = useState<UtilizationReportData | null>(null);
  const [realPowerReport, setRealPowerReport] = useState<PowerReportData | null>(null);
  const [realDrcReport, setRealDrcReport] = useState<DrcReportData | null>(null);
  const [realIoReport, setRealIoReport] = useState<{ title: string; generated: string; banks: IoBankData[] } | null>(null);
  const [_buildDone, setBuildDone] = useState(false);
  const [buildFailed, setBuildFailed] = useState(false);
  const [buildElapsedSec, setBuildElapsedSec] = useState<number | null>(null);
  const [activeStage, setActiveStage] = useState<number | null>(null);
  const [licenseResult, setLicenseResult] = useState<LicenseCheckResult | null>(null);
  const [licenseLoading, setLicenseLoading] = useState(false);
  const [buildStages, setBuildStages] = useState<string[]>([]);
  const [buildOptions, setBuildOptions] = useState<Record<string, string>>({});
  const [sourcesStale, setSourcesStale] = useState(false);
  const [toolEdition, setToolEdition] = useState<string | null>(null);
  const [commitModal, setCommitModal] = useState<"checking" | "prompt" | "committing" | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [perfOverlay, setPerfOverlay] = useState(false);
  const [sourceContents, setSourceContents] = useState<Record<string, string>>({});
  const [aiMdContent, setAiMdContent] = useState<string | null>(null);
  const [pendingAiMessage, setPendingAiMessage] = useState<string | null>(null);

  // ── Build config auto-save state ──
  const [buildSaveStatus, setBuildSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [headConfig, setHeadConfig] = useState<ProjectConfig | null>(null);
  const buildSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve current backend
  const B = backends.find((b) => b.id === bid) ?? FALLBACK_BACKEND;

  // Find constraint file in file tree matching the backend's extension
  const constraintFilePath = useMemo(() => {
    if (!realFiles) return undefined;
    const ext = B.constrExt || (
      bid === "radiant" || bid === "diamond" ? ".pdc" :
      bid === "quartus" ? ".qsf" : bid === "vivado" ? ".xdc" : ".pcf"
    );
    const match = realFiles.find(
      (f) => f.ty === "constr" && f.path && f.n.endsWith(ext)
    );
    return match?.path;
  }, [realFiles, bid, B.constrExt]);

  // Load source file contents for AI context (RTL, constraints, testbenches)
  useEffect(() => {
    if (!realFiles || !isTauri) { setSourceContents({}); return; }
    let cancelled = false;
    const eligible = realFiles
      .filter((f) => (f.ty === "rtl" || f.ty === "constr" || f.ty === "tb") && f.path && f.ty !== "folder" as string)
      .slice(0, 15);
    if (eligible.length === 0) { setSourceContents({}); return; }

    const MAX_PER_FILE = 2000;
    const MAX_TOTAL = 12000;

    Promise.all(
      eligible.map((f) =>
        readFile(f.path!).then((fc) => ({ name: f.n, path: f.path!, content: fc.isBinary ? null : fc.content })).catch(() => null)
      )
    ).then((results) => {
      if (cancelled) return;
      const out: Record<string, string> = {};
      let total = 0;
      for (const r of results) {
        if (!r || !r.content) continue;
        if (total >= MAX_TOTAL) break;
        const trimmed = r.content.length > MAX_PER_FILE
          ? r.content.slice(0, MAX_PER_FILE) + "\n... (truncated)"
          : r.content;
        if (total + trimmed.length > MAX_TOTAL) break;
        out[r.name] = trimmed;
        total += trimmed.length;
      }
      setSourceContents(out);
    });
    return () => { cancelled = true; };
  }, [realFiles]);

  // Load .coverteda_ai project notes for AI context
  useEffect(() => {
    if (!projectDir || !isTauri) { setAiMdContent(null); return; }
    readFile(`${projectDir}/.coverteda_ai`)
      .then((fc) => {
        if (!fc.isBinary && fc.content) {
          setAiMdContent(fc.content.length > 3000 ? fc.content.slice(0, 3000) + "\n... (truncated)" : fc.content);
        } else {
          setAiMdContent(null);
        }
      })
      .catch(() => setAiMdContent(null));
  }, [projectDir]);

  // Rich AI project context — assembled from all available state
  const aiProjectContext = useMemo(() => {
    if (!project) return undefined;
    const lines: string[] = [];

    // Project basics
    lines.push(`Project: ${project.name}`);
    lines.push(`Backend: ${B.name} (${B.id})`);
    lines.push(`Device: ${project.device}`);
    lines.push(`Top Module: ${project.topModule}`);
    if (project.sourcePatterns?.length) lines.push(`Source patterns: ${project.sourcePatterns.join(", ")}`);
    if (project.constraintFiles?.length) lines.push(`Constraint files: ${project.constraintFiles.join(", ")}`);

    // File tree listing
    if (realFiles && realFiles.length > 0) {
      lines.push(`\nProject files:`);
      for (const f of realFiles) {
        if (f.ty !== "folder") {
          const indent = "  ".repeat(Math.max(0, f.d));
          const synth = f.synth ? " [in synthesis]" : "";
          const git = f.git && f.git !== "clean" ? ` (${f.git})` : "";
          lines.push(`${indent}${f.n}${synth}${git}`);
        }
      }
    }

    // Build status
    lines.push(`\nBuild Status: ${building ? "RUNNING" : bStep >= 0 ? `Completed (stage ${bStep})` : "Not built"}`);
    if (buildFailed) lines.push(`Build: FAILED`);

    // Timing report summary
    if (realTimingReport) {
      const s = realTimingReport.summary;
      lines.push(`\nTiming: WNS=${s.wns}, TNS=${s.tns}, Fmax=${s.fmax}`);
      if (s.failingPaths > 0) lines.push(`  ${s.failingPaths} failing path(s)`);
    }

    // Utilization summary
    if (realUtilReport) {
      lines.push(`\nUtilization:`);
      for (const cat of realUtilReport.summary) {
        for (const item of cat.items) {
          if (item.total > 0) {
            lines.push(`  ${item.r}: ${item.used}/${item.total} (${((item.used / item.total) * 100).toFixed(1)}%)`);
          }
        }
      }
    }

    // DRC summary
    if (realDrcReport && realDrcReport.items.length > 0) {
      lines.push(`\nDRC: ${realDrcReport.summary.errors} errors, ${realDrcReport.summary.critWarns} critical warnings, ${realDrcReport.summary.warnings} warnings`);
      for (const v of realDrcReport.items.slice(0, 5)) {
        lines.push(`  [${v.sev}] ${v.code}: ${v.msg}`);
      }
    }

    // Power summary
    if (realPowerReport) {
      lines.push(`\nPower: Total=${realPowerReport.total}, Confidence=${realPowerReport.confidence}`);
    }

    // Git state
    if (gitState) {
      lines.push(`\nGit: branch=${gitState.branch}, dirty=${gitState.dirty}`);
    }

    // Recent build log errors (last 10 error lines)
    const errLines = logs.filter((l) => l.t === "err").slice(-10);
    if (errLines.length > 0) {
      lines.push(`\nRecent build errors:`);
      for (const e of errLines) lines.push(`  ${e.m}`);
    }

    // Source file contents
    const srcKeys = Object.keys(sourceContents);
    if (srcKeys.length > 0) {
      lines.push(`\nSource file contents:`);
      for (const name of srcKeys) {
        lines.push(`--- ${name} ---`);
        lines.push(sourceContents[name]);
      }
    }

    // .coverteda_ai project notes
    if (aiMdContent) {
      lines.push(`\nProject AI notes (.coverteda_ai):`);
      lines.push(aiMdContent);
    }

    return lines.join("\n");
  }, [project, B, building, bStep, buildFailed, realTimingReport, realUtilReport, realDrcReport, realPowerReport, gitState, logs, realFiles, sourceContents, aiMdContent]);

  // Load backends and config on mount; restore project if page was reloaded
  useEffect(() => {
    perf("mount_effect");
    getRuntimeBackends().then((be) => {
      perf("backends_loaded");
      setBackends(be);
      // Restore project from sessionStorage on reload
      const savedDir = sessionStorage.getItem("coverteda_projectDir");
      if (savedDir && view === "start") {
        openProject(savedDir)
          .then((cfg) => {
            handleOpenProject(savedDir, cfg, be);
          })
          .catch(() => {
            sessionStorage.removeItem("coverteda_projectDir");
          });
      }
    });
    getAppConfig().then((cfg) => {
      perf("config_loaded");
      const tid = cfg.theme as "dark" | "light" | "colorblind";
      if (tid === "dark" || tid === "light" || tid === "colorblind") setThemeId(tid);
      if (cfg.scale_factor >= 0.5 && cfg.scale_factor <= 3.0) setScaleFactor(cfg.scale_factor);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setThemeId, setScaleFactor]);

  // Flush log buffer periodically during builds for performance
  const startLogFlush = useCallback(() => {
    if (flushTimer.current) return;
    flushTimer.current = setInterval(() => {
      if (logsRef.current.length > 0) {
        const batch = logsRef.current.splice(0);
        setLogs((p) => [...p, ...batch]);
      }
    }, 100);
  }, []);

  // Detect tool edition when backend changes
  useEffect(() => {
    if (!bid) return;
    detectToolEdition(bid).then(setToolEdition).catch(() => setToolEdition(null));
  }, [bid]);

  const stopLogFlush = useCallback(() => {
    if (flushTimer.current) {
      clearInterval(flushTimer.current);
      flushTimer.current = null;
    }
    // Final flush
    if (logsRef.current.length > 0) {
      const batch = logsRef.current.splice(0);
      setLogs((p) => [...p, ...batch]);
    }
  }, []);

  const handleOpenProject = useCallback((dir: string, config: ProjectConfig, backendsOverride?: RuntimeBackend[]) => {
    perf("project_open");
    const resolvedBackends = backendsOverride ?? backends;
    sessionStorage.setItem("coverteda_projectDir", dir);
    setProjectDir(dir);
    setProject(config);
    const backendId = config.backendId;
    const matchingBackend = resolvedBackends.find((b) => b.id === backendId);
    if (matchingBackend) setBid(backendId);
    setBStep(-1);
    setLogs([]);
    setBuilding(false);
    setBuildDone(false);
    setSec("build");
    setViewingFile(null);
    setRealTimingReport(null);
    setRealUtilReport(null);
    setActiveStage(null);
    setGitState(null);
    setView("ide");

    // Initialize build stages/options from project config
    setBuildStages(config.buildStages ?? []);
    setBuildOptions(config.buildOptions ?? {});
    setBuildSaveStatus("saved");

    // Load HEAD config for diff comparison
    getProjectConfigAtHead(dir).then(setHeadConfig).catch(() => setHeadConfig(null));

    if (isTauri) {
      // Load git status + log
      Promise.all([
        getGitStatus(dir),
        gitLog(dir, 20).catch(() => [] as GitLogEntry[]),
      ])
        .then(([r, log]) => { perf("git_status_loaded"); setGitState(mapGitStatus(r, log)); })
        .catch(() => setGitState(null));

      // Load real file tree
      getFileTreeMapped(dir).then((files) => {
        perf("file_tree_loaded");
        setRealFiles(files);
        // If report files exist, a previous build was done — load reports
        const implDir = config.implDir || "impl1";
        const hasImpl = files.some((f) =>
          f.path?.includes(implDir) &&
          (f.n.endsWith(".twr") || f.n.endsWith(".mrp") || f.n.endsWith(".bit") || f.n.endsWith(".jed"))
        );
        // Also detect OSS builds (build/ directory with any build artifacts or logs)
        const hasOssBuild = files.some((f) =>
          f.path?.includes("/build/") &&
          (f.n === "report.json" || f.n.endsWith(".bit") || f.n.endsWith(".bin")
           || f.n === "out.config" || f.n === "synth.log" || f.n === "pnr.log"
           || f.n === "out.json" || f.n === "bitstream.log")
        );
        if (hasImpl || hasOssBuild) {
          setBuildDone(true);
          setBStep(4); // Mark all stages done
          const bName = matchingBackend?.name ?? "Radiant";
          console.log("[Reports] Loading existing reports for", backendId, dir);
          // Use auto-detection to bypass backend ID issues
          autoLoadReports(dir, bName).then((reports) => {
            perf("reports_loaded");
            if (reports.timing) setRealTimingReport(reports.timing);
            if (reports.utilization) setRealUtilReport(reports.utilization);
            if (reports.power) setRealPowerReport(reports.power);
            if (reports.drc) setRealDrcReport(reports.drc);
            perfSummary();
          }).catch((e) => console.warn("[Reports] auto-load failed:", e));
          getIoReport(backendId, dir)
            .then((r) => { if (r) setRealIoReport(mapIoReport(r)); })
            .catch((e) => console.warn("[Reports] io load:", e));
          // Check if sources are newer than build outputs
          checkSourcesStale(dir).then(setSourcesStale).catch(() => {});
        } else {
          perfSummary();
        }
      }).catch((err) => {
        console.error("File tree scan failed:", err);
        setRealFiles(null);
      });

      // Load previous build log
      readBuildLog(dir).then((logText) => {
        if (logText) {
          const lines: LogEntry[] = logText.split("\n")
            .filter((l) => l.length > 0)
            .map((l) => ({ t: "out" as const, m: l }));
          if (lines.length > 0) setLogs(lines);
        }
      }).catch(() => {});
    } else {
      // Browser dev mode: show mock file tree matching the test project
      perf("file_tree_loaded");
      setRealFiles([
        { n: "source", d: 0, ty: "folder", open: true },
        { n: "count_attr.v", d: 1, ty: "rtl", saved: true, git: "clean", synth: true, lines: 42, lang: "Verilog" },
        { n: "impl1.pdc", d: 1, ty: "constr", saved: true, git: "clean", synth: true, lang: "PDC" },
        { n: "impl1.sdc", d: 1, ty: "constr", saved: true, git: "clean", synth: true, lang: "SDC" },
        { n: "8_bit_counter.rdf", d: 0, ty: "config", saved: true, git: "clean" },
        { n: "counter1.sty", d: 0, ty: "config", saved: true, git: "clean" },
        { n: "build.tcl", d: 0, ty: "config", saved: true, git: "clean" },
      ]);
      perfSummary();
    }
  }, [backends]);

  const handleCloseProject = useCallback(() => {
    sessionStorage.removeItem("coverteda_projectDir");
    setView("start");
    setProject(null);
    setProjectDir("");
    setCmdOpen(false);
    setRealFiles(null);
    setViewingFile(null);
    setRealTimingReport(null);
    setRealUtilReport(null);
    setRealPowerReport(null);
    setRealDrcReport(null);
    setRealIoReport(null);
    setBuildDone(false);
    setActiveStage(null);
  }, []);

  const buildCleanup = useRef<(() => void) | null>(null);
  const commitCancelled = useRef(false);

  // Mock build simulation for browser dev mode
  const runMockBuild = useCallback((backend: RuntimeBackend) => {
    const stages = backend.pipeline;
    const mockStartTime = Date.now();
    const stageLines: LogEntry[][] = [
      // Synthesis
      [
        { t: "warn", m: `\u2550\u2550\u2550 SIMULATION MODE \u2550\u2550\u2550 No Tauri backend detected` },
        { t: "cmd", m: `radiantc .coverteda_build.tcl` },
        { t: "info", m: `CovertEDA \u2192 ${backend.name} ${backend.version || "2025.2"}` },
        { t: "cmd", m: "prj_run_synthesis" },
        { t: "out", m: "LSE: reading sources..." },
        { t: "out", m: "  count_attr.v" },
        { t: "out", m: "LSE: synthesizing design 'count'..." },
        { t: "out", m: "Checksum -- syn: 0x5A3B" },
        { t: "out", m: "Total CPU Time: 4 secs" },
        { t: "ok", m: "Synthesis complete: 0 errors, 0 warnings" },
      ],
      // Map
      [
        { t: "cmd", m: "prj_run_map" },
        { t: "out", m: "Map: Loading design..." },
        { t: "out", m: "Map: Processing constraints..." },
        { t: "out", m: "  Device: LIFCL-40-7BG400I" },
        { t: "out", m: "Checksum -- map: 0x7C2D" },
        { t: "out", m: "Total CPU Time: 8 secs" },
        { t: "ok", m: "Map complete: 0 errors, 0 warnings" },
      ],
      // PAR
      [
        { t: "cmd", m: "prj_run_par" },
        { t: "out", m: "PAR: Loading mapped design..." },
        { t: "out", m: "PAR: Running placement..." },
        { t: "out", m: "PAR: Running routing..." },
        { t: "out", m: "  LUT4:  48/39600  (0.1%)" },
        { t: "out", m: "  REG:   8/39744   (0.0%)" },
        { t: "out", m: "  I/O:   10/220    (4.5%)" },
        { t: "out", m: "par done!" },
        { t: "out", m: "PAR_SUMMARY::Run status = Completed" },
        { t: "out", m: "Total CPU Time: 52 secs" },
        { t: "ok", m: "Place & Route complete" },
      ],
      // Bitstream
      [
        { t: "cmd", m: "prj_run_bitstream" },
        { t: "out", m: "Bitstream: Generating bitstream..." },
        { t: "out", m: "  8_bit_counter_impl1.bit (811,204 bytes)" },
        { t: "out", m: "Bitstream generation complete" },
        { t: "out", m: "Total CPU Time: 6 secs" },
        { t: "ok", m: "Bitstream generated successfully" },
      ],
    ];

    let stageIdx = 0;
    const advanceStage = () => {
      if (stageIdx >= stages.length) {
        // Build complete
        const elapsed = Math.round((Date.now() - mockStartTime) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        setBuilding(false);
        setBuildDone(true);
        setBuildElapsedSec(elapsed);
        setLogs((p) => [...p, { t: "ok", m: `\u2550\u2550\u2550 BUILD COMPLETE \u2550\u2550\u2550 ${mins}m ${secs}s` }]);
        // Set mock reports
        setRealTimingReport({
          title: "Timing Report",
          generated: new Date().toISOString(),
          tool: backend.name,
          summary: {
            status: "UNCONSTRAINED",
            fmax: "Unconstrained",
            target: "None",
            margin: "N/A",
            wns: "0.000 ns",
            tns: "0.000 ns",
            whs: "0.000 ns",
            ths: "0.000 ns",
            failingPaths: 0,
            totalPaths: 0,
            clocks: 0,
          },
          clocks: [],
          criticalPaths: [],
          holdPaths: [],
          unconstrained: [],
        });
        setRealUtilReport({
          title: "Utilization Report",
          generated: new Date().toISOString(),
          device: "LIFCL-40-7BG400I",
          summary: [
            { cat: "Logic", items: [
              { r: "LUT4", used: 48, total: 39600, detail: "0.1%" },
              { r: "Registers (FF)", used: 8, total: 39744, detail: "0.0%" },
            ]},
            { cat: "I/O", items: [
              { r: "User I/O Pins", used: 10, total: 220, detail: "4.5%" },
            ]},
            { cat: "Memory", items: [
              { r: "EBR", used: 0, total: 104, detail: "0.0%" },
            ]},
          ],
          byModule: [
            { module: "count", lut: 48, ff: 8, ebr: 0, pct: "100.0%" },
          ],
        });
        setRealDrcReport({
          title: "Design Rule Checks",
          generated: new Date().toISOString(),
          summary: { errors: 0, critWarns: 0, warnings: 2, info: 1, waived: 0 },
          items: [
            { sev: "warning", code: "YOSYS-W", msg: "Module has unconnected port", loc: "yosys", action: "Review warning" },
            { sev: "warning", code: "NEXTPNR-W", msg: "No timing constraints defined", loc: "nextpnr", action: "Review warning" },
            { sev: "info", code: "NEXTPNR-I", msg: "All cells placed successfully", loc: "nextpnr", action: "Review" },
          ],
        });
        setRealPowerReport({
          title: "Power Estimation",
          generated: new Date().toISOString(),
          junction: "25.0\u00B0C",
          ambient: "25.0\u00B0C",
          theta_ja: "0.0\u00B0C/W",
          total: "50.5 mW",
          confidence: "Estimate",
          breakdown: [
            { cat: "Static", mw: 50, pct: 99, color: "#f59e0b" },
            { cat: "Logic (LUTs)", mw: 0.48, pct: 0.95, color: "#ef4444" },
            { cat: "Registers (FFs)", mw: 0.04, pct: 0.08, color: "#3b82f6" },
          ],
          byRail: [
            { rail: "VCCIO", mw: 15.2 },
            { rail: "VCCINT", mw: 35.3 },
          ],
        });
        // Set mock file tree for build artifacts
        setRealFiles([
          { n: "source", d: 0, ty: "folder", open: true },
          { n: "count_attr.v", d: 1, ty: "rtl", saved: true, git: "clean", synth: true, lines: 42, lang: "Verilog", path: "/mnt/c/Users/tcove/projects/test_radiant_counter/source/count_attr.v" },
          { n: "impl1", d: 0, ty: "folder", open: true },
          { n: "8_bit_counter_impl1.bit", d: 1, ty: "output", saved: true, git: "clean", synth: false, path: "/mnt/c/Users/tcove/projects/test_radiant_counter/impl1/8_bit_counter_impl1.bit" },
          { n: "8_bit_counter_impl1.twr", d: 1, ty: "output", saved: true, git: "clean", synth: false, path: "/mnt/c/Users/tcove/projects/test_radiant_counter/impl1/8_bit_counter_impl1.twr" },
          { n: "8_bit_counter_impl1.mrp", d: 1, ty: "output", saved: true, git: "clean", synth: false, path: "/mnt/c/Users/tcove/projects/test_radiant_counter/impl1/8_bit_counter_impl1.mrp" },
          { n: "8_bit_counter_impl1.par", d: 1, ty: "output", saved: true, git: "clean", synth: false, path: "/mnt/c/Users/tcove/projects/test_radiant_counter/impl1/8_bit_counter_impl1.par" },
          { n: "synlog.srp", d: 1, ty: "output", saved: true, git: "clean", synth: false, path: "/mnt/c/Users/tcove/projects/test_radiant_counter/impl1/synlog.srp" },
        ]);
        return;
      }

      const lines = stageLines[stageIdx] ?? [{ t: "out" as const, m: `Running ${stages[stageIdx]?.label ?? "stage"}...` }];
      let lineIdx = 0;
      const lineInterval = setInterval(() => {
        if (lineIdx < lines.length) {
          setLogs((p) => [...p, lines[lineIdx]]);
          lineIdx++;
        } else {
          clearInterval(lineInterval);
          setActiveStage(stageIdx);
          setBStep(stageIdx + 1);
          stageIdx++;
          setTimeout(advanceStage, 400);
        }
      }, 150);
    };

    setTimeout(advanceStage, 300);
  }, []);

  // Load all reports from disk using auto-detection (no backend ID needed)
  const loadReportsFromDisk = useCallback((dir: string, backendName: string) => {
    if (!dir) return;
    autoLoadReports(dir, backendName).then((reports) => {
      if (reports.timing) setRealTimingReport(reports.timing);
      if (reports.utilization) setRealUtilReport(reports.utilization);
      if (reports.power) setRealPowerReport(reports.power);
      if (reports.drc) setRealDrcReport(reports.drc);
    }).catch((e) => console.warn("[Reports] auto-load failed:", e));
    // I/O report still needs backend-specific parsing
    getIoReport(bid, dir)
      .then((r) => { if (r) setRealIoReport(mapIoReport(r)); })
      .catch(() => {});
  }, [bid]);

  const doRunBuild = useCallback(async () => {
    // Clean up any stale listeners from previous builds
    if (buildCleanup.current) {
      buildCleanup.current();
      buildCleanup.current = null;
    }

    setBuilding(true);
    buildStartTime.current = Date.now();
    setBuildElapsedSec(null);
    setBStep(0);
    setLogs([]);
    logsRef.current = [];
    setSec("build");
    setBuildDone(false);
    setBuildFailed(false);
    setActiveStage(null);
    setSourcesStale(false);

    if (!isTauri || !projectDir) {
      // Simulate build in browser dev mode
      runMockBuild(B);
      return;
    }

    startLogFlush();

    // Set up event listeners BEFORE starting the build to avoid race condition
    const unlistenStdout = await listen<{ buildId: string; line: string }>(
      "build:stdout",
      (data) => {
        logsRef.current.push({ t: "out" as const, m: data.line });
      }
    );

    const unlistenStage = await listen<{ build_id: string; stage_idx: number; status: string; message: string }>(
      "build:stage_complete",
      (data) => {
        const result = data.status === "failed" ? "failed" as const : "success" as const;
        setStageResults((prev) => ({ ...prev, [data.stage_idx]: result }));
        if (result === "success") {
          setBStep(data.stage_idx + 1);
          // Reload reports after each successful stage so tabs update incrementally
          loadReportsFromDisk(projectDir, B.name);
        }
        setActiveStage(data.stage_idx);
      }
    );

    const unlistenFinished = await listen<{ build_id: string; stage_idx: number; status: string; message: string }>(
      "build:finished",
      (data) => {
        // Clean up all listeners now that build is done
        if (buildCleanup.current) {
          buildCleanup.current();
          buildCleanup.current = null;
        }
        stopLogFlush();
        setBuilding(false);
        setLogs((p) => [
          ...p,
          {
            t: (data.status === "success" ? "ok" : "err") as LogEntry["t"],
            m: data.message,
          },
        ]);
        // Save build record to history
        const record: BuildRecord = {
          id: `b-${Date.now()}`,
          timestamp: new Date().toISOString(),
          duration: buildStartTime.current > 0 ? Math.round((Date.now() - buildStartTime.current) / 1000) : 0,
          status: data.status as "success" | "failed" | "cancelled",
          backend: B.short,
          device: project?.device ?? B.defaultDev,
          stages: B.pipeline.map((s) => s.id),
          warnings: 0,
          errors: data.status === "success" ? 0 : 1,
          commitHash: gitState?.commit?.slice(0, 7),
          commitMsg: gitState?.commitMsg,
        };

        const elapsed = buildStartTime.current > 0 ? Math.round((Date.now() - buildStartTime.current) / 1000) : null;
        setBuildElapsedSec(elapsed);
        if (data.status === "success") {
          setBuildDone(true);
        } else {
          setBuildFailed(true);
        }
        getFileTreeMapped(projectDir).then(setRealFiles).catch(() => {});
        // Load reports using auto-detection (bypasses backend ID issues)
        loadReportsFromDisk(projectDir, B.name);
        // Also save build record with report enrichment
        autoLoadReports(projectDir, B.name).then((reports) => {
          const enriched: BuildRecord = { ...record };
          if (reports.timing) {
            const fmax = parseFloat(reports.timing.summary.fmax);
            if (!isNaN(fmax)) enriched.fmaxMhz = fmax;
          }
          if (reports.utilization) {
            for (const cat of reports.utilization.summary) {
              for (const item of cat.items) {
                if (item.r.toUpperCase().includes("LUT") || item.r.toUpperCase().includes("SLICE")) {
                  enriched.lutUsed = item.used;
                  enriched.lutTotal = item.total;
                }
                if (item.r.toUpperCase().includes("FF") || item.r.toUpperCase().includes("REGISTER")) {
                  enriched.ffUsed = item.used;
                  enriched.ffTotal = item.total;
                }
              }
            }
          }
          if (projectDir) saveBuildRecord(projectDir, enriched).catch(() => {});
        }).catch(() => { if (projectDir) saveBuildRecord(projectDir, record).catch(() => {}); });
        // Refresh git status + log (build may have created new files)
        if (projectDir) {
          Promise.all([
            getGitStatus(projectDir),
            gitLog(projectDir, 20).catch(() => [] as GitLogEntry[]),
          ])
            .then(([r, log]) => setGitState(mapGitStatus(r, log)))
            .catch(() => {});
        }
      }
    );

    buildCleanup.current = () => {
      unlistenStdout();
      unlistenStage();
      unlistenFinished();
    };

    // NOW start the build — listeners are already active
    try {
      const newBuildId = await tauriStartBuild(bid, projectDir, buildStages, buildOptions);
      setBuildId(newBuildId);
      console.log("Build started:", newBuildId);
    } catch (err) {
      // Clean up listeners on error
      stopLogFlush();
      if (buildCleanup.current) {
        buildCleanup.current();
        buildCleanup.current = null;
      }
      setBuilding(false);
      setLogs((p) => [...p, { t: "err" as const, m: `Build error: ${err}` }]);
    }
  }, [B, bid, projectDir, buildStages, buildOptions, startLogFlush, stopLogFlush, runMockBuild]);

  const handleCommitAndBuild = useCallback(async () => {
    if (!projectDir || !project) { setCommitModal(null); doRunBuild(); return; }
    commitCancelled.current = false;
    setCommitModal("committing");
    setCommitting(true);
    const msg = `Pre-build: ${project.name} ${new Date().toISOString().split("T")[0]}`;
    try {
      const hash = await gitCommit(projectDir, msg);
      if (commitCancelled.current) { setCommitting(false); return; }
      setLogs((p) => [...p, { t: "info" as const, m: `Committed ${hash}: ${msg}` }]);
      // Refresh git status/log and HEAD config in parallel (don't block build start)
      Promise.all([
        Promise.all([
          getGitStatus(projectDir),
          gitLog(projectDir, 20).catch(() => [] as GitLogEntry[]),
        ]).then(([r, log]) => setGitState(mapGitStatus(r, log))).catch(() => {}),
        getProjectConfigAtHead(projectDir).then(setHeadConfig).catch(() => {}),
      ]);
    } catch (err) {
      if (commitCancelled.current) { setCommitting(false); return; }
      setLogs((p) => [...p, { t: "warn" as const, m: `Git commit failed: ${err}` }]);
    } finally {
      setCommitting(false);
    }
    if (commitCancelled.current) return;
    setCommitModal(null);
    doRunBuild();
  }, [projectDir, project, doRunBuild]);

  const handleCancelCommitAndBuild = useCallback(() => {
    commitCancelled.current = true;
    setCommitModal(null);
    setCommitting(false);
  }, []);

  const handleBuildWithoutCommit = useCallback(() => {
    setCommitModal(null);
    doRunBuild();
  }, [doRunBuild]);

  const runBuild = useCallback(() => {
    // Use cached gitState.dirty instead of IPC round-trip for instant response
    if (gitState?.dirty) {
      setCommitModal("prompt");
    } else {
      doRunBuild();
    }
  }, [gitState, doRunBuild]);

  const runClean = useCallback(async () => {
    if (!isTauri || !projectDir) return;
    setCleaning(true);
    setLogs([{ t: "info", m: "Cleaning build artifacts..." }]);
    setSec("build");
    setBuildDone(false);
    setBStep(-1);
    setRealTimingReport(null);
    setRealUtilReport(null);
    setRealPowerReport(null);
    setRealDrcReport(null);
    setRealIoReport(null);
    setSourcesStale(false);
    try {
      const removed = await cleanBuild(projectDir);
      setLogs((p) => [...p, { t: "ok", m: `Cleaned ${removed} artifact(s)` }]);
      getFileTreeMapped(projectDir).then(setRealFiles).catch(() => {});
    } catch (err) {
      setLogs((p) => [...p, { t: "warn", m: `Clean: ${err}` }]);
    } finally {
      setCleaning(false);
    }
  }, [projectDir]);

  const runCancel = useCallback(async () => {
    if (!building) return;
    try {
      await cancelBuild(buildId ?? "");
      setLogs((p) => [...p, { t: "warn" as const, m: "Build cancelled by user" }]);
    } catch (err) {
      setLogs((p) => [...p, { t: "err" as const, m: `Cancel error: ${err}` }]);
    }
  }, [building, buildId]);

  const refreshAll = useCallback(() => {
    if (!projectDir) return;
    getFileTreeMapped(projectDir).then(setRealFiles).catch(() => {});
    Promise.all([
      getGitStatus(projectDir),
      gitLog(projectDir, 20).catch(() => [] as GitLogEntry[]),
    ])
      .then(([r, log]) => setGitState(mapGitStatus(r, log)))
      .catch(() => setGitState(null));
  }, [projectDir]);

  const handleGitCommit = useCallback(async () => {
    if (!projectDir || !project) return;
    const msg = window.prompt("Commit message:", `${project.name}: ${new Date().toISOString().split("T")[0]}`);
    if (!msg) return;
    setCommitting(true);
    try {
      const hash = await gitCommit(projectDir, msg);
      setLogs((p) => [...p, { t: "ok" as const, m: `Committed ${hash}: ${msg}` }]);
      // Refresh git status/log, HEAD config, and file tree in parallel
      Promise.all([
        Promise.all([
          getGitStatus(projectDir),
          gitLog(projectDir, 20).catch(() => [] as GitLogEntry[]),
        ]).then(([r, log]) => setGitState(mapGitStatus(r, log))).catch(() => {}),
        getProjectConfigAtHead(projectDir).then(setHeadConfig).catch(() => {}),
        getFileTreeMapped(projectDir).then(setRealFiles).catch(() => {}),
      ]);
    } catch (err) {
      setLogs((p) => [...p, { t: "err" as const, m: `Commit failed: ${err}` }]);
    } finally {
      setCommitting(false);
    }
  }, [projectDir, project]);

  const handleToggleSynth = useCallback((file: ProjectFile) => {
    setRealFiles((prev) => {
      if (!prev) return prev;
      return prev.map((f) =>
        f.n === file.n && f.d === file.d && f.path === file.path
          ? { ...f, synth: !f.synth }
          : f
      );
    });
  }, []);

  const handleFileClick = useCallback((name: string, path?: string) => {
    setAFile(name);
    if (path && isTauri) {
      readFile(path).then(setViewingFile).catch(() => setViewingFile(null));
    } else {
      setViewingFile(null);
    }
  }, []);

  const navClick = useCallback((s: Section) => {
    setVisitedSecs((prev) => {
      if (prev.has(s)) return prev;
      const next = new Set(prev);
      next.add(s);
      return next;
    });
    setSec((prev) => {
      navHistory.current.push(prev);
      return s;
    });
    setViewingFile(null);
  }, []);

  // Auto-load reports when Reports tab is first visited
  useEffect(() => {
    if (sec === "reports" && projectDir) {
      if (!realTimingReport || !realUtilReport || !realPowerReport || !realDrcReport) {
        loadReportsFromDisk(projectDir, B.name);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sec]);

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (view === "ide") setCmdOpen((p) => !p);
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        setScaleFactor(Math.min(3.0, scaleFactor + 0.1));
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "-") {
        e.preventDefault();
        setScaleFactor(Math.max(0.5, scaleFactor - 0.1));
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "0") {
        e.preventDefault();
        setScaleFactor(1.2);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "b" && !e.shiftKey) {
        e.preventDefault();
        if (view === "ide" && !building) runBuild();
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "?" || (e.shiftKey && e.key === "/"))) {
        e.preventDefault();
        setShortcutsOpen((p) => !p);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "P") {
        e.preventDefault();
        setPerfOverlay((p) => !p);
      }
      if (e.key === "Escape") {
        setCmdOpen(false);
        setShortcutsOpen(false);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [view, scaleFactor, building, runBuild, setScaleFactor]);

  // Mouse back button navigation
  useEffect(() => {
    const handleMouseBack = (e: MouseEvent) => {
      if (e.button === 3) { // Mouse back button
        e.preventDefault();
        if (navHistory.current.length > 0) {
          const prev = navHistory.current.pop()!;
          setSec(prev);
          setViewingFile(null);
        }
      }
    };
    window.addEventListener("mousedown", handleMouseBack);
    return () => window.removeEventListener("mousedown", handleMouseBack);
  }, []);

  // ── Auto-save build stages & options (debounced 1s) ──
  useEffect(() => {
    if (!project || !projectDir) return;
    // Skip if nothing has actually changed from the loaded config
    const configStages = project.buildStages ?? [];
    const configOptions = project.buildOptions ?? {};
    const stagesSame = JSON.stringify(buildStages) === JSON.stringify(configStages);
    const optionsSame = JSON.stringify(buildOptions) === JSON.stringify(configOptions);
    if (stagesSame && optionsSame) {
      setBuildSaveStatus("saved");
      return;
    }
    setBuildSaveStatus("unsaved");
    if (buildSaveTimer.current) clearTimeout(buildSaveTimer.current);
    buildSaveTimer.current = setTimeout(() => {
      const updated = { ...project, buildStages, buildOptions };
      setBuildSaveStatus("saving");
      saveProject(projectDir, updated)
        .then(() => {
          setProject(updated);
          setBuildSaveStatus("saved");
        })
        .catch(() => setBuildSaveStatus("unsaved"));
    }, 1000);
    return () => {
      if (buildSaveTimer.current) clearTimeout(buildSaveTimer.current);
    };
  }, [buildStages, buildOptions, project, projectDir]);

  // ── Compute what changed from last git commit ──
  const changedFromCommit = useMemo(() => {
    if (!project || !headConfig) return [];
    const changes: string[] = [];
    if (project.device !== headConfig.device) changes.push("device");
    if (project.topModule !== headConfig.topModule) changes.push("topModule");
    if (JSON.stringify(project.buildStages ?? []) !== JSON.stringify(headConfig.buildStages ?? []))
      changes.push("stages");
    if (JSON.stringify(project.buildOptions ?? {}) !== JSON.stringify(headConfig.buildOptions ?? {}))
      changes.push("options");
    if (JSON.stringify(project.sourcePatterns) !== JSON.stringify(headConfig.sourcePatterns))
      changes.push("sources");
    if (JSON.stringify(project.constraintFiles) !== JSON.stringify(headConfig.constraintFiles))
      changes.push("constraints");
    if (project.implDir !== headConfig.implDir) changes.push("implDir");
    if (project.backendId !== headConfig.backendId) changes.push("backend");
    return changes;
  }, [project, headConfig]);

  // Load license info when license section opens
  useEffect(() => {
    if (sec === "license" && !licenseResult && !licenseLoading) {
      setLicenseLoading(true);
      checkLicenses()
        .then(setLicenseResult)
        .finally(() => setLicenseLoading(false));
    }
  }, [sec, licenseResult, licenseLoading]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (buildCleanup.current) buildCleanup.current();
      if (buildSaveTimer.current) clearTimeout(buildSaveTimer.current);
      stopLogFlush();
    };
  }, [stopLogFlush]);

  // ── Start Screen ──
  if (view === "start") {
    return (
      <>
        <StartScreen onOpenProject={handleOpenProject} onOpenSettings={() => setSettingsOpen(true)} />
        <Suspense fallback={null}>
          {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
        </Suspense>
        <PerfOverlay visible={perfOverlay} />
      </>
    );
  }

  // ── IDE ──
  const panelP: React.CSSProperties = {
    background: C.s1,
    borderRadius: 7,
    border: `1px solid ${C.b1}`,
    overflow: "hidden",
    padding: 14,
  };

  const commands = [
    // Build
    { label: "Build All", category: "Build", desc: `Run full ${B.short} flow`, action: runBuild },
    { label: "Build Selected Stages", category: "Build", desc: "Run only checked stages", action: runBuild },
    { label: "Clean", category: "Build", desc: "Delete build artifacts", action: runClean },
    // View / Navigation
    { label: "Build Pipeline", category: "View", desc: "Stage selector and options", action: () => navClick("build") },
    { label: "Reports", category: "View", desc: "Timing, Utilization, Power, DRC, I/O", action: () => navClick("reports") },
    { label: "Timing Report", category: "View", desc: "Fmax, WNS, critical paths", action: () => { navClick("reports"); setRptTab("timing"); } },
    { label: "Utilization Report", category: "View", desc: "LUT, FF, BRAM usage", action: () => { navClick("reports"); setRptTab("util"); } },
    { label: "Synthesis Log", category: "View", desc: "Raw synthesis report", action: () => { navClick("reports"); setRptTab("synth"); } },
    { label: "Map Report", category: "View", desc: "Technology mapping log", action: () => { navClick("reports"); setRptTab("map"); } },
    { label: "PAR Report", category: "View", desc: "Place & Route log", action: () => { navClick("reports"); setRptTab("par"); } },
    { label: "Report Files", category: "View", desc: "Browse generated report files", action: () => { navClick("reports"); setRptTab("files"); } },
    { label: "IP Catalog", category: "View", desc: "Browse and configure IP cores", action: () => navClick("ip") },
    { label: "Console", category: "View", desc: "Build output log", action: () => navClick("console") },
    { label: "Constraints", category: "View", desc: "Pin assignments", action: () => navClick("constraints") },
    { label: "Build History", category: "View", desc: "Previous builds, trends, Fmax tracking", action: () => navClick("history") },
    { label: "License Status", category: "View", desc: "FlexLM license info", action: () => navClick("license") },
    { label: "AI Assistant", category: "View", desc: "FPGA design help", action: () => navClick("ai") },
    { label: "Git", category: "View", desc: "Branches, tags, commit log, push/pull", action: () => navClick("git") },
    { label: "SSH Build Server", category: "View", desc: "Configure remote build server", action: () => navClick("ssh") },
    // Zoom
    { label: "Zoom In", category: "Zoom", desc: `Current: ${Math.round(scaleFactor * 100)}%`, action: () => {
      const next = Math.min(3.0, scaleFactor + 0.1);
      setScaleFactor(next);
    }},
    { label: "Zoom Out", category: "Zoom", desc: `Current: ${Math.round(scaleFactor * 100)}%`, action: () => {
      const next = Math.max(0.5, scaleFactor - 0.1);
      setScaleFactor(next);
    }},
    { label: "Reset Zoom (120%)", category: "Zoom", action: () => setScaleFactor(1.2) },
    { label: "Zoom 100%", category: "Zoom", action: () => setScaleFactor(1.0) },
    { label: "Zoom 150%", category: "Zoom", action: () => setScaleFactor(1.5) },
    { label: "Zoom 200%", category: "Zoom", action: () => setScaleFactor(2.0) },
    // Project
    { label: "Settings", category: "Project", desc: "Tool paths, theme, zoom", action: () => setSettingsOpen(true) },
    { label: "Toggle File Tree", category: "Project", desc: showFiles ? "Hide files" : "Show files", action: () => setShowFiles((p) => !p) },
    { label: "Keyboard Shortcuts", category: "Project", desc: "Show all shortcuts (Ctrl+?)", action: () => setShortcutsOpen(true) },
    { label: "Stats for Nerds", category: "Project", desc: "FPS, memory, DOM nodes (Ctrl+Shift+P)", action: () => setPerfOverlay((p) => !p) },
    { label: "Close Project", category: "Project", desc: "Return to start screen", action: handleCloseProject },
  ];

  const emptyFiles: ProjectFile[] = [];

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: C.bg,
        color: C.t2,
        fontFamily: SANS,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Git Status Bar */}
      <GitStatusBar
        git={gitState}
        projectName={project?.name}
        projectDir={projectDir}
        gitExpanded={gitExpanded}
        setGitExpanded={setGitExpanded}
        onRefresh={refreshAll}
        onCommit={handleGitCommit}
        committing={committing}
        onInit={projectDir ? async () => {
          try {
            const { gitInit } = await import("./hooks/useTauri");
            await gitInit(projectDir);
            refreshAll();
          } catch (err) {
            console.error("Git init failed:", err);
          }
        } : undefined}
      />

      {/* Command Palette */}
      <Suspense fallback={null}>
        <CommandPalette
          open={cmdOpen}
          onClose={() => setCmdOpen(false)}
          commands={commands}
        />
      </Suspense>

      {/* Settings Panel */}
      <Suspense fallback={null}>
        {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      </Suspense>

      {/* Keyboard Shortcuts */}
      <Suspense fallback={null}>
        {shortcutsOpen && <KeyboardShortcuts onClose={() => setShortcutsOpen(false)} />}
      </Suspense>

      {/* Pre-Build Commit Modal */}
      {(commitModal === "prompt" || commitModal === "committing") && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1001,
            fontFamily: SANS,
          }}
          onClick={() => { if (commitModal === "prompt") setCommitModal(null); }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: C.s1,
              border: `1px solid ${C.b1}`,
              borderRadius: 10,
              width: 400,
              padding: "20px 24px",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: C.t1, marginBottom: 8 }}>
              {commitModal === "committing" ? "Committing\u2026" : "Uncommitted Changes"}
            </div>
            <div style={{ fontSize: 9, fontFamily: MONO, color: C.t2, marginBottom: 16, lineHeight: 1.5 }}>
              {commitModal === "committing"
                ? "Staging files and creating commit. This may take a moment for large repositories."
                : "You have uncommitted changes. Committing before building lets you link each build to a specific source state and easily return to it later."}
            </div>
            {commitModal === "committing" && (
              <div style={{
                height: 3, borderRadius: 2, background: C.bg, marginBottom: 16, overflow: "hidden",
              }}>
                <div style={{
                  height: "100%", borderRadius: 2, background: C.accent,
                  animation: "commitProgress 1.5s ease-in-out infinite",
                }} />
                <style>{`@keyframes commitProgress { 0% { width: 0%; margin-left: 0%; } 50% { width: 60%; margin-left: 20%; } 100% { width: 0%; margin-left: 100%; } }`}</style>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              {commitModal === "committing" ? (
                <Btn small onClick={handleCancelCommitAndBuild}>Cancel</Btn>
              ) : (
                <>
                  <Btn small onClick={() => setCommitModal(null)}>Cancel</Btn>
                  <Btn small onClick={handleBuildWithoutCommit}>Build Without Committing</Btn>
                  <Btn small primary onClick={handleCommitAndBuild}>Commit & Build</Btn>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* ══════ LEFT NAV ══════ */}
        <div
          style={{
            width: 50,
            flexShrink: 0,
            background: C.s1,
            borderRight: `1px solid ${C.b1}`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: 6,
            gap: 2,
          }}
        >
          <div
            style={{
              padding: "6px 0 8px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1,
              borderBottom: `1px solid ${C.b1}`,
              marginBottom: 4,
              width: "100%",
            }}
          >
            <span style={{ color: C.accent }}>
              <Chip />
            </span>
            <span
              style={{
                fontSize: 6,
                fontFamily: MONO,
                fontWeight: 700,
                color: B.color,
                letterSpacing: 0.3,
              }}
            >
              {B.short.toUpperCase()}
            </span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", alignItems: "center", gap: 1, minHeight: 0 }}>
            <NavBtn icon={<Zap />} label="Build" active={sec === "build"} onClick={() => navClick("build")} badge={building} tooltip="Build pipeline — run synthesis, map, place & route, bitstream" />
            <NavBtn icon={<Pin />} label="Constr" active={sec === "constraints"} onClick={() => navClick("constraints")} tooltip="Constraint Editor — pin assignments and timing constraints" />
            <NavBtn icon={<Doc />} label="Reports" active={sec === "reports"} onClick={() => navClick("reports")} accent={C.cyan} tooltip="Reports — timing, utilization, power, DRC, I/O analysis" />
            <NavBtn icon={<Term />} label="Log" active={sec === "console"} onClick={() => navClick("console")} tooltip="Console — build output log with search" />
            <NavBtn icon={<Clock />} label="History" active={sec === "history"} onClick={() => navClick("history")} accent={C.orange} tooltip="Build history — track Fmax trends and past builds" />
            <NavBtn icon={<Box />} label="IP" active={sec === "ip"} onClick={() => navClick("ip")} accent={C.purple} tooltip="IP Catalog — browse, configure, and generate IP cores" />
            <NavBtn icon={<Brain />} label="AI" active={sec === "ai"} onClick={() => navClick("ai")} accent={C.pink} tooltip="AI Assistant — get FPGA design help and code analysis" />
            <NavBtn icon={<Git />} label="Git" active={sec === "git"} onClick={() => navClick("git")} accent={C.ok} tooltip="Git — branches, tags, commit log, push/pull" badge={gitState?.behind ? true : undefined} />
            <NavBtn icon={<Server />} label="SSH" active={sec === "ssh"} onClick={() => navClick("ssh")} accent={C.cyan} tooltip="SSH Build Server — run builds on remote machines" />
            <NavBtn icon={<Download />} label="Prog" active={sec === "programmer"} onClick={() => navClick("programmer")} accent={C.ok} tooltip="Device Programmer — program FPGA via USB cable" />
            <NavBtn icon={<Zap />} label="Power" active={sec === "power"} onClick={() => navClick("power")} accent={C.orange} tooltip="Power Calculator — power analysis and thermal margins" />
            <NavBtn icon={<Brain />} label={DEBUG_TOOL_LABEL[bid] ?? "Debug"} active={sec === "reveal"} onClick={() => navClick("reveal")} accent={C.pink} tooltip={DEBUG_TOOL_TOOLTIP[bid] ?? "Backend does not provide a logic analyzer integration"} />
            <NavBtn icon={<Box />} label="Runs" active={sec === "runs"} onClick={() => navClick("runs")} accent={C.cyan} tooltip="Run Manager — multi-run management and comparison" />
            <NavBtn icon={<Chip />} label="ECO" active={sec === "eco"} onClick={() => navClick("eco")} accent={C.purple} tooltip="ECO Editor — engineering change orders for I/O, PLL, memory" />
            <NavBtn icon={<Play />} label="Sim" active={sec === "simulation"} onClick={() => navClick("simulation")} accent={C.ok} tooltip="Simulation Wizard — HDL simulation setup and configuration" />
            <NavBtn icon={<Doc />} label="Tmpl" active={sec === "templates"} onClick={() => navClick("templates")} accent={C.cyan} tooltip="Source Templates — HDL code generator and examples" />
          </div>
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
            <NavBtn icon={<Doc />} label="Docs" active={sec === "docs"} onClick={() => navClick("docs")} accent={C.cyan} tooltip="Documentation — detailed user guide" />
            <NavBtn icon={<Key />} label="Lic" accent={C.warn} active={sec === "license"} onClick={() => navClick("license")} tooltip="License — FlexLM license status and feature listing" />
            <NavBtn icon={<Settings />} label="Cfg" onClick={() => setSettingsOpen(true)} tooltip="Settings — tool paths, theme, zoom configuration" />
          </div>
          <div
            onClick={handleCloseProject}
            title="Close Project"
            style={{
              padding: "6px 4px",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              borderTop: `1px solid ${C.b1}`,
              width: "100%",
              color: C.t3,
              fontSize: 7,
              fontFamily: MONO,
              fontWeight: 600,
              letterSpacing: 0.3,
            }}
          >
            <span style={{ fontSize: 12 }}>{"\u2190"}</span>
            Close
          </div>
        </div>

        {/* ══════ FILE TREE ══════ */}
        {showFiles && (
          <FileTree
            files={realFiles ?? emptyFiles}
            activeFile={aFile}
            setActiveFile={handleFileClick}
            width={fileTreeWidth}
            onWidthChange={setFileTreeWidth}
            onRefresh={refreshAll}
            onToggleSynth={handleToggleSynth}
            projectDir={projectDir}
            device={project?.device ?? B.defaultDev}
            backendId={bid}
            toolEdition={toolEdition}
            onDeviceChange={(part) => {
              if (!project || !projectDir) return;
              const updated = { ...project, device: part };
              setProject(updated);
              saveProject(projectDir, updated).catch(() => {});
            }}
            sourcePatterns={project?.sourcePatterns}
            constraintFiles={project?.constraintFiles}
            onSourcePatternsChange={(patterns) => {
              if (!project || !projectDir) return;
              const updated = { ...project, sourcePatterns: patterns };
              setProject(updated);
              saveProject(projectDir, updated).then(() => {
                getFileTreeMapped(projectDir).then(setRealFiles).catch(() => {});
              }).catch(() => {});
            }}
            onConstraintFilesChange={(files) => {
              if (!project || !projectDir) return;
              const updated = { ...project, constraintFiles: files };
              setProject(updated);
              saveProject(projectDir, updated).then(() => {
                getFileTreeMapped(projectDir).then(setRealFiles).catch(() => {});
              }).catch(() => {});
            }}
            topModule={project?.topModule}
            onSetTopModule={(file) => {
              if (!project || !projectDir) return;
              const mod = file.n.replace(/\.[^.]+$/, "");
              const updated = { ...project, topModule: mod };
              setProject(updated);
              saveProject(projectDir, updated).catch(() => {});
            }}
            onFileContextMenu={(file, x, y) => {
              const isSynthable = file.ty === "rtl" || file.ty === "tb" || file.ty === "constr";
              const items: ContextMenuItem[] = file.ty === "folder"
                ? [
                    { label: "Copy Path", icon: "\u2398", onClick: () => { if (file.path) navigator.clipboard.writeText(file.path); } },
                    { label: "", separator: true, onClick: () => {} },
                    {
                      label: "Delete Folder",
                      icon: "\u2715",
                      danger: true,
                      onClick: () => {
                        if (file.path && window.confirm(`Delete folder "${file.n}" and all its contents?`)) {
                          deleteDirectory(file.path).then(() => {
                            if (projectDir) getFileTreeMapped(projectDir).then(setRealFiles).catch(() => {});
                          }).catch((err) => {
                            setLogs((p) => [...p, { t: "err" as const, m: `Delete failed: ${err}` }]);
                          });
                        }
                      },
                    },
                  ]
                : [
                    { label: "Open in Viewer", icon: "\u25A3", onClick: () => handleFileClick(file.n, file.path) },
                    { label: "Open in Editor", icon: "\u270E", onClick: () => { if (file.path) openInEditor(file.path); } },
                    { label: "Copy Path", icon: "\u2398", onClick: () => { if (file.path) navigator.clipboard.writeText(file.path); } },
                    { label: "Copy Name", icon: "\u2399", onClick: () => navigator.clipboard.writeText(file.n) },
                    ...(isSynthable ? [
                      { label: "", separator: true, onClick: () => {} },
                      {
                        label: file.synth ? "Remove from Synthesis" : "Add to Synthesis",
                        icon: file.synth ? "\u2212" : "+",
                        onClick: () => handleToggleSynth(file),
                      },
                    ] : []),
                    ...(file.ty === "rtl" ? [
                      {
                        label: "Set as Top Module",
                        icon: "T",
                        onClick: () => {
                          if (!project || !projectDir) return;
                          const mod = file.n.replace(/\.[^.]+$/, "");
                          const updated = { ...project, topModule: mod };
                          setProject(updated);
                          saveProject(projectDir, updated).catch(() => {});
                        },
                      },
                    ] : []),
                    { label: "", separator: true, onClick: () => {} },
                    {
                      label: "Delete File",
                      icon: "\u2715",
                      danger: true,
                      onClick: () => {
                        if (file.path && window.confirm(`Delete ${file.n}?`)) {
                          deleteFile(file.path).then(() => {
                            if (projectDir) getFileTreeMapped(projectDir).then(setRealFiles).catch(() => {});
                          }).catch(() => {});
                        }
                      },
                    },
                  ];
              setContextMenu({ x, y, items });
            }}
          />
        )}

        {/* ══════ MAIN CONTENT ══════ */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
          {/* Top bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "5px 14px",
              background: C.s1,
              borderBottom: `1px solid ${C.b1}`,
              height: 36,
              gap: 8,
              flexShrink: 0,
            }}
          >
            <span
              style={{ cursor: "pointer", color: C.t3, fontSize: 10 }}
              onClick={() => setShowFiles((p) => !p)}
            >
              {showFiles ? "\u25C0" : "\u25B6"}
            </span>
            <span style={{ color: B.color, fontSize: 12 }}>{B.icon}</span>
            <span style={{ fontSize: 10, fontFamily: MONO, fontWeight: 600, color: C.t1 }}>
              {project ? project.name : B.name}
            </span>
            {sourcesStale && (
              <span
                style={{
                  fontSize: 7,
                  fontFamily: MONO,
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: 3,
                  background: `${C.warn}20`,
                  color: C.warn,
                }}
                title="Source files changed since last build"
              >
                STALE
              </span>
            )}
            <div style={{ flex: 1 }} />
            <div
              onClick={() => setCmdOpen(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 10px",
                background: C.bg,
                border: `1px solid ${C.b1}`,
                borderRadius: 4,
                fontSize: 9,
                fontFamily: MONO,
                color: C.t3,
                cursor: "pointer",
              }}
            >
              <Search />
              Commands{" "}
              <span
                style={{
                  fontSize: 7,
                  padding: "0 3px",
                  border: `1px solid ${C.b1}`,
                  borderRadius: 2,
                }}
              >
                {"\u2318K"}
              </span>
            </div>
            <Btn small onClick={runClean} disabled={building || cleaning}>
              {cleaning ? "Cleaning\u2026" : "Clean"}
            </Btn>
            {building ? (
              <Btn small icon={<Stop />} onClick={runCancel} style={{ background: "#e5534b22", color: "#e5534b", border: "1px solid #e5534b44" }}>
                Cancel
              </Btn>
            ) : (
              <Btn primary small icon={<Play />} onClick={runBuild} disabled={cleaning}>
                Build
              </Btn>
            )}
          </div>

          <Suspense fallback={null}>
          <div style={{ flex: 1, overflow: "hidden", position: "relative", minHeight: 0 }}>
            {/* File Viewer (overlay — does not unmount panel beneath) */}
            {viewingFile && (
              <div style={{ position: "absolute", inset: 0, zIndex: 10, overflow: "auto", padding: 12, background: C.bg }}>
                <FileViewer
                  file={viewingFile}
                  onClose={() => setViewingFile(null)}
                />
              </div>
            )}

            {/* Panels: mounted once on first visit, kept alive with display:none */}

            {/* Build Section */}
            {visitedSecs.has("build") && (
              <div style={{ display: sec === "build" ? undefined : "none", height: "100%", overflow: "auto", padding: 12 }}>
                <BuildPipeline
                  backend={B}
                  building={building}
                  buildStep={bStep}
                  buildFailed={buildFailed}
                  buildElapsedSec={buildElapsedSec}
                  logs={logs}
                  activeStage={activeStage}
                  onStageClick={setActiveStage}
                  selectedStages={buildStages}
                  onStagesChange={setBuildStages}
                  buildOptions={buildOptions}
                  onOptionsChange={setBuildOptions}
                  saveStatus={buildSaveStatus}
                  changedFromCommit={changedFromCommit}
                  deviceString={project?.device ?? ""}
                  projectDir={projectDir}
                  topModule={project?.topModule}
                  onTopModuleChange={(name) => {
                    if (!project || !projectDir) return;
                    const updated = { ...project, topModule: name };
                    setProject(updated);
                    saveProject(projectDir, updated).catch(() => {});
                  }}
                  onMakefileImport={(result) => {
                    if (project) {
                      const updated = { ...project };
                      if (result.device) updated.device = result.device;
                      if (result.topModule) updated.topModule = result.topModule;
                      setProject(updated);
                    }
                  }}
                />
              </div>
            )}

            {/* Reports Section */}
            {visitedSecs.has("reports") && (
              <div style={{ display: sec === "reports" ? undefined : "none", height: "100%", overflow: "auto", padding: 12 }}>
                <ReportViewer
                  rptTab={rptTab}
                  setRptTab={setRptTab}
                  reports={{
                    timing: realTimingReport,
                    utilization: realUtilReport,
                    power: realPowerReport,
                    drc: realDrcReport,
                    io: realIoReport,
                  }}
                  device={project?.device ?? B.defaultDev}
                  projectDir={projectDir}
                  building={building}
                  onSendToAi={(content) => { setPendingAiMessage(content); navClick("ai"); }}
                  backendId={bid}
                />
              </div>
            )}

            {/* Console */}
            {visitedSecs.has("console") && (
              <div style={{ display: sec === "console" ? undefined : "none", height: "100%", overflow: "auto", padding: 12 }}>
                <Console
                  logs={logs}
                  building={building}
                  backendShort={B.short}
                  backendColor={B.color}
                  backendVersion={B.version}
                  live={isTauri && B.available}
                  onClear={() => setLogs([])}
                />
              </div>
            )}

            {/* Constraint Editor */}
            {visitedSecs.has("constraints") && (
              <div style={{ display: sec === "constraints" ? undefined : "none", height: "100%", overflow: "auto", padding: 12 }}>
                <ConstraintEditor
                  backendId={bid}
                  device={project?.device ?? B.defaultDev}
                  constraintFile={constraintFilePath}
                  projectDir={projectDir}
                />
              </div>
            )}

            {/* Device Programmer */}
            {visitedSecs.has("programmer") && (
              <div style={{ display: sec === "programmer" ? undefined : "none", height: "100%", overflow: "auto", padding: 12 }}>
                <Programmer
                  device={project?.device ?? B.defaultDev}
                  backendId={bid}
                />
              </div>
            )}

            {/* Power Calculator Section */}
            {visitedSecs.has("power") && (
              <div style={{ display: sec === "power" ? undefined : "none", height: "100%", overflow: "auto", padding: 12 }}>
                <PowerCalculator />
              </div>
            )}

            {/* Reveal Debug Section */}
            {visitedSecs.has("reveal") && (
              <div style={{ display: sec === "reveal" ? undefined : "none", height: "100%", overflow: "auto", padding: 12 }}>
                <RevealDebug backendId={bid} />
              </div>
            )}

            {/* Run Manager Section */}
            {visitedSecs.has("runs") && (
              <div style={{ display: sec === "runs" ? undefined : "none", height: "100%", overflow: "auto", padding: 12 }}>
                <RunManager
                  runs={null}
                />
              </div>
            )}

            {/* ECO Editor Section */}
            {visitedSecs.has("eco") && (
              <div style={{ display: sec === "eco" ? undefined : "none", height: "100%", overflow: "auto", padding: 12 }}>
                <EcoEditor
                  changes={null}
                />
              </div>
            )}

            {/* Simulation Wizard Section */}
            {visitedSecs.has("simulation") && (
              <div style={{ display: sec === "simulation" ? undefined : "none", height: "100%", overflow: "auto", padding: 12 }}>
                <SimWizard />
              </div>
            )}

            {/* Source Templates Section */}
            {visitedSecs.has("templates") && (
              <div style={{ display: sec === "templates" ? undefined : "none", height: "100%", overflow: "auto", padding: 12 }}>
                <SourceTemplates
                  templates={null}
                  onInsert={(code) => {
                    console.log("Template inserted:", code);
                  }}
                />
              </div>
            )}

            {/* License Section */}
            {visitedSecs.has("license") && (
              <div style={{ display: sec === "license" ? undefined : "none", height: "100%", overflow: "auto", padding: 12 }}>
              <div style={panelP}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.t1,
                    marginBottom: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <Key />
                  License Status
                </div>
                {licenseLoading && (
                  <div style={{ color: C.t3, fontSize: 10, fontFamily: MONO }}>
                    Checking licenses...
                  </div>
                )}
                {licenseResult && (
                  <>
                    {/* License files found */}
                    {licenseResult.licenseFiles.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                        {licenseResult.licenseFiles.map((lf, i) => (
                          <div key={i} style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "4px 8px", borderRadius: 4, background: C.bg,
                            fontSize: 9, fontFamily: MONO,
                          }}>
                            <span style={{
                              fontSize: 7, fontWeight: 700, padding: "1px 5px", borderRadius: 2,
                              background: `${C.accent}15`, color: C.accent, textTransform: "uppercase",
                            }}>
                              {lf.backend}
                            </span>
                            <span style={{ color: C.t3, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {lf.path}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 9, fontFamily: MONO, color: C.t3, marginBottom: 12 }}>
                        No license files found
                      </div>
                    )}
                    {/* Features table */}
                    {licenseResult.features.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {licenseResult.features.map((f, i) => (
                          <div
                            key={i}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 80px 100px 80px",
                              gap: 8,
                              padding: "5px 8px",
                              borderRadius: 4,
                              background: `${C.s2}`,
                              fontSize: 9,
                              fontFamily: MONO,
                            }}
                          >
                            <span style={{ color: C.t1, fontWeight: 600 }}>{f.feature}</span>
                            <span style={{ color: C.t3 }}>{f.vendor}</span>
                            <span style={{ color: C.t3 }}>{f.expires}</span>
                            <span
                              style={{
                                color: f.status === "active" ? C.ok : f.status === "warning" ? C.warn : C.err,
                                fontWeight: 600,
                                textAlign: "right",
                              }}
                            >
                              {f.status.toUpperCase()}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: C.t3, fontSize: 10, fontFamily: MONO }}>
                        No license features found.
                      </div>
                    )}
                    <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                      <Btn
                        small
                        onClick={() => {
                          setLicenseResult(null);
                          setLicenseLoading(false);
                        }}
                      >
                        Refresh
                      </Btn>
                    </div>
                  </>
                )}
              </div>
              </div>
            )}

            {/* IP Catalog */}
            {visitedSecs.has("ip") && (
              <div style={{ display: sec === "ip" ? undefined : "none", height: "100%", overflow: "auto", padding: 12 }}>
                <IpCatalogSection backendId={bid} projectDir={projectDir} device={project?.device ?? B.defaultDev}
                  customIps={project?.customIps}
                  onCustomIpsChange={(ips) => {
                    if (!project || !projectDir) return;
                    const updated = { ...project, customIps: ips };
                    setProject(updated);
                    saveProject(projectDir, updated).catch(() => {});
                  }}
                  onRefreshFiles={() => { if (projectDir) getFileTreeMapped(projectDir).then(setRealFiles).catch(() => {}); }}
                  onAddToSynth={(ipInstanceName) => {
                    if (!projectDir) return;
                    getFileTreeMapped(projectDir).then((files) => {
                      const lower = ipInstanceName.toLowerCase();
                      setRealFiles(files.map((f) => {
                        if (f.ty === "folder" || f.ty === "config" || f.ty === "output") return f;
                        const nameL = f.n.toLowerCase();
                        const isIpFile = nameL.includes(lower) ||
                          (f.path?.toLowerCase().includes("ip_cores") && (nameL.endsWith(".v") || nameL.endsWith(".sv") || nameL.endsWith(".vhd") || nameL.endsWith(".vhdl")));
                        return isIpFile ? { ...f, synth: true, ty: "ip" as const } : f;
                      }));
                    }).catch(() => {});
                  }}
                />
              </div>
            )}

            {/* Interconnect */}
            {visitedSecs.has("interconnect") && (
              <div style={{ display: sec === "interconnect" ? undefined : "none", height: "100%", overflow: "auto", padding: 12 }}>
              <div style={panelP}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.t1, marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
                  <Link />
                  Interconnect View
                </div>
                <div style={{ color: C.t3, fontSize: 10, fontFamily: MONO }}>
                  Run a build to generate interconnect data. Block-level routing visualization will appear here.
                </div>
              </div>
              </div>
            )}

            {/* AI Assistant */}
            {visitedSecs.has("ai") && (
              <div style={{ display: sec === "ai" ? undefined : "none", height: "100%", overflow: "auto", padding: 12 }}>
              <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                <AiAssistant
                  projectContext={aiProjectContext}
                  projectDir={projectDir}
                  onOpenFile={handleFileClick}
                  initialMessage={pendingAiMessage}
                />
              </div>
              </div>
            )}

            {/* Build History */}
            {visitedSecs.has("history") && (
              <div style={{ display: sec === "history" ? undefined : "none", height: "100%", overflow: "auto", padding: 12 }}>
                <BuildHistory projectDir={projectDir} onViewReport={() => { setSec("reports"); }} />
              </div>
            )}

            {/* Git Panel */}
            {visitedSecs.has("git") && (
              <div style={{ display: sec === "git" ? undefined : "none", height: "100%", overflow: "auto", padding: 12 }}>
                <GitPanel
                  git={gitState}
                  projectDir={projectDir}
                  onRefresh={refreshAll}
                  onLog={(msg, type) => {
                    const t = type === "ok" ? "ok" : type === "err" ? "err" : type === "warn" ? "warn" : "info";
                    setLogs((p) => [...p, { t, m: msg }]);
                  }}
                />
              </div>
            )}

            {/* SSH Build Server */}
            {visitedSecs.has("ssh") && (
              <div style={{ display: sec === "ssh" ? undefined : "none", height: "100%", overflow: "auto", padding: 12 }}>
                <Suspense fallback={null}>
                  <SshPanel
                    onLog={(msg, type) => {
                      const t = type === "ok" ? "ok" : type === "err" ? "err" : type === "warn" ? "warn" : "info";
                      setLogs((p) => [...p, { t, m: msg }]);
                    }}
                  />
                </Suspense>
              </div>
            )}

            {/* Documentation */}
            {visitedSecs.has("docs") && (
              <div style={{ display: sec === "docs" ? undefined : "none", height: "100%", overflow: "auto", padding: 12 }}>
                <Documentation />
              </div>
            )}

            {/* Register Map */}
            {visitedSecs.has("regmap") && (
              <div style={{ display: sec === "regmap" ? undefined : "none", height: "100%", overflow: "auto", padding: 12 }}>
              <div style={panelP}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.t1, marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
                  <MapIcon />
                  Register Map
                </div>
                <div style={{ color: C.t3, fontSize: 10, fontFamily: MONO }}>
                  No register map defined. Add a register description file (.rdl, .json) to your project.
                </div>
              </div>
              </div>
            )}
          </div>
          </Suspense>
        </div>
      </div>
      <PerfOverlay visible={perfOverlay} />
    </div>
  );
}
