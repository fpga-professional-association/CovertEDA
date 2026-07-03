import { useTheme } from "../context/ThemeContext";
import { Btn, Badge } from "./shared";
import type { PowerReportData } from "../types";

interface PowerCalculatorProps {
  report: PowerReportData | null;
  onAnalyze?: () => void;
  analyzing?: boolean;
}

function parseLeadingNumber(s: string): number {
  const m = /-?[\d.]+/.exec(s);
  return m ? parseFloat(m[0]) : 0;
}

export default function PowerCalculator({ report, onAnalyze, analyzing }: PowerCalculatorProps): React.ReactElement {
  const { C, MONO } = useTheme();

  if (!report) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 40,
          background: C.bg,
          borderRadius: 8,
          color: C.t3,
        }}
      >
        <div style={{ fontSize: 11, fontFamily: MONO }}>
          No power report available yet.
        </div>
        <div style={{ fontSize: 9, fontFamily: MONO, color: C.t3, textAlign: "center", maxWidth: 320 }}>
          Run a build to generate a power estimation report, or click Analyze to load one from disk.
        </div>
        {onAnalyze && (
          <Btn small onClick={onAnalyze} disabled={analyzing} title="Load power report from disk">
            {analyzing ? "Analyzing…" : "Analyze"}
          </Btn>
        )}
      </div>
    );
  }

  const totalMw = parseLeadingNumber(report.total);
  const totalW = totalMw / 1000;
  const maxBreakdown = Math.max(...report.breakdown.map((b) => b.mw), 1);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 12,
        background: C.bg,
        borderRadius: 8,
        overflow: "auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 11, fontFamily: MONO, color: C.t3, marginBottom: 2 }}>
            POWER SUMMARY
          </div>
          <div style={{ fontSize: 16, fontFamily: MONO, fontWeight: 600, color: C.t1 }}>
            {totalW.toFixed(3)} W
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Badge color={C.cyan}>{report.confidence}</Badge>
          {onAnalyze && (
            <Btn small onClick={onAnalyze} disabled={analyzing} title="Reload power report from disk">
              {analyzing ? "Analyzing…" : "Analyze"}
            </Btn>
          )}
        </div>
      </div>

      {/* Thermal Info */}
      <div
        style={{
          padding: 12,
          background: C.s1,
          borderRadius: 6,
          border: `1px solid ${C.b1}`,
        }}
      >
        <div style={{ fontSize: 9, fontFamily: MONO, fontWeight: 600, color: C.t2, marginBottom: 8 }}>
          THERMAL
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 9 }}>
          <div>
            <span style={{ color: C.t3 }}>Junction:</span>
            <span style={{ color: C.t1, marginLeft: 4, fontWeight: 600 }}>
              {report.junction}
            </span>
          </div>
          <div>
            <span style={{ color: C.t3 }}>Ambient:</span>
            <span style={{ color: C.t1, marginLeft: 4, fontWeight: 600 }}>
              {report.ambient}
            </span>
          </div>
          <div>
            <span style={{ color: C.t3 }}>{"θ"}JA:</span>
            <span style={{ color: C.t1, marginLeft: 4, fontWeight: 600 }}>
              {report.theta_ja}
            </span>
          </div>
        </div>
      </div>

      {/* Power Breakdown Chart */}
      {report.breakdown.length > 0 && (
        <div
          style={{
            padding: 12,
            background: C.s1,
            borderRadius: 6,
            border: `1px solid ${C.b1}`,
          }}
        >
          <div style={{ fontSize: 9, fontFamily: MONO, fontWeight: 600, color: C.t2, marginBottom: 12 }}>
            POWER BREAKDOWN
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {report.breakdown.map((item) => (
              <div key={item.cat}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 4,
                    fontSize: 8,
                    fontFamily: MONO,
                  }}
                >
                  <span style={{ color: C.t2 }}>{item.cat}</span>
                  <span style={{ color: item.color, fontWeight: 600 }}>
                    {item.mw.toFixed(1)}mW ({item.pct}%)
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    background: C.b1,
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      background: item.color,
                      width: `${(item.mw / maxBreakdown) * 100}%`,
                      transition: "width 300ms ease-out",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Power Rail Table */}
      {report.byRail.length > 0 && (
        <div
          style={{
            padding: 12,
            background: C.s1,
            borderRadius: 6,
            border: `1px solid ${C.b1}`,
          }}
        >
          <div style={{ fontSize: 9, fontFamily: MONO, fontWeight: 600, color: C.t2, marginBottom: 8 }}>
            POWER BY RAIL
          </div>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                fontSize: 8,
                fontFamily: MONO,
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: `1px solid ${C.b1}`,
                    color: C.t3,
                  }}
                >
                  <th style={{ textAlign: "left", padding: "4px 0" }}>Rail</th>
                  <th style={{ textAlign: "right", padding: "4px 0" }}>Power</th>
                </tr>
              </thead>
              <tbody>
                {report.byRail.map((r) => (
                  <tr
                    key={r.rail}
                    style={{
                      borderBottom: `1px solid ${C.b1}`,
                      color: C.t2,
                    }}
                  >
                    <td style={{ padding: "4px 0" }}>{r.rail}</td>
                    <td style={{ textAlign: "right", color: C.accent, fontWeight: 600 }}>
                      {r.mw.toFixed(1)}mW
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
