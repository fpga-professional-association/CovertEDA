import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Section, ReportTab, LogEntry, AppView, ProjectConfig, ProjectFile, FileContent, TimingReportData, UtilizationReportData, PowerReportData, DrcReportData, IoBankData, RuntimeBackend, LicenseCheckResult, GitState } from "./types";
import { RADIANT_IP_CATALOG, QUARTUS_IP_CATALOG, OSS_IP_CATALOG, ICE40_IP_CATALOG, GOWIN_IP_CATALOG, IP_CATEGORIES, IpCore } from "./data/ipCatalog";
import { DEVICE_MAP, validatePart } from "./data/deviceParts";
import { useTheme } from "./context/ThemeContext";
import { Btn, NavBtn, Select } from "./components/shared";
import {
  Chip, Zap, Doc, Box, Brain, Link, MapIcon, Pin, Term, Key, Settings,
  Play, Stop, Search, Clock, Download,
} from "./components/Icons";
import GitStatusBar from "./components/GitStatusBar";
import FileTree from "./components/FileTree";
import BuildPipeline from "./components/BuildPipeline";
import ReportViewer from "./components/ReportViewer";
import Console from "./components/Console";
import CommandPalette from "./components/CommandPalette";
import StartScreen from "./components/StartScreen";
import FileViewer from "./components/FileViewer";
import BuildArtifacts from "./components/BuildArtifacts";
import SettingsPanel from "./components/SettingsPanel";
import ContextMenu, { ContextMenuItem } from "./components/ContextMenu";
import AiAssistant from "./components/AiAssistant";
import ConstraintEditor from "./components/ConstraintEditor";
import Programmer from "./components/Programmer";
import BuildHistory from "./components/BuildHistory";
import type { BuildRecord } from "./components/BuildHistory";
import Documentation from "./components/Documentation";
import KeyboardShortcuts from "./components/KeyboardShortcuts";
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
  gitIsDirty,
  gitCommit,
  getGitStatus,
  executeIpGenerate,
  saveBuildRecord,
  getProjectConfigAtHead,
} from "./hooks/useTauri";
import type { RustGitStatus } from "./hooks/useTauri";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function mapGitStatus(r: RustGitStatus): GitState {
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
    stashes: 0,
    tags: [],
    recentCommits: [],
  };
}

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

