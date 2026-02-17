import React, { useState, useEffect, useCallback } from "react";
import { C, MONO, SANS, Section, ReportTab, LogEntry } from "./types";
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
import { BACKENDS, GIT, FILES, REPORTS } from "./data/mockData";

export default function App() {
  const [bid, setBid] = useState("diamond");
  const [sec, setSec] = useState<Section>("build");
  const [building, setBuilding] = useState(false);
  const [bStep, setBStep] = useState(-1);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const [aFile, setAFile] = useState("pqc_engine.sv");
  const [showFiles, setShowFiles] = useState(true);
  const [rptTab, setRptTab] = useState<ReportTab>("timing");
  const [gitExpanded, setGitExpanded] = useState(false);

  const B = BACKENDS[bid];

  const switchBackend = useCallback((id: string) => {
    setBid(id);
    setBStep(-1);
    setLogs([]);
    setBuilding(false);
  }, []);

  const runBuild = useCallback(() => {
    setBuilding(true);
    setBStep(0);
    setLogs([]);
    setSec("build");
    let step = 0;
    let li = 0;
    const si = setInterval(() => {
      step++;
      setBStep(step);
      if (step >= B.pipeline.length) {
        clearInterval(si);
        setBuilding(false);
      }
    }, 950);
    const ti = setInterval(() => {
      if (li < B.log.length) {
        setLogs((p) => [...p, B.log[li]]);
        li++;
      } else {
        clearInterval(ti);
      }
    }, 200);
    return () => {
      clearInterval(si);
      clearInterval(ti);
    };
  }, [B]);

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((p) => !p);
      }
      if (e.key === "Escape") {
        setCmdOpen(false);
        setDevOpen(false);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const panel: React.CSSProperties = {
    background: C.s1,
    borderRadius: 7,
    border: `1px solid ${C.b1}`,
    overflow: "hidden",
  };
  const panelP: React.CSSProperties = { ...panel, padding: 14 };

  const commands = [
    { label: "Build All", category: "Build", desc: `${B.short} flow`, action: runBuild },
    { label: "Reports", category: "View", desc: "Timing, Utilization, Power, DRC, I/O", action: () => setSec("reports") },
    { label: "Switch: Diamond", category: "Backend", action: () => switchBackend("diamond") },
    { label: "Switch: Quartus", category: "Backend", action: () => switchBackend("quartus") },
    { label: "Switch: Vivado", category: "Backend", action: () => switchBackend("vivado") },
    { label: "Switch: OSS", category: "Backend", action: () => switchBackend("opensource") },
    { label: "Git: Log", category: "Git", action: () => setGitExpanded(true) },
  ];

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
        git={GIT}
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
        backends={BACKENDS}
        activeId={bid}
        onSwitch={switchBackend}
      />

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
          <NavBtn icon={<Zap />} label="Build" active={sec === "build"} onClick={() => setSec("build")} badge={building} />
          <NavBtn icon={<Doc />} label="Reports" active={sec === "reports"} onClick={() => setSec("reports")} accent={C.cyan} />
          <NavBtn icon={<Box />} label="IP" active={sec === "ip"} onClick={() => setSec("ip")} accent={C.purple} />
          <NavBtn icon={<Link />} label="Interc" active={sec === "interconnect"} onClick={() => setSec("interconnect")} accent={C.cyan} />
          <NavBtn icon={<Brain />} label="AI" active={sec === "ai"} onClick={() => setSec("ai")} accent={C.pink} />
          <NavBtn icon={<MapIcon />} label="Regs" active={sec === "regmap"} onClick={() => setSec("regmap")} accent={C.orange} />
          <NavBtn icon={<Pin />} label="Constr" active={sec === "constraints"} onClick={() => setSec("constraints")} />
          <NavBtn icon={<Gauge />} label="Rsrc" active={sec === "resources"} onClick={() => setSec("resources")} />
          <NavBtn icon={<Term />} label="Log" active={sec === "console"} onClick={() => setSec("console")} />
          <div style={{ flex: 1 }} />
          <NavBtn icon={<Key />} label="Lic" accent={C.warn} />
          <NavBtn icon={<Settings />} label="Cfg" />
          <div style={{ height: 6 }} />
        </div>

        {/* ══════ FILE TREE ══════ */}
        {showFiles && (
          <FileTree
            files={FILES}
            activeFile={aFile}
            setActiveFile={setAFile}
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
              {B.name}
            </span>
            <span style={{ color: C.t3, fontSize: 9, fontFamily: MONO }}>
              \u2192 {B.defaultDev}
            </span>
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
                \u2318K
              </span>
            </div>
            <Btn primary small icon={<Play />} onClick={runBuild} disabled={building}>
              {building ? "Building..." : "Build"}
            </Btn>
          </div>

          <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
            {/* Build Section */}
            {sec === "build" && (
              <BuildPipeline
                backend={B}
                building={building}
                buildStep={bStep}
              />
            )}

            {/* Reports Section */}
            {sec === "reports" && (
              <ReportViewer
                rptTab={rptTab}
                setRptTab={setRptTab}
                reports={REPORTS}
                device={B.defaultDev}
              />
            )}

            {/* Resources Quick View */}
            {sec === "resources" && (
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
                  Utilization \u2014{" "}
                  <span style={{ color: B.color }}>{B.defaultDev}</span>
                </div>
                {B.resources.map((r, i) => (
                  <ResourceBar key={i} label={r.label} used={r.used} total={r.total} />
                ))}
                <div style={{ marginTop: 10 }}>
                  <Btn
                    small
                    onClick={() => {
                      setSec("reports");
                      setRptTab("util");
                    }}
                  >
                    Open Full Utilization Report \u2192
                  </Btn>
                </div>
              </div>
            )}

            {/* Console */}
            {sec === "console" && (
              <Console
                logs={logs}
                building={building}
                backendShort={B.short}
                backendIcon={B.icon}
                backendColor={B.color}
                onClear={() => setLogs([])}
              />
            )}

            {/* Constraints Quick View */}
            {sec === "constraints" && (
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
                  Open Full I/O Report \u2192
                </Btn>
              </div>
            )}

            {/* Placeholder sections */}
            {["ip", "interconnect", "ai", "regmap"].includes(sec) && (
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
                  This section will be implemented in Phase 4. Use the nav to
                  explore Build, Reports, Resources, or Console.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
