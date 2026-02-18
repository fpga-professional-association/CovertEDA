import { useState, useMemo, useCallback } from "react";
import { useTheme } from "../context/ThemeContext";
import { Btn, Badge, Select } from "./shared";
import { Pin, Clock } from "./Icons";

export interface PinAssignment {
  net: string;
  pin: string;
  dir: "input" | "output" | "inout";
  ioStandard: string;
  drive?: string;
  pull?: string;
  slew?: string;
  openDrain?: boolean;
  schmitt?: boolean;
  diffPair?: string;
  bank?: string;
  locked: boolean;
}

export interface TimingConstraint {
  type: "clock" | "input_delay" | "output_delay" | "false_path" | "multicycle" | "max_delay" | "min_delay" | "group";
  name: string;
  target: string;
  value: string;
  reference?: string;
  enabled: boolean;
}

// Per-backend I/O standards
const IO_STANDARDS: Record<string, string[]> = {
  radiant: [
    "LVCMOS33", "LVCMOS25", "LVCMOS18", "LVCMOS15", "LVCMOS12", "LVCMOS10",
    "LVTTL",
    "SSTL135_I", "SSTL135_II", "SSTL15_I", "SSTL15_II", "SSTL18_I", "SSTL18_II",
    "HSUL12",
    "LVDS", "SUBLVDS", "SLVS", "MIPI_DPHY",
    "HSTL15_I", "HSTL18_I",
    "LVPECL33",
  ],
  diamond: [
    "LVCMOS33", "LVCMOS25", "LVCMOS18", "LVCMOS15", "LVCMOS12",
    "LVTTL",
    "SSTL135", "SSTL15", "SSTL18", "SSTL25",
    "LVDS", "LVDS25", "BLVDS25", "MLVDS25",
    "HSTL15", "HSTL18",
    "LVPECL33",
    "PCI33", "PCI66",
  ],
  quartus: [
    "3.3-V LVTTL", "3.3-V LVCMOS", "2.5 V", "1.8 V", "1.5 V", "1.2 V",
    "3.3-V PCI", "3.3-V PCI-X",
    "SSTL-135", "SSTL-15 Class I", "SSTL-15 Class II", "SSTL-18 Class I", "SSTL-18 Class II",
    "HSTL-15 Class I", "HSTL-18 Class I",
    "LVDS", "Mini-LVDS", "RSDS",
    "Differential SSTL-135", "Differential SSTL-15 Class I",
    "HSUL-12",
  ],
  vivado: [
    "LVCMOS33", "LVCMOS25", "LVCMOS18", "LVCMOS15", "LVCMOS12",
    "LVTTL",
    "SSTL135", "SSTL135_R", "SSTL15", "SSTL15_R", "SSTL18_I", "SSTL18_II",
    "HSTL_I", "HSTL_II", "HSTL_I_18", "HSUL_12",
    "LVDS", "LVDS_25", "DIFF_SSTL135", "DIFF_SSTL15", "DIFF_HSTL_I",
    "TMDS_33",
    "POD12", "POD12_DCI",
  ],
  oss: [
    "LVCMOS33", "LVCMOS25", "LVCMOS18", "LVCMOS15", "LVCMOS12",
    "LVTTL",
    "SSTL135_I", "SSTL135_II", "SSTL15_I",
    "LVDS",
  ],
};

const DRIVE_STRENGTHS: Record<string, string[]> = {
  radiant: ["2mA", "4mA", "6mA", "8mA", "12mA", "16mA"],
  diamond: ["2mA", "4mA", "6mA", "8mA", "12mA", "16mA", "20mA", "24mA"],
  quartus: ["2mA", "4mA", "6mA", "8mA", "10mA", "12mA", "16mA", "20mA", "24mA"],
  vivado: ["2", "4", "6", "8", "12", "16", "24"],
  oss: ["4mA", "8mA", "12mA", "16mA"],
};

const PULL_OPTIONS = ["None", "Up", "Down", "Bus Hold"];
const SLEW_OPTIONS = ["Slow", "Fast"];
const BANK_NUMBERS = ["0", "1", "2", "3", "4", "5", "6", "7", "8"];

type ConstraintTab = "pins" | "timing" | "generated";

interface ConstraintEditorProps {
  backendId: string;
  device: string;
  projectDir: string;
}

function cellInput(
  value: string,
  onChange: (v: string) => void,
  C: ReturnType<typeof useTheme>["C"],
  MONO: string,
  width?: number,
) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      style={{
        fontSize: 8, fontFamily: MONO, background: C.bg,
        color: C.t1, border: `1px solid ${C.b1}`, borderRadius: 2,
        padding: "1px 4px", outline: "none", width: width ?? 50,
        boxSizing: "border-box",
      }}
    />
  );
}