function IpCatalogSection({ backendId, projectDir, device, onRefreshFiles, onAddToSynth }: { backendId: string; projectDir: string; device: string; onRefreshFiles?: () => void; onAddToSynth?: (instanceName: string) => void }) {
  const { C, MONO } = useTheme();
  const [ipSearch, setIpSearch] = useState("");
  const [configuring, setConfiguring] = useState<IpCore | null>(null);
  const [ipParams, setIpParams] = useState<Record<string, string>>({});
  const [instanceName, setInstanceName] = useState("u_inst");
  const [copiedTemplate, setCopiedTemplate] = useState(false);
  const [tclVisible, setTclVisible] = useState(false);
  const [genState, setGenState] = useState<"idle" | "preview" | "running" | "done" | "error">("idle");
  const [genOutput, setGenOutput] = useState<string[]>([]);

  const catalog = useMemo(() => {
    if (backendId === "quartus") return QUARTUS_IP_CATALOG;
    if (backendId === "opensource") {
      const d = device.toUpperCase();
      if (d.startsWith("ICE40")) return ICE40_IP_CATALOG;
      if (d.startsWith("GW")) return GOWIN_IP_CATALOG;
      return OSS_IP_CATALOG; // ECP5 default + Nexus/GateMate/MachXO2
    }
    return RADIANT_IP_CATALOG;
  }, [backendId, device]);

  const filtered = useMemo(() => {
    if (!ipSearch) return catalog;
    const q = ipSearch.toLowerCase();
    return catalog.filter(
      (ip) => ip.name.toLowerCase().includes(q) || ip.description.toLowerCase().includes(q) || ip.category.toLowerCase().includes(q)
    );
  }, [ipSearch, catalog]);

  const grouped = useMemo(() => {
    const map: Record<string, typeof filtered> = {};
    for (const cat of IP_CATEGORIES) map[cat] = [];
    for (const ip of filtered) (map[ip.category] ??= []).push(ip);
    return Object.entries(map).filter(([, items]) => items.length > 0);
  }, [filtered]);

  const openConfigurator = useCallback((ip: IpCore) => {
    setConfiguring(ip);
    const defaults: Record<string, string> = {};
    for (const p of ip.params ?? []) defaults[p.key] = p.default;
    setIpParams(defaults);
    setInstanceName(`u_${ip.name.toLowerCase().replace(/\s+/g, "_")}`);
    setCopiedTemplate(false);
    setTclVisible(false);
    setGenState("idle");
    setGenOutput([]);
  }, []);

  const generateTemplate = useMemo(() => {
    if (!configuring?.template) return null;
    let t = configuring.template;
    for (const [key, val] of Object.entries(ipParams)) {
      t = t.replace(new RegExp(`\\{${key}\\}`, "g"), val);
    }
    t = t.replace(/\{INSTANCE_NAME\}/g, instanceName);
    return t;
  }, [configuring, ipParams, instanceName]);

  const copyTemplate = useCallback(() => {
    if (generateTemplate) {
      navigator.clipboard.writeText(generateTemplate);
      setCopiedTemplate(true);
      setTimeout(() => setCopiedTemplate(false), 2000);
    }
  }, [generateTemplate]);

  // Deterministic TCL preview — computed synchronously, no async races
  const genTcl = useMemo(() => {
    if (!tclVisible || !configuring) return null;
    const sortedParams = Object.entries(ipParams)
      .filter(([, v]) => v)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const isQuartus = backendId === "quartus";
    const isVivado = backendId === "vivado";
    if (isQuartus) {
      const paramLines = sortedParams.map(([k, v]) => `set_parameter -name ${k} ${v}`).join("\n");
      return `# IP generation TCL for ${configuring.name}\npackage require ::quartus::project\nset_global_assignment -name IP_COMPONENT "${configuring.name}"\nset_global_assignment -name IP_INSTANCE "${instanceName}"\n${paramLines}\ngenerate_ip "${instanceName}"`;
    }
    if (isVivado) {
      const paramLines = sortedParams.map(([k, v]) => `CONFIG.${k} {${v}}`).join(" \\\n  ");
      return `# IP generation TCL for ${configuring.name}\ncreate_ip -name ${configuring.name} -vendor xilinx.com -library ip -module_name ${instanceName}\nset_property -dict [list \\\n  ${paramLines} \\\n] [get_ips ${instanceName}]\ngenerate_target all [get_ips ${instanceName}]`;
    }
    // Lattice (Radiant/Diamond) and OSS
    const paramLines = sortedParams
      .map(([k, v]) => `  -param "${k}:${v}"`)
      .join(" \\\n");
    return `# IP generation TCL for ${configuring.name}\nsbp_design new -name "${instanceName}" -family "LIFCL" -device "${device}"\nsbp_configure -component "${configuring.name}" \\\n${paramLines}\nsbp_generate -lang "verilog"\nsbp_save\nsbp_close_design`;
  }, [tclVisible, configuring, ipParams, instanceName, backendId, device]);

  const handleRunGenerate = useCallback(async () => {
    if (!genTcl) return;
    setGenState("running");
    setGenOutput([]);
    try {
      const unlistenStdout = await listen<{ genId: string; line: string }>(
        "ip:stdout",
        (data) => setGenOutput((p) => [...p, data.line]),
      );
      const unlistenFinished = await listen<{ genId: string; status: string; message: string }>(
        "ip:finished",
        (data) => {
          setGenOutput((p) => [...p, data.message]);
          setGenState(data.status === "success" ? "done" : "error");
          unlistenStdout();
          unlistenFinished();
        },
      );
      await executeIpGenerate(backendId, projectDir, genTcl);
    } catch (err) {
      setGenState("error");
      setGenOutput((p) => [...p, `Error: ${err}`]);
    }
  }, [genTcl, backendId, projectDir]);

  const panelP: React.CSSProperties = {
    background: C.s1, borderRadius: 7, border: `1px solid ${C.b1}`, overflow: "hidden", padding: 14,
  };

  // Full-screen configurator when an IP is selected
  if (configuring) {
    return (
      <div style={{ ...panelP, display: "flex", flexDirection: "column", overflow: "auto" }}>
        {/* Back button + header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Btn small onClick={() => { setConfiguring(null); setGenState("idle"); setTclVisible(false); setGenOutput([]); }}
            icon={<span style={{ fontSize: 10 }}>{"\u2190"}</span>}>
            IP Catalog
          </Btn>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.t1, flex: 1 }}>
            {configuring.name}
          </div>
          <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>
            {configuring.category}
          </span>
        </div>

        <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, marginBottom: 12, lineHeight: 1.5 }}>
          {configuring.description}
        </div>

        {/* Two-column layout: params on left, template + generation on right */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, flex: 1 }}>
          {/* Left: Instance Name + Parameters */}
          <div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 8, fontFamily: MONO, fontWeight: 600, color: C.t3, marginBottom: 3 }}>
                INSTANCE NAME
              </div>
              <input
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                style={{
                  width: "100%", padding: "4px 8px", fontSize: 9, fontFamily: MONO,
                  background: C.bg, color: C.t1, border: `1px solid ${C.b1}`, borderRadius: 3,
                  outline: "none", boxSizing: "border-box",
                }}
              />
            </div>

            {configuring.params?.map((p) => (
              <div key={p.key} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 8, fontFamily: MONO, fontWeight: 600, color: C.t3, marginBottom: 3 }}>
                  {p.label} {p.unit && <span style={{ fontWeight: 400 }}>({p.unit})</span>}
                </div>
                {p.type === "select" ? (
                  <Select
                    value={ipParams[p.key] ?? p.default}
                    onChange={(v) => setIpParams((prev) => ({ ...prev, [p.key]: v }))}
                    options={(p.choices ?? []).map((c) => ({ value: c, label: c }))}
                    style={{ width: "100%" }}
                  />
                ) : p.type === "boolean" ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    {["true", "false"].map((v) => (
                      <span
                        key={v}
                        onClick={() => setIpParams((prev) => ({ ...prev, [p.key]: v }))}
                        style={{
                          padding: "3px 8px", borderRadius: 3, cursor: "pointer",
                          fontSize: 8, fontFamily: MONO, fontWeight: 600,
                          border: `1px solid ${(ipParams[p.key] ?? p.default) === v ? C.accent : C.b1}`,
                          color: (ipParams[p.key] ?? p.default) === v ? C.accent : C.t2,
                          background: (ipParams[p.key] ?? p.default) === v ? `${C.accent}15` : C.bg,
                        }}
                      >
                        {v === "true" ? "Yes" : "No"}
                      </span>
                    ))}
                  </div>
                ) : (
                  <input
                    type={p.type === "number" ? "number" : "text"}
                    value={ipParams[p.key] ?? p.default}
                    onChange={(e) => setIpParams((prev) => ({ ...prev, [p.key]: e.target.value }))}
                    min={p.min}
                    max={p.max}
                    style={{
                      width: "100%", padding: "4px 8px", fontSize: 9, fontFamily: MONO,
                      background: C.bg, color: C.t1, border: `1px solid ${C.b1}`, borderRadius: 3,
                      outline: "none", boxSizing: "border-box",
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Right: Template + Generation */}
          <div>
            {generateTemplate && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 8, fontFamily: MONO, fontWeight: 600, color: C.t3 }}>
                    INSTANTIATION
                  </div>
                  <span
                    onClick={copyTemplate}
                    style={{
                      fontSize: 7, fontFamily: MONO, padding: "2px 6px", borderRadius: 3,
                      background: copiedTemplate ? `${C.ok}15` : `${C.accent}15`,
                      color: copiedTemplate ? C.ok : C.accent,
                      fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    {copiedTemplate ? "Copied!" : "Copy"}
                  </span>
                </div>
                <pre style={{
                  fontSize: 8, fontFamily: MONO, color: C.t1, background: C.bg,
                  border: `1px solid ${C.b1}`, borderRadius: 4, padding: "8px 10px",
                  overflow: "auto", maxHeight: 200, lineHeight: 1.5, whiteSpace: "pre-wrap",
                  margin: 0,
                }}>
                  {generateTemplate}
                </pre>
              </div>
            )}

            {configuring.params && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 8, fontFamily: MONO, fontWeight: 600, color: C.t3 }}>
                    IP GENERATION
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                  <Btn small onClick={() => { setTclVisible((v) => !v); setGenState((p) => p === "done" ? "done" : tclVisible ? "idle" : "preview"); }} disabled={genState === "running"}>
                    {tclVisible ? "Hide TCL" : "Preview TCL"}
                  </Btn>
                  {genTcl && genState !== "running" && (
                    <Btn small primary onClick={handleRunGenerate}>
                      {genState === "done" ? "Re-Generate" : "Generate IP"}
                    </Btn>
                  )}
                  {genState === "done" && (
                    <>
                      <span style={{ fontSize: 8, fontFamily: MONO, color: C.ok, fontWeight: 600, alignSelf: "center" }}>
                        {"\u2713"} Complete
                      </span>
                      <Btn small onClick={() => {
                        onRefreshFiles?.();
                        onAddToSynth?.(instanceName);
                        setGenOutput([`IP "${instanceName}" added to project and synthesis flow.`]);
                      }} style={{ color: C.ok, borderColor: `${C.ok}44` }}>
                        Add to Synthesis
                      </Btn>
                      <Btn small onClick={() => {
                        onRefreshFiles?.();
                        setGenOutput([`IP files added to project (not in synthesis).`]);
                      }}>
                        Add to Project Only
                      </Btn>
                      <Btn small onClick={() => {
                        setConfiguring(null);
                        setGenState("idle");
                        setTclVisible(false);
                        setGenOutput([]);
                      }} style={{ color: C.err, borderColor: `${C.err}44` }}>
                        Discard
                      </Btn>
                    </>
                  )}
                </div>
                {genTcl && (
                  <pre style={{
                    fontSize: 7, fontFamily: MONO, color: C.t2, background: C.bg,
                    border: `1px solid ${C.b1}`, borderRadius: 4, padding: "6px 8px",
                    overflow: "auto", maxHeight: 120, lineHeight: 1.4, whiteSpace: "pre-wrap",
                    margin: "0 0 6px",
                  }}>
                    {genTcl}
                  </pre>
                )}
                {genOutput.length > 0 && (
                  <div style={{
                    background: C.bg, borderRadius: 4, padding: "6px 8px",
                    maxHeight: 120, overflowY: "auto", fontSize: 7, fontFamily: MONO, lineHeight: 1.5,
                  }}>
                    {genOutput.map((line, i) => (
                      <div key={i} style={{ color: line.includes("error") || line.includes("Error") ? C.err : line.includes("complete") ? C.ok : C.t2 }}>
                        {line}
                      </div>
                    ))}
                    {genState === "running" && (
                      <div style={{ color: C.accent }}>
                        <span style={{ animation: "pulse 1s infinite" }}>{"\u25CF"}</span> Running...
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Catalog browsing view
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={panelP}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.t1, marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
          <Box />
          IP Catalog
          <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3, fontWeight: 400 }}>
            {filtered.length} cores
          </span>
        </div>
        <input
          type="text"
          value={ipSearch}
          onChange={(e) => setIpSearch(e.target.value)}
          placeholder="Search IP cores..."
          style={{
            width: "100%", padding: "5px 8px", fontSize: 9, fontFamily: MONO,
            background: C.bg, color: C.t1, border: `1px solid ${C.b1}`, borderRadius: 4,
            outline: "none", marginBottom: 10, boxSizing: "border-box",
          }}
        />
        <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, marginBottom: 8 }}>
          Click "Configure" on any IP to set parameters and generate instantiation code.
        </div>
      </div>
      {grouped.map(([cat, items]) => (
        <div key={cat} style={panelP}>
          <div style={{ fontSize: 9, fontFamily: MONO, fontWeight: 700, color: C.t3, letterSpacing: 1, marginBottom: 8 }}>
            {cat.toUpperCase()}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
            {items.map((ip) => (
              <div
                key={ip.name}
                style={{
                  padding: "8px 10px", background: C.bg, borderRadius: 5,
                  border: `1px solid ${C.b1}`,
                  cursor: ip.params ? "pointer" : "default",
                }}
                onClick={() => { if (ip.params) openConfigurator(ip); }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ fontSize: 10, fontFamily: MONO, fontWeight: 600, color: C.t1, flex: 1 }}>
                    {ip.name}
                  </div>
                  {ip.params && (
                    <span
                      onClick={(e) => { e.stopPropagation(); openConfigurator(ip); }}
                      style={{
                        fontSize: 7, fontFamily: MONO, padding: "2px 6px", borderRadius: 3,
                        background: `${C.accent}15`, color: C.accent, fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      Configure
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, marginTop: 2, lineHeight: 1.4 }}>
                  {ip.description}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
                  {ip.families.map((f) => (
                    <span key={f} style={{
                      fontSize: 6, fontFamily: MONO, padding: "1px 4px", borderRadius: 2,
                      background: `${C.accent}15`, color: C.accent, fontWeight: 600,
                    }}>
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DevicePicker({ backendId, value, onChange, onSelect, onCancel }: {
  backendId: string; value: string;
  onChange: (v: string) => void; onSelect: (part: string) => void; onCancel: () => void;
}) {
  const { C, MONO } = useTheme();
  const [open, setOpen] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const families = DEVICE_MAP[backendId] ?? [];
  const lower = value.toLowerCase();

  // Filter families/parts by search text
  const filteredFamilies = useMemo(() => {
    if (!lower) return families;
    return families
      .map((f) => ({
        ...f,
        parts: f.parts.filter((p) => p.toLowerCase().includes(lower) || f.family.toLowerCase().includes(lower)),
      }))
      .filter((f) => f.parts.length > 0);
  }, [families, lower]);

  const validation = useMemo(() => validatePart(backendId, value), [backendId, value]);

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onCancel]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input
          autoFocus
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) onSelect(validation.match ?? value.trim());
            if (e.key === "Escape") onCancel();
          }}
          placeholder="Search parts..."
          style={{
            fontSize: 9, fontFamily: MONO, background: C.bg, color: C.t1,
            border: `1px solid ${validation.valid ? C.ok : value.length > 3 ? C.warn : C.accent}`,
            borderRadius: 3, padding: "1px 6px", width: 200, outline: "none",
          }}
        />
        {validation.valid && (
          <span style={{ fontSize: 7, color: C.ok, fontFamily: MONO, fontWeight: 600 }}>
            {"\u2713"} {validation.family}
          </span>
        )}
        {!validation.valid && value.length > 3 && (
          <span style={{ fontSize: 7, color: C.warn, fontFamily: MONO }}>
            Unknown part
          </span>
        )}
      </div>
      {open && filteredFamilies.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, marginTop: 2,
          width: 320, maxHeight: 300, overflowY: "auto", background: C.s1,
          border: `1px solid ${C.b1}`, borderRadius: 6, zIndex: 999,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}>
          {filteredFamilies.map((f) => (
            <div key={f.family}>
              <div style={{
                fontSize: 7, fontFamily: MONO, fontWeight: 700, color: C.t3,
                padding: "4px 8px", letterSpacing: 0.5, background: C.bg,
                borderBottom: `1px solid ${C.b1}`,
              }}>
                {f.family.toUpperCase()}
              </div>
              {f.parts.map((p) => (
                <div
                  key={p}
                  onClick={() => { onSelect(p); setOpen(false); }}
                  style={{
                    padding: "3px 10px", fontSize: 8, fontFamily: MONO, color: C.t1,
                    cursor: "pointer", borderBottom: `1px solid ${C.b1}10`,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = C.s3; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  {p}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
  const [buildDone, setBuildDone] = useState(false);
  const [buildFailed, setBuildFailed] = useState(false);
  const [activeStage, setActiveStage] = useState<number | null>(null);
  const [licenseResult, setLicenseResult] = useState<LicenseCheckResult | null>(null);
  const [licenseLoading, setLicenseLoading] = useState(false);
  const [buildStages, setBuildStages] = useState<string[]>([]);
  const [buildOptions, setBuildOptions] = useState<Record<string, string>>({});
  const [sourcesStale, setSourcesStale] = useState(false);
  const [editingDevice, setEditingDevice] = useState(false);
  const [deviceDraft, setDeviceDraft] = useState("");
  const [commitModal, setCommitModal] = useState<"checking" | "prompt" | null>(null);

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

  // Load backends and config on mount; restore project if page was reloaded
  useEffect(() => {
    getRuntimeBackends().then((be) => {
      setBackends(be);
      // Restore project from sessionStorage on reload
      const savedDir = sessionStorage.getItem("coverteda_projectDir");
      if (savedDir && view === "start") {
        openProject(savedDir)
          .then((cfg) => {
            handleOpenProject(savedDir, cfg);
          })
          .catch(() => {
            sessionStorage.removeItem("coverteda_projectDir");
          });
      }
    });
    getAppConfig().then((cfg) => {
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
    sessionStorage.setItem("coverteda_projectDir", dir);
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
    setGitState(null);
    setView("ide");

    // Initialize build stages/options from project config
    setBuildStages(config.buildStages ?? []);
    setBuildOptions(config.buildOptions ?? {});
    setBuildSaveStatus("saved");

    // Load HEAD config for diff comparison
    getProjectConfigAtHead(dir).then(setHeadConfig).catch(() => setHeadConfig(null));

    if (isTauri) {
      // Ensure the Rust backend registers this as the active project
      // (required for start_build to find the project config)
      openProject(dir).catch(() => {});

      // Load git status
      getGitStatus(dir)
        .then((r) => setGitState(mapGitStatus(r)))
        .catch(() => setGitState(null));

      // Load real file tree
      getFileTreeMapped(dir).then((files) => {
        console.log("File tree loaded:", files.length, "entries");
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
            if (reports.timing) setRealTimingReport(reports.timing);
            if (reports.utilization) setRealUtilReport(reports.utilization);
            if (reports.power) setRealPowerReport(reports.power);
            if (reports.drc) setRealDrcReport(reports.drc);
          }).catch((e) => console.warn("[Reports] auto-load failed:", e));
          getIoReport(backendId, dir)
            .then((r) => { if (r) setRealIoReport(mapIoReport(r)); })
            .catch((e) => console.warn("[Reports] io load:", e));
          // Check if sources are newer than build outputs
          checkSourcesStale(dir).then(setSourcesStale).catch(() => {});
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
    if (!isTauri || !dir) return;
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
        // Refresh git status (build may have created new files)
        if (projectDir) {
          getGitStatus(projectDir)
            .then((r) => setGitState(mapGitStatus(r)))
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
    setCommitModal(null);
    if (projectDir && project) {
      const msg = `Pre-build: ${project.name} ${new Date().toISOString().split("T")[0]}`;
      try {
        const hash = await gitCommit(projectDir, msg);
        setLogs((p) => [...p, { t: "info" as const, m: `Committed ${hash}: ${msg}` }]);
        // Refresh git status and HEAD config after commit
        getGitStatus(projectDir)
          .then((r) => setGitState(mapGitStatus(r)))
          .catch(() => {});
        getProjectConfigAtHead(projectDir).then(setHeadConfig).catch(() => {});
      } catch (err) {
        setLogs((p) => [...p, { t: "warn" as const, m: `Git commit failed: ${err}` }]);
      }
    }
    doRunBuild();
  }, [projectDir, project, doRunBuild]);

  const handleBuildWithoutCommit = useCallback(() => {
    setCommitModal(null);
    doRunBuild();
  }, [doRunBuild]);

  const runBuild = useCallback(async () => {
    if (!projectDir) {
      doRunBuild();
      return;
    }
    // Check if working directory is dirty
    setCommitModal("checking");
    try {
      const dirty = await gitIsDirty(projectDir);
      if (dirty) {
        setCommitModal("prompt");
        return;
      }
    } catch {
      // Not a git repo or error — just proceed
    }
    setCommitModal(null);
    doRunBuild();
  }, [projectDir, doRunBuild]);

  const runClean = useCallback(async () => {
    if (!isTauri || !projectDir) return;
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
    getGitStatus(projectDir)
      .then((r) => setGitState(mapGitStatus(r)))
      .catch(() => setGitState(null));
  }, [projectDir]);

  const handleGitCommit = useCallback(async () => {
    if (!projectDir || !project) return;
    const msg = window.prompt("Commit message:", `${project.name}: ${new Date().toISOString().split("T")[0]}`);
    if (!msg) return;
    try {
      const hash = await gitCommit(projectDir, msg);
      setLogs((p) => [...p, { t: "ok" as const, m: `Committed ${hash}: ${msg}` }]);
      // Refresh git status and HEAD config
      getGitStatus(projectDir)
        .then((r) => setGitState(mapGitStatus(r)))
        .catch(() => {});
      getProjectConfigAtHead(projectDir).then(setHeadConfig).catch(() => {});
    } catch (err) {
      setLogs((p) => [...p, { t: "err" as const, m: `Commit failed: ${err}` }]);
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
    setSec((prev) => {
      navHistory.current.push(prev);
      return s;
    });
    setViewingFile(null);
    // Auto-load reports from disk when navigating to Reports tab
    if (s === "reports" && isTauri && projectDir) {
      // Use auto-detection — works regardless of backend ID
      if (!realTimingReport || !realUtilReport || !realPowerReport || !realDrcReport) {
        loadReportsFromDisk(projectDir, B.name);
      }
    }
  }, [projectDir, B.name, realTimingReport, realUtilReport, realPowerReport, realDrcReport, loadReportsFromDisk]);

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
        {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
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
    { label: "IP Catalog", category: "View", desc: "Browse and configure IP cores", action: () => navClick("ip") },
    { label: "Console", category: "View", desc: "Build output log", action: () => navClick("console") },
    { label: "Constraints", category: "View", desc: "Pin assignments", action: () => navClick("constraints") },
    { label: "Build History", category: "View", desc: "Previous builds, trends, Fmax tracking", action: () => navClick("history") },
    { label: "License Status", category: "View", desc: "FlexLM license info", action: () => navClick("license") },
    { label: "AI Assistant", category: "View", desc: "FPGA design help", action: () => navClick("ai") },
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
      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        commands={commands}
      />

      {/* Settings Panel */}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}

      {/* Keyboard Shortcuts */}
      {shortcutsOpen && <KeyboardShortcuts onClose={() => setShortcutsOpen(false)} />}

      {/* Pre-Build Commit Modal */}
      {commitModal === "prompt" && (
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
          onClick={() => setCommitModal(null)}
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
              Uncommitted Changes
            </div>
            <div style={{ fontSize: 9, fontFamily: MONO, color: C.t2, marginBottom: 16, lineHeight: 1.5 }}>
              You have uncommitted changes. Committing before building lets you link
              each build to a specific source state and easily return to it later.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn small onClick={() => setCommitModal(null)}>Cancel</Btn>
              <Btn small onClick={handleBuildWithoutCommit}>Build Without Committing</Btn>
              <Btn small primary onClick={handleCommitAndBuild}>Commit & Build</Btn>
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
            <NavBtn icon={<Doc />} label="Reports" active={sec === "reports"} onClick={() => navClick("reports")} accent={C.cyan} tooltip="Reports — timing, utilization, power, DRC, I/O analysis" />
            <NavBtn icon={<Clock />} label="History" active={sec === "history"} onClick={() => navClick("history")} accent={C.orange} tooltip="Build history — track Fmax trends and past builds" />
            <NavBtn icon={<Box />} label="IP" active={sec === "ip"} onClick={() => navClick("ip")} accent={C.purple} tooltip="IP Catalog — browse, configure, and generate IP cores" />
            <NavBtn icon={<Link />} label="Interc" active={sec === "interconnect"} onClick={() => navClick("interconnect")} accent={C.cyan} tooltip="Interconnect — block-level routing visualization" />
            <NavBtn icon={<Brain />} label="AI" active={sec === "ai"} onClick={() => navClick("ai")} accent={C.pink} tooltip="AI Assistant — get FPGA design help and code analysis" />
            <NavBtn icon={<MapIcon />} label="Regs" active={sec === "regmap"} onClick={() => navClick("regmap")} accent={C.orange} tooltip="Register Map — view and edit register definitions" />
            <NavBtn icon={<Pin />} label="Constr" active={sec === "constraints"} onClick={() => navClick("constraints")} tooltip="Constraint Editor — pin assignments and timing constraints" />
            <NavBtn icon={<Download />} label="Prog" active={sec === "programmer"} onClick={() => navClick("programmer")} accent={C.ok} tooltip="Device Programmer — program FPGA via USB cable" />
            <NavBtn icon={<Term />} label="Log" active={sec === "console"} onClick={() => navClick("console")} tooltip="Console — build output log with search" />
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
            {editingDevice ? (
              <DevicePicker
                backendId={bid}
                value={deviceDraft}
                onChange={setDeviceDraft}
                onSelect={(part) => {
                  if (part && project && projectDir) {
                    const updated = { ...project, device: part };
                    setProject(updated);
                    setEditingDevice(false);
                    saveProject(projectDir, updated).catch(() => {});
                  }
                }}
                onCancel={() => setEditingDevice(false)}
              />
            ) : (
              <span
                onClick={() => {
                  if (project) {
                    setDeviceDraft(project.device);
                    setEditingDevice(true);
                  }
                }}
                style={{
                  color: C.t3,
                  fontSize: 9,
                  fontFamily: MONO,
                  cursor: project ? "pointer" : "default",
                  borderBottom: project ? `1px dashed ${C.t3}40` : "none",
                }}
                title={project ? "Click to change device/part" : undefined}
              >
                {"\u2192"} {project ? project.device : B.defaultDev}
              </span>
            )}
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
            <Btn small onClick={runClean} disabled={building}>
              Clean
            </Btn>
            {building ? (
              <Btn small icon={<Stop />} onClick={runCancel} style={{ background: "#e5534b22", color: "#e5534b", border: "1px solid #e5534b44" }}>
                Cancel
              </Btn>
            ) : (
              <Btn primary small icon={<Play />} onClick={runBuild}>
                Build
              </Btn>
            )}
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
                  buildFailed={buildFailed}
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
                  onMakefileImport={(result) => {
                    if (project) {
                      const updated = { ...project };
                      if (result.device) updated.device = result.device;
                      if (result.topModule) updated.topModule = result.topModule;
                      setProject(updated);
                    }
                  }}
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
                  power: realPowerReport,
                  drc: realDrcReport,
                  io: realIoReport,
                }}
                device={project?.device ?? B.defaultDev}
                projectDir={projectDir}
              />
            )}


            {/* Console */}
            {sec === "console" && !viewingFile && (
              <Console
                logs={logs}
                building={building}
                backendShort={B.short}
                backendColor={B.color}
                backendVersion={B.version}
                live={isTauri && B.available}
                onClear={() => setLogs([])}
              />
            )}

            {/* Constraint Editor */}
            {sec === "constraints" && !viewingFile && (
              <ConstraintEditor
                backendId={bid}
                device={project?.device ?? B.defaultDev}
                constraintFile={constraintFilePath}
              />
            )}

            {/* Device Programmer */}
            {sec === "programmer" && !viewingFile && (
              <Programmer
                device={project?.device ?? B.defaultDev}
                backendId={bid}
              />
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
            )}

            {/* IP Catalog */}
            {sec === "ip" && !viewingFile && <IpCatalogSection backendId={bid} projectDir={projectDir} device={project?.device ?? B.defaultDev}
                  onRefreshFiles={() => { if (projectDir) getFileTreeMapped(projectDir).then(setRealFiles).catch(() => {}); }}
                  onAddToSynth={(ipInstanceName) => {
                    if (!projectDir) return;
                    // Refresh file tree, then mark IP files matching instance name as synth-included
                    getFileTreeMapped(projectDir).then((files) => {
                      const lower = ipInstanceName.toLowerCase();
                      setRealFiles(files.map((f) => {
                        if (f.ty === "folder" || f.ty === "config" || f.ty === "output") return f;
                        const nameL = f.n.toLowerCase();
                        // Match files whose name contains the instance name, or are inside an ip_cores dir
                        const isIpFile = nameL.includes(lower) ||
                          (f.path?.toLowerCase().includes("ip_cores") && (nameL.endsWith(".v") || nameL.endsWith(".sv") || nameL.endsWith(".vhd") || nameL.endsWith(".vhdl")));
                        return isIpFile ? { ...f, synth: true, ty: "ip" as const } : f;
                      }));
                    }).catch(() => {});
                  }}
                />}

            {/* Interconnect */}
            {sec === "interconnect" && !viewingFile && (
              <div style={panelP}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.t1, marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
                  <Link />
                  Interconnect View
                </div>
                <div style={{ color: C.t3, fontSize: 10, fontFamily: MONO }}>
                  Run a build to generate interconnect data. Block-level routing visualization will appear here.
                </div>
              </div>
            )}

            {/* AI Assistant */}
            {sec === "ai" && !viewingFile && (
              <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                <AiAssistant
                  projectContext={project ? `Project: ${project.name}, Backend: ${B.name}, Device: ${project.device}, Top: ${project.topModule}` : undefined}
                />
              </div>
            )}

            {/* Build History */}
            {sec === "history" && !viewingFile && <BuildHistory projectDir={projectDir} onViewReport={() => { setSec("reports"); }} />}


            {/* Documentation */}
            {sec === "docs" && !viewingFile && <Documentation />}

            {/* Register Map */}
            {sec === "regmap" && !viewingFile && (
              <div style={panelP}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.t1, marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
                  <MapIcon />
                  Register Map
                </div>
                <div style={{ color: C.t3, fontSize: 10, fontFamily: MONO }}>
                  No register map defined. Add a register description file (.rdl, .json) to your project.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
