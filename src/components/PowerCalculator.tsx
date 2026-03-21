import { useState, useMemo } from "react";
import { useTheme } from "../context/ThemeContext";
import { Btn, Badge, Select } from "./shared";

interface PowerModule {
  name: string;
  static_mw: number;
  dynamic_mw: number;
  total_mw: number;
}

interface PowerReport {
  total_power_w: number;
  static_power_w: number;
  dynamic_power_w: number;
  logic_power_w: number;
  io_power_w: number;
  clock_power_w: number;
  bram_power_w: number;
  dsp_power_w: number;
  junction_temp_c: number;
  ambient_temp_c: number;
  thermal_margin_c: number;
  modules: PowerModule[];
}

// Mock power report for non-Tauri environments
function getMockPowerReport(): PowerReport {
  return {
    total_power_w: 1.23,
    static_power_w: 0.45,
    dynamic_power_w: 0.78,
    logic_power_w: 0.35,
    io_power_w: 0.18,
    clock_power_w: 0.12,
    bram_power_w: 0.08,
    dsp_power_w: 0.05,
    junction_temp_c: 62.5,
    ambient_temp_c: 25.0,
    thermal_margin_c: 37.5,
    modules: [
      { name: "counter", static_mw: 120, dynamic_mw: 310, total_mw: 430 },
      { name: "controller", static_mw: 180, dynamic_mw: 260, total_mw: 440 },
      { name: "datapath", static_mw: 150, dynamic_mw: 200, total_mw: 350 },
    ],
  };
}

