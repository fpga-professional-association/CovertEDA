import { useState } from "react";
import { EcoChange } from "../types";
import { useTheme } from "../context/ThemeContext";
import { Btn, Input, Select } from "./shared";

interface EcoEditorProps {
  changes?: EcoChange[] | null;
}

export default function EcoEditor({ changes = [] }: EcoEditorProps): React.ReactElement {
  const { C, MONO } = useTheme();
  const [tab, setTab] = useState<"io" | "pll" | "memory" | "sysconfig">("io");
  const [ioSettings, setIoSettings] = useState([
    {
      name: "clk",
      type: "input",
      drive: "N/A",
      pull: "None",
      slew: "Fast",
    },
    {
      name: "reset",
      type: "input",
      drive: "N/A",
      pull: "None",
      slew: "Fast",
    },
    {
      name: "out",
      type: "output",
      drive: "12mA",
      pull: "N/A",
      slew: "Slow",
    },
  ]);
  const [pllParams, setPllParams] = useState([
    { instance: "pll_0", parameter: "DIVR", value: "5" },
    { instance: "pll_0", parameter: "DIVF", value: "49" },
  ]);
  const [memoryInitFile, setMemoryInitFile] = useState("memory.hex");
  const [appliedChanges, setAppliedChanges] = useState<EcoChange[]>(changes || []);

  const tabStyle = (active: boolean) => ({
    padding: "8px 12px",
    fontSize: 9,
    fontFamily: MONO,
    fontWeight: 600,
    cursor: "pointer",
    borderBottom: `2px solid ${active ? C.accent : C.b1}`,
    color: active ? C.accent : C.t3,
    background: "transparent",
    border: "none",
    transition: "color 100ms ease-out",
  });

  const handleApplyChanges = () => {
    // Convert current settings to EcoChanges
    const newChanges: EcoChange[] = [];
    ioSettings.forEach((io) => {
      newChanges.push({
        type: "io_setting",
        target: io.name,
        parameter: "drive",
        old_value: "default",
        new_value: io.drive,
      });
    });
    pllParams.forEach((pll) => {
      newChanges.push({
        type: "pll_parameter",
        target: pll.instance,
        parameter: pll.parameter,
        old_value: "default",
        new_value: pll.value,
      });
    });
    setAppliedChanges(newChanges);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
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
            DEVICE ATTRIBUTES
          </div>
          <div style={{ fontSize: 14, fontFamily: MONO, fontWeight: 600, color: C.t1 }}>
            Attributes
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn small disabled={appliedChanges.length === 0}>
            Undo
          </Btn>
          <Btn small primary onClick={handleApplyChanges}>
            Apply
          </Btn>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.b1}` }}>
        {["io", "pll", "memory", "sysconfig"].map((t) => (
          <button
            key={t}
            style={tabStyle(tab === t)}
            onClick={() => setTab(t as any)}
          >
            {t === "io"
              ? "I/O Settings"
              : t === "pll"
                ? "PLL"
                : t === "memory"
                  ? "Memory Init"
                  : "SysConfig"}
          </button>
        ))}
      </div>

      {/* I/O Settings Tab */}
      {tab === "io" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              padding: 12,
              background: C.s1,
              borderRadius: 6,
              border: `1px solid ${C.b1}`,
              overflowX: "auto",
            }}
          >
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
                  <th style={{ textAlign: "left", padding: "6px 0" }}>Port Name</th>
                  <th style={{ textAlign: "left", padding: "6px 0" }}>Type</th>
                  <th style={{ textAlign: "left", padding: "6px 0" }}>Drive</th>
                  <th style={{ textAlign: "left", padding: "6px 0" }}>Pull</th>
                  <th style={{ textAlign: "left", padding: "6px 0" }}>Slew</th>
                </tr>
              </thead>
              <tbody>
                {ioSettings.map((io, idx) => (
                  <tr key={idx} style={{ borderBottom: `1px solid ${C.b1}`, color: C.t2 }}>
                    <td style={{ padding: "6px 0" }}>{io.name}</td>
                    <td style={{ padding: "6px 0" }}>
                      <Select
                        value={io.type}
                        onChange={(v) => {
                          const updated = [...ioSettings];
                          updated[idx].type = v;
                          setIoSettings(updated);
                        }}
                        options={[
                          { value: "input", label: "Input" },
                          { value: "output", label: "Output" },
                          { value: "inout", label: "Inout" },
                        ]}
                        compact
                      />
                    </td>
                    <td style={{ padding: "6px 0" }}>
                      <Input
                        value={io.drive}
                        onChange={(v) => {
                          const updated = [...ioSettings];
                          updated[idx].drive = v;
                          setIoSettings(updated);
                        }}
                        placeholder="12mA"
                      />
                    </td>
                    <td style={{ padding: "6px 0" }}>
                      <Select
                        value={io.pull}
                        onChange={(v) => {
                          const updated = [...ioSettings];
                          updated[idx].pull = v;
                          setIoSettings(updated);
                        }}
                        options={[
                          { value: "None", label: "None" },
                          { value: "Up", label: "Up" },
                          { value: "Down", label: "Down" },
                        ]}
                        compact
                      />
                    </td>
                    <td style={{ padding: "6px 0" }}>
                      <Select
                        value={io.slew}
                        onChange={(v) => {
                          const updated = [...ioSettings];
                          updated[idx].slew = v;
                          setIoSettings(updated);
                        }}
                        options={[
                          { value: "Slow", label: "Slow" },
                          { value: "Fast", label: "Fast" },
                        ]}
                        compact
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Btn
            small
            onClick={() =>
              setIoSettings([
                ...ioSettings,
                {
                  name: "",
                  type: "input",
                  drive: "N/A",
                  pull: "None",
                  slew: "Fast",
                },
              ])
            }
          >
            + Add Port
          </Btn>
        </div>
      )}

      {/* PLL Parameters Tab */}
      {tab === "pll" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              padding: 12,
              background: C.s1,
              borderRadius: 6,
              border: `1px solid ${C.b1}`,
              overflowX: "auto",
            }}
          >
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
                  <th style={{ textAlign: "left", padding: "6px 0" }}>Instance</th>
                  <th style={{ textAlign: "left", padding: "6px 0" }}>Parameter</th>
                  <th style={{ textAlign: "left", padding: "6px 0" }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {pllParams.map((pll, idx) => (
                  <tr key={idx} style={{ borderBottom: `1px solid ${C.b1}`, color: C.t2 }}>
                    <td style={{ padding: "6px 0" }}>
                      <Input
                        value={pll.instance}
                        onChange={(v) => {
                          const updated = [...pllParams];
                          updated[idx].instance = v;
                          setPllParams(updated);
                        }}
                      />
                    </td>
                    <td style={{ padding: "6px 0" }}>
                      <Input
                        value={pll.parameter}
                        onChange={(v) => {
                          const updated = [...pllParams];
                          updated[idx].parameter = v;
                          setPllParams(updated);
                        }}
                      />
                    </td>
                    <td style={{ padding: "6px 0" }}>
                      <Input
                        value={pll.value}
                        onChange={(v) => {
                          const updated = [...pllParams];
                          updated[idx].value = v;
                          setPllParams(updated);
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Btn
            small
            onClick={() =>
              setPllParams([
                ...pllParams,
                { instance: "", parameter: "", value: "" },
              ])
            }
          >
            + Add Parameter
          </Btn>
        </div>
      )}

      {/* Memory Initialization Tab */}
      {tab === "memory" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              padding: 12,
              background: C.s1,
              borderRadius: 6,
              border: `1px solid ${C.b1}`,
            }}
          >
            <label style={{ fontSize: 9, fontFamily: MONO, color: C.t2, display: "block", marginBottom: 8 }}>
              Memory Initialization File
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <Input value={memoryInitFile} onChange={setMemoryInitFile} />
              <Btn small>Browse...</Btn>
            </div>
            <div
              style={{
                fontSize: 8,
                fontFamily: MONO,
                color: C.t3,
                marginTop: 8,
              }}
            >
              Supports: .hex, .mem, .mif, .coe formats
            </div>
          </div>

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
                marginBottom: 8,
              }}
            >
              File Preview
            </div>
            <div
              style={{
                padding: 8,
                background: C.bg,
                borderRadius: 4,
                border: `1px solid ${C.b1}`,
                fontFamily: MONO,
                fontSize: 8,
                color: C.t3,
                maxHeight: 150,
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {`@0000 FF F0 A5 5A 3C\n@0005 12 34 56 78 9A\n@000A BC DE F0 00 11\n@000F 22 33 44 55 66`}
            </div>
          </div>
        </div>
      )}

      {/* SysConfig Tab */}
      {tab === "sysconfig" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              padding: 12,
              background: C.s1,
              borderRadius: 6,
              border: `1px solid ${C.b1}`,
            }}
          >
            <label style={{ fontSize: 9, fontFamily: MONO, color: C.t2, marginBottom: 8, display: "block" }}>
              System Configuration
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <label style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>
                  FPGA Voltage
                </label>
                <Select
                  value="3.3V"
                  onChange={() => {}}
                  options={[
                    { value: "1.8V", label: "1.8V" },
                    { value: "2.5V", label: "2.5V" },
                    { value: "3.3V", label: "3.3V" },
                  ]}
                />
              </div>
              <div>
                <label style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>
                  Config Mode
                </label>
                <Select
                  value="JTAG"
                  onChange={() => {}}
                  options={[
                    { value: "JTAG", label: "JTAG" },
                    { value: "SPI", label: "SPI" },
                    { value: "BPI", label: "BPI" },
                  ]}
                />
              </div>
              <div>
                <label style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>
                  Startup Clock
                </label>
                <Select
                  value="CCLK"
                  onChange={() => {}}
                  options={[
                    { value: "CCLK", label: "CCLK" },
                    { value: "CCLK/2", label: "CCLK/2" },
                    { value: "CCLK/4", label: "CCLK/4" },
                  ]}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Changes Summary */}
      {appliedChanges.length > 0 && (
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
              marginBottom: 8,
            }}
          >
            APPLIED CHANGES ({appliedChanges.length})
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              maxHeight: 120,
              overflowY: "auto",
            }}
          >
            {appliedChanges.slice(0, 5).map((change, idx) => (
              <div
                key={idx}
                style={{
                  fontSize: 8,
                  fontFamily: MONO,
                  color: C.t3,
                  padding: 4,
                  background: C.bg,
                  borderRadius: 2,
                  borderLeft: `2px solid ${C.accent}`,
                  paddingLeft: 8,
                }}
              >
                <span style={{ color: C.t2 }}>{change.target}</span>
                <span style={{ color: C.t3 }}> / </span>
                <span style={{ color: C.accent }}>{change.parameter}</span>
                <span style={{ color: C.t3 }}> : </span>
                <span style={{ color: C.warn }}>{change.old_value}</span>
                <span style={{ color: C.t3 }}> → </span>
                <span style={{ color: C.ok }}>{change.new_value}</span>
              </div>
            ))}
            {appliedChanges.length > 5 && (
              <div style={{ fontSize: 8, color: C.t3, fontFamily: MONO }}>
                + {appliedChanges.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
