import { useState, useMemo, useCallback } from "react";
import { TimingReportData } from "../types";
import { useTheme } from "../context/ThemeContext";
import { Badge, Btn } from "./shared";

// ── Root cause classification ──

type RootCause = "logic_depth" | "high_fanout" | "routing_congestion" | "dsp_bram_path" | "unknown";

interface AnalyzedPath {
  rank: number;
  from: string;
  to: string;
  slack: number;
  required: number;
  delay: number;
  levels: number;
  clk: string;
  type: string;
  logicDelay: number;
  routeDelay: number;
  routePct: number;
  rootCause: RootCause;
  suggestion: string;
}

function classifyPath(p: { from: string; to: string; delay: number; levels: number }): { rootCause: RootCause; logicDelay: number; routeDelay: number; routePct: number; suggestion: string } {
  const logicDelay = p.levels * 0.4;
  const routeDelay = Math.max(p.delay - logicDelay, 0);
  const routePct = p.delay > 0 ? (routeDelay / p.delay) * 100 : 0;

  const isDspBram = /dsp|bram|ram|mem|mult/i.test(p.from) || /dsp|bram|ram|mem|mult/i.test(p.to);
  if (isDspBram) return { rootCause: "dsp_bram_path", logicDelay, routeDelay, routePct, suggestion: "Enable internal pipeline registers on DSP/BRAM primitives to reduce path delay." };
  if (p.levels > 4) return { rootCause: "logic_depth", logicDelay, routeDelay, routePct, suggestion: "Pipeline the combinational logic — insert register stages to reduce logic depth below 4 levels." };
  if (routePct > 75) return { rootCause: "routing_congestion", logicDelay, routeDelay, routePct, suggestion: "Routing dominates this path. Try floorplanning source/dest modules closer, or reduce utilization in the region." };
  if (routePct > 60 && p.levels <= 2) return { rootCause: "high_fanout", logicDelay, routeDelay, routePct, suggestion: "Low logic depth but high route delay suggests fanout. Add MAX_FANOUT constraint or enable register replication." };
  return { rootCause: "unknown", logicDelay, routeDelay, routePct, suggestion: "Review path constraints and placement. Try a different implementation strategy or seed." };
}

const ROOT_CAUSE_LABELS: Record<RootCause, { label: string; color: (C: ReturnType<typeof useTheme>["C"]) => string }> = {
  logic_depth: { label: "Logic Depth", color: (C) => C.purple },
  high_fanout: { label: "High Fanout", color: (C) => C.orange },
  routing_congestion: { label: "Routing", color: (C) => C.err },
  dsp_bram_path: { label: "DSP/BRAM", color: (C) => C.cyan },
  unknown: { label: "Review", color: (C) => C.t3 },
};

// ── Inline SVG: Delay Bar ──

function DelayBar({ logicDelay, routeDelay, required, C }: {
  logicDelay: number; routeDelay: number; required: number;
  C: ReturnType<typeof useTheme>["C"];
}) {
  const total = logicDelay + routeDelay;
  const maxVal = Math.max(total, required, 0.01);
  const logicW = (logicDelay / maxVal) * 100;
  const routeW = (routeDelay / maxVal) * 100;
  const reqW = (required / maxVal) * 100;

  return (
    <div style={{ position: "relative", height: 20, width: "100%" }}>
      {/* Requirement line */}
      <div style={{
        position: "absolute", left: `${reqW}%`, top: 0, bottom: 0,
        width: 2, background: C.t3, opacity: 0.5, zIndex: 1,
      }} />
      <div style={{
        position: "absolute", left: `${reqW}%`, top: -2,
        fontSize: 6, color: C.t3, transform: "translateX(-50%)",
      }}>
        req
      </div>
      {/* Bars */}
      <div style={{ display: "flex", height: "100%", borderRadius: 3, overflow: "hidden", marginTop: 6 }}>
        <div style={{ width: `${logicW}%`, background: "#6366f1", minWidth: logicW > 0 ? 2 : 0 }}
          title={`Logic: ${logicDelay.toFixed(2)} ns`} />
        <div style={{ width: `${routeW}%`, background: "#f59e0b", minWidth: routeW > 0 ? 2 : 0 }}
          title={`Route: ${routeDelay.toFixed(2)} ns`} />
        <div style={{ flex: 1, background: C.b1, opacity: 0.3 }} />
      </div>
    </div>
  );
}

