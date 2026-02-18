import { useState, useEffect, useCallback, useRef } from "react";
import { Section, ReportTab, LogEntry, AppView, ProjectConfig, ProjectFile, FileContent, TimingReportData, UtilizationReportData, RuntimeBackend, LicenseCheckResult } from "./types";
import { useTheme } from "./context/ThemeContext";
import { Btn, NavBtn, ResourceBar } from "./components/shared";
import {
  Chip, Zap, Doc, Box, Brain, Link, MapIcon, Pin, Gauge, Term, Key, Settings,
  Play, Search,
} from "./components/Icons";
import GitStatusBar from "./components/GitStatusBar";
import FileTree from "./components/FileTree";
import BuildPipeline from "./components/BuildPipeline";
import ReportViewer from "./components/ReportViewer";
import Console from "./components/Console";
import CommandPalette from "./components/CommandPalette";
import BackendSwitcher from "./components/BackendSwitcher";
import StartScreen from "./components/StartScreen";
import FileViewer from "./components/FileViewer";
import BuildArtifacts from "./components/BuildArtifacts";
import SettingsPanel from "./components/SettingsPanel";
import ContextMenu, { ContextMenuItem } from "./components/ContextMenu";
import {
  startBuild as tauriStartBuild,
  listen,
  readFile,
  readBuildLog,
  openProject,
  getFileTreeMapped,
  getTimingReport,
  getUtilizationReport,
  mapTimingReport,
  mapUtilizationReport,
  getRuntimeBackends,
  getAppConfig,
  deleteFile,
  checkLicenses,
} from "./hooks/useTauri";

const isTauri = typeof window !== "undefined" && "__TAURI__" in window;

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

