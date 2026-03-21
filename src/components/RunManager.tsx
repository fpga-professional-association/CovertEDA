import { useState, useMemo } from "react";
import { ImplementationRun, BuildStrategy } from "../types";
import { useTheme } from "../context/ThemeContext";
import { Btn, Badge } from "./shared";

// Default build strategies
const DEFAULT_STRATEGIES: BuildStrategy[] = [
  {
    name: "Default",
    description: "Balanced synthesis, map, place & route",
    synth_options: { syn_optimization: "Balanced" },
    map_options: { map_effort: "Standard" },
    par_options: { par_effort: "Standard" },
    bitgen_options: { bit_compress: "true" },
  },
  {
    name: "Timing Focused",
    description: "Aggressive timing optimization",
    synth_options: { syn_optimization: "Timing" },
    map_options: { map_effort: "High" },
    par_options: { par_effort: "High", par_timing_driven: "true" },
    bitgen_options: { bit_compress: "true" },
  },
  {
    name: "Area Optimized",
    description: "Minimize resource usage",
    synth_options: { syn_optimization: "Area" },
    map_options: { map_effort: "Standard" },
    par_options: { par_effort: "Standard" },
    bitgen_options: { bit_compress: "true" },
  },
  {
    name: "Quick Build",
    description: "Fast synthesis and place & route",
    synth_options: { syn_optimization: "Balanced" },
    map_options: { map_effort: "Standard" },
    par_options: { par_effort: "Standard", par_multipass: "false" },
    bitgen_options: { bit_compress: "false" },
  },
];

// Mock runs for demo
const MOCK_RUNS: ImplementationRun[] = [
  {
    id: "run-001",
    name: "Default Build",
    strategy: DEFAULT_STRATEGIES[0],
    status: "completed",
    created_at: "2025-01-15T10:00:00Z",
    completed_at: "2025-01-15T10:05:30Z",
    results: {
      fmax_mhz: 125.5,
      wns_ns: 2.5,
      lut_utilization: 0.1,
      ff_utilization: 0.05,
      bram_utilization: 0,
      total_power_w: 1.23,
      build_time_secs: 330,
    },
  },
  {
    id: "run-002",
    name: "Timing Focused",
    strategy: DEFAULT_STRATEGIES[1],
    status: "completed",
    created_at: "2025-01-15T10:10:00Z",
    completed_at: "2025-01-15T10:18:45Z",
    results: {
      fmax_mhz: 142.3,
      wns_ns: 3.8,
      lut_utilization: 0.15,
      ff_utilization: 0.08,
      bram_utilization: 0,
      total_power_w: 1.45,
      build_time_secs: 525,
    },
  },
];

interface RunManagerProps {
  runs?: ImplementationRun[] | null;
}