export default function ConstraintEditor({ backendId, device }: ConstraintEditorProps) {
  const { C, MONO } = useTheme();
  const [tab, setTab] = useState<ConstraintTab>("pins");
  const [pins, setPins] = useState<PinAssignment[]>([
    { net: "clk", pin: "E1", dir: "input", ioStandard: "LVCMOS33", pull: "None", slew: "Fast", locked: true, bank: "0" },
    { net: "rst_n", pin: "D1", dir: "input", ioStandard: "LVCMOS33", pull: "Up", slew: "Slow", locked: true, bank: "0" },
    { net: "led[0]", pin: "A4", dir: "output", ioStandard: "LVCMOS33", drive: "8mA", pull: "None", slew: "Slow", locked: true, bank: "1" },
    { net: "led[1]", pin: "B4", dir: "output", ioStandard: "LVCMOS33", drive: "8mA", pull: "None", slew: "Slow", locked: true, bank: "1" },
    { net: "led[2]", pin: "C4", dir: "output", ioStandard: "LVCMOS33", drive: "8mA", pull: "None", slew: "Slow", locked: true, bank: "1" },
    { net: "led[3]", pin: "D4", dir: "output", ioStandard: "LVCMOS33", drive: "8mA", pull: "None", slew: "Slow", locked: true, bank: "1" },
    { net: "led[4]", pin: "A5", dir: "output", ioStandard: "LVCMOS33", drive: "8mA", pull: "None", slew: "Slow", locked: false, bank: "1" },
    { net: "led[5]", pin: "B5", dir: "output", ioStandard: "LVCMOS33", drive: "8mA", pull: "None", slew: "Slow", locked: false, bank: "1" },
    { net: "led[6]", pin: "C5", dir: "output", ioStandard: "LVCMOS33", drive: "8mA", pull: "None", slew: "Slow", locked: false, bank: "1" },
    { net: "led[7]", pin: "D5", dir: "output", ioStandard: "LVCMOS33", drive: "8mA", pull: "None", slew: "Slow", locked: false, bank: "1" },
  ]);
  const [timing, setTiming] = useState<TimingConstraint[]>([
    { type: "clock", name: "clk", target: "clk", value: "12.0", enabled: true },
  ]);
  const [search, setSearch] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showAddTiming, setShowAddTiming] = useState(false);
  const [newPin, setNewPin] = useState<PinAssignment>({
    net: "", pin: "", dir: "input", ioStandard: "LVCMOS33", pull: "None", slew: "Slow", locked: false,
  });
  const [newTiming, setNewTiming] = useState<TimingConstraint>({
    type: "clock", name: "", target: "", value: "", enabled: true,
  });

  const standards = IO_STANDARDS[backendId] ?? IO_STANDARDS.radiant;
  const drives = DRIVE_STRENGTHS[backendId] ?? DRIVE_STRENGTHS.radiant;

  const filtered = useMemo(() => {
    if (!search) return pins;
    const q = search.toLowerCase();
    return pins.filter(
      (p) => p.net.toLowerCase().includes(q) || p.pin.toLowerCase().includes(q) ||
        p.ioStandard.toLowerCase().includes(q) || (p.bank ?? "").toLowerCase().includes(q)
    );
  }, [pins, search]);

  const updatePin = useCallback((idx: number, field: keyof PinAssignment, value: string | boolean) => {
    setPins((prev) => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  }, []);

  const removePin = useCallback((idx: number) => {
    setPins((prev) => prev.filter((_, i) => i !== idx));
    setEditingIdx(null);
  }, []);

  const addPin = useCallback(() => {
    if (newPin.net && newPin.pin) {
      setPins((prev) => [...prev, { ...newPin }]);
      setNewPin({ net: "", pin: "", dir: "input", ioStandard: "LVCMOS33", pull: "None", slew: "Slow", locked: false });
      setShowAdd(false);
    }
  }, [newPin]);

  const updateTiming = useCallback((idx: number, field: keyof TimingConstraint, value: string | boolean) => {
    setTiming((prev) => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));
  }, []);

  const removeTiming = useCallback((idx: number) => {
    setTiming((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const addTiming = useCallback(() => {
    if (newTiming.name && newTiming.target) {
      setTiming((prev) => [...prev, { ...newTiming }]);
      setNewTiming({ type: "clock", name: "", target: "", value: "", enabled: true });
      setShowAddTiming(false);
    }
  }, [newTiming]);

  // Generate constraints text per backend
  const generateConstraintText = useMemo(() => {
    const lines: string[] = [];

    if (backendId === "radiant" || backendId === "diamond") {
      lines.push(`## Pin Constraints (PDC/LPF format)`);
      for (const p of pins) {
        lines.push(`ldc_set_location -site {${p.pin}} [get_ports {${p.net}}]`);
        let iobuf = `IO_TYPE=${p.ioStandard}`;
        if (p.drive) iobuf += ` DRIVE=${p.drive}`;
        if (p.pull && p.pull !== "None") iobuf += ` PULLMODE=${p.pull === "Up" ? "UP" : p.pull === "Down" ? "DOWN" : "BUSHOLD"}`;
        if (p.slew) iobuf += ` SLEWRATE=${p.slew === "Fast" ? "FAST" : "SLOW"}`;
        if (p.openDrain) iobuf += ` OPENDRAIN=ON`;
        if (p.schmitt) iobuf += ` HYSTERESIS=ON`;
        lines.push(`ldc_set_port -iobuf {${iobuf}} [get_ports {${p.net}}]`);
        lines.push("");
      }
      lines.push(`\n## Timing Constraints (SDC format)`);
      for (const t of timing) {
        if (!t.enabled) { lines.push(`# ${formatTimingLine(t, "sdc")}`); continue; }
        lines.push(formatTimingLine(t, "sdc"));
      }
    } else if (backendId === "quartus") {
      lines.push(`## Pin Assignments (QSF format)`);
      for (const p of pins) {
        lines.push(`set_location_assignment PIN_${p.pin} -to ${p.net}`);
        lines.push(`set_instance_assignment -name IO_STANDARD "${p.ioStandard}" -to ${p.net}`);
        if (p.drive) lines.push(`set_instance_assignment -name CURRENT_STRENGTH_NEW "${p.drive}" -to ${p.net}`);
        if (p.pull && p.pull !== "None") {
          const qPull = p.pull === "Up" ? "PULLUP" : p.pull === "Down" ? "PULLDOWN" : "BUSHOLD";
          lines.push(`set_instance_assignment -name WEAK_PULL_UP_RESISTOR ${qPull === "PULLUP" ? "ON" : "OFF"} -to ${p.net}`);
        }
        if (p.slew === "Fast") lines.push(`set_instance_assignment -name SLEW_RATE 2 -to ${p.net}`);
        if (p.openDrain) lines.push(`set_instance_assignment -name OPEN_DRAIN_OUTPUT ON -to ${p.net}`);
        lines.push("");
      }
      lines.push(`\n## Timing Constraints (SDC format)`);
      for (const t of timing) {
        if (!t.enabled) { lines.push(`# ${formatTimingLine(t, "sdc")}`); continue; }
        lines.push(formatTimingLine(t, "sdc"));
      }
    } else if (backendId === "vivado") {
      lines.push(`## Pin Constraints (XDC format)`);
      for (const p of pins) {
        lines.push(`set_property PACKAGE_PIN ${p.pin} [get_ports {${p.net}}]`);
        lines.push(`set_property IOSTANDARD ${p.ioStandard} [get_ports {${p.net}}]`);
        if (p.drive) lines.push(`set_property DRIVE ${p.drive} [get_ports {${p.net}}]`);
        if (p.pull && p.pull !== "None") {
          const xPull = p.pull === "Up" ? "TRUE" : "FALSE";
          lines.push(`set_property PULLUP ${xPull} [get_ports {${p.net}}]`);
        }
        if (p.slew) lines.push(`set_property SLEW ${p.slew === "Fast" ? "FAST" : "SLOW"} [get_ports {${p.net}}]`);
        lines.push("");
      }
      lines.push(`\n## Timing Constraints (XDC format)`);
      for (const t of timing) {
        if (!t.enabled) { lines.push(`# ${formatTimingLine(t, "sdc")}`); continue; }
        lines.push(formatTimingLine(t, "sdc"));
      }
    } else {
      // OSS - PCF format
      lines.push(`## Pin Constraints (PCF format)`);
      for (const p of pins) {
        lines.push(`set_io ${p.net} ${p.pin}`);
      }
      lines.push(`\n## Timing Constraints`);
      for (const t of timing) {
        if (t.type === "clock") {
          lines.push(`# Clock: ${t.name} = ${t.value} MHz on ${t.target}`);
        }
      }
    }

    return lines.join("\n");
  }, [pins, timing, backendId]);

  const unconstrainedClocks = useMemo(() => {
    const clockNets = pins.filter((p) => p.net.toLowerCase().includes("clk") || p.net.toLowerCase().includes("clock"));
    const constrainedNets = timing.filter((t) => t.type === "clock" && t.enabled).map((t) => t.target);
    return clockNets.filter((p) => !constrainedNets.includes(p.net));
  }, [pins, timing]);

  const panelP: React.CSSProperties = {
    background: C.s1, borderRadius: 7, border: `1px solid ${C.b1}`, overflow: "hidden", padding: 14,
  };

  const cellStyle: React.CSSProperties = {
    fontSize: 8, fontFamily: MONO, padding: "3px 4px", whiteSpace: "nowrap",
  };

  const thStyle: React.CSSProperties = {
    ...cellStyle, textAlign: "left", fontWeight: 700, color: C.t3,
    padding: "4px 4px 6px", position: "sticky" as const, top: 0,
    background: C.s1, zIndex: 1, borderBottom: `2px solid ${C.b1}`,
  };

  const constraintFormat = backendId === "radiant" || backendId === "diamond" ? "PDC" :
    backendId === "quartus" ? "QSF" : backendId === "vivado" ? "XDC" : "PCF";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      {/* Unconstrained clock warning */}
      {unconstrainedClocks.length > 0 && (
        <div style={{
          padding: "8px 12px", borderRadius: 6, background: `${C.warn}12`,
          border: `1px solid ${C.warn}30`, display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ color: C.warn, fontSize: 14 }}>{"\u26A0"}</span>
          <div>
            <div style={{ fontSize: 9, fontFamily: MONO, fontWeight: 700, color: C.warn }}>
              Unconstrained Clock{unconstrainedClocks.length > 1 ? "s" : ""} Detected
            </div>
            <div style={{ fontSize: 8, fontFamily: MONO, color: C.t2, marginTop: 2 }}>
              {unconstrainedClocks.map((p) => p.net).join(", ")} {unconstrainedClocks.length === 1 ? "has" : "have"} no
              timing constraint. Add a clock constraint in the Timing tab to ensure correct operation.
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <Btn small onClick={() => setTab("timing")} style={{ fontSize: 7 }}>
            Add Constraint
          </Btn>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 1, background: C.bg, borderRadius: 6, padding: 2 }}>
        {(["pins", "timing", "generated"] as ConstraintTab[]).map((t) => (
          <div
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, textAlign: "center", padding: "5px 8px", borderRadius: 4,
              fontSize: 9, fontFamily: MONO, fontWeight: 600, cursor: "pointer",
              background: tab === t ? C.s1 : "transparent",
              color: tab === t ? C.t1 : C.t3,
              border: tab === t ? `1px solid ${C.b1}` : "1px solid transparent",
            }}
          >
            {t === "pins" && <><Pin /> Pin Assignments ({pins.length})</>}
            {t === "timing" && <><Clock /> Timing ({timing.length})</>}
            {t === "generated" && <>{constraintFormat} Output</>}
          </div>
        ))}
      </div>

      {/* Pin Assignments Spreadsheet */}
      {tab === "pins" && (
        <div style={panelP}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.t1 }}>Pin Assignments</span>
            <Badge color={C.accent}>{pins.length} pins</Badge>
            <Badge color={C.ok}>{pins.filter((p) => p.locked).length} locked</Badge>
            <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>{device}</span>
            <div style={{ flex: 1 }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter nets/pins..."
              style={{
                padding: "3px 8px", fontSize: 8, fontFamily: MONO,
                background: C.bg, color: C.t1, border: `1px solid ${C.b1}`,
                borderRadius: 3, outline: "none", width: 150,
              }}
            />
            <Btn small onClick={() => setShowAdd(true)}>+ Add Pin</Btn>
          </div>

          {/* Add Pin Form */}
          {showAdd && (
            <div style={{
              display: "flex", gap: 6, padding: "8px 10px", marginBottom: 8,
              background: C.bg, borderRadius: 4, border: `1px solid ${C.accent}30`,
              alignItems: "center", flexWrap: "wrap",
            }}>
              {cellInput(newPin.net, (v) => setNewPin((p) => ({ ...p, net: v })), C, MONO, 90)}
              {cellInput(newPin.pin, (v) => setNewPin((p) => ({ ...p, pin: v })), C, MONO, 40)}
              <Select compact value={newPin.dir} onChange={(v) => setNewPin((p) => ({ ...p, dir: v as PinAssignment["dir"] }))}
                options={[{ value: "input", label: "Input" }, { value: "output", label: "Output" }, { value: "inout", label: "Inout" }]} />
              <Select compact value={newPin.ioStandard} onChange={(v) => setNewPin((p) => ({ ...p, ioStandard: v }))}
                options={standards.map((s) => ({ value: s, label: s }))} />
              <Btn small primary onClick={addPin}>Add</Btn>
              <Btn small onClick={() => setShowAdd(false)}>Cancel</Btn>
            </div>
          )}

          {/* Spreadsheet Table */}
          <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 320px)", border: `1px solid ${C.b1}`, borderRadius: 4 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 20 }}>{"\u2713"}</th>
                  <th style={{ ...thStyle, minWidth: 90 }}>Net Name</th>
                  <th style={{ ...thStyle, width: 50 }}>Pin</th>
                  <th style={{ ...thStyle, width: 55 }}>Dir</th>
                  <th style={{ ...thStyle, minWidth: 100 }}>I/O Standard</th>
                  <th style={{ ...thStyle, width: 55 }}>Drive</th>
                  <th style={{ ...thStyle, width: 55 }}>Pull</th>
                  <th style={{ ...thStyle, width: 45 }}>Slew</th>
                  <th style={{ ...thStyle, width: 30 }} title="Open Drain">OD</th>
                  <th style={{ ...thStyle, width: 30 }} title="Schmitt Trigger">ST</th>
                  <th style={{ ...thStyle, width: 35 }}>Bank</th>
                  <th style={{ ...thStyle, minWidth: 60 }}>Diff Pair</th>
                  <th style={{ ...thStyle, width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const realIdx = pins.indexOf(p);
                  const editing = editingIdx === realIdx;
                  return (
                    <tr
                      key={i}
                      onClick={() => setEditingIdx(editing ? null : realIdx)}
                      style={{
                        borderBottom: `1px solid ${C.b1}15`,
                        cursor: "pointer",
                        background: editing ? `${C.accent}08` : i % 2 === 0 ? "transparent" : `${C.bg}50`,
                      }}
                    >
                      {/* Lock */}
                      <td style={cellStyle}>
                        <input type="checkbox" checked={p.locked}
                          onChange={(e) => { e.stopPropagation(); updatePin(realIdx, "locked", e.target.checked); }}
                          onClick={(e) => e.stopPropagation()}
                          style={{ accentColor: C.accent }} />
                      </td>
                      {/* Net */}
                      <td style={{ ...cellStyle, color: C.t1, fontWeight: 600 }}>
                        {editing
                          ? cellInput(p.net, (v) => updatePin(realIdx, "net", v), C, MONO, 85)
                          : p.net
                        }
                      </td>
                      {/* Pin */}
                      <td style={{ ...cellStyle, color: C.accent, fontWeight: 600 }}>
                        {editing
                          ? cellInput(p.pin, (v) => updatePin(realIdx, "pin", v), C, MONO, 40)
                          : p.pin
                        }
                      </td>
                      {/* Dir */}
                      <td style={cellStyle} onClick={(e) => editing && e.stopPropagation()}>
                        {editing ? (
                          <Select compact value={p.dir}
                            onChange={(v) => updatePin(realIdx, "dir", v)}
                            options={[{ value: "input", label: "IN" }, { value: "output", label: "OUT" }, { value: "inout", label: "IO" }]} />
                        ) : (
                          <span style={{
                            fontSize: 7, padding: "1px 4px", borderRadius: 2, fontWeight: 600,
                            color: p.dir === "input" ? C.cyan : p.dir === "output" ? C.ok : C.warn,
                            background: p.dir === "input" ? `${C.cyan}15` : p.dir === "output" ? `${C.ok}15` : `${C.warn}15`,
                          }}>
                            {p.dir === "input" ? "IN" : p.dir === "output" ? "OUT" : "IO"}
                          </span>
                        )}
                      </td>
                      {/* I/O Standard */}
                      <td style={cellStyle} onClick={(e) => editing && e.stopPropagation()}>
                        {editing ? (
                          <Select compact value={p.ioStandard}
                            onChange={(v) => updatePin(realIdx, "ioStandard", v)}
                            options={standards.map((s) => ({ value: s, label: s }))} />
                        ) : (
                          <span style={{ color: C.t2 }}>{p.ioStandard}</span>
                        )}
                      </td>
                      {/* Drive */}
                      <td style={cellStyle} onClick={(e) => editing && e.stopPropagation()}>
                        {editing ? (
                          <Select compact value={p.drive ?? ""}
                            onChange={(v) => updatePin(realIdx, "drive", v)}
                            options={[{ value: "", label: "-" }, ...drives.map((d) => ({ value: d, label: d }))]}
                            placeholder="-" />
                        ) : (
                          <span style={{ color: C.t3 }}>{p.drive ?? "-"}</span>
                        )}
                      </td>
                      {/* Pull */}
                      <td style={cellStyle} onClick={(e) => editing && e.stopPropagation()}>
                        {editing ? (
                          <Select compact value={p.pull ?? "None"}
                            onChange={(v) => updatePin(realIdx, "pull", v)}
                            options={PULL_OPTIONS.map((o) => ({ value: o, label: o }))} />
                        ) : (
                          <span style={{ color: p.pull && p.pull !== "None" ? C.warn : C.t3 }}>
                            {p.pull ?? "None"}
                          </span>
                        )}
                      </td>
                      {/* Slew */}
                      <td style={cellStyle} onClick={(e) => editing && e.stopPropagation()}>
                        {editing ? (
                          <Select compact value={p.slew ?? "Slow"}
                            onChange={(v) => updatePin(realIdx, "slew", v)}
                            options={SLEW_OPTIONS.map((o) => ({ value: o, label: o }))} />
                        ) : (
                          <span style={{ color: C.t3 }}>{p.slew ?? "Slow"}</span>
                        )}
                      </td>
                      {/* Open Drain */}
                      <td style={cellStyle}>
                        <input type="checkbox" checked={p.openDrain ?? false}
                          onChange={(e) => { e.stopPropagation(); updatePin(realIdx, "openDrain", e.target.checked); }}
                          onClick={(e) => e.stopPropagation()}
                          style={{ accentColor: C.accent }} />
                      </td>
                      {/* Schmitt */}
                      <td style={cellStyle}>
                        <input type="checkbox" checked={p.schmitt ?? false}
                          onChange={(e) => { e.stopPropagation(); updatePin(realIdx, "schmitt", e.target.checked); }}
                          onClick={(e) => e.stopPropagation()}
                          style={{ accentColor: C.accent }} />
                      </td>
                      {/* Bank */}
                      <td style={cellStyle} onClick={(e) => editing && e.stopPropagation()}>
                        {editing ? (
                          <Select compact value={p.bank ?? ""}
                            onChange={(v) => updatePin(realIdx, "bank", v)}
                            options={[{ value: "", label: "-" }, ...BANK_NUMBERS.map((b) => ({ value: b, label: b }))]}
                            placeholder="-" />
                        ) : (
                          <span style={{ color: C.t3 }}>{p.bank ?? "-"}</span>
                        )}
                      </td>
                      {/* Diff Pair */}
                      <td style={cellStyle} onClick={(e) => editing && e.stopPropagation()}>
                        {editing
                          ? cellInput(p.diffPair ?? "", (v) => updatePin(realIdx, "diffPair", v), C, MONO, 50)
                          : <span style={{ color: p.diffPair ? C.purple : C.t3 }}>{p.diffPair ?? "-"}</span>
                        }
                      </td>
                      {/* Actions */}
                      <td style={cellStyle}>
                        {editing && (
                          <span
                            onClick={(e) => { e.stopPropagation(); removePin(realIdx); }}
                            style={{ color: C.err, cursor: "pointer", fontSize: 7, fontWeight: 600 }}
                          >
                            {"\u2715"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 8, fontSize: 7, fontFamily: MONO, color: C.t3 }}>
            Click a row to edit. Columns: Lock, Net, Pin, Direction, I/O Standard, Drive Strength, Pull Mode, Slew Rate, Open Drain, Schmitt Trigger, Bank, Differential Pair.
          </div>
        </div>
      )}

      {/* Timing Constraints */}
      {tab === "timing" && (
        <div style={panelP}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Clock />
            <span style={{ fontSize: 11, fontWeight: 700, color: C.t1 }}>Timing Constraints</span>
            <Badge color={C.accent}>{timing.length}</Badge>
            <div style={{ flex: 1 }} />
            <Btn small onClick={() => setShowAddTiming(true)}>+ Add Constraint</Btn>
          </div>

          {/* Quick-add shortcuts */}
          <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
            {[
              { label: "Clock", type: "clock" as const },
              { label: "Input Delay", type: "input_delay" as const },
              { label: "Output Delay", type: "output_delay" as const },
              { label: "False Path", type: "false_path" as const },
              { label: "Multicycle", type: "multicycle" as const },
              { label: "Max Delay", type: "max_delay" as const },
              { label: "Min Delay", type: "min_delay" as const },
              { label: "Clock Group", type: "group" as const },
            ].map((item) => (
              <span
                key={item.type}
                onClick={() => {
                  setNewTiming({ type: item.type, name: "", target: "", value: "", enabled: true });
                  setShowAddTiming(true);
                }}
                style={{
                  fontSize: 7, fontFamily: MONO, fontWeight: 600, padding: "2px 6px",
                  borderRadius: 3, border: `1px solid ${C.b1}`, color: C.t3,
                  cursor: "pointer", background: C.bg,
                }}
              >
                + {item.label}
              </span>
            ))}
          </div>

          {/* Add timing form */}
          {showAddTiming && (
            <div style={{
              display: "flex", gap: 6, padding: "8px 10px", marginBottom: 8,
              background: C.bg, borderRadius: 4, border: `1px solid ${C.accent}30`,
              alignItems: "center", flexWrap: "wrap",
            }}>
              <Select compact value={newTiming.type}
                onChange={(v) => setNewTiming((p) => ({ ...p, type: v as TimingConstraint["type"] }))}
                options={[
                  { value: "clock", label: "create_clock" },
                  { value: "input_delay", label: "set_input_delay" },
                  { value: "output_delay", label: "set_output_delay" },
                  { value: "false_path", label: "set_false_path" },
                  { value: "multicycle", label: "set_multicycle_path" },
                  { value: "max_delay", label: "set_max_delay" },
                  { value: "min_delay", label: "set_min_delay" },
                  { value: "group", label: "set_clock_groups" },
                ]} />
              {cellInput(newTiming.name, (v) => setNewTiming((p) => ({ ...p, name: v })), C, MONO, 80)}
              <span style={{ fontSize: 7, color: C.t3, fontFamily: MONO }}>target:</span>
              {cellInput(newTiming.target, (v) => setNewTiming((p) => ({ ...p, target: v })), C, MONO, 80)}
              {newTiming.type === "clock" && (
                <>
                  <span style={{ fontSize: 7, color: C.t3, fontFamily: MONO }}>MHz:</span>
                  {cellInput(newTiming.value, (v) => setNewTiming((p) => ({ ...p, value: v })), C, MONO, 50)}
                </>
              )}
              {(newTiming.type === "input_delay" || newTiming.type === "output_delay") && (
                <>
                  <span style={{ fontSize: 7, color: C.t3, fontFamily: MONO }}>ns:</span>
                  {cellInput(newTiming.value, (v) => setNewTiming((p) => ({ ...p, value: v })), C, MONO, 40)}
                  <span style={{ fontSize: 7, color: C.t3, fontFamily: MONO }}>clock:</span>
                  {cellInput(newTiming.reference ?? "", (v) => setNewTiming((p) => ({ ...p, reference: v })), C, MONO, 60)}
                </>
              )}
              {(newTiming.type === "max_delay" || newTiming.type === "min_delay") && (
                <>
                  <span style={{ fontSize: 7, color: C.t3, fontFamily: MONO }}>ns:</span>
                  {cellInput(newTiming.value, (v) => setNewTiming((p) => ({ ...p, value: v })), C, MONO, 40)}
                </>
              )}
              {newTiming.type === "multicycle" && (
                <>
                  <span style={{ fontSize: 7, color: C.t3, fontFamily: MONO }}>multiplier:</span>
                  {cellInput(newTiming.value, (v) => setNewTiming((p) => ({ ...p, value: v })), C, MONO, 30)}
                </>
              )}
              <Btn small primary onClick={addTiming}>Add</Btn>
              <Btn small onClick={() => setShowAddTiming(false)}>Cancel</Btn>
            </div>
          )}

          {/* Timing constraints table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${C.b1}` }}>
                  <th style={{ ...thStyle, width: 30 }}>On</th>
                  <th style={{ ...thStyle, minWidth: 120 }}>Command</th>
                  <th style={{ ...thStyle, width: 80 }}>Name</th>
                  <th style={{ ...thStyle, minWidth: 80 }}>Target</th>
                  <th style={{ ...thStyle, width: 70 }}>Value</th>
                  <th style={{ ...thStyle, width: 70 }}>Reference</th>
                  <th style={{ ...thStyle, width: 60 }}>SDC</th>
                  <th style={{ ...thStyle, width: 30 }}></th>
                </tr>
              </thead>
              <tbody>
                {timing.map((t, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.b1}15`, opacity: t.enabled ? 1 : 0.5 }}>
                    <td style={cellStyle}>
                      <input type="checkbox" checked={t.enabled}
                        onChange={(e) => updateTiming(i, "enabled", e.target.checked)}
                        style={{ accentColor: C.accent }} />
                    </td>
                    <td style={cellStyle}>
                      <span style={{
                        fontSize: 7, fontFamily: MONO, fontWeight: 600, padding: "1px 4px",
                        borderRadius: 2,
                        color: t.type === "clock" ? C.cyan : t.type === "false_path" ? C.warn : C.accent,
                        background: t.type === "clock" ? `${C.cyan}15` : t.type === "false_path" ? `${C.warn}15` : `${C.accent}15`,
                      }}>
                        {timingTypeLabel(t.type)}
                      </span>
                    </td>
                    <td style={{ ...cellStyle, color: C.t1, fontWeight: 600 }}>
                      {cellInput(t.name, (v) => updateTiming(i, "name", v), C, MONO, 70)}
                    </td>
                    <td style={cellStyle}>
                      {cellInput(t.target, (v) => updateTiming(i, "target", v), C, MONO, 70)}
                    </td>
                    <td style={cellStyle}>
                      {cellInput(t.value, (v) => updateTiming(i, "value", v), C, MONO, 50)}
                    </td>
                    <td style={cellStyle}>
                      {cellInput(t.reference ?? "", (v) => updateTiming(i, "reference", v), C, MONO, 60)}
                    </td>
                    <td style={cellStyle}>
                      <span style={{ fontSize: 7, fontFamily: MONO, color: C.t3, wordBreak: "break-all" }}>
                        {formatTimingLine(t, "sdc").slice(0, 30)}...
                      </span>
                    </td>
                    <td style={cellStyle}>
                      <span onClick={() => removeTiming(i)}
                        style={{ color: C.err, cursor: "pointer", fontSize: 7, fontWeight: 600 }}>
                        {"\u2715"}
                      </span>
                    </td>
                  </tr>
                ))}
                {timing.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ ...cellStyle, textAlign: "center", padding: 20, color: C.t3 }}>
                      No timing constraints defined. Click "+ Add Constraint" or use the quick-add buttons above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Hint */}
          <div style={{ marginTop: 8, fontSize: 7, fontFamily: MONO, color: C.t3, lineHeight: 1.5 }}>
            Timing constraints define clock frequencies, I/O delays, false paths, and multicycle paths.
            All constraints are written in SDC (Synopsys Design Constraints) format.
            {" "}{unconstrainedClocks.length > 0 && (
              <span style={{ color: C.warn }}>
                {"\u26A0"} {unconstrainedClocks.length} clock net{unconstrainedClocks.length > 1 ? "s" : ""} unconstrained
              </span>
            )}
          </div>
        </div>
      )}

      {/* Generated Constraint Output */}
      {tab === "generated" && (
        <div style={panelP}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.t1 }}>
              Generated {constraintFormat} Constraints
            </span>
            <Badge color={C.accent}>{pins.length} pins</Badge>
            <Badge color={C.cyan}>{timing.length} timing</Badge>
            <div style={{ flex: 1 }} />
            <Btn small onClick={() => navigator.clipboard.writeText(generateConstraintText)}>
              Copy All
            </Btn>
          </div>
          <pre style={{
            fontSize: 8, fontFamily: MONO, color: C.t2, background: C.bg,
            border: `1px solid ${C.b1}`, borderRadius: 4, padding: "10px 12px",
            overflow: "auto", maxHeight: "calc(100vh - 280px)", lineHeight: 1.6, margin: 0,
            whiteSpace: "pre-wrap",
          }}>
            {generateConstraintText}
          </pre>
        </div>
      )}
    </div>
  );
}

