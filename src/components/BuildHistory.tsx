import { useState, useEffect, useMemo } from "react";
import { useTheme } from "../context/ThemeContext";
import { Badge } from "./shared";
import { Zap, Check } from "./Icons";
import { readFile } from "../hooks/useTauri";

export interface BuildRecord {
  id: string;
  timestamp: string;
  duration: number; // seconds
  status: "success" | "failed" | "cancelled";
  backend: string;
  device: string;
  stages: string[];
  fmaxMhz?: number;
  lutUsed?: number;
  lutTotal?: number;
  ffUsed?: number;
  ffTotal?: number;
  warnings: number;
  errors: number;
  commitHash?: string;
  commitMsg?: string;
  branch?: string;
}

interface BuildHistoryProps {
  projectDir: string;
  onViewReport?: (buildId: string) => void;
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export default function BuildHistory({ projectDir, onViewReport }: BuildHistoryProps) {
  const { C, MONO } = useTheme();
  const [history, setHistory] = useState<BuildRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Load build history from .coverteda_history.json in the project directory
  useEffect(() => {
    if (!projectDir) {
      setHistory([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const historyPath = `${projectDir}/.coverteda_history.json`;
    setLoading(true);
    setError(null);
    readFile(historyPath)
      .then((fc) => {
        if (cancelled) return;
        try {
          const records: BuildRecord[] = JSON.parse(fc.content);
          setHistory(Array.isArray(records) ? records : []);
        } catch {
          setHistory([]);
          setError("Failed to parse build history file.");
        }
      })
      .catch(() => {
        if (cancelled) return;
        // File doesn't exist yet — that's fine, no builds recorded
        setHistory([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [projectDir]);

  const selected = useMemo(() => history.find((h) => h.id === selectedId), [history, selectedId]);

  // Compute trends
  const successfulBuilds = useMemo(() => history.filter((h) => h.status === "success" && h.fmaxMhz), [history]);
  const fmaxTrend = useMemo(() => {
    if (successfulBuilds.length < 2) return null;
    const first = successfulBuilds[0].fmaxMhz!;
    const last = successfulBuilds[successfulBuilds.length - 1].fmaxMhz!;
    return last - first;
  }, [successfulBuilds]);

  const panelP: React.CSSProperties = {
    background: C.s1, borderRadius: 7, border: `1px solid ${C.b1}`, padding: 14,
  };

  // Loading state
  if (loading) {
    return (
      <div style={{ ...panelP, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 120 }}>
        <span style={{ fontSize: 10, fontFamily: MONO, color: C.t3 }}>Loading build history...</span>
      </div>
    );
  }

  // Empty state
  if (history.length === 0) {
    return (
      <div style={{ ...panelP, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 160, gap: 8 }}>
        <Zap />
        <span style={{ fontSize: 11, fontWeight: 600, color: C.t2 }}>No build history yet</span>
        <span style={{ fontSize: 9, fontFamily: MONO, color: C.t3, textAlign: "center", maxWidth: 300 }}>
          {error
            ? error
            : "Build records will appear here after your first build. History is stored in .coverteda_history.json in your project directory."}
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        <div style={panelP}>
          <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, marginBottom: 4 }}>TOTAL BUILDS</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.t1 }}>{history.length}</div>
        </div>
        <div style={panelP}>
          <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, marginBottom: 4 }}>SUCCESS RATE</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.ok }}>
            {Math.round((history.filter((h) => h.status === "success").length / history.length) * 100)}%
          </div>
        </div>
        <div style={panelP}>
          <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, marginBottom: 4 }}>BEST FMAX</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.accent }}>
            {successfulBuilds.length > 0 ? `${Math.max(...successfulBuilds.map((b) => b.fmaxMhz!)).toFixed(1)}` : "N/A"}
            <span style={{ fontSize: 9, fontWeight: 400, color: C.t3 }}> MHz</span>
          </div>
        </div>
        <div style={panelP}>
          <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, marginBottom: 4 }}>FMAX TREND</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: fmaxTrend && fmaxTrend > 0 ? C.ok : fmaxTrend && fmaxTrend < 0 ? C.err : C.t3 }}>
            {fmaxTrend ? `${fmaxTrend > 0 ? "+" : ""}${fmaxTrend.toFixed(1)}` : "N/A"}
            <span style={{ fontSize: 9, fontWeight: 400, color: C.t3 }}> MHz</span>
          </div>
        </div>
      </div>

      {/* Fmax Chart (ASCII bar chart) */}
      {successfulBuilds.length > 0 && (
        <div style={panelP}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.t1, marginBottom: 10 }}>Fmax History</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80, paddingBottom: 4 }}>
            {successfulBuilds.map((b, i) => {
              const maxFmax = Math.max(...successfulBuilds.map((x) => x.fmaxMhz!));
              const pct = (b.fmaxMhz! / maxFmax) * 100;
              return (
                <div key={b.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <span style={{ fontSize: 7, fontFamily: MONO, color: C.t1 }}>{b.fmaxMhz!.toFixed(0)}</span>
                  <div
                    style={{
                      width: "100%",
                      height: `${pct}%`,
                      minHeight: 4,
                      background: `linear-gradient(to top, ${C.accent}, ${C.accent}60)`,
                      borderRadius: "3px 3px 0 0",
                    }}
                  />
                  <span style={{ fontSize: 6, fontFamily: MONO, color: C.t3 }}>#{i + 1}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Build History Table */}
      <div style={panelP}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.t1, marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
          <Zap />
          Build History
          <span style={{ fontSize: 7, fontFamily: MONO, color: C.t3, marginLeft: "auto" }}>
            .coverteda_history.json
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.b1}` }}>
                {["", "Time", "Branch", "Commit", "Duration", "Status", "Fmax", "LUT", "FF", "W", "E"].map((h) => (
                  <th key={h} style={{
                    fontSize: 8, fontFamily: MONO, fontWeight: 700, color: C.t3,
                    padding: "4px 6px", textAlign: "left",
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.slice().reverse().map((b) => (
                <tr
                  key={b.id}
                  onClick={() => setSelectedId(selectedId === b.id ? null : b.id)}
                  style={{
                    borderBottom: `1px solid ${C.b1}10`,
                    cursor: "pointer",
                    background: selectedId === b.id ? `${C.accent}08` : undefined,
                  }}
                >
                  <td style={{ padding: "4px 6px" }}>
                    {b.status === "success" ? <Check /> :
                      <span style={{ color: C.err, fontSize: 10 }}>{"\u2717"}</span>}
                  </td>
                  <td style={{ fontSize: 8, fontFamily: MONO, color: C.t2, padding: "4px 6px" }}>
                    {formatDate(b.timestamp)} {formatTime(b.timestamp)}
                  </td>
                  <td style={{ fontSize: 8, fontFamily: MONO, padding: "4px 6px" }}>
                    {b.branch ? (
                      <Badge color={C.accent} style={{ fontSize: 7 }}>{b.branch}</Badge>
                    ) : (
                      <span style={{ color: C.t3, fontStyle: "italic" }}>-</span>
                    )}
                  </td>
                  <td style={{ fontSize: 8, fontFamily: MONO, padding: "4px 6px" }}>
                    {b.commitHash ? (
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span
                          style={{
                            color: C.cyan,
                            padding: "1px 4px",
                            borderRadius: 2,
                            background: `${C.cyan}10`,
                            fontWeight: 600,
                            flexShrink: 0,
                          }}
                        >
                          {b.commitHash}
                        </span>
                        {b.commitMsg && (
                          <span style={{
                            color: C.t2,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: 180,
                          }}>
                            {b.commitMsg}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span style={{ color: C.t3, fontStyle: "italic" }}>none</span>
                    )}
                  </td>
                  <td style={{ fontSize: 8, fontFamily: MONO, color: C.t2, padding: "4px 6px" }}>
                    {formatDuration(b.duration)}
                  </td>
                  <td style={{ padding: "4px 6px" }}>
                    <Badge color={b.status === "success" ? C.ok : b.status === "failed" ? C.err : C.warn}>
                      {b.status}
                    </Badge>
                  </td>
                  <td style={{ fontSize: 9, fontFamily: MONO, color: b.fmaxMhz ? C.t1 : C.t3, fontWeight: 600, padding: "4px 6px" }}>
                    {b.fmaxMhz ? `${b.fmaxMhz.toFixed(1)}` : "-"}
                  </td>
                  <td style={{ fontSize: 8, fontFamily: MONO, color: C.t2, padding: "4px 6px" }}>
                    {b.lutUsed !== undefined ? `${b.lutUsed}/${b.lutTotal}` : "-"}
                  </td>
                  <td style={{ fontSize: 8, fontFamily: MONO, color: C.t2, padding: "4px 6px" }}>
                    {b.ffUsed !== undefined ? `${b.ffUsed}/${b.ffTotal}` : "-"}
                  </td>
                  <td style={{ fontSize: 8, fontFamily: MONO, color: b.warnings > 0 ? C.warn : C.t3, padding: "4px 6px" }}>
                    {b.warnings}
                  </td>
                  <td style={{ fontSize: 8, fontFamily: MONO, color: b.errors > 0 ? C.err : C.t3, padding: "4px 6px" }}>
                    {b.errors}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Build Details */}
      {selected && (
        <div style={panelP}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.t1, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            Build Details
            {onViewReport && selected.status === "success" && (
              <button
                onClick={() => onViewReport(selected.id)}
                style={{
                  marginLeft: "auto",
                  fontSize: 8,
                  fontFamily: MONO,
                  fontWeight: 600,
                  color: C.accent,
                  background: `${C.accent}15`,
                  border: `1px solid ${C.accent}40`,
                  borderRadius: 4,
                  padding: "3px 10px",
                  cursor: "pointer",
                }}
              >
                View Report
              </button>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "4px 12px", fontSize: 9, fontFamily: MONO }}>
            <span style={{ color: C.t3 }}>Backend:</span>
            <span style={{ color: C.t1 }}>{selected.backend}</span>
            <span style={{ color: C.t3 }}>Device:</span>
            <span style={{ color: C.t1 }}>{selected.device}</span>
            <span style={{ color: C.t3 }}>Stages:</span>
            <span style={{ color: C.t1 }}>{selected.stages.join(" \u2192 ")}</span>
            <span style={{ color: C.t3 }}>Duration:</span>
            <span style={{ color: C.t1 }}>{formatDuration(selected.duration)}</span>
            {selected.branch && (
              <>
                <span style={{ color: C.t3 }}>Branch:</span>
                <span style={{ color: C.accent, fontWeight: 600 }}>{selected.branch}</span>
              </>
            )}
            {selected.commitHash && (
              <>
                <span style={{ color: C.t3 }}>Commit:</span>
                <span style={{ color: C.cyan, fontWeight: 600 }}>
                  {selected.commitHash}
                  {selected.commitMsg && (
                    <span style={{ color: C.t2, fontWeight: 400 }}> — {selected.commitMsg}</span>
                  )}
                </span>
              </>
            )}
            {selected.fmaxMhz && (
              <>
                <span style={{ color: C.t3 }}>Fmax:</span>
                <span style={{ color: C.accent, fontWeight: 700 }}>{selected.fmaxMhz.toFixed(2)} MHz</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
