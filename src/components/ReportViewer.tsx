import { useState, useCallback, ReactNode } from "react";
import {
  ReportTab,
  TimingReportData,
  UtilizationReportData,
  PowerReportData,
  DrcReportData,
  IoBankData,
} from "../types";
import { useTheme } from "../context/ThemeContext";
import { Badge } from "./shared";
import { Clock, Warn, Arrow, Gauge, Bolt, Pin } from "./Icons";
import { getRawReport } from "../hooks/useTauri";

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
  const panelP: React.CSSProperties = {
    background: C.s1,
    borderRadius: 7,
    border: `1px solid ${C.b1}`,
    overflow: "hidden",
    padding: 14,
  };
  return (
    <div style={panelP}>
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
    <div style={{
      background: C.s1, borderRadius: 7, border: `1px solid ${C.b1}`, overflow: "hidden",
    }}>
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
      {open && <div style={{ padding: "0 14px 14px" }}>{children}</div>}
    </div>
  );
}

/** Raw log drawer — lazy-loads content on expand */
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
      marginTop: 12, background: C.bg, borderRadius: 6, border: `1px solid ${C.b1}`,
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
        <div style={{ maxHeight: 400, overflowY: "auto", padding: "0 12px 12px" }}>
          {loading ? (
            <div style={{ color: C.t3, fontSize: 9, fontFamily: MONO }}>Loading...</div>
          ) : (
            <pre style={{
              fontSize: 8, fontFamily: MONO, color: C.t2, lineHeight: 1.5,
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

export default function ReportViewer({
  rptTab,
  setRptTab,
  reports,
  projectDir,
}: ReportViewerProps) {
  const { C, MONO } = useTheme();
  const REPORTS = reports;

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

  return (
    <div
      style={{
        display: "flex", flexDirection: "column", gap: 12,
        height: "calc(100vh - 120px)",
      }}
    >
      {/* ── Tab bar ── */}
      <div
        style={{
          display: "flex", gap: 1, background: C.s1, borderRadius: 7,
          border: `1px solid ${C.b1}`, padding: 3, flexWrap: "wrap",
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
      </div>

      {/* ════════════════ TIMING REPORT ════════════════ */}
      {rptTab === "timing" && !REPORTS.timing && <NoData label="timing" />}
      {rptTab === "timing" && REPORTS.timing && (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Hero card */}
          <div style={{
            background: `linear-gradient(135deg, ${C.s1}, ${REPORTS.timing.summary.failingPaths === 0 ? C.okDim : C.errDim})`,
            borderRadius: 8, border: `1px solid ${REPORTS.timing.summary.failingPaths === 0 ? `${C.ok}30` : `${C.err}30`}`,
            padding: 18,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <Clock />
              <span style={{ fontSize: 14, fontWeight: 700, color: C.t1 }}>Timing Analysis</span>
              <Badge color={REPORTS.timing.summary.failingPaths === 0 ? C.ok : C.err} style={{ fontSize: 10, padding: "3px 10px" }}>
                {REPORTS.timing.summary.status}
              </Badge>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>
                {REPORTS.timing.generated} &mdash; {REPORTS.timing.tool}
              </span>
            </div>

            {/* 4 metric cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {[
                { l: "Fmax Achieved", v: REPORTS.timing.summary.fmax, c: C.ok },
                { l: "Target", v: REPORTS.timing.summary.target, c: C.t2 },
                { l: "Margin", v: REPORTS.timing.summary.margin, c: C.ok },
                { l: "Failing Paths", v: `${REPORTS.timing.summary.failingPaths} / ${REPORTS.timing.summary.totalPaths}`, c: REPORTS.timing.summary.failingPaths > 0 ? C.err : C.ok },
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
                { l: "WNS (Setup)", v: REPORTS.timing.summary.wns },
                { l: "TNS", v: REPORTS.timing.summary.tns },
                { l: "WHS (Hold)", v: REPORTS.timing.summary.whs },
                { l: "THS", v: REPORTS.timing.summary.ths },
              ].map((m, i) => (
                <div key={i} style={{ padding: 8, background: C.bg, borderRadius: 5, border: `1px solid ${C.b1}`, fontSize: 10, fontFamily: MONO }}>
                  <span style={{ color: C.t3 }}>{m.l}: </span>
                  <span style={{ color: parseFloat(m.v) >= 0 ? C.ok : C.err, fontWeight: 700 }}>{m.v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Clock Domains */}
          <Collapsible title="Clock Domains" icon={<Clock />} defaultOpen={false}>
            <div style={{ display: "grid", gridTemplateColumns: "140px 90px 80px 120px 60px 60px", gap: 6, padding: "5px 8px", fontSize: 8, fontFamily: MONO, fontWeight: 700, color: C.t3, letterSpacing: 0.8, borderBottom: `1px solid ${C.b1}` }}>
              <span>CLOCK</span><span>PERIOD</span><span>FREQUENCY</span><span>SOURCE</span><span>WNS</span><span>PATHS</span>
            </div>
            {REPORTS.timing.clocks.map((ck, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "140px 90px 80px 120px 60px 60px", gap: 6, padding: "7px 8px", fontSize: 10, fontFamily: MONO, borderBottom: `1px solid ${C.b1}` }}>
                <span style={{ color: C.cyan, fontWeight: 600 }}>{ck.name}</span>
                <span style={{ color: C.t2 }}>{ck.period}</span>
                <span style={{ color: C.t1, fontWeight: 600 }}>{ck.freq}</span>
                <span style={{ color: C.t3 }}>{ck.source}</span>
                <span style={{ color: C.ok, fontWeight: 600 }}>{ck.wns}</span>
                <span style={{ color: C.t3 }}>{ck.paths}</span>
              </div>
            ))}
          </Collapsible>

          {/* Critical Paths */}
          <Collapsible title={<>Critical Paths &mdash; Setup <Badge color={C.t3}>{REPORTS.timing.criticalPaths.length} shown</Badge></>} icon={<Warn />} defaultOpen={false}>
            {REPORTS.timing.criticalPaths.map((p, i) => (
              <div key={i} style={{ padding: "10px 12px", marginBottom: 6, background: C.bg, borderRadius: 6, border: `1px solid ${C.b1}`, borderLeft: `3px solid ${parseFloat(p.slack) < 1 ? C.warn : C.ok}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                  <span style={{ fontSize: 10, fontFamily: MONO, fontWeight: 700, color: C.t3, width: 20 }}>#{p.rank}</span>
                  <span style={{ fontSize: 10, fontFamily: MONO, color: C.cyan, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.from}</span>
                  <Arrow />
                  <span style={{ fontSize: 10, fontFamily: MONO, color: C.cyan, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.to}</span>
                </div>
                <div style={{ display: "flex", gap: 10, fontSize: 9, fontFamily: MONO }}>
                  <span><span style={{ color: C.t3 }}>Slack: </span><span style={{ color: parseFloat(p.slack) < 1 ? C.warn : C.ok, fontWeight: 700 }}>{p.slack}</span></span>
                  <span><span style={{ color: C.t3 }}>Req: </span><span style={{ color: C.t2 }}>{p.req}</span></span>
                  <span><span style={{ color: C.t3 }}>Delay: </span><span style={{ color: C.t2 }}>{p.delay}</span></span>
                  <span><span style={{ color: C.t3 }}>Levels: </span><span style={{ color: C.t2 }}>{p.levels}</span></span>
                  <span><span style={{ color: C.t3 }}>Clock: </span><span style={{ color: C.cyan }}>{p.clk}</span></span>
                </div>
                <div style={{ marginTop: 6, height: 3, borderRadius: 2, background: C.b1, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 2, width: `${(parseFloat(p.delay) / parseFloat(p.req)) * 100}%`, background: `linear-gradient(90deg, ${C.accent}, ${parseFloat(p.slack) < 1 ? C.warn : C.ok})` }} />
                </div>
              </div>
            ))}
          </Collapsible>

          {/* Hold Analysis */}
          {REPORTS.timing.holdPaths.length > 0 && (
            <Collapsible title="Hold Analysis (worst paths)" defaultOpen={false}>
              {REPORTS.timing.holdPaths.map((p, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", fontSize: 10, fontFamily: MONO, borderBottom: `1px solid ${C.b1}` }}>
                  <span style={{ color: C.t3 }}>#{p.rank}</span>
                  <span style={{ color: C.cyan, flex: 1 }}>{p.from} &rarr; {p.to}</span>
                  <Badge color={parseFloat(p.slack) < 0.1 ? C.warn : C.ok}>{p.slack}</Badge>
                </div>
              ))}
            </Collapsible>
          )}

          {/* Unconstrained Paths */}
          {REPORTS.timing.unconstrained.length > 0 && (
            <div style={{ ...panelP, borderLeft: `3px solid ${C.warn}` }}>
              {hdr("Unconstrained Paths", <Warn />)}
              {REPORTS.timing.unconstrained.map((u, i) => (
                <div key={i} style={{ fontSize: 10, fontFamily: MONO, color: C.warn, padding: "4px 0" }}>{u}</div>
              ))}
            </div>
          )}

          <RawLogDrawer projectDir={projectDir} reportType="timing" />
        </div>
      )}

      {/* ════════════════ UTILIZATION REPORT ════════════════ */}
      {rptTab === "util" && !REPORTS.utilization && <NoData label="utilization" />}
      {rptTab === "util" && REPORTS.utilization && (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ ...panelP, background: `linear-gradient(135deg, ${C.s1}, ${C.accentDim})` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Gauge />
              <span style={{ fontSize: 14, fontWeight: 700, color: C.t1 }}>Resource Utilization</span>
              <Badge color={C.accent}>{REPORTS.utilization.device}</Badge>
            </div>
            {REPORTS.utilization.summary.map((cat, ci) => (
              <div key={ci} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 9, fontFamily: MONO, fontWeight: 700, color: C.t3, letterSpacing: 1, marginBottom: 6 }}>
                  {cat.cat.toUpperCase()}
                </div>
                {cat.items.map((r, ri) => {
                  const pct = Math.round((r.used / r.total) * 100);
                  const col = pct > 85 ? C.err : pct > 65 ? C.warn : C.accent;
                  return (
                    <div key={ri} style={{ marginBottom: 8 }}>
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

          <Collapsible title="Utilization by Module" defaultOpen={false}>
            <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 70px 60px 40px 50px", gap: 6, padding: "5px 8px", fontSize: 8, fontFamily: MONO, fontWeight: 700, color: C.t3, borderBottom: `1px solid ${C.b1}` }}>
              <span>MODULE</span><span>SHARE</span><span>LUT</span><span>FF</span><span>EBR</span><span>%</span>
            </div>
            {REPORTS.utilization.byModule.map((m, i) => {
              const pct = parseFloat(m.pct);
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "140px 1fr 70px 60px 40px 50px", gap: 6, padding: "7px 8px", fontSize: 10, fontFamily: MONO, borderBottom: `1px solid ${C.b1}`, alignItems: "center" }}>
                  <span style={{ color: C.cyan, fontWeight: 600 }}>{m.module}</span>
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
      )}

      {/* ════════════════ POWER REPORT ════════════════ */}
      {rptTab === "power" && !REPORTS.power && <NoData label="power" />}
      {rptTab === "power" && REPORTS.power && (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ ...panelP, background: `linear-gradient(135deg, ${C.s1}, ${C.warnDim})` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Bolt />
              <span style={{ fontSize: 14, fontWeight: 700, color: C.t1 }}>Power Estimation</span>
              <Badge color={C.warn}>{REPORTS.power.confidence}</Badge>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
              {[
                { l: "Total Power", v: REPORTS.power.total, c: C.warn },
                { l: "Junction Temp", v: REPORTS.power.junction, c: C.t1 },
                { l: "Ambient", v: REPORTS.power.ambient, c: C.t2 },
                { l: "\u0398_JA", v: REPORTS.power.theta_ja, c: C.t3 },
              ].map((m, i) => (
                <div key={i} style={{ padding: 10, background: C.bg, borderRadius: 6, border: `1px solid ${C.b1}` }}>
                  <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, marginBottom: 3 }}>{m.l}</div>
                  <div style={{ fontSize: 16, fontFamily: MONO, fontWeight: 700, color: m.c }}>{m.v}</div>
                </div>
              ))}
            </div>
            <div style={{ height: 24, borderRadius: 6, overflow: "hidden", display: "flex", marginBottom: 10 }}>
              {REPORTS.power.breakdown.map((b, i) => (
                <div key={i} style={{ width: `${b.pct}%`, background: b.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontFamily: MONO, color: "#fff", fontWeight: 700 }}>
                  {b.pct > 8 ? `${b.pct}%` : ""}
                </div>
              ))}
            </div>
            {REPORTS.power.breakdown.map((b, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px solid ${C.b1}`, fontSize: 10, fontFamily: MONO }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: b.color, flexShrink: 0 }} />
                <span style={{ color: C.t1, flex: 1 }}>{b.cat}</span>
                <span style={{ color: b.color, fontWeight: 700 }}>{b.mw} mW</span>
                <span style={{ color: C.t3, width: 35, textAlign: "right" }}>{b.pct}%</span>
              </div>
            ))}
          </div>
          <Collapsible title="Power by Rail" defaultOpen={false}>
            {REPORTS.power.byRail.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.b1}`, fontSize: 10, fontFamily: MONO }}>
                <span style={{ color: C.t1, flex: 1 }}>{r.rail}</span>
                <span style={{ color: C.warn, fontWeight: 600 }}>{r.mw} mW</span>
              </div>
            ))}
          </Collapsible>
        </div>
      )}

      {/* ════════════════ DRC REPORT ════════════════ */}
      {rptTab === "drc" && !REPORTS.drc && <NoData label="DRC" />}
      {rptTab === "drc" && REPORTS.drc && (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 10 }}>
            {[
              { l: "Errors", v: REPORTS.drc.summary.errors, c: C.err },
              { l: "Critical Warnings", v: REPORTS.drc.summary.critWarns, c: C.warn },
              { l: "Warnings", v: REPORTS.drc.summary.warnings, c: C.orange },
              { l: "Info", v: REPORTS.drc.summary.info, c: C.accent },
              { l: "Waived", v: REPORTS.drc.summary.waived, c: C.t3 },
            ].map((m, i) => (
              <div key={i} style={{ flex: 1, padding: 10, background: C.s1, borderRadius: 6, border: `1px solid ${C.b1}`, borderTop: `3px solid ${m.c}`, textAlign: "center" }}>
                <div style={{ fontSize: 22, fontFamily: MONO, fontWeight: 700, color: m.v > 0 ? m.c : C.t3 }}>{m.v}</div>
                <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, marginTop: 2 }}>{m.l}</div>
              </div>
            ))}
          </div>
          {REPORTS.drc.items.map((d, i) => {
            const sevColors: Record<string, string> = { crit_warn: C.warn, warning: C.orange, info: C.accent, waived: C.t3 };
            const sevLabels: Record<string, string> = { crit_warn: "CRIT", warning: "WARN", info: "INFO", waived: "WAIVED" };
            return (
              <div key={i} style={{ padding: "10px 12px", background: C.s1, borderRadius: 6, border: `1px solid ${C.b1}`, borderLeft: `3px solid ${sevColors[d.sev] || C.t3}`, display: "flex", gap: 10 }}>
                <Badge color={sevColors[d.sev] || C.t3} style={{ flexShrink: 0, alignSelf: "flex-start" }}>
                  {sevLabels[d.sev] || d.sev}
                </Badge>
                <div style={{ flex: 1, fontSize: 10, fontFamily: MONO }}>
                  <div style={{ color: C.t1, fontWeight: 600, marginBottom: 3 }}>
                    <span style={{ color: sevColors[d.sev] || C.t3 }}>[{d.code}]</span> {d.msg}
                  </div>
                  <div style={{ display: "flex", gap: 12, color: C.t3, fontSize: 9 }}>
                    {d.loc !== "\u2014" && <span>{"\uD83D\uDCCD"} {d.loc}</span>}
                    <span>&rarr; {d.action}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ════════════════ I/O BANKING REPORT ════════════════ */}
      {rptTab === "io" && !REPORTS.io && <NoData label="I/O banking" />}
      {rptTab === "io" && REPORTS.io && REPORTS.utilization && (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={panelP}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Pin />
              <span style={{ fontSize: 14, fontWeight: 700, color: C.t1 }}>I/O Pin Assignments</span>
              <Badge color={C.accent}>{REPORTS.utilization.device}</Badge>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
              {REPORTS.io.banks.map((bk, i) => {
                const pct = Math.round((bk.used / bk.total) * 100);
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
        </div>
      )}

      {/* ════════════════ STAGE LOG TABS ════════════════ */}
      {(rptTab === "synth" || rptTab === "map" || rptTab === "par" || rptTab === "bitstream") && (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={panelP}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.t1 }}>
                {rptTab === "synth" ? "Synthesis Report" :
                 rptTab === "map" ? "Map Report" :
                 rptTab === "par" ? "Place & Route Report" :
                 "Bitstream Report"}
              </span>
            </div>
            <div style={{ color: C.t3, fontSize: 9, fontFamily: MONO, marginBottom: 8 }}>
              Expand the raw log below to view the full report file from impl1/.
            </div>
          </div>
          <RawLogDrawer projectDir={projectDir} reportType={rptTab} />
        </div>
      )}
    </div>
  );
}
