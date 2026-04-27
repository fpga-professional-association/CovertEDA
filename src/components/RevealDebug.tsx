import { useState } from "react";
import { TriggerSignal } from "../types";
import { useTheme } from "../context/ThemeContext";
import { Btn, Select, Input, Badge, Collapsible } from "./shared";

interface DebugToolMeta {
  header: string;       // small label above main title
  title: string;        // main title
  subtitle: string;     // summary shown under the title
  commandHint: string;  // one-line hint about what CLI TCL would drive
}

const TOOL_META: Record<string, DebugToolMeta> = {
  radiant: {
    header: "REVEAL DEBUG CORE",
    title:  "Reveal — Integrated Logic Analyzer",
    subtitle: "Lattice Radiant in-system signal capture (Reveal2 core)",
    commandHint: "radiantc + ipgen reveal_core",
  },
  diamond: {
    header: "REVEAL DEBUG CORE",
    title:  "Reveal — Integrated Logic Analyzer",
    subtitle: "Lattice Diamond in-system signal capture",
    commandHint: "pnmainc + Reveal insertion TCL",
  },
  quartus: {
    header: "SIGNAL TAP II",
    title:  "SignalTap — Logic Analyzer",
    subtitle: "Intel/Altera SignalTap II embedded logic analyzer (.stp)",
    commandHint: "quartus_stp + SignalTap auto-instance",
  },
  quartus_pro: {
    header: "SIGNAL TAP II",
    title:  "SignalTap — Logic Analyzer",
    subtitle: "Intel/Altera Quartus Prime Pro SignalTap II embedded logic analyzer (.stp)",
    commandHint: "quartus_stp + SignalTap auto-instance",
  },
  vivado: {
    header: "INTEGRATED LOGIC ANALYZER (ILA)",
    title:  "ILA — Integrated Logic Analyzer",
    subtitle: "AMD/Xilinx in-system debug core (create_debug_core)",
    commandHint: "vivado -mode batch + create_debug_core ila",
  },
  libero: {
    header: "SMARTDEBUG",
    title:  "SmartDebug — Logic Analyzer",
    subtitle: "Microchip Libero in-system debug",
    commandHint: "libero + smart_debug_core",
  },
  ace: {
    header: "SNAPSHOT",
    title:  "SnapShot — Logic Analyzer",
    subtitle: "Achronix ACE integrated signal capture",
    commandHint: "ace + snapshot IP",
  },
  oss: {
    header: "DEBUG",
    title:  "Generic Signal Debug",
    subtitle: "No vendor-native ILA — use RTL probe + external capture",
    commandHint: "yosys probe insertion",
  },
};

interface RevealDebugProps {
  backendId?: string;
}