export default function RunManager({ runs = MOCK_RUNS }: RunManagerProps): React.ReactElement {
  const { C, MONO } = useTheme();
  const [selectedRuns, setSelectedRuns] = useState<string[]>([]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return C.ok;
      case "running":
        return C.accent;
      case "failed":
        return C.err;
      case "cancelled":
        return C.warn;
      default:
        return C.t3;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "completed":
        return "✓ DONE";
      case "running":
        return "⟳ RUNNING";
      case "failed":
        return "✕ FAILED";
      case "cancelled":
        return "⊘ CANCELLED";
      default:
        return "● PENDING";
    }
  };

  const comparisonRuns = useMemo(() => {
    return runs?.filter((r) => selectedRuns.includes(r.id)) ?? [];
  }, [runs, selectedRuns]);

  const toggleRunSelection = (id: string) => {
    setSelectedRuns((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

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
            IMPLEMENTATION RUNS
          </div>
          <div style={{ fontSize: 14, fontFamily: MONO, fontWeight: 600, color: C.t1 }}>
            Multi-Run Manager
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn small primary>
            New Run
          </Btn>
          <Btn small disabled={comparisonRuns.length < 2}>
            Compare
          </Btn>
        </div>
      </div>

      {/* Strategy Presets */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
        }}
      >
        {DEFAULT_STRATEGIES.map((strat) => (
          <div
            key={strat.name}
            onClick={() => {}}
            style={{
              padding: 12,
              background: C.s1,
              border: `1px solid ${C.b1}`,
              borderRadius: 6,
              cursor: "pointer",
              transition: "border-color 100ms ease-out, background-color 100ms ease-out",
            }}
            title={strat.description}
          >
            <div
              style={{
                fontSize: 9,
                fontFamily: MONO,
                fontWeight: 600,
                color: C.t1,
                marginBottom: 4,
              }}
            >
              {strat.name}
            </div>
            <div
              style={{
                fontSize: 7,
                fontFamily: MONO,
                color: C.t3,
                lineHeight: "1.3",
              }}
            >
              {strat.description}
            </div>
          </div>
        ))}
      </div>

      {/* Run List Table */}
      <div
        style={{
          padding: 12,
          background: C.s1,
          borderRadius: 6,
          border: `1px solid ${C.b1}`,
        }}
      >
        <div
          style={{
            fontSize: 9,
            fontFamily: MONO,
            fontWeight: 600,
            color: C.t2,
            marginBottom: 12,
          }}
        >
          RECENT RUNS ({runs?.length ?? 0})
        </div>

        {runs && runs.length > 0 ? (
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
                  <th style={{ textAlign: "left", padding: "6px 0", width: "20px" }}>
                    <input
                      type="checkbox"
                      style={{ width: 12, height: 12, cursor: "pointer" }}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedRuns(runs.map((r) => r.id));
                        } else {
                          setSelectedRuns([]);
                        }
                      }}
                    />
                  </th>
                  <th style={{ textAlign: "left", padding: "6px 0" }}>Name</th>
                  <th style={{ textAlign: "left", padding: "6px 0" }}>Strategy</th>
                  <th style={{ textAlign: "left", padding: "6px 0" }}>Status</th>
                  <th style={{ textAlign: "right", padding: "6px 0" }}>Fmax</th>
                  <th style={{ textAlign: "right", padding: "6px 0" }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    style={{
                      borderBottom: `1px solid ${C.b1}`,
                      background: selectedRuns.includes(run.id) ? C.s3 : "transparent",
                      color: C.t2,
                    }}
                  >
                    <td style={{ padding: "6px 0", textAlign: "left" }}>
                      <input
                        type="checkbox"
                        checked={selectedRuns.includes(run.id)}
                        onChange={() => toggleRunSelection(run.id)}
                        style={{ width: 12, height: 12, cursor: "pointer" }}
                      />
                    </td>
                    <td style={{ padding: "6px 0" }}>{run.name}</td>
                    <td style={{ padding: "6px 0" }}>{run.strategy.name}</td>
                    <td style={{ padding: "6px 0" }}>
                      <Badge color={getStatusColor(run.status)}>
                        {getStatusLabel(run.status)}
                      </Badge>
                    </td>
                    <td
                      style={{
                        padding: "6px 0",
                        textAlign: "right",
                        color: run.results?.fmax_mhz
                          ? C.accent
                          : C.t3,
                      }}
                    >
                      {run.results?.fmax_mhz
                        ? `${run.results.fmax_mhz.toFixed(1)}M`
                        : "—"}
                    </td>
                    <td style={{ padding: "6px 0", textAlign: "right" }}>
                      {run.results?.build_time_secs
                        ? `${Math.round(run.results.build_time_secs / 60)}m`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            style={{
              padding: 20,
              textAlign: "center",
              color: C.t3,
              fontSize: 9,
            }}
          >
            No runs yet. Start a new run to begin.
          </div>
        )}
      </div>

      {/* Results Comparison */}
      {comparisonRuns.length > 0 && (
        <div
          style={{
            padding: 12,
            background: C.s1,
            borderRadius: 6,
            border: `1px solid ${C.b1}`,
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontFamily: MONO,
              fontWeight: 600,
              color: C.t2,
              marginBottom: 12,
            }}
          >
            COMPARISON ({comparisonRuns.length} selected)
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
                <tr style={{ borderBottom: `1px solid ${C.b1}`, color: C.t3 }}>
                  <th style={{ textAlign: "left", padding: "6px 4px" }}>Metric</th>
                  {comparisonRuns.map((run) => (
                    <th
                      key={run.id}
                      style={{
                        textAlign: "center",
                        padding: "6px 4px",
                        color: C.accent,
                      }}
                    >
                      {run.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: `1px solid ${C.b1}`, color: C.t2 }}>
                  <td style={{ padding: "6px 4px" }}>Fmax (MHz)</td>
                  {comparisonRuns.map((run) => (
                    <td
                      key={run.id}
                      style={{
                        textAlign: "center",
                        padding: "6px 4px",
                        color: C.accent,
                        fontWeight: 600,
                      }}
                    >
                      {run.results?.fmax_mhz?.toFixed(1) ?? "—"}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: `1px solid ${C.b1}`, color: C.t2 }}>
                  <td style={{ padding: "6px 4px" }}>LUT %</td>
                  {comparisonRuns.map((run) => (
                    <td
                      key={run.id}
                      style={{
                        textAlign: "center",
                        padding: "6px 4px",
                        color: C.ok,
                      }}
                    >
                      {run.results?.lut_utilization
                        ? (run.results.lut_utilization * 100).toFixed(1)
                        : "—"}
                      %
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: `1px solid ${C.b1}`, color: C.t2 }}>
                  <td style={{ padding: "6px 4px" }}>Power (W)</td>
                  {comparisonRuns.map((run) => (
                    <td
                      key={run.id}
                      style={{
                        textAlign: "center",
                        padding: "6px 4px",
                        color: C.orange,
                      }}
                    >
                      {run.results?.total_power_w?.toFixed(2) ?? "—"}
                    </td>
                  ))}
                </tr>
                <tr style={{ color: C.t2 }}>
                  <td style={{ padding: "6px 4px" }}>Time (s)</td>
                  {comparisonRuns.map((run) => (
                    <td
                      key={run.id}
                      style={{
                        textAlign: "center",
                        padding: "6px 4px",
                        color: C.cyan,
                      }}
                    >
                      {run.results?.build_time_secs?.toFixed(0) ?? "—"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Simple comparison chart */}
          <div style={{ marginTop: 16, paddingTop: 8, borderTop: `1px solid ${C.b1}` }}>
            <div
              style={{
                fontSize: 9,
                fontFamily: MONO,
                fontWeight: 600,
                color: C.t2,
                marginBottom: 12,
              }}
            >
              FMAX COMPARISON
            </div>
            <div style={{ display: "flex", gap: 24, alignItems: "flex-end", height: 80 }}>
              {comparisonRuns.map((run) => {
                const fmax = run.results?.fmax_mhz ?? 0;
                const maxFmax = Math.max(...comparisonRuns.map((r) => r.results?.fmax_mhz ?? 0));
                const height = (fmax / maxFmax) * 70;
                return (
                  <div key={run.id} style={{ display: "flex", flexDirection: "column" }}>
                    <div
                      style={{
                        width: 40,
                        height: `${height}px`,
                        background: C.accent,
                        borderRadius: 4,
                        marginBottom: 4,
                      }}
                    />
                    <div
                      style={{
                        fontSize: 7,
                        fontFamily: MONO,
                        color: C.t3,
                        textAlign: "center",
                        maxWidth: 40,
                      }}
                    >
                      {fmax.toFixed(0)}M
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