export default function PowerCalculator(): React.ReactElement {
  const report = null;
  const { C, MONO } = useTheme();
  const [caseMode, setCaseMode] = useState<"typical" | "worst">("typical");

  const data = report || getMockPowerReport();

  const breakdownItems = useMemo(() => [
    { label: "Logic", value: data.logic_power_w, color: C.accent },
    { label: "I/O", value: data.io_power_w, color: C.cyan },
    { label: "Clock", value: data.clock_power_w, color: C.orange },
    { label: "BRAM", value: data.bram_power_w, color: C.ok },
    { label: "DSP", value: data.dsp_power_w, color: C.pink },
  ], [data, C]);

  const maxBreakdown = Math.max(...breakdownItems.map((b) => b.value));

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
            {data.total_power_w.toFixed(2)} W
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn small onClick={() => {}} title="Run power analysis">
            Analyze
          </Btn>
          <Select
            value={caseMode}
            onChange={(v) => setCaseMode(v as "typical" | "worst")}
            options={[
              { value: "typical", label: "Typical" },
              { value: "worst", label: "Worst Case" },
            ]}
            compact
          />
        </div>
      </div>

      {/* Summary Gauges */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
        }}
      >
        {/* Total Power Gauge */}
        <div
          style={{
            padding: 12,
            background: C.s1,
            borderRadius: 6,
            border: `1px solid ${C.b1}`,
          }}
        >
          <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, marginBottom: 4 }}>
            TOTAL
          </div>
          <svg width="100%" height="60" viewBox="0 0 60 60" style={{ overflow: "visible" }}>
            {/* Donut chart */}
            <circle
              cx="30"
              cy="30"
              r="20"
              fill="none"
              stroke={C.b1}
              strokeWidth="8"
            />
            <circle
              cx="30"
              cy="30"
              r="20"
              fill="none"
              stroke={C.accent}
              strokeWidth="8"
              strokeDasharray="75 100"
              transform="rotate(-90 30 30)"
            />
            <text
              x="30"
              y="32"
              textAnchor="middle"
              style={{
                fontSize: "11px",
                fontFamily: MONO,
                fontWeight: 600,
                fill: C.t1,
              }}
            >
              {data.total_power_w.toFixed(2)}W
            </text>
          </svg>
        </div>

        {/* Static Power */}
        <div
          style={{
            padding: 12,
            background: C.s1,
            borderRadius: 6,
            border: `1px solid ${C.b1}`,
          }}
        >
          <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, marginBottom: 4 }}>
            STATIC
          </div>
          <div
            style={{
              fontSize: 14,
              fontFamily: MONO,
              fontWeight: 600,
              color: C.ok,
              marginBottom: 4,
            }}
          >
            {data.static_power_w.toFixed(2)}W
          </div>
          <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>
            {((data.static_power_w / data.total_power_w) * 100).toFixed(0)}%
          </div>
        </div>

        {/* Dynamic Power */}
        <div
          style={{
            padding: 12,
            background: C.s1,
            borderRadius: 6,
            border: `1px solid ${C.b1}`,
          }}
        >
          <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, marginBottom: 4 }}>
            DYNAMIC
          </div>
          <div
            style={{
              fontSize: 14,
              fontFamily: MONO,
              fontWeight: 600,
              color: C.orange,
              marginBottom: 4,
            }}
          >
            {data.dynamic_power_w.toFixed(2)}W
          </div>
          <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>
            {((data.dynamic_power_w / data.total_power_w) * 100).toFixed(0)}%
          </div>
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 9 }}>
          <div>
            <span style={{ color: C.t3 }}>Junction:</span>
            <span style={{ color: C.t1, marginLeft: 4, fontWeight: 600 }}>
              {data.junction_temp_c.toFixed(1)}°C
            </span>
          </div>
          <div>
            <span style={{ color: C.t3 }}>Ambient:</span>
            <span style={{ color: C.t1, marginLeft: 4, fontWeight: 600 }}>
              {data.ambient_temp_c.toFixed(1)}°C
            </span>
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 8, color: C.t3, marginBottom: 2 }}>Margin</div>
          <div
            style={{
              fontSize: 12,
              fontFamily: MONO,
              fontWeight: 600,
              color:
                data.thermal_margin_c > 30
                  ? C.ok
                  : data.thermal_margin_c > 15
                    ? C.warn
                    : C.err,
            }}
          >
            {data.thermal_margin_c.toFixed(1)}°C
          </div>
        </div>
      </div>

      {/* Power Breakdown Chart */}
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
          {breakdownItems.map((item) => (
            <div key={item.label}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 4,
                  fontSize: 8,
                  fontFamily: MONO,
                }}
              >
                <span style={{ color: C.t2 }}>{item.label}</span>
                <span style={{ color: item.color, fontWeight: 600 }}>
                  {item.value.toFixed(3)}W
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
                    width: `${(item.value / maxBreakdown) * 100}%`,
                    transition: "width 300ms ease-out",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Module-Level Power Table */}
      {data.modules.length > 0 && (
        <div
          style={{
            padding: 12,
            background: C.s1,
            borderRadius: 6,
            border: `1px solid ${C.b1}`,
          }}
        >
          <div style={{ fontSize: 9, fontFamily: MONO, fontWeight: 600, color: C.t2, marginBottom: 8 }}>
            MODULE BREAKDOWN
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
                  <th style={{ textAlign: "left", padding: "4px 0" }}>Module</th>
                  <th style={{ textAlign: "right", padding: "4px 0" }}>Static</th>
                  <th style={{ textAlign: "right", padding: "4px 0" }}>Dynamic</th>
                  <th style={{ textAlign: "right", padding: "4px 0" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.modules.map((m: PowerModule) => (
                  <tr
                    key={m.name}
                    style={{
                      borderBottom: `1px solid ${C.b1}`,
                      color: C.t2,
                    }}
                  >
                    <td style={{ padding: "4px 0" }}>{m.name}</td>
                    <td style={{ textAlign: "right", color: C.ok }}>
                      {(m.static_mw / 1000).toFixed(2)}W
                    </td>
                    <td style={{ textAlign: "right", color: C.orange }}>
                      {(m.dynamic_mw / 1000).toFixed(2)}W
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        color: C.accent,
                        fontWeight: 600,
                      }}
                    >
                      {(m.total_mw / 1000).toFixed(2)}W
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Status Badge */}
      <div style={{ display: "flex", gap: 8 }}>
        {data.thermal_margin_c > 30 && (
          <Badge color={C.ok}>Thermal OK</Badge>
        )}
        {data.thermal_margin_c <= 30 && data.thermal_margin_c > 10 && (
          <Badge color={C.warn}>Thermal Warning</Badge>
        )}
        {data.thermal_margin_c <= 10 && (
          <Badge color={C.err}>Thermal Critical</Badge>
        )}
        <Badge color={C.cyan}>{caseMode === "typical" ? "Typical" : "Worst Case"}</Badge>
      </div>
    </div>
  );
}