export default function RevealDebug({ backendId }: RevealDebugProps = {}): React.ReactElement {
  const { C, MONO } = useTheme();
  const meta = TOOL_META[backendId ?? "radiant"] ?? TOOL_META.radiant;
  const [tab, setTab] = useState<"inserter" | "analyzer">("inserter");
  const [signals, setSignals] = useState<TriggerSignal[]>([
    { name: "clk", operator: "rising", value: "1" },
    { name: "reset", operator: "equals", value: "0" },
  ]);
  const [sampleDepth, setSampleDepth] = useState("1024");
  const [clockSignal, setClockSignal] = useState("clk");
  const [triggerMode, setTriggerMode] = useState<"and" | "or" | "sequential">("and");
  const [connected, setConnected] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const handleAddSignal = () => {
    setSignals([...signals, { name: "", operator: "equals", value: "" }]);
  };

  const handleRemoveSignal = (idx: number) => {
    setSignals(signals.filter((_, i) => i !== idx));
  };

  const handleUpdateSignal = (idx: number, field: keyof TriggerSignal, value: string) => {
    const updated = [...signals];
    updated[idx] = { ...updated[idx], [field]: value };
    setSignals(updated);
  };

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
            {meta.header}
          </div>
          <div style={{ fontSize: 14, fontFamily: MONO, fontWeight: 600, color: C.t1 }}>
            {meta.title}
          </div>
          <div style={{ fontSize: 9, fontFamily: MONO, color: C.t3, marginTop: 2 }}>
            {meta.subtitle}  •  {meta.commandHint}
          </div>
        </div>
        <Badge color={connected ? C.ok : C.err}>
          {connected ? "Connected" : "Disconnected"}
        </Badge>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.b1}` }}>
        <button
          style={tabStyle(tab === "inserter")}
          onClick={() => setTab("inserter")}
        >
          Inserter
        </button>
        <button
          style={tabStyle(tab === "analyzer")}
          onClick={() => setTab("analyzer")}
        >
          Analyzer
        </button>
      </div>

      {/* Inserter Tab */}
      {tab === "inserter" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Clock Signal */}
          <Collapsible title="Clock Configuration" defaultOpen>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 9, fontFamily: MONO, color: C.t2 }}>
                Sampling Clock
              </label>
              <Input
                value={clockSignal}
                onChange={setClockSignal}
                placeholder="clk"
              />
              <label style={{ fontSize: 9, fontFamily: MONO, color: C.t2, marginTop: 8 }}>
                Sample Depth
              </label>
              <Select
                value={sampleDepth}
                onChange={setSampleDepth}
                options={[
                  { value: "256", label: "256 samples" },
                  { value: "512", label: "512 samples" },
                  { value: "1024", label: "1024 samples" },
                  { value: "2048", label: "2048 samples" },
                  { value: "4096", label: "4096 samples" },
                  { value: "8192", label: "8192 samples" },
                  { value: "16384", label: "16384 samples" },
                ]}
              />
            </div>
          </Collapsible>

          {/* Trigger Configuration */}
          <Collapsible title="Trigger Configuration" defaultOpen>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 9, fontFamily: MONO, color: C.t2, marginBottom: 4 }}>
                Trigger Mode
              </label>
              <Select
                value={triggerMode}
                onChange={(v) => setTriggerMode(v as "and" | "or" | "sequential")}
                options={[
                  { value: "and", label: "AND" },
                  { value: "or", label: "OR" },
                  { value: "sequential", label: "Sequential" },
                ]}
              />

              <div
                style={{
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: `1px solid ${C.b1}`,
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
                  Trigger Signals ({signals.length})
                </div>
                {signals.map((sig, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr 24px",
                      gap: 8,
                      marginBottom: 8,
                      padding: 8,
                      background: C.s1,
                      borderRadius: 4,
                      border: `1px solid ${C.b1}`,
                    }}
                  >
                    <Input
                      value={sig.name}
                      onChange={(v) => handleUpdateSignal(idx, "name", v)}
                      placeholder="Signal name"
                    />
                    <Select
                      value={sig.operator}
                      onChange={(v) =>
                        handleUpdateSignal(
                          idx,
                          "operator",
                          v as any
                        )
                      }
                      options={[
                        { value: "equals", label: "==" },
                        { value: "not_equals", label: "!=" },
                        { value: "rising", label: "↑ Rising" },
                        { value: "falling", label: "↓ Falling" },
                        { value: "dont_care", label: "X DC" },
                      ]}
                      compact
                    />
                    <Input
                      value={sig.value}
                      onChange={(v) => handleUpdateSignal(idx, "value", v)}
                      placeholder="Value"
                    />
                    <Btn
                      small
                      onClick={() => handleRemoveSignal(idx)}
                      style={{
                        padding: "3px 4px",
                        minWidth: "auto",
                      }}
                      title="Remove signal"
                    >
                      ✕
                    </Btn>
                  </div>
                ))}
                <Btn
                  small
                  onClick={handleAddSignal}
                  style={{ width: "100%", marginTop: 8 }}
                >
                  + Add Signal
                </Btn>
              </div>
            </div>
          </Collapsible>
        </div>
      )}

      {/* Analyzer Tab */}
      {tab === "analyzer" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Connection Controls */}
          <div style={{ display: "flex", gap: 8 }}>
            <Btn
              primary={!connected}
              onClick={() => setConnected(!connected)}
            >
              {connected ? "Disconnect" : "Connect"}
            </Btn>
            <Btn
              disabled={!connected}
              onClick={() => setCapturing(!capturing)}
              primary={capturing}
            >
              {capturing ? "Stop Capture" : "Start Capture"}
            </Btn>
          </div>

          {/* Waveform Display */}
          <div
            style={{
              padding: 12,
              background: C.s1,
              borderRadius: 6,
              border: `1px solid ${C.b1}`,
              minHeight: 200,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 9, fontFamily: MONO, color: C.t3 }}>
              WAVEFORM VIEW
            </div>

            {!connected ? (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: C.t3,
                  fontSize: 9,
                }}
              >
                Probe not connected
              </div>
            ) : capturing ? (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: C.accent,
                  fontSize: 10,
                  fontWeight: 600,
                }}
              >
                Capturing waveforms...
              </div>
            ) : (
              /* Simple timing diagram */
              <svg width="100%" height="120" style={{ overflow: "visible" }}>
                {/* Grid */}
                {[0, 50, 100, 150, 200, 250].map((x) => (
                  <line
                    key={`grid-${x}`}
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={120}
                    stroke={C.b1}
                    strokeWidth="0.5"
                  />
                ))}

                {/* CLK signal */}
                <text x="4" y="20" style={{ fontSize: "8px", fill: C.t3, fontFamily: MONO }}>
                  clk
                </text>
                <polyline
                  points="0,25 25,25 25,35 50,35 50,25 75,25 75,35 100,35 100,25"
                  fill="none"
                  stroke={C.accent}
                  strokeWidth="1.5"
                />

                {/* Reset signal */}
                <text x="4" y="55" style={{ fontSize: "8px", fill: C.t3, fontFamily: MONO }}>
                  rst
                </text>
                <polyline
                  points="0,65 30,65 30,60 100,60"
                  fill="none"
                  stroke={C.orange}
                  strokeWidth="1.5"
                />
                <polyline
                  points="100,60 100,70 250,70"
                  fill="none"
                  stroke={C.orange}
                  strokeWidth="1.5"
                />

                {/* Data signal */}
                <text x="4" y="95" style={{ fontSize: "8px", fill: C.t3, fontFamily: MONO }}>
                  data
                </text>
                <polyline
                  points="0,100 50,100 50,105 100,105 100,100 150,100 150,105 200,105 200,100"
                  fill="none"
                  stroke={C.ok}
                  strokeWidth="1.5"
                />

                {/* Time labels */}
                <text x="20" y="115" style={{ fontSize: "7px", fill: C.t3, textAnchor: "middle" }}>
                  0ns
                </text>
                <text x="100" y="115" style={{ fontSize: "7px", fill: C.t3, textAnchor: "middle" }}>
                  500ns
                </text>
              </svg>
            )}
          </div>

          {/* Sample Information */}
          <div
            style={{
              padding: 8,
              background: C.s1,
              borderRadius: 4,
              border: `1px solid ${C.b1}`,
              fontSize: 8,
              fontFamily: MONO,
              color: C.t3,
            }}
          >
            <div>Sample Depth: {sampleDepth} samples</div>
            <div>Trigger Mode: {triggerMode.toUpperCase()}</div>
            <div>Status: {capturing ? "Acquiring..." : connected ? "Idle" : "Disconnected"}</div>
          </div>
        </div>
      )}
    </div>
  );
}
