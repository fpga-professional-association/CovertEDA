import { useState, useCallback, useEffect, useMemo, ReactNode } from "react";
import {
  ReportTab,
  TimingReportData,
  UtilizationReportData,
  PowerReportData,
  DrcReportData,
  IoBankData,
} from "../types";
import { useTheme } from "../context/ThemeContext";
import { Badge, Btn } from "./shared";
import { Clock, Warn, Arrow, Gauge, Bolt, Pin, Download } from "./Icons";
import { getRawReport } from "../hooks/useTauri";

// ── Inline SVG Visualizations (no external chart libs) ──

/** Arc gauge showing Fmax as % of target — green ≥100%, amber 80-100%, red <80% */
function FmaxGauge({ fmax, target, C }: { fmax: string; target: string; C: ReturnType<typeof useTheme>["C"] }) {
  const fmaxVal = parseFloat(fmax) || 0;
  const targetVal = parseFloat(target) || 1;
  const pct = Math.min((fmaxVal / targetVal) * 100, 150);
  const color = pct >= 100 ? C.ok : pct >= 80 ? C.warn : C.err;

  // SVG arc: 180-degree semicircle
  const r = 40, cx = 50, cy = 48, strokeW = 8;
  const arcLen = Math.PI * r; // half circumference
  const filled = (Math.min(pct, 100) / 100) * arcLen;

  return (
    <svg width="100" height="60" viewBox="0 0 100 60" style={{ display: "block", margin: "0 auto" }}>
      {/* Background arc */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke={C.b1} strokeWidth={strokeW} strokeLinecap="round"
      />
      {/* Filled arc */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="round"
        strokeDasharray={`${filled} ${arcLen}`}
      />
      {/* Center value */}
      <text x={cx} y={cy - 8} textAnchor="middle" fill={color}
        style={{ fontSize: 14, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>
        {Math.round(pct)}%
      </text>
      <text x={cx} y={cy + 4} textAnchor="middle" fill={C.t3}
        style={{ fontSize: 7, fontFamily: "'IBM Plex Mono', monospace" }}>
        of target
      </text>
    </svg>
  );
}

/** Donut chart for power breakdown — inline SVG with segments */
function PowerDonut({ breakdown, total, C }: {
  breakdown: { cat: string; mw: number; pct: number; color: string }[];
  total: string;
  C: ReturnType<typeof useTheme>["C"];
}) {
  const r = 36, strokeW = 14, cx = 50, cy = 50;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <svg width="100" height="100" viewBox="0 0 100 100" style={{ display: "block", margin: "0 auto" }}>
      {/* Background ring */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.b1} strokeWidth={strokeW} />
      {/* Segments */}
      {breakdown.map((b, i) => {
        const segLen = (b.pct / 100) * circumference;
        const dashOffset = -offset;
        offset += segLen;
        return (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={b.color} strokeWidth={strokeW}
            strokeDasharray={`${segLen} ${circumference - segLen}`}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        );
      })}
      {/* Center text */}
      <text x={cx} y={cy - 2} textAnchor="middle" fill={C.t1}
        style={{ fontSize: 12, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>
        {total}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill={C.t3}
        style={{ fontSize: 7, fontFamily: "'IBM Plex Mono', monospace" }}>
        total
      </text>
    </svg>
  );
}

// ── Props ──
interface ReportViewerProps {
  rptTab: ReportTab;
  setRptTab: (tab: ReportTab) => void;
  reports: {
    timing: TimingReportData | null;
    utilization: UtilizationReportData | null;
    power: PowerReportData | null;
    drc: DrcReportData | null;
    io: { title: string; generated: string; banks: IoBankData[] } | null;
  };
  device: string;
  projectDir: string;
}

function NoData({ label }: { label: string }) {
  const { C, MONO } = useTheme();
  return (
    <div style={{ background: C.s1, borderRadius: 7, border: `1px solid ${C.b1}`, padding: 14 }}>
      <div style={{ color: C.t3, fontSize: 10, fontFamily: MONO, padding: 20, textAlign: "center" }}>
        No {label} data available. Run a build to generate reports.
      </div>
    </div>
  );
}

/** Collapsible section wrapper */
function Collapsible({ title, icon, defaultOpen = false, children }: {
  title: ReactNode; icon?: ReactNode; defaultOpen?: boolean; children: ReactNode;
}) {
  const { C } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: C.s1, borderRadius: 7, border: `1px solid ${C.b1}`, overflow: "hidden" }}>
      <div
        onClick={() => setOpen((p) => !p)}
        style={{
          display: "flex", alignItems: "center", gap: 5, padding: "10px 14px",
          cursor: "pointer", userSelect: "none",
        }}
      >
        <span style={{ fontSize: 8, color: C.t3 }}>{open ? "\u25BC" : "\u25B6"}</span>
        {icon}
        <span style={{ fontSize: 11, fontWeight: 700, color: C.t1 }}>{title}</span>
      </div>
      {open && <div style={{ padding: "0 14px 14px", maxHeight: 400, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: `${C.b2} transparent` }}>{children}</div>}
    </div>
  );
}

/** Raw log drawer — collapsible, lazy-loads content on expand */
function RawLogDrawer({ projectDir, reportType }: { projectDir: string; reportType: string }) {
  const { C, MONO } = useTheme();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleOpen = useCallback(() => {
    if (!open && content === null) {
      setLoading(true);
      getRawReport(projectDir, reportType)
        .then(setContent)
        .catch((e) => setContent(`Error loading report: ${e}`))
        .finally(() => setLoading(false));
    }
    setOpen((p) => !p);
  }, [open, content, projectDir, reportType]);

  return (
    <div style={{
      background: C.s1, borderRadius: 6, border: `1px solid ${C.b1}`, overflow: "hidden",
    }}>
      <div
        onClick={handleOpen}
        style={{
          display: "flex", alignItems: "center", gap: 5, padding: "8px 12px",
          cursor: "pointer", userSelect: "none",
        }}
      >
        <span style={{ fontSize: 8, color: C.t3 }}>{open ? "\u25BC" : "\u25B6"}</span>
        <span style={{ fontSize: 9, fontFamily: MONO, fontWeight: 600, color: C.t3 }}>
          Raw Log
        </span>
      </div>
      {open && (
        <div style={{
          overflowY: "auto", overflowX: "hidden",
          maxHeight: "60vh",
          padding: "0 12px 12px",
          scrollbarWidth: "thin",
          scrollbarColor: `${C.b2} ${C.bg}`,
        }}>
          {loading ? (
            <div style={{ color: C.t3, fontSize: 9, fontFamily: MONO }}>Loading...</div>
          ) : (
            <pre style={{
              fontSize: 9, fontFamily: MONO, color: C.t2, lineHeight: 1.6,
              margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all",
            }}>
              {content ?? "No content."}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

/** Stage log panel with filter buttons, counts, and AI send */
function StageLogPanel({ projectDir, reportType }: { projectDir: string; reportType: string }) {
  const { C, MONO } = useTheme();
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "error" | "warning" | "info">("all");

  useEffect(() => {
    setLoading(true);
    setContent(null);
    getRawReport(projectDir, reportType)
      .then(setContent)
      .catch((e) => setContent(`Error loading report: ${e}`))
      .finally(() => setLoading(false));
  }, [projectDir, reportType]);

  const filteredLines = useMemo(() => {
    if (!content || filter === "all") return content;
    const lines = content.split("\n");
    return lines.filter((line) => {
      const lower = line.toLowerCase();
      if (filter === "error") return lower.includes("error") || lower.includes("fatal") || lower.includes("fail");
      if (filter === "warning") return lower.includes("warning") || lower.includes("warn");
      if (filter === "info") return lower.includes("info") || lower.includes("note");
      return true;
    }).join("\n");
  }, [content, filter]);

  const counts = useMemo(() => {
    if (!content) return { errors: 0, warnings: 0, info: 0 };
    const lines = content.split("\n");
    return {
      errors: lines.filter((l) => { const ll = l.toLowerCase(); return ll.includes("error") || ll.includes("fatal") || ll.includes("fail"); }).length,
      warnings: lines.filter((l) => { const ll = l.toLowerCase(); return ll.includes("warning") || ll.includes("warn"); }).length,
      info: lines.filter((l) => { const ll = l.toLowerCase(); return ll.includes("info") || ll.includes("note"); }).length,
    };
  }, [content]);

  const stageNames: Record<string, string> = {
    synth: "Synthesis Report", map: "Map Report", par: "Place & Route Report", bitstream: "Bitstream Report",
  };

  const panel: React.CSSProperties = {
    background: C.s1, borderRadius: 7, border: `1px solid ${C.b1}`, overflow: "hidden",
  };

  return (
    <div style={{ ...panel, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{
        padding: "10px 14px", borderBottom: `1px solid ${C.b1}`,
        display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap",
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.t1 }}>
          {stageNames[reportType] ?? reportType}
        </span>
        <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>
          Raw vendor output from impl1/
        </span>
        <div style={{ flex: 1 }} />
        {/* Filter buttons */}
        {content && (
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {([
              { id: "all", label: "All", color: C.t2, count: null },
              { id: "error", label: "Errors", color: C.err, count: counts.errors },
              { id: "warning", label: "Warnings", color: C.warn, count: counts.warnings },
              { id: "info", label: "Info", color: C.accent, count: counts.info },
            ] as const).map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                style={{
                  padding: "2px 8px", borderRadius: 3, fontSize: 8, fontFamily: MONO, fontWeight: 600,
                  border: filter === f.id ? `1px solid ${f.color}` : `1px solid ${C.b1}`,
                  background: filter === f.id ? `${f.color}18` : "transparent",
                  color: filter === f.id ? f.color : C.t3,
                  cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 3,
                }}
              >
                {f.label}
                {f.count !== null && f.count > 0 && (
                  <span style={{
                    fontSize: 7, padding: "0 3px", borderRadius: 2,
                    background: `${f.color}25`, color: f.color,
                  }}>
                    {f.count}
                  </span>
                )}
              </button>
            ))}
            <button
              onClick={() => {
                if (content) {
                  navigator.clipboard.writeText(
                    `Please analyze this ${stageNames[reportType] ?? reportType} from an FPGA build:\n\n${content}`
                  );
                }
              }}
              title="Copy report to clipboard for AI analysis"
              style={{
                padding: "2px 8px", borderRadius: 3, fontSize: 8, fontFamily: MONO, fontWeight: 600,
                border: `1px solid ${C.pink}40`, background: `${C.pink}10`, color: C.pink,
                cursor: "pointer", marginLeft: 4,
              }}
            >
              Send to AI
            </button>
          </div>
        )}
      </div>
      <div style={{
        flex: 1, overflowY: "auto", overflowX: "hidden",
        scrollbarWidth: "thin", scrollbarColor: `${C.b2} ${C.bg}`,
      }}>
        {loading ? (
          <div style={{ color: C.t3, fontSize: 9, fontFamily: MONO, padding: 20, textAlign: "center" }}>Loading report...</div>
        ) : !content || content.startsWith("Error") ? (
          <div style={{ color: C.t3, fontSize: 9, fontFamily: MONO, padding: 20, textAlign: "center" }}>
            {content || "No report file found."}
          </div>
        ) : (
          <pre style={{
            fontSize: 9, fontFamily: MONO, color: C.t2, lineHeight: 1.6,
            margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all",
            padding: "12px 14px",
          }}>
            {filteredLines}
          </pre>
        )}
      </div>
    </div>
  );
}

export default function ReportViewer({
  rptTab,
  setRptTab,
  reports,
  projectDir,
}: ReportViewerProps) {
  const { C, MONO } = useTheme();
  const REPORTS = reports;
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const exportReport = useCallback((format: "csv" | "json") => {
    let content = "";
    let filename = "";

    if (rptTab === "timing" && REPORTS.timing) {
      const t = REPORTS.timing;
      if (format === "json") {
        content = JSON.stringify(t, null, 2);
        filename = "timing_report.json";
      } else {
        const rows = [
          ["Metric", "Value"],
          ["Fmax", t.summary.fmax],
          ["Target", t.summary.target],
          ["WNS", t.summary.wns],
          ["TNS", t.summary.tns],
          ["WHS", t.summary.whs],
          ["THS", t.summary.ths],
          ["Failing Paths", String(t.summary.failingPaths)],
          ["Total Paths", String(t.summary.totalPaths)],
          ["Clocks", String(t.summary.clocks)],
          ...t.clocks.map((c) => [`Clock: ${c.name}`, `${c.freq} (${c.wns})`]),
          ...t.criticalPaths.map((p) => [`Path: ${p.from} → ${p.to}`, `${p.slack} (${p.levels} levels)`]),
        ];
        content = rows.map((r) => r.join(",")).join("\n");
        filename = "timing_report.csv";
      }
    } else if (rptTab === "util" && REPORTS.utilization) {
      const u = REPORTS.utilization;
      if (format === "json") {
        content = JSON.stringify(u, null, 2);
        filename = "utilization_report.json";
      } else {
        const rows = [
          ["Category", "Resource", "Used", "Total", "Percentage"],
          ...u.summary.flatMap((cat) =>
            cat.items.map((i) => [cat.cat, i.r, String(i.used), String(i.total), i.detail])
          ),
        ];
        content = rows.map((r) => r.join(",")).join("\n");
        filename = "utilization_report.csv";
      }
    } else if (rptTab === "power" && REPORTS.power) {
      if (format === "json") {
        content = JSON.stringify(REPORTS.power, null, 2);
        filename = "power_report.json";
      } else {
        const rows = [
          ["Category", "mW", "%"],
          ...REPORTS.power.breakdown.map((b) => [b.cat, String(b.mw), String(b.pct)]),
        ];
        content = rows.map((r) => r.join(",")).join("\n");
        filename = "power_report.csv";
      }
    } else if (rptTab === "drc" && REPORTS.drc) {
      if (format === "json") {
        content = JSON.stringify(REPORTS.drc, null, 2);
        filename = "drc_report.json";
      } else {
        const rows = [
          ["Severity", "Code", "Message", "Location", "Action"],
          ...REPORTS.drc.items.map((d) => [d.sev, d.code, d.msg, d.loc, d.action]),
        ];
        content = rows.map((r) => r.join(",")).join("\n");
        filename = "drc_report.csv";
      }
    } else {
      return;
    }

    const blob = new Blob([content], { type: format === "json" ? "application/json" : "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setExportMsg(`Exported ${filename}`);
    setTimeout(() => setExportMsg(null), 2000);
  }, [rptTab, REPORTS]);

  const panel: React.CSSProperties = {
    background: C.s1,
    borderRadius: 7,
    border: `1px solid ${C.b1}`,
    overflow: "hidden",
  };
  const panelP: React.CSSProperties = { ...panel, padding: 14 };

  function hdr(t: ReactNode, icon: ReactNode) {
    return (
      <div
        style={{
          fontSize: 11, fontWeight: 700, color: C.t1, marginBottom: 10,
          display: "flex", alignItems: "center", gap: 5,
        }}
      >
        {icon}
        {t}
      </div>
    );
  }

  // Check for constraint issues
  const hasUnconstrainedClocks = REPORTS.timing && REPORTS.timing.clocks.length === 0 && REPORTS.timing.summary.totalPaths > 0;
  const hasTimingFailures = REPORTS.timing && REPORTS.timing.summary.failingPaths > 0;

  // ── Tab definitions: analysis + stage logs ──
  const analysisTabs: { id: ReportTab; l: string; c?: string }[] = [
    {
      id: "timing", l: "\u23F1 Timing",
      c: REPORTS.timing
        ? (REPORTS.timing.summary.failingPaths > 0 ? C.err : C.ok)
        : undefined,
    },
    { id: "util", l: "\uD83D\uDCCA Utilization" },
    { id: "power", l: "\u26A1 Power" },
    {
      id: "drc", l: "\u26A0 DRC",
      c: REPORTS.drc
        ? (REPORTS.drc.summary.critWarns > 0 ? C.warn : C.ok)
        : undefined,
    },
    { id: "io", l: "\uD83D\uDCCC I/O" },
  ];

  const stageTabs: { id: ReportTab; l: string }[] = [
    { id: "synth", l: "Synth" },
    { id: "map", l: "Map" },
    { id: "par", l: "P&R" },
    { id: "bitstream", l: "Bitstream" },
  ];

  // Determine if export is available for current tab
  const canExport = (rptTab === "timing" && !!REPORTS.timing) ||
    (rptTab === "util" && !!REPORTS.utilization) ||
    (rptTab === "power" && !!REPORTS.power) ||
    (rptTab === "drc" && !!REPORTS.drc);

  return (
    <div
      style={{
        display: "flex", flexDirection: "column", gap: 12,
        height: "100%", overflow: "hidden",
      }}
    >
      {/* ── Tab bar ── */}
      <div
        style={{
          display: "flex", gap: 1, background: C.s1, borderRadius: 7,
          border: `1px solid ${C.b1}`, padding: 3, flexWrap: "wrap", flexShrink: 0,
        }}
      >
        {analysisTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setRptTab(t.id)}
            style={{
              flex: 1, padding: "7px 0",
              background: rptTab === t.id ? C.accentDim : "transparent",
              border: "none", borderRadius: 4,
              color: rptTab === t.id ? C.t1 : C.t3,
              fontSize: 10, fontFamily: "'Outfit', sans-serif", fontWeight: 600,
              cursor: "pointer", transition: "all .1s",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            }}
          >
            {t.l}
            {t.c && <span style={{ width: 5, height: 5, borderRadius: 3, background: t.c }} />}
          </button>
        ))}
        <span style={{ width: 1, background: C.b1, margin: "4px 2px", flexShrink: 0 }} />
        {stageTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setRptTab(t.id)}
            style={{
              padding: "7px 10px",
              background: rptTab === t.id ? C.accentDim : "transparent",
              border: "none", borderRadius: 4,
              color: rptTab === t.id ? C.t1 : C.t3,
              fontSize: 9, fontFamily: MONO, fontWeight: 600,
              cursor: "pointer", transition: "all .1s",
            }}
          >
            {t.l}
          </button>
        ))}
        {/* Export buttons — always visible */}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {exportMsg && (
            <span style={{ fontSize: 7, fontFamily: MONO, color: C.ok, fontWeight: 600 }}>{exportMsg}</span>
          )}
          <Btn small onClick={() => exportReport("csv")} disabled={!canExport}><Download /> CSV</Btn>
          <Btn small onClick={() => exportReport("json")} disabled={!canExport}><Download /> JSON</Btn>
        </div>
      </div>

      {/* ── Constraint warnings banner ── */}
      {(rptTab === "timing" || rptTab === "par") && (hasUnconstrainedClocks || hasTimingFailures) && (
        <div style={{
          background: hasTimingFailures ? C.errDim : C.warnDim,
          borderRadius: 6,
          border: `1px solid ${hasTimingFailures ? `${C.err}40` : `${C.warn}40`}`,
          padding: "8px 14px",
          display: "flex", alignItems: "center", gap: 8,
          flexShrink: 0,
        }}>
          <Warn />
          <div style={{ fontSize: 10, fontFamily: MONO, flex: 1 }}>
            {hasUnconstrainedClocks && (
              <div style={{ color: C.warn, fontWeight: 700 }}>
                {"\u26A0"} No clock constraints detected. All clocks may be unconstrained. Add an SDC/PDC file with create_clock commands.
              </div>
            )}
            {hasTimingFailures && (
              <div style={{ color: C.err, fontWeight: 700 }}>
                {"\u2717"} Timing FAILED: {REPORTS.timing!.summary.failingPaths} path(s) with negative slack (WNS: {REPORTS.timing!.summary.wns})
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Scrollable content area ── */}
      <div style={{
        flex: 1, overflowY: "auto", overflowX: "hidden",
        display: "flex", flexDirection: "column", gap: 12,
        scrollbarWidth: "thin", scrollbarColor: `${C.b2} ${C.bg}`,
      }}>

        {/* ════════════════ TIMING REPORT ════════════════ */}
        {rptTab === "timing" && !REPORTS.timing && <NoData label="timing" />}
        {rptTab === "timing" && REPORTS.timing && (() => {
          const t = REPORTS.timing!;
          return (
            <>
              {/* Hero card */}
              <div style={{
                background: `linear-gradient(135deg, ${C.s1}, ${t.summary.failingPaths === 0 ? C.okDim : C.errDim})`,
                borderRadius: 8, border: `1px solid ${t.summary.failingPaths === 0 ? `${C.ok}30` : `${C.err}30`}`,
                padding: 18,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <Clock />
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.t1 }}>Timing Analysis</span>
                  <Badge color={t.summary.failingPaths === 0 ? C.ok : C.err} style={{ fontSize: 10, padding: "3px 10px" }}>
                    {t.summary.status}
                  </Badge>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>
                    {t.generated} {"\u2014"} {t.tool}
                  </span>
                </div>

                {/* Fmax gauge + 4 metric cards */}
                <div style={{ display: "grid", gridTemplateColumns: "110px repeat(4, 1fr)", gap: 10, alignItems: "center" }}>
                  <div style={{ padding: 6, background: C.bg, borderRadius: 6, border: `1px solid ${C.b1}`, textAlign: "center" }}>
                    <FmaxGauge fmax={t.summary.fmax} target={t.summary.target} C={C} />
                  </div>
                  {[
                    { l: "Fmax Achieved", v: t.summary.fmax, c: C.ok },
                    { l: "Target", v: t.summary.target, c: C.t2 },
                    { l: "Margin", v: t.summary.margin, c: C.ok },
                    { l: "Failing Paths", v: `${t.summary.failingPaths} / ${t.summary.totalPaths}`, c: t.summary.failingPaths > 0 ? C.err : C.ok },
                  ].map((m, i) => (
                    <div key={i} style={{ padding: 10, background: C.bg, borderRadius: 6, border: `1px solid ${C.b1}` }}>
                      <div style={{ fontSize: 8, fontFamily: MONO, fontWeight: 600, color: C.t3, marginBottom: 4, letterSpacing: 0.8 }}>{m.l}</div>
                      <div style={{ fontSize: 16, fontFamily: MONO, fontWeight: 700, color: m.c }}>{m.v}</div>
                    </div>
                  ))}
                </div>

                {/* 4 slack cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 10 }}>
                  {[
                    { l: "WNS (Setup)", v: t.summary.wns },
                    { l: "TNS", v: t.summary.tns },
                    { l: "WHS (Hold)", v: t.summary.whs },
                    { l: "THS", v: t.summary.ths },
                  ].map((m, i) => (
                    <div key={i} style={{ padding: 8, background: C.bg, borderRadius: 5, border: `1px solid ${C.b1}`, fontSize: 10, fontFamily: MONO }}>
                      <span style={{ color: C.t3 }}>{m.l}: </span>
                      <span style={{ color: parseFloat(m.v) >= 0 ? C.ok : C.err, fontWeight: 700 }}>{m.v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Clock Domains */}
              <Collapsible title={<>Clock Domains <Badge color={t.clocks.length === 0 ? C.warn : C.t3}>{t.clocks.length === 0 ? "unconstrained" : `${t.clocks.length} clock(s)`}</Badge></>} icon={<Clock />} defaultOpen={t.clocks.length === 0}>
                {t.clocks.length === 0 ? (
                  <div style={{ fontSize: 10, fontFamily: MONO }}>
                    <div style={{ color: C.warn, marginBottom: 8 }}>
                      {"\u26A0"} No constrained clocks found. Add SDC/PDC constraints (create_clock) for accurate timing analysis.
                    </div>
                    {t.summary.fmax && parseFloat(t.summary.fmax) > 0 && (
                      <div style={{ padding: "10px 12px", background: C.bg, borderRadius: 6, border: `1px solid ${C.b1}`, display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ color: C.t3 }}>Tool-inferred Fmax:</span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: C.ok }}>{t.summary.fmax}</span>
                        {t.summary.target && parseFloat(t.summary.target) > 0 && (
                          <span style={{ color: C.t3 }}>target: {t.summary.target}</span>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 1fr 60px 60px", gap: 6, padding: "5px 8px", fontSize: 8, fontFamily: MONO, fontWeight: 700, color: C.t3, letterSpacing: 0.8, borderBottom: `1px solid ${C.b1}` }}>
                      <span>CLOCK</span><span>PERIOD</span><span>FREQUENCY</span><span>SOURCE</span><span>WNS</span><span>PATHS</span>
                    </div>
                    {t.clocks.map((ck, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 1fr 60px 60px", gap: 6, padding: "7px 8px", fontSize: 10, fontFamily: MONO, borderBottom: `1px solid ${C.b1}` }}>
                        <span style={{ color: C.cyan, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ck.name}</span>
                        <span style={{ color: C.t2 }}>{ck.period}</span>
                        <span style={{ color: C.t1, fontWeight: 600 }}>{ck.freq}</span>
                        <span style={{ color: C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ck.source}</span>
                        <span style={{ color: parseFloat(ck.wns) >= 0 ? C.ok : C.err, fontWeight: 600 }}>{ck.wns}</span>
                        <span style={{ color: C.t3 }}>{ck.paths}</span>
                      </div>
                    ))}
                  </>
                )}
              </Collapsible>

              {/* Critical Paths */}
              <Collapsible title={<>Critical Paths {"\u2014"} Setup <Badge color={C.t3}>{t.criticalPaths.length} shown</Badge></>} icon={<Warn />} defaultOpen={false}>
                {t.criticalPaths.map((p, i) => (
                  <div key={i} style={{ padding: "10px 12px", marginBottom: 6, background: C.bg, borderRadius: 6, border: `1px solid ${C.b1}`, borderLeft: `3px solid ${parseFloat(p.slack) < 1 ? C.warn : C.ok}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <span style={{ fontSize: 10, fontFamily: MONO, fontWeight: 700, color: C.t3, width: 20 }}>#{p.rank}</span>
                      <span style={{ fontSize: 10, fontFamily: MONO, color: C.cyan, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.from}</span>
                      <Arrow />
                      <span style={{ fontSize: 10, fontFamily: MONO, color: C.cyan, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.to}</span>
                    </div>
                    <div style={{ display: "flex", gap: 10, fontSize: 9, fontFamily: MONO, flexWrap: "wrap" }}>
                      <span><span style={{ color: C.t3 }}>Slack: </span><span style={{ color: parseFloat(p.slack) < 0 ? C.err : parseFloat(p.slack) < 1 ? C.warn : C.ok, fontWeight: 700 }}>{p.slack}</span></span>
                      <span><span style={{ color: C.t3 }}>Req: </span><span style={{ color: C.t2 }}>{p.req}</span></span>
                      <span><span style={{ color: C.t3 }}>Delay: </span><span style={{ color: C.t2 }}>{p.delay}</span></span>
                      <span><span style={{ color: C.t3 }}>Levels: </span><span style={{ color: C.t2 }}>{p.levels}</span></span>
                      <span><span style={{ color: C.t3 }}>Clock: </span><span style={{ color: C.cyan }}>{p.clk}</span></span>
                    </div>
                    <div style={{ marginTop: 6, height: 3, borderRadius: 2, background: C.b1, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 2, width: `${Math.min(100, (parseFloat(p.delay) / Math.max(0.01, parseFloat(p.req))) * 100)}%`, background: `linear-gradient(90deg, ${C.accent}, ${parseFloat(p.slack) < 0 ? C.err : parseFloat(p.slack) < 1 ? C.warn : C.ok})` }} />
                    </div>
                  </div>
                ))}
              </Collapsible>

              {/* Hold Analysis */}
              {t.holdPaths.length > 0 && (
                <Collapsible title="Hold Analysis (worst paths)" defaultOpen={false}>
                  {t.holdPaths.map((p, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", fontSize: 10, fontFamily: MONO, borderBottom: `1px solid ${C.b1}` }}>
                      <span style={{ color: C.t3 }}>#{p.rank}</span>
                      <span style={{ color: C.cyan, flex: 1 }}>{p.from} {"\u2192"} {p.to}</span>
                      <Badge color={parseFloat(p.slack) < 0.1 ? C.warn : C.ok}>{p.slack}</Badge>
                    </div>
                  ))}
                </Collapsible>
              )}

              {/* Unconstrained Paths */}
              {t.unconstrained.length > 0 && (
                <div style={{ ...panelP, borderLeft: `3px solid ${C.warn}` }}>
                  {hdr("Unconstrained Paths", <Warn />)}
                  {t.unconstrained.map((u, i) => (
                    <div key={i} style={{ fontSize: 10, fontFamily: MONO, color: C.warn, padding: "4px 0" }}>{u}</div>
                  ))}
                </div>
              )}

              <RawLogDrawer projectDir={projectDir} reportType="timing" />
            </>
          );
        })()}

        {/* ════════════════ UTILIZATION REPORT ════════════════ */}
        {rptTab === "util" && !REPORTS.utilization && <NoData label="utilization" />}
        {rptTab === "util" && REPORTS.utilization && (() => {
          const u = REPORTS.utilization!;
          return (
            <>
              <div style={{ ...panelP, background: `linear-gradient(135deg, ${C.s1}, ${C.accentDim})`, maxHeight: 500, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: `${C.b2} transparent` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, position: "sticky", top: -14, background: "inherit", zIndex: 1, paddingTop: 2, paddingBottom: 4 }}>
                  <Gauge />
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.t1 }}>Resource Utilization</span>
                  <Badge color={C.accent}>{u.device}</Badge>
                </div>
                {u.summary.map((cat, ci) => (
                  <div key={ci} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 9, fontFamily: MONO, fontWeight: 700, color: C.t3, letterSpacing: 1, marginBottom: 6 }}>
                      {cat.cat.toUpperCase()}
                    </div>
                    {cat.items.map((r, ri) => {
                      const pct = r.total > 0 ? Math.round((r.used / r.total) * 100) : 0;
                      const col = pct > 85 ? C.err : pct > 65 ? C.warn : C.accent;
                      return (
                        <div key={ri} style={{ marginBottom: 8 }} title={`${r.r}: ${r.used.toLocaleString()} used of ${r.total.toLocaleString()} available (${pct}%). ${r.detail || ""}`}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, fontFamily: MONO, marginBottom: 3 }}>
                            <span style={{ color: C.t1, fontWeight: 600 }}>{r.r}</span>
                            <span style={{ color: col, fontWeight: 600 }}>{r.used.toLocaleString()} / {r.total.toLocaleString()} ({pct}%)</span>
                          </div>
                          <div style={{ height: 6, borderRadius: 3, background: C.b1, overflow: "hidden", marginBottom: 2 }}>
                            <div style={{ height: "100%", borderRadius: 3, width: `${pct}%`, background: `linear-gradient(90deg,${col}88,${col})` }} />
                          </div>
                          {r.detail && <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>{r.detail}</div>}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Both panels side by side at bottom */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Collapsible title="Utilization by Module" defaultOpen={false}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 70px 60px 40px 50px", gap: 6, padding: "5px 8px", fontSize: 8, fontFamily: MONO, fontWeight: 700, color: C.t3, borderBottom: `1px solid ${C.b1}` }}>
                    <span>MODULE</span><span>SHARE</span><span>LUT</span><span>FF</span><span>EBR</span><span>%</span>
                  </div>
                  {u.byModule.map((m, i) => {
                    const pct = parseFloat(m.pct);
                    return (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 2fr 70px 60px 40px 50px", gap: 6, padding: "7px 8px", fontSize: 10, fontFamily: MONO, borderBottom: `1px solid ${C.b1}`, alignItems: "center" }}>
                        <span style={{ color: C.cyan, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.module}</span>
                        <div style={{ height: 4, borderRadius: 2, background: C.b1, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: C.accent, borderRadius: 2 }} />
                        </div>
                        <span style={{ color: C.t2 }}>{m.lut.toLocaleString()}</span>
                        <span style={{ color: C.t3 }}>{m.ff.toLocaleString()}</span>
                        <span style={{ color: C.t3 }}>{m.ebr}</span>
                        <span style={{ color: C.t1, fontWeight: 600 }}>{m.pct}</span>
                      </div>
                    );
                  })}
                </Collapsible>
                <RawLogDrawer projectDir={projectDir} reportType="map" />
              </div>
            </>
          );
        })()}

        {/* ════════════════ POWER REPORT ════════════════ */}
        {rptTab === "power" && !REPORTS.power && <NoData label="power" />}
        {rptTab === "power" && REPORTS.power && (() => {
          const pw = REPORTS.power!;
          return (
            <>
              <div style={{ ...panelP, background: `linear-gradient(135deg, ${C.s1}, ${C.warnDim})`, maxHeight: 500, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: `${C.b2} transparent` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Bolt />
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.t1 }}>Power Estimation</span>
                  <Badge color={C.warn}>{pw.confidence}</Badge>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
                  {[
                    { l: "Total Power", v: pw.total, c: C.warn },
                    { l: "Junction Temp", v: pw.junction, c: C.t1 },
                    { l: "Ambient", v: pw.ambient, c: C.t2 },
                    { l: "\u0398_JA", v: pw.theta_ja, c: C.t3 },
                  ].map((m, i) => (
                    <div key={i} style={{ padding: 10, background: C.bg, borderRadius: 6, border: `1px solid ${C.b1}` }}>
                      <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, marginBottom: 3 }}>{m.l}</div>
                      <div style={{ fontSize: 16, fontFamily: MONO, fontWeight: 700, color: m.c }}>{m.v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  {/* Donut chart */}
                  <div style={{ flexShrink: 0 }}>
                    <PowerDonut breakdown={pw.breakdown} total={pw.total} C={C} />
                  </div>
                  {/* Stacked bar + legend */}
                  <div style={{ flex: 1 }}>
                    <div style={{ height: 24, borderRadius: 6, overflow: "hidden", display: "flex", marginBottom: 10 }}>
                      {pw.breakdown.map((b, i) => (
                        <div key={i} style={{ width: `${b.pct}%`, background: b.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontFamily: MONO, color: "#fff", fontWeight: 700 }}>
                          {b.pct > 8 ? `${b.pct}%` : ""}
                        </div>
                      ))}
                    </div>
                    {pw.breakdown.map((b, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px solid ${C.b1}`, fontSize: 10, fontFamily: MONO }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: b.color, flexShrink: 0 }} />
                        <span style={{ color: C.t1, flex: 1 }}>{b.cat}</span>
                        <span style={{ color: b.color, fontWeight: 700 }}>{b.mw} mW</span>
                        <span style={{ color: C.t3, width: 35, textAlign: "right" }}>{b.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Both panels side by side at bottom */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Collapsible title="Power by Rail" defaultOpen={false}>
                  {pw.byRail.map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.b1}`, fontSize: 10, fontFamily: MONO }}>
                      <span style={{ color: C.t1, flex: 1 }}>{r.rail}</span>
                      <span style={{ color: C.warn, fontWeight: 600 }}>{r.mw} mW</span>
                    </div>
                  ))}
                </Collapsible>
                <RawLogDrawer projectDir={projectDir} reportType="power" />
              </div>
            </>
          );
        })()}

        {/* ════════════════ DRC REPORT ════════════════ */}
        {rptTab === "drc" && !REPORTS.drc && <NoData label="DRC" />}
        {rptTab === "drc" && REPORTS.drc && (() => {
          const d = REPORTS.drc!;
          return (
            <>
              {/* Summary cards panel */}
              <div style={{ ...panelP, background: `linear-gradient(135deg, ${C.s1}, ${C.accentDim})`, maxHeight: 500, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: `${C.b2} transparent` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Warn />
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.t1 }}>Design Rule Checks</span>
                  <Badge color={d.summary.errors > 0 ? C.err : d.summary.critWarns > 0 ? C.warn : C.ok}>
                    {d.summary.errors > 0 ? "FAIL" : d.summary.critWarns > 0 ? "WARNINGS" : "PASS"}
                  </Badge>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  {[
                    { l: "Errors", v: d.summary.errors, c: C.err },
                    { l: "Critical Warnings", v: d.summary.critWarns, c: C.warn },
                    { l: "Warnings", v: d.summary.warnings, c: C.orange },
                    { l: "Info", v: d.summary.info, c: C.accent },
                    { l: "Waived", v: d.summary.waived, c: C.t3 },
                  ].map((m, i) => (
                    <div key={i} style={{ flex: 1, padding: 10, background: C.bg, borderRadius: 6, border: `1px solid ${C.b1}`, borderTop: `3px solid ${m.c}`, textAlign: "center" }}>
                      <div style={{ fontSize: 22, fontFamily: MONO, fontWeight: 700, color: m.v > 0 ? m.c : C.t3 }}>{m.v}</div>
                      <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, marginTop: 2 }}>{m.l}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* DRC items list */}
              <Collapsible title={<>DRC Items <Badge color={C.t3}>{d.items.length} item(s)</Badge></>} icon={<Warn />} defaultOpen={d.items.length > 0}>
                {d.items.map((item, i) => {
                  const sevColors: Record<string, string> = { crit_warn: C.warn, warning: C.orange, info: C.accent, waived: C.t3 };
                  const sevLabels: Record<string, string> = { crit_warn: "CRIT", warning: "WARN", info: "INFO", waived: "WAIVED" };
                  return (
                    <div key={i} style={{ padding: "10px 12px", marginBottom: 6, background: C.bg, borderRadius: 6, border: `1px solid ${C.b1}`, borderLeft: `3px solid ${sevColors[item.sev] || C.t3}`, display: "flex", gap: 10 }}>
                      <Badge color={sevColors[item.sev] || C.t3} style={{ flexShrink: 0, alignSelf: "flex-start" }}>
                        {sevLabels[item.sev] || item.sev}
                      </Badge>
                      <div style={{ flex: 1, fontSize: 10, fontFamily: MONO }}>
                        <div style={{ color: C.t1, fontWeight: 600, marginBottom: 3 }}>
                          <span style={{ color: sevColors[item.sev] || C.t3 }}>[{item.code}]</span> {item.msg}
                        </div>
                        <div style={{ display: "flex", gap: 12, color: C.t3, fontSize: 9 }}>
                          {item.loc !== "\u2014" && <span>{"\uD83D\uDCCD"} {item.loc}</span>}
                          <span>{"\u2192"} {item.action}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </Collapsible>
            </>
          );
        })()}

        {/* ════════════════ I/O BANKING REPORT ════════════════ */}
        {rptTab === "io" && !REPORTS.io && <NoData label="I/O banking" />}
        {rptTab === "io" && REPORTS.io && REPORTS.utilization && (() => {
          const io = REPORTS.io!;
          return (
            <div style={{ ...panelP, maxHeight: 600, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: `${C.b2} transparent` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, position: "sticky", top: -14, background: C.s1, zIndex: 1, paddingTop: 2, paddingBottom: 4 }}>
                <Pin />
                <span style={{ fontSize: 14, fontWeight: 700, color: C.t1 }}>I/O Pin Assignments</span>
                <Badge color={C.accent}>{REPORTS.utilization!.device}</Badge>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                {io.banks.map((bk, i) => {
                  const pct = bk.total > 0 ? Math.round((bk.used / bk.total) * 100) : 0;
                  return (
                    <div key={i} style={{ padding: 12, background: C.bg, borderRadius: 6, border: `1px solid ${C.b1}`, borderTop: `3px solid ${pct > 80 ? C.warn : C.accent}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontFamily: MONO, fontWeight: 700, color: C.t1 }}>Bank {bk.id}</span>
                        <Badge color={C.cyan}>{bk.vccio}</Badge>
                      </div>
                      <div style={{ fontSize: 10, fontFamily: MONO, color: C.t3, marginBottom: 4 }}>{bk.used}/{bk.total} pins ({pct}%)</div>
                      <div style={{ height: 4, borderRadius: 2, background: C.b1, overflow: "hidden", marginBottom: 8 }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: pct > 80 ? C.warn : C.accent, borderRadius: 2 }} />
                      </div>
                      {bk.pins.map((p, pi) => {
                        const [pin, net, dir] = p.split(" ");
                        const dirColors: Record<string, string> = { IN: C.accent, OUT: C.ok, BIDIR: C.purple };
                        return (
                          <div key={pi} style={{ fontSize: 9, fontFamily: MONO, padding: "2px 0", display: "flex", gap: 4 }}>
                            <span style={{ color: C.cyan, width: 28, flexShrink: 0 }}>{pin}</span>
                            <span style={{ color: C.t1, flex: 1 }}>{net}</span>
                            <span style={{ color: dirColors[dir] || C.t3, fontSize: 8 }}>{dir}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ════════════════ STAGE LOG TABS ════════════════ */}
        {(rptTab === "synth" || rptTab === "map" || rptTab === "par" || rptTab === "bitstream") && (
          <StageLogPanel projectDir={projectDir} reportType={rptTab} />
        )}
      </div>
    </div>
  );
}