function timingTypeLabel(type: TimingConstraint["type"]): string {
  const map: Record<string, string> = {
    clock: "create_clock",
    input_delay: "set_input_delay",
    output_delay: "set_output_delay",
    false_path: "set_false_path",
    multicycle: "set_multicycle_path",
    max_delay: "set_max_delay",
    min_delay: "set_min_delay",
    group: "set_clock_groups",
  };
  return map[type] ?? type;
}

function formatTimingLine(t: TimingConstraint, _fmt: "sdc"): string {
  const freq = parseFloat(t.value) || 0;
  switch (t.type) {
    case "clock": {
      const period = freq > 0 ? (1000 / freq).toFixed(3) : "10.000";
      const half = freq > 0 ? (500 / freq).toFixed(3) : "5.000";
      return `create_clock -name ${t.name} -period ${period} -waveform {0 ${half}} [get_ports {${t.target}}]`;
    }
    case "input_delay":
      return `set_input_delay -clock ${t.reference ?? t.name} -max ${t.value || "0.000"} [get_ports {${t.target}}]`;
    case "output_delay":
      return `set_output_delay -clock ${t.reference ?? t.name} -max ${t.value || "0.000"} [get_ports {${t.target}}]`;
    case "false_path":
      return `set_false_path -from [get_ports {${t.target}}]`;
    case "multicycle":
      return `set_multicycle_path -setup ${t.value || "2"} -from [get_ports {${t.target}}]`;
    case "max_delay":
      return `set_max_delay ${t.value || "10.000"} -from [get_ports {${t.target}}]`;
    case "min_delay":
      return `set_min_delay ${t.value || "0.000"} -from [get_ports {${t.target}}]`;
    case "group":
      return `set_clock_groups -asynchronous -group {${t.name}} -group {${t.target}}`;
    default:
      return `# ${t.type} ${t.name} ${t.target} ${t.value}`;
  }
}