export default function App() {
  const { C, MONO, SANS, setThemeId, scaleFactor, setScaleFactor } = useTheme();

  // ── View routing ──
  const [view, setView] = useState<AppView>("start");
  const [project, setProject] = useState<ProjectConfig | null>(null);
  const [projectDir, setProjectDir] = useState<string>("");

  // ── Backend state ──
  const [backends, setBackends] = useState<RuntimeBackend[]>([]);
  const [bid, setBid] = useState("radiant");

  // ── IDE state ──
  const [sec, setSec] = useState<Section>("build");
  const [building, setBuilding] = useState(false);
  const [bStep, setBStep] = useState(-1);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsRef = useRef<LogEntry[]>([]);
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const [aFile, setAFile] = useState("");
  const [showFiles, setShowFiles] = useState(true);
  const [rptTab, setRptTab] = useState<ReportTab>("timing");
  const [gitExpanded, setGitExpanded] = useState(false);
  const [realFiles, setRealFiles] = useState<ProjectFile[] | null>(null);
  const [viewingFile, setViewingFile] = useState<FileContent | null>(null);
  const [realTimingReport, setRealTimingReport] = useState<TimingReportData | null>(null);
  const [realUtilReport, setRealUtilReport] = useState<UtilizationReportData | null>(null);
  const [buildDone, setBuildDone] = useState(false);
  const [activeStage, setActiveStage] = useState<number | null>(null);
  const [licenseResult, setLicenseResult] = useState<LicenseCheckResult | null>(null);
  const [licenseLoading, setLicenseLoading] = useState(false);

  // Resolve current backend
  const B = backends.find((b) => b.id === bid) ?? FALLBACK_BACKEND;

  // Load backends and config on mount
  useEffect(() => {
    getRuntimeBackends().then(setBackends);
    getAppConfig().then((cfg) => {
      const tid = cfg.theme as "dark" | "light" | "colorblind";
      if (tid === "dark" || tid === "light" || tid === "colorblind") setThemeId(tid);
      if (cfg.scale_factor >= 0.5 && cfg.scale_factor <= 2.0) setScaleFactor(cfg.scale_factor);
    }).catch(() => {});
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

  const handleOpenProject = useCallback((dir: string, config: ProjectConfig) => {
    setProjectDir(dir);
    setProject(config);
    const backendId = config.backendId;
    const matchingBackend = backends.find((b) => b.id === backendId);
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
    setView("ide");

    if (isTauri) {
      // Ensure the Rust backend registers this as the active project
      // (required for start_build to find the project config)
      openProject(dir).catch(() => {});

      // Load real file tree
      getFileTreeMapped(dir).then((files) => {
        console.log("File tree loaded:", files.length, "entries");
        setRealFiles(files);
        // If impl files exist, a previous build was done — load reports
        const hasImpl = files.some((f) => f.path?.includes(config.implDir || "impl1"));
        if (hasImpl) {
          setBuildDone(true);
          setBStep(4); // Mark all stages done
          const bName = matchingBackend?.name ?? "Radiant";
          getTimingReport(backendId, dir)
            .then((r) => setRealTimingReport(mapTimingReport(r, bName)))
            .catch(() => {});
          getUtilizationReport(backendId, dir)
            .then((r) => setRealUtilReport(mapUtilizationReport(r)))
            .catch(() => {});
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
      setRealFiles([
        { n: "source", d: 0, ty: "folder", open: true },
        { n: "count_attr.v", d: 1, ty: "rtl", saved: true, git: "clean", synth: true, lines: 42, lang: "Verilog" },
        { n: "impl1.pdc", d: 1, ty: "constr", saved: true, git: "clean", synth: true, lang: "PDC" },
        { n: "impl1.sdc", d: 1, ty: "constr", saved: true, git: "clean", synth: true, lang: "SDC" },
        { n: "8_bit_counter.rdf", d: 0, ty: "config", saved: true, git: "clean" },
        { n: "counter1.sty", d: 0, ty: "config", saved: true, git: "clean" },
        { n: "build.tcl", d: 0, ty: "config", saved: true, git: "clean" },
      ]);
    }
  }, [backends]);

  const handleCloseProject = useCallback(() => {
    setView("start");
    setProject(null);
    setProjectDir("");
    setCmdOpen(false);
    setDevOpen(false);
    setRealFiles(null);
    setViewingFile(null);
    setRealTimingReport(null);
    setRealUtilReport(null);
    setBuildDone(false);
    setActiveStage(null);
  }, []);

  const switchBackend = useCallback((id: string) => {
    setBid(id);
    setBStep(-1);
    setLogs([]);
    setBuilding(false);
    setActiveStage(null);
  }, []);

  const buildCleanup = useRef<(() => void) | null>(null);

  // Mock build simulation for browser dev mode
  const runMockBuild = useCallback((backend: RuntimeBackend) => {
    const stages = backend.pipeline;
    const mockStartTime = Date.now();
    const stageLines: LogEntry[][] = [
      // Synthesis
      [
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

  const runBuild = useCallback(async () => {
    setBuilding(true);
    setBStep(0);
    setLogs([]);
    logsRef.current = [];
    setSec("build");
    setBuildDone(false);
    setActiveStage(null);

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
        setBStep(data.stage_idx + 1);
        setActiveStage(data.stage_idx);
      }
    );

    const unlistenFinished = await listen<{ build_id: string; stage_idx: number; status: string; message: string }>(
      "build:finished",
      (data) => {
        stopLogFlush();
        setBuilding(false);
        setLogs((p) => [
          ...p,
          {
            t: (data.status === "success" ? "ok" : "err") as LogEntry["t"],
            m: data.message,
          },
        ]);
        if (data.status === "success") {
          setBuildDone(true);
          getFileTreeMapped(projectDir).then(setRealFiles).catch(() => {});
          getTimingReport(bid, projectDir)
            .then((r) => setRealTimingReport(mapTimingReport(r, B.name)))
            .catch(() => {});
          getUtilizationReport(bid, projectDir)
            .then((r) => setRealUtilReport(mapUtilizationReport(r)))
            .catch(() => {});
        }
      }
    );

    buildCleanup.current = () => {
      stopLogFlush();
      unlistenStdout();
      unlistenStage();
      unlistenFinished();
    };

    // NOW start the build — listeners are already active
    try {
      const buildId = await tauriStartBuild(bid, projectDir);
      console.log("Build started:", buildId);
    } catch (err) {
      // Clean up listeners on error
      buildCleanup.current();
      buildCleanup.current = null;
      setBuilding(false);
      setLogs((p) => [...p, { t: "err" as const, m: `Build error: ${err}` }]);
    }
  }, [B, bid, projectDir, startLogFlush, stopLogFlush, runMockBuild]);

  const handleFileClick = useCallback((name: string, path?: string) => {
    setAFile(name);
    if (path && isTauri) {
      readFile(path).then(setViewingFile).catch(() => setViewingFile(null));
    } else {
      setViewingFile(null);
    }
  }, []);

  const navClick = useCallback((s: Section) => {
    setSec(s);
    setViewingFile(null);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (view === "ide") setCmdOpen((p) => !p);
      }
      if (e.key === "Escape") {
        setCmdOpen(false);
        setDevOpen(false);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [view]);

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
      stopLogFlush();
    };
  }, [stopLogFlush]);

  // ── Start Screen ──
  if (view === "start") {
    return <StartScreen onOpenProject={handleOpenProject} />;
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
    { label: "Build All", category: "Build", desc: `${B.short} flow`, action: runBuild },
    { label: "Reports", category: "View", desc: "Timing, Utilization, Power, DRC, I/O", action: () => navClick("reports") },
    { label: "Console", category: "View", desc: "Build output log", action: () => navClick("console") },
    ...backends.filter((b) => b.available).map((b) => ({
      label: `Switch: ${b.name}`, category: "Backend", action: () => switchBackend(b.id),
    })),
    { label: "Close Project", category: "Project", action: handleCloseProject },
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
        zoom: scaleFactor !== 1 ? scaleFactor : undefined,
      }}
    >
      {/* Git Status Bar */}
      <GitStatusBar
        git={null}
        projectName={project?.name}
        gitExpanded={gitExpanded}
        setGitExpanded={setGitExpanded}
      />

      {/* Command Palette */}
      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        commands={commands}
      />

      {/* Backend Switcher */}
      <BackendSwitcher
        open={devOpen}
        onClose={() => setDevOpen(false)}
        backends={backends}
        activeId={bid}
        onSwitch={switchBackend}
      />

      {/* Settings Panel */}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}

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
            width: 56,
            flexShrink: 0,
            background: C.s1,
            borderRight: `1px solid ${C.b1}`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: 6,
            gap: 1,
          }}
        >
          <div
            onClick={() => setDevOpen((p) => !p)}
            style={{
              padding: "6px 0 8px",
              cursor: "pointer",
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
          <NavBtn icon={<Zap />} label="Build" active={sec === "build"} onClick={() => navClick("build")} badge={building} />
          <NavBtn icon={<Doc />} label="Reports" active={sec === "reports"} onClick={() => navClick("reports")} accent={C.cyan} />
          <NavBtn icon={<Box />} label="IP" active={sec === "ip"} onClick={() => navClick("ip")} accent={C.purple} />
          <NavBtn icon={<Link />} label="Interc" active={sec === "interconnect"} onClick={() => navClick("interconnect")} accent={C.cyan} />
          <NavBtn icon={<Brain />} label="AI" active={sec === "ai"} onClick={() => navClick("ai")} accent={C.pink} />
          <NavBtn icon={<MapIcon />} label="Regs" active={sec === "regmap"} onClick={() => navClick("regmap")} accent={C.orange} />
          <NavBtn icon={<Pin />} label="Constr" active={sec === "constraints"} onClick={() => navClick("constraints")} />
          <NavBtn icon={<Gauge />} label="Rsrc" active={sec === "resources"} onClick={() => navClick("resources")} />
          <NavBtn icon={<Term />} label="Log" active={sec === "console"} onClick={() => navClick("console")} />
          <div style={{ flex: 1 }} />
          <NavBtn icon={<Key />} label="Lic" accent={C.warn} active={sec === "license"} onClick={() => navClick("license")} />
          <NavBtn icon={<Settings />} label="Cfg" onClick={() => setSettingsOpen(true)} />
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
            onFileContextMenu={(file, x, y) => {
              const items: ContextMenuItem[] = file.ty === "folder"
                ? [
                    { label: "Copy Path", icon: "\u2398", onClick: () => { if (file.path) navigator.clipboard.writeText(file.path); } },
                  ]
                : [
                    { label: "Open in Viewer", icon: "\u25A3", onClick: () => handleFileClick(file.n, file.path) },
                    { label: "Copy Path", icon: "\u2398", onClick: () => { if (file.path) navigator.clipboard.writeText(file.path); } },
                    { label: "Copy Name", icon: "\u2399", onClick: () => navigator.clipboard.writeText(file.n) },
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
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
            <span style={{ color: C.t3, fontSize: 9, fontFamily: MONO }}>
              {"\u2192"} {project ? project.device : B.defaultDev}
            </span>
            {projectDir && (
              <span
                style={{
                  color: C.t3,
                  fontSize: 8,
                  fontFamily: MONO,
                  opacity: 0.6,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 200,
                }}
                title={projectDir}
              >
                {projectDir}
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
            <Btn primary small icon={<Play />} onClick={runBuild} disabled={building}>
              {building ? "Building..." : "Build"}
            </Btn>
          </div>

          <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
            {/* File Viewer (overrides section content) */}
            {viewingFile && (
              <FileViewer
                file={viewingFile}
                onClose={() => setViewingFile(null)}
              />
            )}

            {/* Build Section */}
            {sec === "build" && !viewingFile && (
              <>
                <BuildPipeline
                  backend={B}
                  building={building}
                  buildStep={bStep}
                  logs={logs}
                  activeStage={activeStage}
                  onStageClick={setActiveStage}
                />
                {buildDone && realFiles && (
                  <BuildArtifacts
                    files={realFiles}
                    implDir={project?.implDir ?? "impl1"}
                    onOpenFile={(path) => {
                      const name = path.split("/").pop() ?? path;
                      handleFileClick(name, path);
                    }}
                  />
                )}
              </>
            )}

            {/* Reports Section */}
            {sec === "reports" && !viewingFile && (
              <ReportViewer
                rptTab={rptTab}
                setRptTab={setRptTab}
                reports={{
                  timing: realTimingReport,
                  utilization: realUtilReport,
                  power: null,
                  drc: null,
                  io: null,
                }}
                device={project?.device ?? B.defaultDev}
              />
            )}

            {/* Resources Quick View */}
            {sec === "resources" && !viewingFile && (
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
                  <Gauge />
                  Utilization {"\u2014"}{" "}
                  <span style={{ color: B.color }}>{project?.device ?? B.defaultDev}</span>
                </div>
                {realUtilReport ? (
                  realUtilReport.summary.flatMap((cat) =>
                    cat.items.filter((i) => i.total > 0).map((i, idx) => (
                      <ResourceBar key={idx} label={i.r} used={i.used} total={i.total} />
                    ))
                  )
                ) : (
                  <div style={{ color: C.t3, fontSize: 10, fontFamily: MONO }}>
                    Run a build to see utilization data.
                  </div>
                )}
                <div style={{ marginTop: 10 }}>
                  <Btn
                    small
                    onClick={() => {
                      setSec("reports");
                      setRptTab("util");
                    }}
                  >
                    Open Full Utilization Report {"\u2192"}
                  </Btn>
                </div>
              </div>
            )}

            {/* Console */}
            {sec === "console" && !viewingFile && (
              <Console
                logs={logs}
                building={building}
                backendShort={B.short}
                backendColor={B.color}
                onClear={() => setLogs([])}
              />
            )}

            {/* Constraints Quick View */}
            {sec === "constraints" && !viewingFile && (
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
                  <Pin />
                  Pin Constraints
                </div>
                <Btn
                  small
                  onClick={() => {
                    setSec("reports");
                    setRptTab("io");
                  }}
                >
                  Open Full I/O Report {"\u2192"}
                </Btn>
              </div>
            )}

            {/* License Section */}
            {sec === "license" && !viewingFile && (
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
                    <div style={{ fontSize: 9, fontFamily: MONO, color: C.t3, marginBottom: 10 }}>
                      {licenseResult.licenseFile
                        ? `License file: ${licenseResult.licenseFile}`
                        : "No license file found"}
                    </div>
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
                                color: f.status === "active" ? C.ok : C.err,
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
                    <div style={{ marginTop: 10 }}>
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
            )}

            {/* Placeholder sections */}
            {["ip", "interconnect", "ai", "regmap"].includes(sec) && !viewingFile && (
              <div style={panelP}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.t1,
                    marginBottom: 10,
                  }}
                >
                  {sec.charAt(0).toUpperCase() + sec.slice(1)}
                </div>
                <div style={{ color: C.t3, fontSize: 10, fontFamily: MONO }}>
                  Coming soon.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
