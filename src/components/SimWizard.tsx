import { useCallback, useEffect, useMemo, useState } from "react";
import { SimConfig } from "../types";
import { useTheme } from "../context/ThemeContext";
import { Btn, Input, Select, Badge } from "./shared";
import type { CocotbTest, CocotbResult } from "../hooks/useTauri";

interface SimWizardProps {
  projectDir?: string;
}

export default function SimWizard({ projectDir }: SimWizardProps = {}): React.ReactElement {
  const { C, MONO } = useTheme();
  const [tab, setTab] = useState<"script" | "cocotb">("cocotb");
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

  // ── Cocotb state ──
  const [cocotbTests, setCocotbTests] = useState<CocotbTest[]>([]);
  const [cocotbScanning, setCocotbScanning] = useState(false);
  const [cocotbError, setCocotbError] = useState<string | null>(null);
  const [cocotbFilter, setCocotbFilter] = useState("");
  const [cocotbResults, setCocotbResults] = useState<Record<string, CocotbResult>>({});
  const [cocotbRunning, setCocotbRunning] = useState<string | null>(null);
  const [cocotbRunningAll, setCocotbRunningAll] = useState(false);
  const [cocotbExpanded, setCocotbExpanded] = useState<string | null>(null);

  const scanCocotb = useCallback(async () => {
    if (!projectDir) return;
    setCocotbScanning(true);
    setCocotbError(null);
    try {
      const { discoverCocotbTests } = await import("../hooks/useTauri");
      const tests = await discoverCocotbTests(projectDir);
      setCocotbTests(tests);
    } catch (e) {
      setCocotbError(String(e));
      setCocotbTests([]);
    } finally {
      setCocotbScanning(false);
    }
  }, [projectDir]);

  useEffect(() => {
    if (tab === "cocotb" && projectDir) void scanCocotb();
  }, [tab, projectDir, scanCocotb]);

  const runOneCocotb = useCallback(async (t: CocotbTest) => {
    setCocotbRunning(t.dir);
    try {
      const { runCocotbTest } = await import("../hooks/useTauri");
      const result = await runCocotbTest(t.dir);
      setCocotbResults((r) => ({ ...r, [t.dir]: result }));
      return result;
    } catch (e) {
      const failed: CocotbResult = {
        vendor: t.vendor, project: t.project, dir: t.dir,
        passed: false, durationSec: 0, output: String(e), testCount: 0,
      };
      setCocotbResults((r) => ({ ...r, [t.dir]: failed }));
      return failed;
    } finally {
      setCocotbRunning(null);
    }
  }, []);

  const runAllCocotb = useCallback(async () => {
    setCocotbRunningAll(true);
    try {
      for (const t of filteredTests) {
        await runOneCocotb(t);
      }
    } finally {
      setCocotbRunningAll(false);
    }
    // filteredTests is captured via closure; eslint-disable-line
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runOneCocotb, cocotbTests, cocotbFilter]);

  const filteredTests = useMemo(() => {
    const q = cocotbFilter.trim().toLowerCase();
    if (!q) return cocotbTests;
    return cocotbTests.filter(
      (t) => t.vendor.toLowerCase().includes(q) || t.project.toLowerCase().includes(q),
    );
  }, [cocotbTests, cocotbFilter]);

  const aggregate = useMemo(() => {
    let ran = 0, pass = 0, fail = 0, totalTests = 0, totalDuration = 0;
    for (const r of Object.values(cocotbResults)) {
      ran += 1;
      if (r.passed) pass += 1; else fail += 1;
      totalTests += r.testCount;
      totalDuration += r.durationSec;
    }
    return { ran, pass, fail, totalTests, totalDuration };
  }, [cocotbResults]);

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
        <Badge color={C.cyan}>{tab === "cocotb" ? "cocotb" : simulator}</Badge>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.b1}` }}>
        {(
          [
            { id: "cocotb", label: "Cocotb Tests" },
            { id: "script",  label: "Generate Script" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "8px 14px",
              background: "transparent",
              border: "none",
              borderBottom: `2px solid ${tab === t.id ? C.accent : "transparent"}`,
              color: tab === t.id ? C.accent : C.t3,
              fontFamily: MONO,
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Cocotb panel */}
      {tab === "cocotb" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {!projectDir && (
            <div style={{
              padding: 12, background: C.s1, borderRadius: 6,
              border: `1px solid ${C.b1}`,
              fontSize: 10, fontFamily: MONO, color: C.t3,
            }}>
              Open a project first. Cocotb tests are discovered under
              <code style={{ color: C.t1 }}> &lt;project&gt;/tb/ </code>
              or <code style={{ color: C.t1 }}> &lt;project&gt;/examples/tb/ </code>.
            </div>
          )}

          {projectDir && (
            <>
              {/* Discovery + actions bar */}
              <div style={{
                padding: 10, background: C.s1, borderRadius: 6,
                border: `1px solid ${C.b1}`,
                display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
              }}>
                <Input
                  value={cocotbFilter}
                  onChange={setCocotbFilter}
                  placeholder="Filter by vendor or project\u2026"
                />
                <Btn small onClick={scanCocotb} disabled={cocotbScanning || cocotbRunningAll}>
                  {cocotbScanning ? "Scanning\u2026" : "Rescan"}
                </Btn>
                <Btn
                  small
                  onClick={runAllCocotb}
                  disabled={cocotbRunningAll || filteredTests.length === 0}
                >
                  {cocotbRunningAll
                    ? `Running ${Object.keys(cocotbResults).length}/${filteredTests.length}\u2026`
                    : `Run all (${filteredTests.length})`}
                </Btn>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 9, fontFamily: MONO, color: C.t3 }}>
                  {cocotbTests.length} discovered
                  {aggregate.ran > 0 && (
                    <>
                      {" \u2022 "}
                      <span style={{ color: C.ok }}>{aggregate.pass} pass</span>
                      {aggregate.fail > 0 && (
                        <>{" \u2022 "}<span style={{ color: C.err }}>{aggregate.fail} fail</span></>
                      )}
                      {" \u2022 "}{aggregate.totalTests} tests
                      {" \u2022 "}{aggregate.totalDuration.toFixed(1)}s
                    </>
                  )}
                </span>
              </div>

              {cocotbError && (
                <div style={{
                  padding: 10, background: `${C.err}15`, borderRadius: 6,
                  border: `1px solid ${C.err}60`,
                  fontSize: 9, fontFamily: MONO, color: C.err, whiteSpace: "pre-wrap",
                }}>
                  {cocotbError}
                </div>
              )}

              {/* Test list */}
              <div style={{
                background: C.s1, borderRadius: 6,
                border: `1px solid ${C.b1}`, overflow: "hidden",
              }}>
                {filteredTests.length === 0 && !cocotbScanning ? (
                  <div style={{
                    padding: 24, fontSize: 10, fontFamily: MONO, color: C.t3,
                    textAlign: "center",
                  }}>
                    No cocotb tests found under
                    <code style={{ color: C.t1 }}> tb/ </code>
                    {" "}or{" "}<code style={{ color: C.t1 }}> examples/tb/ </code>.
                  </div>
                ) : (
                  filteredTests.map((t) => {
                    const key = t.dir;
                    const r = cocotbResults[key];
                    const isRunning = cocotbRunning === key;
                    const isExpanded = cocotbExpanded === key;
                    const status: "idle" | "running" | "pass" | "fail" =
                      isRunning ? "running" : r ? (r.passed ? "pass" : "fail") : "idle";
                    const statusColor =
                      status === "pass" ? C.ok :
                      status === "fail" ? C.err :
                      status === "running" ? C.accent : C.t3;
                    return (
                      <div key={key} style={{ borderBottom: `1px solid ${C.b1}` }}>
                        <div style={{
                          display: "flex", gap: 10, alignItems: "center",
                          padding: "8px 12px",
                          background: isExpanded ? C.bg : undefined,
                        }}>
                          <span style={{
                            display: "inline-block", width: 8, height: 8,
                            borderRadius: "50%", background: statusColor,
                            animation: isRunning ? "pulse 1.2s infinite" : undefined,
                          }} />
                          <span style={{
                            fontSize: 10, fontFamily: MONO, color: C.t3,
                            width: 80, flexShrink: 0,
                          }}>
                            {t.vendor}
                          </span>
                          <span style={{
                            fontSize: 10, fontFamily: MONO, color: C.t1,
                            fontWeight: 600, flex: 1,
                          }}>
                            {t.project}
                          </span>
                          {r && (
                            <span style={{
                              fontSize: 9, fontFamily: MONO, color: C.t3,
                              fontVariantNumeric: "tabular-nums",
                            }}>
                              {r.testCount > 0 && `${r.testCount} tests \u2022 `}
                              {r.durationSec.toFixed(1)}s
                            </span>
                          )}
                          <Btn
                            small
                            onClick={() => runOneCocotb(t)}
                            disabled={isRunning || cocotbRunningAll}
                          >
                            {isRunning ? "Running" : r ? "Re-run" : "Run"}
                          </Btn>
                          <Btn
                            small
                            onClick={() => setCocotbExpanded(isExpanded ? null : key)}
                            disabled={!r}
                          >
                            {isExpanded ? "Hide" : "Output"}
                          </Btn>
                        </div>
                        {isExpanded && r && (
                          <pre style={{
                            margin: 0, padding: "8px 12px",
                            background: C.bg, fontSize: 9, fontFamily: MONO,
                            color: C.t2, whiteSpace: "pre-wrap", wordBreak: "break-all",
                            maxHeight: 300, overflow: "auto",
                            borderTop: `1px solid ${C.b1}`,
                          }}>
                            {r.output}
                          </pre>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "script" && <>

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
      </>}
    </div>
  );
}
