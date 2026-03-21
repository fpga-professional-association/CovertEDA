import { useState } from "react";
import { SimConfig } from "../types";
import { useTheme } from "../context/ThemeContext";
import { Btn, Input, Select, Badge } from "./shared";

export default function SimWizard(): React.ReactElement {
  const { C, MONO } = useTheme();
  const [simulator, setSimulator] = useState<SimConfig["simulator"]>("modelsim");
  const [topModule, setTopModule] = useState("counter");
  const [testbench, setTestbench] = useState("tb_counter.v");
  const [sourceFiles, setSourceFiles] = useState([
    "counter.v",
    "adder.v",
  ]);
  const [simTime, setSimTime] = useState("1000ns");
  const [timescale, setTimescale] = useState("1ns/1ps");
  const [useSdf, setUseSdf] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const generatedScript = `# Simulation script for ${simulator}
set project_name "sim_project"
set top_module ${topModule}
set sim_time ${simTime}
set timescale ${timescale}

# Compile sources
${sourceFiles.map((f) => `vlog ${f}`).join("\n")}
vlog ${testbench}

# Elaborate
vsim -top ${topModule} -t ${timescale}

# Add waves
add wave -r /*/

# Run simulation
run ${simTime}

# Exit
quit
`;

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
            SIMULATION WIZARD
          </div>
          <div style={{ fontSize: 14, fontFamily: MONO, fontWeight: 600, color: C.t1 }}>
            HDL Simulation Setup
          </div>
        </div>
        <Badge color={C.cyan}>{simulator}</Badge>
      </div>

      {/* Simulator Selection */}
      <div
        style={{
          padding: 12,
          background: C.s1,
          borderRadius: 6,
          border: `1px solid ${C.b1}`,
        }}
      >
        <label style={{ fontSize: 9, fontFamily: MONO, color: C.t2, display: "block", marginBottom: 8 }}>
          HDL Simulator
        </label>
        <Select
          value={simulator}
          onChange={(v) => setSimulator(v as SimConfig["simulator"])}
          options={[
            { value: "modelsim", label: "ModelSim" },
            { value: "active_hdl", label: "Active-HDL" },
            { value: "icarus", label: "Icarus Verilog" },
            { value: "verilator", label: "Verilator" },
          ]}
        />
        <div
          style={{
            fontSize: 8,
            fontFamily: MONO,
            color: C.t3,
            marginTop: 8,
          }}
        >
          {simulator === "modelsim" && "Mentor Graphics ModelSim or ModelSim SE"}
          {simulator === "active_hdl" && "Aldec Active-HDL"}
          {simulator === "icarus" && "Open-source Verilog simulator"}
          {simulator === "verilator" && "Fast open-source cycle-accurate simulator"}
        </div>
      </div>

      {/* Design Info */}
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
          DESIGN INFORMATION
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <label style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>
              Top Module
            </label>
            <Input
              value={topModule}
              onChange={setTopModule}
              placeholder="top_module"
            />
          </div>
          <div>
            <label style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>
              Testbench File
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <Input value={testbench} onChange={setTestbench} />
              <Btn small>Browse...</Btn>
            </div>
          </div>
        </div>
      </div>

      {/* Source Files */}
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
          SOURCE FILES ({sourceFiles.length})
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            maxHeight: 120,
            overflowY: "auto",
            marginBottom: 8,
          }}
        >
          {sourceFiles.map((file, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 6,
                background: C.bg,
                borderRadius: 3,
                border: `1px solid ${C.b1}`,
                fontSize: 8,
                fontFamily: MONO,
                color: C.t2,
              }}
            >
              <span>{file}</span>
              <button
                onClick={() => setSourceFiles(sourceFiles.filter((_, i) => i !== idx))}
                style={{
                  background: "transparent",
                  border: "none",
                  color: C.err,
                  cursor: "pointer",
                  fontSize: 10,
                  fontFamily: MONO,
                  fontWeight: 600,
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <Btn small style={{ width: "100%" }}>
          + Add Source File
        </Btn>
      </div>

      {/* Simulation Parameters */}
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
          SIMULATION PARAMETERS
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <label style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>
              Simulation Time
            </label>
            <Input value={simTime} onChange={setSimTime} placeholder="1000ns" />
          </div>
          <div>
            <label style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>
              Timescale
            </label>
            <Select
              value={timescale}
              onChange={setTimescale}
              options={[
                { value: "1ns/1ps", label: "1ns / 1ps" },
                { value: "1ns/100ps", label: "1ns / 100ps" },
                { value: "1us/1ns", label: "1us / 1ns" },
                { value: "100ns/1ns", label: "100ns / 1ns" },
              ]}
            />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: 8,
              background: C.bg,
              borderRadius: 4,
            }}
          >
            <input
              type="checkbox"
              checked={useSdf}
              onChange={(e) => setUseSdf(e.target.checked)}
              style={{ width: 16, height: 16, cursor: "pointer" }}
            />
            <label
              style={{
                fontSize: 8,
                fontFamily: MONO,
                color: C.t2,
                cursor: "pointer",
              }}
            >
              Use SDF Back-Annotation
            </label>
          </div>
        </div>
      </div>

      {/* Script Preview Toggle */}
      <div
        style={{
          display: "flex",
          gap: 8,
        }}
      >
        <Btn small onClick={() => setShowPreview(!showPreview)}>
          {showPreview ? "Hide Preview" : "Show Preview"}
        </Btn>
        <Btn small primary>
          Generate Script
        </Btn>
      </div>

      {/* Script Preview */}
      {showPreview && (
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
            GENERATED SCRIPT
          </div>
          <div
            style={{
              padding: 8,
              background: C.bg,
              borderRadius: 4,
              border: `1px solid ${C.b1}`,
              fontFamily: MONO,
              fontSize: 7,
              color: C.t3,
              maxHeight: 200,
              overflowY: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              lineHeight: "1.4",
            }}
          >
            {generatedScript}
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <Btn small>Copy</Btn>
            <Btn small>Save As...</Btn>
          </div>
        </div>
      )}

      {/* Summary */}
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
          SIMULATION SETUP SUMMARY
        </div>
        <div
          style={{
            fontSize: 8,
            fontFamily: MONO,
            color: C.t3,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div>
            <span style={{ color: C.t2 }}>Simulator:</span> {simulator}
          </div>
          <div>
            <span style={{ color: C.t2 }}>Top Module:</span> {topModule}
          </div>
          <div>
            <span style={{ color: C.t2 }}>Testbench:</span> {testbench}
          </div>
          <div>
            <span style={{ color: C.t2 }}>Sources:</span> {sourceFiles.length} files
          </div>
          <div>
            <span style={{ color: C.t2 }}>Sim Time:</span> {simTime}
          </div>
          <div>
            <span style={{ color: C.t2 }}>SDF:</span> {useSdf ? "Enabled" : "Disabled"}
          </div>
        </div>
      </div>
    </div>
  );
}