// ── Inline SVG: Slack Gauge ──

function SlackGauge({ slack, required, C }: { slack: number; required: number; C: ReturnType<typeof useTheme>["C"] }) {
  const margin = required > 0 ? ((required + slack) / required) * 100 : 100;
  const color = slack >= 0 ? (margin > 110 ? C.ok : C.warn) : C.err;
  const r = 16, cx = 20, cy = 18, strokeW = 4;
  const arcLen = Math.PI * r;
  const filled = (Math.min(Math.max(margin, 0), 150) / 150) * arcLen;

  return (
    <svg width="40" height="24" viewBox="0 0 40 24">
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke={C.b1} strokeWidth={strokeW} strokeLinecap="round" />
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="round"
        strokeDasharray={`${filled} ${arcLen}`} />
    </svg>
  );
}

// ── Path Card ──

function PathCard({ path, C, MONO, onAskAi }: {
  path: AnalyzedPath;
  C: ReturnType<typeof useTheme>["C"];
  MONO: string;
  onAskAi: (path: AnalyzedPath) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const rcInfo = ROOT_CAUSE_LABELS[path.rootCause];
  const rcColor = rcInfo.color(C);
  const slackColor = path.slack >= 0 ? (path.slack > 0.5 ? C.ok : C.warn) : C.err;

  return (
    <div style={{
      background: C.s1, borderRadius: 6, border: `1px solid ${C.b1}`,
      borderLeft: `3px solid ${slackColor}`, overflow: "hidden",
    }}>
      <div
        onClick={() => setExpanded((p) => !p)}
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
          cursor: "pointer", userSelect: "none",
        }}
      >
        <span style={{
          fontSize: 10, fontWeight: 700, color: C.bg,
          background: slackColor, borderRadius: 3, padding: "1px 6px",
          fontFamily: MONO, minWidth: 22, textAlign: "center",
        }}>
          #{path.rank}
        </span>
        <SlackGauge slack={path.slack} required={path.required} C={C} />
        <span style={{ fontSize: 10, fontFamily: MONO, fontWeight: 700, color: slackColor }}>
          {path.slack >= 0 ? "+" : ""}{path.slack.toFixed(3)} ns
        </span>
        <Badge color={rcColor}>{rcInfo.label}</Badge>
        <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>
          {path.levels} levels
        </span>
        <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3, opacity: 0.6 }}>
          {path.type}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>
          {path.clk}
        </span>
        <span style={{ fontSize: 8, color: C.t3 }}>{expanded ? "\u25BC" : "\u25B6"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "0 12px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
          {/* From/To */}
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 8px", fontSize: 9, fontFamily: MONO }}>
            <span style={{ color: C.t3, fontWeight: 600 }}>FROM</span>
            <span style={{ color: C.t1, wordBreak: "break-all" }}>{path.from}</span>
            <span style={{ color: C.t3, fontWeight: 600 }}>TO</span>
            <span style={{ color: C.t1, wordBreak: "break-all" }}>{path.to}</span>
          </div>

          {/* Delay bar */}
          <div>
            <div style={{ display: "flex", gap: 12, fontSize: 8, fontFamily: MONO, color: C.t3, marginBottom: 4 }}>
              <span>Logic: <span style={{ color: "#6366f1" }}>{path.logicDelay.toFixed(2)} ns</span></span>
              <span>Route: <span style={{ color: "#f59e0b" }}>{path.routeDelay.toFixed(2)} ns</span></span>
              <span>Total: <span style={{ color: C.t1 }}>{path.delay.toFixed(2)} ns</span></span>
              <span>Route: <span style={{ color: path.routePct > 70 ? C.warn : C.t2 }}>{path.routePct.toFixed(0)}%</span></span>
            </div>
            <DelayBar logicDelay={path.logicDelay} routeDelay={path.routeDelay} required={path.required} C={C} />
          </div>

          {/* Suggestion */}
          <div style={{
            padding: "6px 10px", borderRadius: 4,
            background: `${rcColor}08`, border: `1px solid ${rcColor}20`,
            fontSize: 9, color: C.t2, lineHeight: 1.6,
          }}>
            <span style={{ fontWeight: 700, color: rcColor, fontSize: 8 }}>SUGGESTION: </span>
            {path.suggestion}
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            <Btn small onClick={() => onAskAi(path)}>Ask AI</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Clock Domain Matrix ──

function ClockDomainMatrix({ clocks, criticalPaths, C, MONO }: {
  clocks: TimingReportData["clocks"];
  criticalPaths: AnalyzedPath[];
  C: ReturnType<typeof useTheme>["C"];
  MONO: string;
}) {
  const clockNames = clocks.map((c) => c.name);
  if (clockNames.length === 0) return null;

  // Build matrix: clock → clock → worst slack
  const matrix: Record<string, Record<string, number | null>> = {};
  for (const cn of clockNames) {
    matrix[cn] = {};
    for (const cn2 of clockNames) matrix[cn][cn2] = null;
  }
  for (const p of criticalPaths) {
    if (p.clk && matrix[p.clk]) {
      const existing = matrix[p.clk][p.clk];
      if (existing === null || p.slack < existing) {
        matrix[p.clk][p.clk] = p.slack;
      }
    }
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 8, fontFamily: MONO }}>
        <thead>
          <tr>
            <th style={{ padding: "4px 8px", color: C.t3, textAlign: "left" }}>Src \ Dst</th>
            {clockNames.map((n) => (
              <th key={n} style={{ padding: "4px 8px", color: C.t3, fontWeight: 600, textAlign: "center" }}>
                {n.length > 12 ? n.slice(0, 12) + "..." : n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {clockNames.map((src) => (
            <tr key={src}>
              <td style={{ padding: "4px 8px", color: C.t2, fontWeight: 600 }}>
                {src.length > 12 ? src.slice(0, 12) + "..." : src}
              </td>
              {clockNames.map((dst) => {
                const val = matrix[src]?.[dst];
                const color = val === null ? C.b1 : val >= 0 ? C.ok : C.err;
                return (
                  <td key={dst} style={{
                    padding: "4px 8px", textAlign: "center",
                    background: val !== null ? `${color}15` : "transparent",
                    color: val !== null ? color : C.t3,
                    borderRadius: 2,
                  }}>
                    {val !== null ? `${val >= 0 ? "+" : ""}${val.toFixed(2)}` : "-"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Guided Closure Wizard ──

function GuidedClosureWizard({ C, MONO, timing }: {
  C: ReturnType<typeof useTheme>["C"];
  MONO: string;
  timing: TimingReportData;
}) {
  const [expanded, setExpanded] = useState(false);
  const wns = parseFloat(timing.summary.wns) || 0;

  const steps = useMemo(() => {
    const s = [];
    // Step 1: Constraint audit
    const unconstrainedCount = timing.unconstrained.length;
    const clockCount = timing.clocks.length;
    s.push({
      title: "Constraint Audit",
      desc: clockCount === 0
        ? "No constrained clocks detected. Define clock constraints before analyzing timing."
        : unconstrainedCount > 0
        ? `${unconstrainedCount} unconstrained path(s) found. Add constraints to cover all paths.`
        : `${clockCount} clock domain(s) constrained. Constraint coverage looks good.`,
      status: clockCount === 0 ? "warn" as const : unconstrainedCount > 0 ? "warn" as const : "ok" as const,
    });
    // Step 2: Top failing paths
    s.push({
      title: "Analyze Top Failing Paths",
      desc: timing.summary.failingPaths > 0
        ? `${timing.summary.failingPaths} failing path(s). Review the critical path cards above for root cause analysis.`
        : "No failing paths. All timing constraints met.",
      status: timing.summary.failingPaths > 0 ? "err" as const : "ok" as const,
    });
    // Step 3: Quick wins
    s.push({
      title: "Quick Wins — Strategy & Seed Sweep",
      desc: wns < 0 && wns > -0.5
        ? "WNS is close to meeting. Try seed sweep (10-20 seeds) or Performance_Explore strategy."
        : wns < -0.5
        ? "WNS is significantly negative. Strategy changes alone may not be enough — but try Performance_Explore first."
        : "Timing met. Consider strategy sweep to increase margin.",
      status: wns >= 0 ? "ok" as const : wns > -0.5 ? "warn" as const : "err" as const,
    });
    // Step 4: RTL fixes
    s.push({
      title: "RTL Fixes — Pipeline & Replicate",
      desc: "If quick wins are insufficient: pipeline deep combinational paths, replicate high-fanout registers, add output registers to DSP/BRAM.",
      status: "info" as const,
    });
    // Step 5: Placement constraints
    s.push({
      title: "Placement Constraints — Last Resort",
      desc: "Floorplan timing-critical modules to adjacent regions. Create pblocks or LOC constraints for extreme cases.",
      status: "info" as const,
    });
    return s;
  }, [timing, wns]);

  const statusColor: Record<string, string> = { ok: C.ok, warn: C.warn, err: C.err, info: C.accent };

  return (
    <div style={{
      background: C.s1, borderRadius: 6, border: `1px solid ${C.b1}`, overflow: "hidden",
    }}>
      <div
        onClick={() => setExpanded((p) => !p)}
        style={{
          display: "flex", alignItems: "center", gap: 6, padding: "8px 12px",
          cursor: "pointer", userSelect: "none",
        }}
      >
        <span style={{ fontSize: 8, color: C.t3 }}>{expanded ? "\u25BC" : "\u25B6"}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.t1 }}>Guided Timing Closure</span>
        <Badge color={C.accent}>5 steps</Badge>
      </div>
      {expanded && (
        <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
          {steps.map((step, i) => (
            <div key={i} style={{
              display: "flex", gap: 8, padding: "6px 10px", borderRadius: 4,
              background: `${statusColor[step.status]}06`,
              border: `1px solid ${statusColor[step.status]}20`,
              borderLeft: `3px solid ${statusColor[step.status]}`,
            }}>
              <span style={{
                fontSize: 9, fontWeight: 700, color: statusColor[step.status],
                fontFamily: MONO, minWidth: 16,
              }}>
                {i + 1}.
              </span>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.t1, marginBottom: 2 }}>{step.title}</div>
                <div style={{ fontSize: 9, color: C.t2, lineHeight: 1.5 }}>{step.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──

interface TimingAnalyzerProps {
  timing: TimingReportData | null;
}

export default function TimingAnalyzer({ timing }: TimingAnalyzerProps) {
  const { C, MONO } = useTheme();

  const analyzedPaths = useMemo(() => {
    if (!timing) return [];
    return timing.criticalPaths.map((p) => {
      const delay = parseFloat(p.delay) || 0;
      const slack = parseFloat(p.slack) || 0;
      const required = parseFloat(p.req) || 0;
      const analysis = classifyPath({ from: p.from, to: p.to, delay, levels: p.levels });
      return {
        rank: p.rank,
        from: p.from,
        to: p.to,
        slack,
        required,
        delay,
        levels: p.levels,
        clk: p.clk,
        type: p.type,
        ...analysis,
      } as AnalyzedPath;
    });
  }, [timing]);

  const nearViolationCount = useMemo(() => {
    return analyzedPaths.filter((p) => p.slack >= 0 && p.slack < 0.5).length;
  }, [analyzedPaths]);

  const handleAskAi = useCallback((path: AnalyzedPath) => {
    const prompt = `Analyze this FPGA timing path and suggest fixes:\n\nPath #${path.rank}: ${path.from} -> ${path.to}\nSlack: ${path.slack.toFixed(3)} ns\nDelay: ${path.delay.toFixed(3)} ns (Logic: ${path.logicDelay.toFixed(2)} ns, Route: ${path.routeDelay.toFixed(2)} ns)\nLogic Levels: ${path.levels}\nRoute %: ${path.routePct.toFixed(0)}%\nRoot Cause: ${path.rootCause}\nClock: ${path.clk}\n\nWhat RTL changes, constraint changes, or tool settings would improve this path?`;
    navigator.clipboard.writeText(prompt);
  }, []);

  if (!timing) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100%", color: C.t3, fontSize: 11, fontFamily: MONO,
      }}>
        No timing data available. Run a build first.
      </div>
    );
  }

  const t = timing;
  const wns = parseFloat(t.summary.wns) || 0;
  const fmax = parseFloat(t.summary.fmax) || 0;
  const target = parseFloat(t.summary.target) || 0;
  const met = t.summary.status === "MET";
  const worstPath = analyzedPaths[0];

  // Fmax gauge arc
  const pct = target > 0 ? Math.min((fmax / target) * 100, 150) : 100;
  const gaugeColor = pct >= 100 ? C.ok : pct >= 80 ? C.warn : C.err;
  const r = 50, cx = 60, cy = 55, strokeW = 10;
  const arcLen = Math.PI * r;
  const filled = (Math.min(pct, 100) / 100) * arcLen;

  const panel: React.CSSProperties = {
    background: C.s1, borderRadius: 7, border: `1px solid ${C.b1}`, padding: "12px 14px",
  };

  const metricCard = (label: string, value: string, color: string, sub?: string): React.ReactNode => (
    <div style={{
      flex: 1, padding: "8px 10px", borderRadius: 5,
      background: `${color}08`, border: `1px solid ${color}20`,
      textAlign: "center", minWidth: 80,
    }}>
      <div style={{ fontSize: 7, fontFamily: MONO, fontWeight: 600, color: C.t3, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color, fontFamily: MONO }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 7, fontFamily: MONO, color: C.t3, marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 12,
      overflowY: "auto", overflowX: "hidden", flex: 1,
      scrollbarWidth: "thin", scrollbarColor: `${C.b2} transparent`,
      padding: "2px 0",
    }}>
      {/* ════════════════ HERO DASHBOARD ════════════════ */}
      <div style={{
        ...panel,
        background: met
          ? `linear-gradient(135deg, ${C.s1}, ${C.ok}08)`
          : `linear-gradient(135deg, ${C.s1}, ${C.err}08)`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          {/* Status badge */}
          <div style={{
            padding: "8px 16px", borderRadius: 6,
            background: met ? `${C.ok}15` : `${C.err}15`,
            border: `2px solid ${met ? C.ok : C.err}`,
          }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: met ? C.ok : C.err, fontFamily: MONO }}>
              {met ? "TIMING MET" : "TIMING VIOLATED"}
            </div>
          </div>

          {/* Fmax gauge */}
          <div style={{ textAlign: "center" }}>
            <svg width="120" height="70" viewBox="0 0 120 70">
              <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                fill="none" stroke={C.b1} strokeWidth={strokeW} strokeLinecap="round" />
              <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                fill="none" stroke={gaugeColor} strokeWidth={strokeW} strokeLinecap="round"
                strokeDasharray={`${filled} ${arcLen}`} />
              <text x={cx} y={cy - 10} textAnchor="middle" fill={gaugeColor}
                style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO }}>
                {fmax.toFixed(1)}
              </text>
              <text x={cx} y={cy + 4} textAnchor="middle" fill={C.t3}
                style={{ fontSize: 8, fontFamily: MONO }}>
                MHz ({Math.round(pct)}% of target)
              </text>
            </svg>
          </div>

          <div style={{ flex: 1 }} />

          {/* Near-violation warning */}
          {nearViolationCount > 0 && (
            <div style={{
              padding: "4px 10px", borderRadius: 4,
              background: `${C.warn}10`, border: `1px solid ${C.warn}30`,
              fontSize: 9, fontFamily: MONO, color: C.warn,
            }}>
              {nearViolationCount} path{nearViolationCount > 1 ? "s" : ""} within 0.5ns of violation
            </div>
          )}
        </div>

        {/* Metric cards row */}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {metricCard("WNS", t.summary.wns, wns >= 0 ? C.ok : C.err)}
          {metricCard("TNS", t.summary.tns, parseFloat(t.summary.tns) === 0 ? C.ok : C.err)}
          {metricCard("WHS", t.summary.whs, parseFloat(t.summary.whs) >= 0 ? C.ok : C.err)}
          {metricCard("THS", t.summary.ths, parseFloat(t.summary.ths) === 0 ? C.ok : C.err)}
          {metricCard("Failing", String(t.summary.failingPaths), t.summary.failingPaths === 0 ? C.ok : C.err, `of ${t.summary.totalPaths}`)}
        </div>

        {/* Worst path summary */}
        {worstPath && (
          <div style={{
            display: "flex", gap: 12, marginTop: 10, padding: "6px 10px",
            borderRadius: 4, background: C.bg, fontSize: 8, fontFamily: MONO, color: C.t3,
            flexWrap: "wrap",
          }}>
            <span>Worst path: <span style={{ color: C.t1 }}>{worstPath.from.slice(-30)}</span> → <span style={{ color: C.t1 }}>{worstPath.to.slice(-30)}</span></span>
            <span>Route: <span style={{ color: worstPath.routePct > 70 ? C.warn : C.t2 }}>{worstPath.routePct.toFixed(0)}%</span></span>
            <span>Levels: <span style={{ color: C.t2 }}>{worstPath.levels}</span></span>
          </div>
        )}
      </div>

      {/* ════════════════ CRITICAL PATH CARDS ════════════════ */}
      {analyzedPaths.length > 0 && (
        <div style={panel}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.t1, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
            Critical Paths
            <Badge color={C.accent}>{analyzedPaths.length}</Badge>
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", gap: 6, fontSize: 7, fontFamily: MONO }}>
              <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#6366f1", verticalAlign: "middle" }} /> Logic</span>
              <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#f59e0b", verticalAlign: "middle" }} /> Route</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {analyzedPaths.map((p) => (
              <PathCard key={p.rank} path={p} C={C} MONO={MONO} onAskAi={handleAskAi} />
            ))}
          </div>
        </div>
      )}

      {/* ════════════════ CLOCK DOMAIN MATRIX ════════════════ */}
      {t.clocks.length > 0 && (
        <div style={panel}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.t1, marginBottom: 8 }}>
            Clock Domain Interactions
          </div>
          <ClockDomainMatrix clocks={t.clocks} criticalPaths={analyzedPaths} C={C} MONO={MONO} />
        </div>
      )}

      {/* ════════════════ CONSTRAINT COVERAGE ════════════════ */}
      <div style={panel}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.t1, marginBottom: 8 }}>
          Constraint Coverage
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 9, fontFamily: MONO, color: C.t2, flexWrap: "wrap" }}>
          <span>Total paths: <span style={{ color: C.t1, fontWeight: 700 }}>{t.summary.totalPaths}</span></span>
          <span>Constrained clocks: <span style={{ color: C.t1, fontWeight: 700 }}>{t.clocks.length}</span></span>
          <span>Unconstrained: <span style={{ color: t.unconstrained.length > 0 ? C.warn : C.ok, fontWeight: 700 }}>{t.unconstrained.length}</span></span>
        </div>
        {/* Coverage bar */}
        <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", marginTop: 6, background: C.b1 }}>
          <div style={{
            width: t.summary.totalPaths > 0
              ? `${((t.summary.totalPaths - t.unconstrained.length) / t.summary.totalPaths) * 100}%`
              : "100%",
            background: C.ok, borderRadius: 3,
          }} />
        </div>
        {t.unconstrained.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
            {t.unconstrained.map((u, i) => (
              <div key={i} style={{
                fontSize: 8, fontFamily: MONO, color: C.warn,
                padding: "2px 6px", borderRadius: 3, background: `${C.warn}08`,
              }}>
                {u}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ════════════════ GUIDED CLOSURE WIZARD ════════════════ */}
      <GuidedClosureWizard C={C} MONO={MONO} timing={t} />
    </div>
  );
}
