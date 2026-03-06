import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useTheme } from "../context/ThemeContext";
import { Btn, Badge, Select } from "./shared";
import { Pin, Clock } from "./Icons";
import { readFile, writeTextFile, pickSaveFile, listPackagePins, getPadReport } from "../hooks/useTauri";
import type { PackagePin, DevicePinData, PadReport, PadPinEntry } from "../hooks/useTauri";

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

type ConstraintTab = "pins" | "timing" | "generated" | "pinout";

type PinWarning = { type: "error" | "warn"; msg: string };

type PinoutFilter = "all" | "user_io" | "assigned" | "unassigned" | "errors";

interface ConstraintEditorProps {
  backendId: string;
  device: string;
  constraintFile?: string;
  projectDir?: string;
}

function cellInput(
  value: string,
  onChange: (v: string) => void,
  C: ReturnType<typeof useTheme>["C"],
  MONO: string,
  width?: number,
  autoFocus?: boolean,
) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      autoFocus={autoFocus}
      style={{
        fontSize: 8, fontFamily: MONO, background: C.bg,
        color: C.t1, border: `1px solid ${C.b1}`, borderRadius: 2,
        padding: "1px 4px", outline: "none", width: width ?? 50,
        boxSizing: "border-box",
      }}
    />
  );
}

// ── Autocomplete Input ──
function AutoInput({
  value,
  onChange,
  suggestions,
  C,
  MONO,
  width,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  C: ReturnType<typeof useTheme>["C"];
  MONO: string;
  width?: number;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hIdx, setHIdx] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!value) return suggestions.slice(0, 12);
    const q = value.toLowerCase();
    return suggestions.filter((s) => s.toLowerCase().includes(q) && s !== value).slice(0, 12);
  }, [value, suggestions]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (!open || filtered.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHIdx((p) => Math.min(p + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHIdx((p) => Math.max(p - 1, 0)); }
    else if (e.key === "Enter" && hIdx >= 0) { e.preventDefault(); onChange(filtered[hIdx]); setOpen(false); }
    else if (e.key === "Escape") { setOpen(false); }
  };

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHIdx(-1); }}
        onFocus={() => setOpen(true)}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        onKeyDown={handleKey}
        autoFocus={autoFocus}
        style={{
          fontSize: 8, fontFamily: MONO, background: C.bg,
          color: C.t1, border: `1px solid ${C.b1}`, borderRadius: 2,
          padding: "1px 4px", outline: "none", width: width ?? 50,
          boxSizing: "border-box" as const,
        }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, zIndex: 999,
          background: C.s1, border: `1px solid ${C.b1}`, borderRadius: 3,
          marginTop: 1, maxHeight: 150, overflowY: "auto", minWidth: width ?? 50,
          boxShadow: "0 3px 8px rgba(0,0,0,0.35)",
        }}>
          {filtered.map((s, idx) => (
            <div
              key={s}
              onMouseEnter={() => setHIdx(idx)}
              onMouseLeave={() => setHIdx(-1)}
              onMouseDown={(e) => { e.preventDefault(); onChange(s); setOpen(false); }}
              style={{
                padding: "2px 6px", fontSize: 8, fontFamily: MONO, fontWeight: 600,
                color: hIdx === idx ? C.accent : C.t1,
                background: hIdx === idx ? C.s3 : "transparent",
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Generate pattern-based net name suggestions from existing pins */
function generateNetSuggestions(existingNets: string[]): string[] {
  const suggestions = new Set<string>(existingNets);

  // Detect bus patterns like name[N] or name_N and suggest next indices
  const busPattern = /^(.+?)[\[_](\d+)\]?$/;
  const busGroups = new Map<string, number[]>();

  for (const net of existingNets) {
    const m = net.match(busPattern);
    if (m) {
      const base = m[1];
      const idx = parseInt(m[2], 10);
      if (!busGroups.has(base)) busGroups.set(base, []);
      busGroups.get(base)!.push(idx);
    }
  }

  for (const [base, indices] of busGroups) {
    const maxIdx = Math.max(...indices);
    const useBracket = existingNets.some((n) => n.startsWith(`${base}[`));
    // Suggest next few indices beyond the current max
    for (let i = 0; i <= maxIdx + 3; i++) {
      const name = useBracket ? `${base}[${i}]` : `${base}_${i}`;
      suggestions.add(name);
    }
  }

  return [...suggestions].sort();
}

// ── Constraint file extension per backend ──
function constraintExt(backendId: string): string {
  if (backendId === "radiant" || backendId === "diamond") return "pdc";
  if (backendId === "quartus") return "qsf";
  if (backendId === "vivado") return "xdc";
  return "pcf";
}

function constraintFilterName(backendId: string): string {
  if (backendId === "radiant" || backendId === "diamond") return "PDC Constraints";
  if (backendId === "quartus") return "QSF Constraints";
  if (backendId === "vivado") return "XDC Constraints";
  return "PCF Constraints";
}

// ═══════════════════════════════════════════
// ── PARSERS ──
// ═══════════════════════════════════════════

/** Parse SDC timing lines (shared across all backends) */
function parseTimingLines(lines: string[]): TimingConstraint[] {
  const result: TimingConstraint[] = [];
  for (let raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    // Detect commented-out constraints
    let enabled = true;
    let line = trimmed;
    if (line.startsWith("#")) {
      // Check if it looks like a commented constraint (not a plain comment)
      const rest = line.replace(/^#+\s*/, "");
      if (/^(create_clock|set_input_delay|set_output_delay|set_false_path|set_multicycle_path|set_max_delay|set_min_delay|set_clock_groups)\b/.test(rest)) {
        enabled = false;
        line = rest;
      } else {
        continue; // Plain comment, skip
      }
    }

    if (line.startsWith("create_clock")) {
      const nameM = line.match(/-name\s+(\S+)/);
      const periodM = line.match(/-period\s+(\S+)/);
      const portM = line.match(/\[get_ports\s+\{?([^}\]]+)\}?\]/);
      const name = nameM?.[1] ?? "";
      const period = parseFloat(periodM?.[1] ?? "0");
      const freq = period > 0 ? (1000 / period) : 0;
      result.push({ type: "clock", name, target: portM?.[1]?.trim() ?? name, value: freq > 0 ? freq.toFixed(1) : "", enabled });
    } else if (line.startsWith("set_input_delay")) {
      const clockM = line.match(/-clock\s+(\S+)/);
      const maxM = line.match(/-max\s+(\S+)/);
      const portM = line.match(/\[get_ports\s+\{?([^}\]]+)\}?\]/);
      result.push({ type: "input_delay", name: clockM?.[1] ?? "", target: portM?.[1]?.trim() ?? "", value: maxM?.[1] ?? "", reference: clockM?.[1], enabled });
    } else if (line.startsWith("set_output_delay")) {
      const clockM = line.match(/-clock\s+(\S+)/);
      const maxM = line.match(/-max\s+(\S+)/);
      const portM = line.match(/\[get_ports\s+\{?([^}\]]+)\}?\]/);
      result.push({ type: "output_delay", name: clockM?.[1] ?? "", target: portM?.[1]?.trim() ?? "", value: maxM?.[1] ?? "", reference: clockM?.[1], enabled });
    } else if (line.startsWith("set_false_path")) {
      const portM = line.match(/\[get_ports\s+\{?([^}\]]+)\}?\]/);
      const target = portM?.[1]?.trim() ?? "";
      result.push({ type: "false_path", name: "false_path", target, value: "", enabled });
    } else if (line.startsWith("set_multicycle_path")) {
      const setupM = line.match(/-setup\s+(\S+)/);
      const portM = line.match(/\[get_ports\s+\{?([^}\]]+)\}?\]/);
      result.push({ type: "multicycle", name: "multicycle", target: portM?.[1]?.trim() ?? "", value: setupM?.[1] ?? "2", enabled });
    } else if (line.startsWith("set_max_delay")) {
      const valM = line.match(/set_max_delay\s+(\S+)/);
      const portM = line.match(/\[get_ports\s+\{?([^}\]]+)\}?\]/);
      result.push({ type: "max_delay", name: "max_delay", target: portM?.[1]?.trim() ?? "", value: valM?.[1] ?? "", enabled });
    } else if (line.startsWith("set_min_delay")) {
      const valM = line.match(/set_min_delay\s+(\S+)/);
      const portM = line.match(/\[get_ports\s+\{?([^}\]]+)\}?\]/);
      result.push({ type: "min_delay", name: "min_delay", target: portM?.[1]?.trim() ?? "", value: valM?.[1] ?? "", enabled });
    } else if (line.startsWith("set_clock_groups")) {
      const groups = [...line.matchAll(/-group\s+\{([^}]*)\}/g)].map((m) => m[1]);
      result.push({ type: "group", name: groups[0] ?? "", target: groups[1] ?? "", value: "", enabled });
    }
  }
  return result;
}

/** Parse PDC / LPF format (Radiant / Diamond) */
function parsePdc(text: string): { pins: PinAssignment[]; timing: TimingConstraint[] } {
  const pins: PinAssignment[] = [];
  const timingLines: string[] = [];
  const pinMap = new Map<string, Partial<PinAssignment>>();
  const lines = text.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("##")) continue;

    // ldc_set_location -site {PIN} [get_ports {NET}]
    const locM = trimmed.match(/ldc_set_location\s+-site\s+\{(\S+)\}\s+\[get_ports\s+\{([^}]+)\}\]/);
    if (locM) {
      const [, pin, net] = locM;
      const existing = pinMap.get(net) ?? {};
      existing.pin = pin;
      existing.net = net;
      pinMap.set(net, existing);
      continue;
    }

    // ldc_set_port -iobuf {KEY=VAL KEY=VAL ...} [get_ports {NET}]
    const iobufM = trimmed.match(/ldc_set_port\s+-iobuf\s+\{([^}]+)\}\s+\[get_ports\s+\{([^}]+)\}\]/);
    if (iobufM) {
      const [, attrs, net] = iobufM;
      const existing = pinMap.get(net) ?? { net };
      for (const pair of attrs.split(/\s+/)) {
        const [k, v] = pair.split("=");
        if (!k || !v) continue;
        const key = k.toUpperCase();
        if (key === "IO_TYPE") existing.ioStandard = v;
        else if (key === "DRIVE") existing.drive = v;
        else if (key === "PULLMODE") {
          existing.pull = v === "UP" ? "Up" : v === "DOWN" ? "Down" : v === "BUSHOLD" ? "Bus Hold" : "None";
        }
        else if (key === "SLEWRATE") existing.slew = v === "FAST" ? "Fast" : "Slow";
        else if (key === "OPENDRAIN") existing.openDrain = v === "ON";
        else if (key === "HYSTERESIS") existing.schmitt = v === "ON";
      }
      pinMap.set(net, existing);
      continue;
    }

    // Timing lines — collect for shared parser
    if (/^#?\s*(create_clock|set_input_delay|set_output_delay|set_false_path|set_multicycle_path|set_max_delay|set_min_delay|set_clock_groups)\b/.test(trimmed)) {
      timingLines.push(trimmed);
    }
  }

  for (const [, p] of pinMap) {
    pins.push({
      net: p.net ?? "",
      pin: p.pin ?? "",
      dir: "input",
      ioStandard: p.ioStandard ?? "LVCMOS33",
      drive: p.drive,
      pull: p.pull ?? "None",
      slew: p.slew ?? "Slow",
      openDrain: p.openDrain,
      schmitt: p.schmitt,
      locked: true,
    });
  }

  return { pins, timing: parseTimingLines(timingLines) };
}

/** Parse QSF format (Quartus) */
function parseQsf(text: string): { pins: PinAssignment[]; timing: TimingConstraint[] } {
  const pinMap = new Map<string, Partial<PinAssignment>>();
  const timingLines: string[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("##")) continue;

    // set_location_assignment PIN_XX -to net
    const locM = trimmed.match(/set_location_assignment\s+PIN_(\S+)\s+-to\s+(\S+)/);
    if (locM) {
      const [, pin, net] = locM;
      const existing = pinMap.get(net) ?? {};
      existing.pin = pin;
      existing.net = net;
      pinMap.set(net, existing);
      continue;
    }

    // set_instance_assignment -name IO_STANDARD "..." -to net
    const ioM = trimmed.match(/set_instance_assignment\s+-name\s+IO_STANDARD\s+"([^"]+)"\s+-to\s+(\S+)/);
    if (ioM) {
      const [, std, net] = ioM;
      const existing = pinMap.get(net) ?? { net };
      existing.ioStandard = std;
      pinMap.set(net, existing);
      continue;
    }

    // set_instance_assignment -name CURRENT_STRENGTH_NEW "..." -to net
    const driveM = trimmed.match(/set_instance_assignment\s+-name\s+CURRENT_STRENGTH_NEW\s+"([^"]+)"\s+-to\s+(\S+)/);
    if (driveM) {
      const [, drv, net] = driveM;
      const existing = pinMap.get(net) ?? { net };
      existing.drive = drv;
      pinMap.set(net, existing);
      continue;
    }

    // set_instance_assignment -name WEAK_PULL_UP_RESISTOR ON/OFF -to net
    const pullM = trimmed.match(/set_instance_assignment\s+-name\s+WEAK_PULL_UP_RESISTOR\s+(\S+)\s+-to\s+(\S+)/);
    if (pullM) {
      const [, val, net] = pullM;
      const existing = pinMap.get(net) ?? { net };
      existing.pull = val === "ON" ? "Up" : "None";
      pinMap.set(net, existing);
      continue;
    }

    // set_instance_assignment -name SLEW_RATE N -to net
    const slewM = trimmed.match(/set_instance_assignment\s+-name\s+SLEW_RATE\s+(\S+)\s+-to\s+(\S+)/);
    if (slewM) {
      const [, val, net] = slewM;
      const existing = pinMap.get(net) ?? { net };
      existing.slew = parseInt(val) >= 2 ? "Fast" : "Slow";
      pinMap.set(net, existing);
      continue;
    }

    // set_instance_assignment -name OPEN_DRAIN_OUTPUT ON -to net
    const odM = trimmed.match(/set_instance_assignment\s+-name\s+OPEN_DRAIN_OUTPUT\s+(\S+)\s+-to\s+(\S+)/);
    if (odM) {
      const [, val, net] = odM;
      const existing = pinMap.get(net) ?? { net };
      existing.openDrain = val === "ON";
      pinMap.set(net, existing);
      continue;
    }

    // Timing
    if (/^#?\s*(create_clock|set_input_delay|set_output_delay|set_false_path|set_multicycle_path|set_max_delay|set_min_delay|set_clock_groups)\b/.test(trimmed)) {
      timingLines.push(trimmed);
    }
  }

  const pins: PinAssignment[] = [];
  for (const [, p] of pinMap) {
    pins.push({
      net: p.net ?? "",
      pin: p.pin ?? "",
      dir: "input",
      ioStandard: p.ioStandard ?? "3.3-V LVTTL",
      drive: p.drive,
      pull: p.pull ?? "None",
      slew: p.slew ?? "Slow",
      openDrain: p.openDrain,
      locked: true,
    });
  }

  return { pins, timing: parseTimingLines(timingLines) };
}

/** Parse XDC format (Vivado) */
function parseXdc(text: string): { pins: PinAssignment[]; timing: TimingConstraint[] } {
  const pinMap = new Map<string, Partial<PinAssignment>>();
  const timingLines: string[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("##")) continue;

    // set_property PACKAGE_PIN XX [get_ports {net}]
    const pkgM = trimmed.match(/set_property\s+PACKAGE_PIN\s+(\S+)\s+\[get_ports\s+\{?([^}\]]+)\}?\]/);
    if (pkgM) {
      const [, pin, net] = pkgM;
      const netT = net.trim();
      const existing = pinMap.get(netT) ?? {};
      existing.pin = pin;
      existing.net = netT;
      pinMap.set(netT, existing);
      continue;
    }

    // set_property IOSTANDARD XX [get_ports {net}]
    const ioM = trimmed.match(/set_property\s+IOSTANDARD\s+(\S+)\s+\[get_ports\s+\{?([^}\]]+)\}?\]/);
    if (ioM) {
      const [, std, net] = ioM;
      const netT = net.trim();
      const existing = pinMap.get(netT) ?? { net: netT };
      existing.ioStandard = std;
      pinMap.set(netT, existing);
      continue;
    }

    // set_property DRIVE N [get_ports {net}]
    const drvM = trimmed.match(/set_property\s+DRIVE\s+(\S+)\s+\[get_ports\s+\{?([^}\]]+)\}?\]/);
    if (drvM) {
      const [, drv, net] = drvM;
      const netT = net.trim();
      const existing = pinMap.get(netT) ?? { net: netT };
      existing.drive = drv;
      pinMap.set(netT, existing);
      continue;
    }

    // set_property PULLUP TRUE/FALSE [get_ports {net}]
    const pullM = trimmed.match(/set_property\s+PULLUP\s+(\S+)\s+\[get_ports\s+\{?([^}\]]+)\}?\]/);
    if (pullM) {
      const [, val, net] = pullM;
      const netT = net.trim();
      const existing = pinMap.get(netT) ?? { net: netT };
      existing.pull = val === "TRUE" ? "Up" : "None";
      pinMap.set(netT, existing);
      continue;
    }

    // set_property SLEW FAST/SLOW [get_ports {net}]
    const slewM = trimmed.match(/set_property\s+SLEW\s+(\S+)\s+\[get_ports\s+\{?([^}\]]+)\}?\]/);
    if (slewM) {
      const [, val, net] = slewM;
      const netT = net.trim();
      const existing = pinMap.get(netT) ?? { net: netT };
      existing.slew = val === "FAST" ? "Fast" : "Slow";
      pinMap.set(netT, existing);
      continue;
    }

    // Timing
    if (/^#?\s*(create_clock|set_input_delay|set_output_delay|set_false_path|set_multicycle_path|set_max_delay|set_min_delay|set_clock_groups)\b/.test(trimmed)) {
      timingLines.push(trimmed);
    }
  }

  const pins: PinAssignment[] = [];
  for (const [, p] of pinMap) {
    pins.push({
      net: p.net ?? "",
      pin: p.pin ?? "",
      dir: "input",
      ioStandard: p.ioStandard ?? "LVCMOS33",
      drive: p.drive,
      pull: p.pull ?? "None",
      slew: p.slew ?? "Slow",
      locked: true,
    });
  }

  return { pins, timing: parseTimingLines(timingLines) };
}

/** Parse PCF format (OSS CAD Suite) */
function parsePcf(text: string): { pins: PinAssignment[]; timing: TimingConstraint[] } {
  const pins: PinAssignment[] = [];
  const timingLines: string[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // set_io net pin
    const ioM = trimmed.match(/^set_io\s+(\S+)\s+(\S+)/);
    if (ioM) {
      const [, net, pin] = ioM;
      pins.push({
        net, pin, dir: "input", ioStandard: "LVCMOS33",
        pull: "None", slew: "Slow", locked: true,
      });
      continue;
    }

    // Clock comments: # Clock: name = 12.0 MHz on target
    const clkM = trimmed.match(/^#\s*Clock:\s*(\S+)\s*=\s*(\S+)\s*MHz\s+on\s+(\S+)/);
    if (clkM) {
      const [, name, freq, target] = clkM;
      timingLines.push(`create_clock -name ${name} -period ${(1000 / parseFloat(freq)).toFixed(3)} [get_ports {${target}}]`);
      continue;
    }

    // Standard SDC timing in PCF
    if (/^#?\s*(create_clock|set_input_delay|set_output_delay|set_false_path|set_multicycle_path|set_max_delay|set_min_delay|set_clock_groups)\b/.test(trimmed)) {
      timingLines.push(trimmed);
    }
  }

  return { pins, timing: parseTimingLines(timingLines) };
}

/** Dispatch to the right parser based on backend */
function parseConstraintFile(text: string, backendId: string): { pins: PinAssignment[]; timing: TimingConstraint[] } {
  if (backendId === "radiant" || backendId === "diamond") return parsePdc(text);
  if (backendId === "quartus") return parseQsf(text);
  if (backendId === "vivado") return parseXdc(text);
  return parsePcf(text);
}

// Simple string hash for external change detection
function quickHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}

// ── Grid navigation constants ──
const PIN_COLS = ["net", "pin", "dir", "ioStandard", "drive", "pull", "slew", "openDrain", "schmitt", "bank", "diffPair"] as const;
type CellAddr = { row: number; col: number };

export default function ConstraintEditor({ backendId, device, constraintFile, projectDir }: ConstraintEditorProps) {
  const { C, MONO } = useTheme();
  const [tab, setTab] = useState<ConstraintTab>("pins");
  const [pins, setPins] = useState<PinAssignment[]>([]);
  const [timing, setTiming] = useState<TimingConstraint[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CellAddr | null>(null);
  const [editingCell, setEditingCell] = useState<CellAddr | null>(null);
  const [clipboard, setClipboard] = useState<PinAssignment[] | null>(null);
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const gridRef = useRef<HTMLDivElement>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showAddTiming, setShowAddTiming] = useState(false);
  const [newPin, setNewPin] = useState<PinAssignment>({
    net: "", pin: "", dir: "input", ioStandard: "LVCMOS33", pull: "None", slew: "Slow", locked: false,
  });
  const [newTiming, setNewTiming] = useState<TimingConstraint>({
    type: "clock", name: "", target: "", value: "", enabled: true,
  });
  const [validationError, setValidationError] = useState<string | null>(null);

  // ── Bulk add state ──
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkPreview, setBulkPreview] = useState<PinAssignment[]>([]);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // ── Browse pins state ──
  const [showBrowsePins, setShowBrowsePins] = useState(false);
  const [packagePins, setPackagePins] = useState<PackagePin[]>([]);
  const [pinsLoading, setPinsLoading] = useState(false);
  const [pinsError, setPinsError] = useState<string | null>(null);
  const [pinSearch, setPinSearch] = useState("");
  const [pinFilter, setPinFilter] = useState<"all" | "user_io">("user_io");
  const [selectedPkgPins, setSelectedPkgPins] = useState<Set<string>>(new Set());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [deviceIoStandards, setDeviceIoStandards] = useState<string[] | null>(null);
  const [deviceDriveStrengths, setDeviceDriveStrengths] = useState<string[] | null>(null);
  const pinsCacheRef = useRef<Record<string, DevicePinData>>({});

  // ── Pinout tab state ──
  const [pinoutFilter, setPinoutFilter] = useState<PinoutFilter>("all");
  const [buildPinout, setBuildPinout] = useState<PadReport | null>(null);

  // ── File save/load state ──
  const [filePath, setFilePath] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [externalChange, setExternalChange] = useState(false);
  const lastHash = useRef<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadedOnce = useRef(false);

  const standards = (deviceIoStandards && deviceIoStandards.length > 0) ? deviceIoStandards : (IO_STANDARDS[backendId] ?? IO_STANDARDS.radiant);
  const drives = (deviceDriveStrengths && deviceDriveStrengths.length > 0) ? deviceDriveStrengths : (DRIVE_STRENGTHS[backendId] ?? DRIVE_STRENGTHS.radiant);

  // ── Load constraint file on mount or when constraintFile changes ──
  useEffect(() => {
    if (!constraintFile) {
      // No file — start with empty state (unless already loaded)
      if (!loadedOnce.current) {
        loadedOnce.current = true;
      }
      setFilePath(null);
      return;
    }

    setFilePath(constraintFile);
    loadedOnce.current = true;

    readFile(constraintFile).then((fc) => {
      if (fc.isBinary) return;
      const parsed = parseConstraintFile(fc.content, backendId);
      setPins(parsed.pins);
      setTiming(parsed.timing);
      setDirty(false);
      lastHash.current = quickHash(fc.content);
      setExternalChange(false);
    }).catch(() => {
      // File doesn't exist or can't be read — start empty
      setPins([]);
      setTiming([]);
      setDirty(false);
      lastHash.current = 0;
    });
  }, [constraintFile, backendId]);

  // ── External change detection (poll every 3s) ──
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    if (!filePath) return;
    const fp = filePath;

    pollRef.current = setInterval(() => {
      readFile(fp).then((fc) => {
        if (fc.isBinary) return;
        const h = quickHash(fc.content);
        if (h !== lastHash.current && lastHash.current !== 0) {
          setExternalChange(true);
        }
      }).catch(() => {}); // File deleted or inaccessible — ignore
    }, 3000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [filePath]);

  const reloadFromDisk = useCallback(() => {
    if (!filePath) return;
    readFile(filePath).then((fc) => {
      if (fc.isBinary) return;
      const parsed = parseConstraintFile(fc.content, backendId);
      setPins(parsed.pins);
      setTiming(parsed.timing);
      setDirty(false);
      lastHash.current = quickHash(fc.content);
      setExternalChange(false);
    }).catch(() => {});
  }, [filePath, backendId]);

  const filtered = useMemo(() => {
    if (!search) return pins;
    const q = search.toLowerCase();
    return pins.filter(
      (p) => p.net.toLowerCase().includes(q) || p.pin.toLowerCase().includes(q) ||
        p.ioStandard.toLowerCase().includes(q) || (p.bank ?? "").toLowerCase().includes(q)
    );
  }, [pins, search]);

  const netSuggestions = useMemo(() => generateNetSuggestions(pins.map((p) => p.net)), [pins]);

  // ── Pin↔Signal mapping ──
  const pinToSignalMap = useMemo(() => {
    const map = new Map<string, PinAssignment>();
    for (const p of pins) { if (p.pin) map.set(p.pin, p); }
    return map;
  }, [pins]);

  // ── Pin validation ──
  const pinValidation = useMemo(() => {
    const validPinNames = new Set(packagePins.map((p) => p.pin));
    const hasDevicePins = packagePins.length > 0;
    const result = new Map<number, PinWarning[]>();
    const pinCounts = new Map<string, number[]>();
    const netCounts = new Map<string, number[]>();

    // Count occurrences of each pin and net
    for (let i = 0; i < pins.length; i++) {
      if (pins[i].pin) {
        const arr = pinCounts.get(pins[i].pin) ?? [];
        arr.push(i);
        pinCounts.set(pins[i].pin, arr);
      }
      if (pins[i].net) {
        const arr = netCounts.get(pins[i].net) ?? [];
        arr.push(i);
        netCounts.set(pins[i].net, arr);
      }
    }

    for (let i = 0; i < pins.length; i++) {
      const warnings: PinWarning[] = [];
      const p = pins[i];

      // Empty pin or net
      if (!p.pin) warnings.push({ type: "warn", msg: "No pin assigned" });
      if (!p.net) warnings.push({ type: "warn", msg: "No net name" });

      // Pin not on device
      if (hasDevicePins && p.pin && !validPinNames.has(p.pin)) {
        warnings.push({ type: "error", msg: `Pin ${p.pin} not found on device` });
      }

      // Function mismatch (Power/GND/Config pin)
      if (hasDevicePins && p.pin) {
        const devPin = packagePins.find((dp) => dp.pin === p.pin);
        if (devPin) {
          const fn = devPin.function.toLowerCase();
          if (fn.includes("gnd") || fn.includes("vcc") || fn.includes("power")) {
            warnings.push({ type: "error", msg: `Pin ${p.pin} is a power/ground pin` });
          } else if (fn.includes("config") || fn.includes("reserved")) {
            warnings.push({ type: "warn", msg: `Pin ${p.pin} is a configuration pin` });
          }
        }
      }

      // Duplicate pin
      if (p.pin && (pinCounts.get(p.pin)?.length ?? 0) > 1) {
        warnings.push({ type: "error", msg: `Pin ${p.pin} assigned to multiple nets` });
      }

      // Duplicate net
      if (p.net && (netCounts.get(p.net)?.length ?? 0) > 1) {
        warnings.push({ type: "error", msg: `Net "${p.net}" appears on multiple rows` });
      }

      if (warnings.length > 0) result.set(i, warnings);
    }
    return result;
  }, [pins, packagePins]);

  const validationSummary = useMemo(() => {
    let errors = 0, warns = 0;
    for (const ws of pinValidation.values()) {
      for (const w of ws) {
        if (w.type === "error") errors++;
        else warns++;
      }
    }
    return { errors, warns };
  }, [pinValidation]);

  const updatePin = useCallback((idx: number, field: keyof PinAssignment, value: string | boolean) => {
    setPins((prev) => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
    setDirty(true);
  }, []);

  const removePin = useCallback((idx: number) => {
    setPins((prev) => prev.filter((_, i) => i !== idx));
    setEditingCell(null);
    setSelected(null);
    setDirty(true);
  }, []);

  const addPin = useCallback(() => {
    if (!newPin.net.trim()) {
      setValidationError("Net name is required");
      return;
    }
    if (!newPin.pin.trim()) {
      setValidationError("Pin location is required");
      return;
    }
    if (pins.some((p) => p.net === newPin.net.trim())) {
      setValidationError(`Net "${newPin.net}" already exists`);
      return;
    }
    setValidationError(null);
    setPins((prev) => [...prev, { ...newPin, net: newPin.net.trim(), pin: newPin.pin.trim() }]);
    setNewPin({ net: "", pin: "", dir: newPin.dir, ioStandard: newPin.ioStandard, pull: "None", slew: "Slow", locked: false });
    // Keep form open for rapid multi-pin entry — just clear net+pin
    setDirty(true);
  }, [newPin, pins]);

  // ── Bulk add parsing ──
  const parseBulkText = useCallback((text: string) => {
    const lines = text.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#") && !l.trim().startsWith("//"));
    const parsed: PinAssignment[] = [];
    const errors: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Accept: "net pin [io_standard]" separated by space/tab/comma
      const parts = line.split(/[\s,]+/).filter(Boolean);
      if (parts.length < 2) {
        errors.push(`Line ${i + 1}: need at least net and pin (got "${line}")`);
        continue;
      }
      const net = parts[0];
      const pin = parts[1];
      const ioStd = parts[2] || newPin.ioStandard;
      if (pins.some((p) => p.net === net) || parsed.some((p) => p.net === net)) {
        errors.push(`Line ${i + 1}: duplicate net "${net}"`);
        continue;
      }
      parsed.push({
        net, pin, dir: "input", ioStandard: ioStd,
        pull: "None", slew: "Slow", locked: false,
      });
    }
    setBulkPreview(parsed);
    setBulkError(errors.length > 0 ? errors.join("; ") : null);
  }, [pins, newPin.ioStandard]);

  const applyBulkAdd = useCallback(() => {
    if (bulkPreview.length === 0) return;
    setPins((prev) => [...prev, ...bulkPreview]);
    setDirty(true);
    setShowBulkAdd(false);
    setBulkText("");
    setBulkPreview([]);
    setBulkError(null);
  }, [bulkPreview]);

  // ── Browse pins ──
  const fetchPackagePins = useCallback(async () => {
    if (!device) { setPinsError("No device selected"); return; }
    // Check cache first
    const cacheKey = `${backendId}:${device}`;
    if (pinsCacheRef.current[cacheKey]) {
      const cached = pinsCacheRef.current[cacheKey];
      setPackagePins(cached.pins);
      if (cached.ioStandards.length > 0) setDeviceIoStandards(cached.ioStandards);
      if (cached.driveStrengths.length > 0) setDeviceDriveStrengths(cached.driveStrengths);
      return;
    }
    setPinsLoading(true);
    setPinsError(null);
    try {
      const result = await listPackagePins(backendId, device);
      pinsCacheRef.current[cacheKey] = result;
      setPackagePins(result.pins);
      if (result.ioStandards.length > 0) setDeviceIoStandards(result.ioStandards);
      if (result.driveStrengths.length > 0) setDeviceDriveStrengths(result.driveStrengths);
    } catch (e) {
      setPinsError(`${e}`);
      setPackagePins([]);
    } finally {
      setPinsLoading(false);
    }
  }, [backendId, device]);

  // ── Eager load pin capabilities for Lattice backends ──
  useEffect(() => {
    if (device && (backendId === "radiant" || backendId === "diamond")) {
      fetchPackagePins();
    }
  }, [device, backendId, fetchPackagePins]);

  const addSelectedPkgPins = useCallback(() => {
    const toAdd: PinAssignment[] = [];
    for (const pinName of selectedPkgPins) {
      if (!pins.some((p) => p.pin === pinName) && !toAdd.some((p) => p.pin === pinName)) {
        toAdd.push({
          net: "", pin: pinName, dir: "input", ioStandard: newPin.ioStandard,
          pull: "None", slew: "Slow", locked: false,
        });
      }
    }
    if (toAdd.length > 0) {
      setPins((prev) => [...prev, ...toAdd]);
      setDirty(true);
    }
    setSelectedPkgPins(new Set());
    setShowBrowsePins(false);
  }, [selectedPkgPins, pins, newPin.ioStandard]);

  const updateTiming = useCallback((idx: number, field: keyof TimingConstraint, value: string | boolean) => {
    setTiming((prev) => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));
    setDirty(true);
  }, []);

  const removeTiming = useCallback((idx: number) => {
    setTiming((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  }, []);

  const addTiming = useCallback(() => {
    if (!newTiming.name.trim()) {
      setValidationError("Constraint name is required");
      return;
    }
    if (!newTiming.target.trim()) {
      setValidationError("Target is required");
      return;
    }
    setValidationError(null);
    setTiming((prev) => [...prev, { ...newTiming }]);
    setNewTiming({ type: "clock", name: "", target: "", value: "", enabled: true });
    setShowAddTiming(false);
    setDirty(true);
  }, [newTiming]);

  // ── Cell-level click handler ──
  const handleCellClick = useCallback((rowIdx: number, colIdx: number, e: React.MouseEvent) => {
    if (e.shiftKey && selectionAnchor !== null) {
      const start = Math.min(selectionAnchor, rowIdx);
      const end = Math.max(selectionAnchor, rowIdx);
      const newSel = new Set<number>();
      for (let r = start; r <= end; r++) newSel.add(r);
      setSelectedRows(newSel);
    } else {
      setSelectionAnchor(rowIdx);
      setSelectedRows(new Set());
    }
    setSelected({ row: rowIdx, col: colIdx });
    // Don't clear editingCell if clicking inside the currently-editing cell
    // (prevents killing Select dropdowns before they can open)
    if (!(editingCell && editingCell.row === rowIdx && editingCell.col === colIdx)) {
      setEditingCell(null);
    }
  }, [selectionAnchor, editingCell]);

  // ── Grid keyboard handler ──
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    const inInput = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";

    if (!selected && !inInput) {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        setSelected({ row: 0, col: 0 });
        return;
      }
    }
    if (!selected) return;

    const { row, col } = selected;
    const maxRow = filtered.length - 1;
    const maxCol = PIN_COLS.length - 1;

    // Escape exits edit mode
    if (editingCell && e.key === "Escape") {
      e.preventDefault();
      setEditingCell(null);
      gridRef.current?.focus();
      return;
    }

    // When editing, let input handle most keys; intercept Tab/Enter
    if (editingCell && inInput) {
      if (e.key === "Tab") {
        e.preventDefault();
        setEditingCell(null);
        if (e.shiftKey) {
          if (col > 0) setSelected({ row, col: col - 1 });
          else if (row > 0) setSelected({ row: row - 1, col: maxCol });
        } else {
          if (col < maxCol) setSelected({ row, col: col + 1 });
          else if (row < maxRow) setSelected({ row: row + 1, col: 0 });
        }
        gridRef.current?.focus();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        setEditingCell(null);
        if (row < maxRow) setSelected({ row: row + 1, col });
        gridRef.current?.focus();
        return;
      }
      return;
    }

    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        if (e.shiftKey) {
          const nr = Math.max(0, row - 1);
          setSelected({ row: nr, col });
          setSelectedRows(prev => { const n = new Set(prev); n.add(nr); n.add(row); return n; });
        } else {
          setSelected({ row: Math.max(0, row - 1), col });
          setSelectedRows(new Set());
          setSelectionAnchor(null);
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        if (e.shiftKey) {
          const nr = Math.min(maxRow, row + 1);
          setSelected({ row: nr, col });
          setSelectedRows(prev => { const n = new Set(prev); n.add(nr); n.add(row); return n; });
        } else {
          setSelected({ row: Math.min(maxRow, row + 1), col });
          setSelectedRows(new Set());
          setSelectionAnchor(null);
        }
        break;
      case "ArrowLeft":
        e.preventDefault();
        setSelected({ row, col: Math.max(0, col - 1) });
        break;
      case "ArrowRight":
        e.preventDefault();
        setSelected({ row, col: Math.min(maxCol, col + 1) });
        break;
      case "Tab":
        e.preventDefault();
        if (e.shiftKey) {
          if (col > 0) setSelected({ row, col: col - 1 });
          else if (row > 0) setSelected({ row: row - 1, col: maxCol });
        } else {
          if (col < maxCol) setSelected({ row, col: col + 1 });
          else if (row < maxRow) setSelected({ row: row + 1, col: 0 });
        }
        break;
      case "Enter":
        e.preventDefault();
        if (row < maxRow) setSelected({ row: row + 1, col });
        break;
      case "F2":
        e.preventDefault();
        setEditingCell({ row, col });
        break;
      case "Delete":
      case "Backspace": {
        e.preventDefault();
        const field = PIN_COLS[col];
        const realIdx = pins.indexOf(filtered[row]);
        if (realIdx >= 0) {
          if (field === "openDrain" || field === "schmitt") updatePin(realIdx, field, false);
          else if (field === "net" || field === "pin" || field === "drive" || field === "diffPair" || field === "bank") updatePin(realIdx, field, "");
          else if (field === "pull") updatePin(realIdx, field, "None");
          else if (field === "slew") updatePin(realIdx, field, "Slow");
        }
        break;
      }
      case "c":
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const rows = selectedRows.size > 0
            ? Array.from(selectedRows).sort().map(r => filtered[r]).filter(Boolean)
            : [filtered[row]].filter(Boolean);
          setClipboard(rows.map(p => ({ ...p })));
        }
        break;
      case "v":
        if ((e.ctrlKey || e.metaKey) && clipboard && clipboard.length > 0) {
          e.preventDefault();
          const realIdx = pins.indexOf(filtered[row]);
          if (realIdx >= 0) {
            const deduped = clipboard.map(p => {
              let newNet = p.net;
              let suf = 1;
              while (pins.some(x => x.net === newNet)) { newNet = `${p.net}_${suf}`; suf++; }
              return { ...p, net: newNet };
            });
            setPins(prev => { const n = [...prev]; n.splice(realIdx + 1, 0, ...deduped); return n; });
            setDirty(true);
          }
        }
        break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const field = PIN_COLS[col];
          if (field === "openDrain" || field === "schmitt") {
            if (e.key === " ") {
              e.preventDefault();
              const realIdx = pins.indexOf(filtered[row]);
              if (realIdx >= 0) updatePin(realIdx, field, !(filtered[row][field] ?? false));
            }
          } else {
            e.preventDefault();
            setEditingCell({ row, col });
          }
        }
        break;
    }
  }, [selected, editingCell, filtered, pins, clipboard, selectedRows, updatePin]);

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

  // ── Save ──
  const doSave = useCallback(async (path: string) => {
    setSaving(true);
    try {
      const content = generateConstraintText;
      await writeTextFile(path, content);
      lastHash.current = quickHash(content);
      setDirty(false);
      setExternalChange(false);
      setFilePath(path);
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  }, [generateConstraintText]);

  const handleSave = useCallback(async () => {
    if (filePath) {
      await doSave(filePath);
    } else {
      // Fall through to Save As
      await handleSaveAs();
    }
  }, [filePath, doSave]);

  const handleSaveAs = useCallback(async () => {
    const ext = constraintExt(backendId);
    const chosen = await pickSaveFile([{
      name: constraintFilterName(backendId),
      extensions: [ext],
    }]);
    if (chosen) {
      await doSave(chosen);
    }
  }, [backendId, doSave]);

  const unconstrainedClocks = useMemo(() => {
    const clockNets = pins.filter((p) => p.net.toLowerCase().includes("clk") || p.net.toLowerCase().includes("clock"));
    const constrainedNets = timing.filter((t) => t.type === "clock" && t.enabled).map((t) => t.target);
    return clockNets.filter((p) => !constrainedNets.includes(p.net));
  }, [pins, timing]);

  const panelP: React.CSSProperties = {
    background: C.s1, borderRadius: 7, border: `1px solid ${C.b1}`, overflow: "visible", padding: 14,
  };

  const cellStyle: React.CSSProperties = {
    fontSize: 8, fontFamily: MONO, padding: "2px 3px", whiteSpace: "nowrap",
  };

  const thStyle: React.CSSProperties = {
    ...cellStyle, textAlign: "left", fontWeight: 700, color: C.t3,
    padding: "3px 3px 4px", position: "sticky" as const, top: 0,
    background: C.s1, zIndex: 1, borderBottom: `2px solid ${C.b1}`,
  };

  const constraintFormat = backendId === "radiant" || backendId === "diamond" ? "PDC" :
    backendId === "quartus" ? "QSF" : backendId === "vivado" ? "XDC" : "PCF";

  const fileName = filePath ? filePath.split("/").pop()?.split("\\").pop() ?? filePath : null;

  // Cell selection helpers
  const isCellSel = (r: number, c: number) => selected?.row === r && selected?.col === c;
  const isCellEdit = (r: number, c: number) => editingCell?.row === r && editingCell?.col === c;
  const cellSel = (r: number, c: number): React.CSSProperties =>
    isCellSel(r, c) ? { outline: `2px solid ${C.accent}`, outlineOffset: -1 } : {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      {/* External change banner */}
      {externalChange && (
        <div style={{
          padding: "8px 12px", borderRadius: 6, background: `${C.warn}12`,
          border: `1px solid ${C.warn}30`, display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ color: C.warn, fontSize: 14 }}>{"\u26A0"}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, fontFamily: MONO, fontWeight: 700, color: C.warn }}>
              {fileName ?? "File"} was modified outside CovertEDA
            </div>
          </div>
          <Btn small onClick={reloadFromDisk}>Reload</Btn>
          <Btn small onClick={() => setExternalChange(false)}>Ignore</Btn>
        </div>
      )}

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

      {/* Save bar + Tab bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Btn small primary onClick={handleSave} disabled={saving || (!dirty && !!filePath)}>
          {saving ? "Saving..." : "Save"}
        </Btn>
        <Btn small onClick={handleSaveAs} disabled={saving}>
          Save As
        </Btn>
        {fileName && (
          <span style={{ fontSize: 9, fontFamily: MONO, color: C.t2, display: "flex", alignItems: "center", gap: 4 }}>
            {fileName}
            {dirty && (
              <span style={{
                display: "inline-block", width: 6, height: 6, borderRadius: 3,
                background: C.warn, flexShrink: 0,
              }} title="Unsaved changes" />
            )}
          </span>
        )}
        {!fileName && (
          <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3, fontStyle: "italic" }}>
            No file loaded
          </span>
        )}
        <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>{device}</span>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 1, background: C.bg, borderRadius: 6, padding: 2 }}>
          {(["pins", "timing", "pinout", "generated"] as ConstraintTab[]).map((t) => (
            <div
              key={t}
              onClick={() => {
                setTab(t);
                if (t === "pinout" && packagePins.length === 0) fetchPackagePins();
              }}
              style={{
                textAlign: "center", padding: "5px 10px", borderRadius: 4,
                fontSize: 9, fontFamily: MONO, fontWeight: 600, cursor: "pointer",
                background: tab === t ? C.s1 : "transparent",
                color: tab === t ? C.t1 : C.t3,
                border: tab === t ? `1px solid ${C.b1}` : "1px solid transparent",
              }}
            >
              {t === "pins" && <><Pin /> Pins ({pins.length})</>}
              {t === "timing" && <><Clock /> Timing ({timing.length})</>}
              {t === "pinout" && <>Pinout</>}
              {t === "generated" && <>{constraintFormat}</>}
            </div>
          ))}
        </div>
      </div>

      {/* Pin Assignments Spreadsheet */}
      {tab === "pins" && (
        <div style={panelP}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.t1 }}>Pin Assignments</span>
            <Badge color={C.accent}>{pins.length} pins</Badge>
            <Badge color={C.ok}>{pins.filter((p) => p.locked).length} locked</Badge>
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
            <Btn small onClick={() => { setShowBulkAdd(true); setBulkText(""); setBulkPreview([]); setBulkError(null); }}>+ Bulk Add</Btn>
            <Btn small onClick={() => { setShowBrowsePins(true); fetchPackagePins(); }}>Browse Pins</Btn>
            {selectedRows.size > 1 && (
              <Btn small onClick={() => {
                setPins((prev) => prev.filter((_, i) => !selectedRows.has(i)));
                setSelectedRows(new Set());
                setSelected(null);
                setDirty(true);
              }}>Delete {selectedRows.size} Selected</Btn>
            )}
          </div>

          {/* Validation summary bar */}
          {(validationSummary.errors > 0 || validationSummary.warns > 0) && (
            <div style={{
              display: "flex", gap: 8, alignItems: "center", padding: "4px 8px",
              marginBottom: 6, borderRadius: 4,
              background: validationSummary.errors > 0 ? `${C.err}08` : `${C.warn}08`,
              border: `1px solid ${validationSummary.errors > 0 ? C.err : C.warn}20`,
            }}>
              {validationSummary.errors > 0 && (
                <Badge color={C.err}>{validationSummary.errors} error{validationSummary.errors !== 1 ? "s" : ""}</Badge>
              )}
              {validationSummary.warns > 0 && (
                <Badge color={C.warn}>{validationSummary.warns} warning{validationSummary.warns !== 1 ? "s" : ""}</Badge>
              )}
              <span style={{ fontSize: 7, fontFamily: MONO, color: C.t3 }}>
                {validationSummary.errors > 0 ? "Fix errors before building" : "Review warnings"}
              </span>
            </div>
          )}

          {/* Add Pin Form */}
          {showAdd && (
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 80px 80px 140px auto auto",
              gap: 6, padding: "10px 10px", marginBottom: 8,
              background: C.bg, borderRadius: 4, border: `1px solid ${C.accent}30`,
              alignItems: "end",
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 7, fontFamily: MONO, color: C.t3, fontWeight: 600 }}>NET NAME</span>
                <AutoInput value={newPin.net} onChange={(v) => { setNewPin((p) => ({ ...p, net: v })); setValidationError(null); }}
                  suggestions={netSuggestions} C={C} MONO={MONO} autoFocus />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 7, fontFamily: MONO, color: C.t3, fontWeight: 600 }}>PIN</span>
                {cellInput(newPin.pin, (v) => { setNewPin((p) => ({ ...p, pin: v })); setValidationError(null); }, C, MONO)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 7, fontFamily: MONO, color: C.t3, fontWeight: 600 }}>DIRECTION</span>
                <Select compact value={newPin.dir} onChange={(v) => setNewPin((p) => ({ ...p, dir: v as PinAssignment["dir"] }))}
                  options={[{ value: "input", label: "Input" }, { value: "output", label: "Output" }, { value: "inout", label: "Inout" }]} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 7, fontFamily: MONO, color: C.t3, fontWeight: 600 }}>I/O STANDARD</span>
                <Select compact value={newPin.ioStandard} onChange={(v) => setNewPin((p) => ({ ...p, ioStandard: v }))}
                  options={standards.map((s) => ({ value: s, label: s }))} />
              </div>
              <Btn small primary onClick={addPin}>Add</Btn>
              <Btn small onClick={() => { setShowAdd(false); setValidationError(null); }}>Cancel</Btn>
            </div>
          )}
          {validationError && tab === "pins" && (
            <div style={{
              padding: "4px 10px", fontSize: 8, fontFamily: MONO, fontWeight: 600,
              color: C.err, background: `${C.err}10`, borderRadius: 3, marginBottom: 6,
            }}>
              {validationError}
            </div>
          )}

          {/* Bulk Add Dialog */}
          {showBulkAdd && (
            <div style={{
              padding: "12px 14px", marginBottom: 8,
              background: C.bg, borderRadius: 6, border: `1px solid ${C.accent}30`,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.t1, marginBottom: 8 }}>
                Bulk Add Pins
              </div>
              <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, marginBottom: 6 }}>
                Paste lines: <code>net pin [io_standard]</code> (space/tab/comma separated)
              </div>
              <textarea
                value={bulkText}
                onChange={(e) => { setBulkText(e.target.value); parseBulkText(e.target.value); }}
                placeholder={"led[0] A4 LVCMOS33\nled[1] B4 LVCMOS33\nclk C1\nrst_n D2"}
                rows={6}
                style={{
                  width: "100%", padding: "6px 8px", fontSize: 9, fontFamily: MONO,
                  background: C.s1, color: C.t1, border: `1px solid ${C.b1}`,
                  borderRadius: 4, resize: "vertical", outline: "none",
                }}
              />
              {bulkError && (
                <div style={{ fontSize: 8, fontFamily: MONO, color: C.warn, marginTop: 4 }}>
                  {bulkError}
                </div>
              )}
              {bulkPreview.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 8, fontFamily: MONO, color: C.ok, marginBottom: 4 }}>
                    {bulkPreview.length} pin{bulkPreview.length !== 1 ? "s" : ""} to add:
                  </div>
                  <div style={{
                    maxHeight: 120, overflowY: "auto", fontSize: 8, fontFamily: MONO,
                    background: C.s1, borderRadius: 3, padding: "4px 8px",
                  }}>
                    {bulkPreview.map((p, i) => (
                      <div key={i} style={{ color: C.t2, padding: "1px 0" }}>
                        {p.net} → {p.pin} ({p.ioStandard})
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <Btn small primary onClick={applyBulkAdd} disabled={bulkPreview.length === 0}>
                  Add {bulkPreview.length} Pin{bulkPreview.length !== 1 ? "s" : ""}
                </Btn>
                <Btn small onClick={() => setShowBulkAdd(false)}>Cancel</Btn>
              </div>
            </div>
          )}

          {/* Browse Package Pins Dialog */}
          {showBrowsePins && (
            <div style={{
              padding: "12px 14px", marginBottom: 8,
              background: C.bg, borderRadius: 6, border: `1px solid ${C.accent}30`,
              maxHeight: 350, display: "flex", flexDirection: "column",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.t1 }}>
                  Device Pinout — {device || "no device"}
                </div>
                <div style={{ flex: 1 }} />
                <input
                  type="text" value={pinSearch}
                  onChange={(e) => setPinSearch(e.target.value)}
                  placeholder="Search pins..."
                  style={{
                    padding: "3px 8px", fontSize: 8, fontFamily: MONO,
                    background: C.s1, color: C.t1, border: `1px solid ${C.b1}`,
                    borderRadius: 3, outline: "none", width: 120,
                  }}
                />
                <Select compact value={pinFilter}
                  onChange={(v) => setPinFilter(v as "all" | "user_io")}
                  options={[
                    { value: "user_io", label: "User I/O" },
                    { value: "all", label: "All Pins" },
                  ]}
                />
                <Btn small onClick={() => setShowAdvanced((v) => !v)}
                  style={{ fontSize: 7, opacity: showAdvanced ? 1 : 0.6 }}>
                  {showAdvanced ? "▾ Advanced" : "▸ Advanced"}
                </Btn>
              </div>
              {pinsLoading && (
                <div style={{ fontSize: 9, fontFamily: MONO, color: C.t3, padding: 20, textAlign: "center" }}>
                  Querying vendor tool for device pinout...
                </div>
              )}
              {pinsError && (
                <div style={{ fontSize: 9, fontFamily: MONO, color: C.warn, padding: "8px 0" }}>
                  {pinsError.includes("not supported") || pinsError.includes("not found")
                    ? "Install vendor tool to browse package pinout. Bulk paste always works."
                    : pinsError
                  }
                </div>
              )}
              {!pinsLoading && !pinsError && packagePins.length > 0 && (() => {
                const q = pinSearch.toLowerCase();
                const filtered = packagePins.filter((p) => {
                  if (pinFilter === "user_io" && !p.function.toLowerCase().includes("user") && !p.function.toLowerCase().includes("i/o") && p.function !== "") {
                    // Keep pins with empty function (likely user I/O)
                    if (p.function.toLowerCase().includes("gnd") || p.function.toLowerCase().includes("vcc") || p.function.toLowerCase().includes("config")) return false;
                  }
                  if (q) {
                    const signalMatch = pinToSignalMap.get(p.pin)?.net.toLowerCase().includes(q) ?? false;
                    return p.pin.toLowerCase().includes(q) ||
                      (p.bank ?? "").toLowerCase().includes(q) ||
                      p.function.toLowerCase().includes(q) ||
                      signalMatch;
                  }
                  return true;
                });
                return (
                  <>
                    <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, marginBottom: 4 }}>
                      {filtered.length} of {packagePins.length} pins shown
                      {selectedPkgPins.size > 0 && <> — <span style={{ color: C.accent }}>{selectedPkgPins.size} selected</span></>}
                    </div>
                    <div style={{ flex: 1, overflowY: "auto", borderRadius: 3, border: `1px solid ${C.b1}` }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8, fontFamily: MONO }}>
                        <thead>
                          <tr style={{ position: "sticky", top: 0, background: C.s1, zIndex: 1 }}>
                            <th style={{ padding: "3px 6px", textAlign: "left", color: C.t3, borderBottom: `1px solid ${C.b1}`, width: 20 }} title="Select pin to add"></th>
                            <th style={{ padding: "3px 6px", textAlign: "left", color: C.t3, borderBottom: `1px solid ${C.b1}` }} title="Package pin name (e.g. A1, N9)">Pin</th>
                            <th style={{ padding: "3px 6px", textAlign: "left", color: C.t3, borderBottom: `1px solid ${C.b1}` }} title="Assigned HDL signal name">Signal</th>
                            <th style={{ padding: "3px 6px", textAlign: "left", color: C.t3, borderBottom: `1px solid ${C.b1}` }} title="I/O bank assignment">Bank</th>
                            <th style={{ padding: "3px 6px", textAlign: "left", color: C.t3, borderBottom: `1px solid ${C.b1}` }} title="Pin function: User I/O, Power, Config, SERDES, etc.">Function</th>
                            <th style={{ padding: "3px 6px", textAlign: "left", color: C.t3, borderBottom: `1px solid ${C.b1}` }} title="Differential pair partner pin">Diff Pair</th>
                            {showAdvanced && <>
                              <th style={{ padding: "3px 6px", textAlign: "right", color: C.t3, borderBottom: `1px solid ${C.b1}` }} title="Package resistance (milliohms) — from IBIS .pkg file">R (m&#937;)</th>
                              <th style={{ padding: "3px 6px", textAlign: "right", color: C.t3, borderBottom: `1px solid ${C.b1}` }} title="Package inductance (nanohenries) — from IBIS .pkg file">L (nH)</th>
                              <th style={{ padding: "3px 6px", textAlign: "right", color: C.t3, borderBottom: `1px solid ${C.b1}` }} title="Package capacitance (picofarads) — from IBIS .pkg file">C (pF)</th>
                            </>}
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.slice(0, 200).map((p) => {
                            const sel = selectedPkgPins.has(p.pin);
                            const assignedSignal = pinToSignalMap.get(p.pin);
                            const alreadyUsed = !!assignedSignal;
                            return (
                              <tr
                                key={p.pin}
                                onClick={() => {
                                  if (alreadyUsed) return;
                                  setSelectedPkgPins((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(p.pin)) next.delete(p.pin); else next.add(p.pin);
                                    return next;
                                  });
                                }}
                                style={{
                                  cursor: alreadyUsed ? "default" : "pointer",
                                  background: sel ? `${C.accent}10` : "transparent",
                                  borderLeft: alreadyUsed ? `3px solid ${C.ok}` : "3px solid transparent",
                                  borderBottom: `1px solid ${C.b1}10`,
                                }}
                              >
                                <td style={{ padding: "2px 6px" }}>
                                  <input type="checkbox" checked={sel} disabled={alreadyUsed}
                                    onChange={() => {}} style={{ accentColor: C.accent, pointerEvents: "none" }} />
                                </td>
                                <td style={{ padding: "2px 6px", color: C.cyan, fontWeight: 600 }}>{p.pin}</td>
                                <td style={{ padding: "2px 6px", color: alreadyUsed ? C.ok : C.t3, fontWeight: alreadyUsed ? 600 : 400 }}>
                                  {assignedSignal?.net || "-"}
                                </td>
                                <td style={{ padding: "2px 6px", color: C.t2 }}>{p.bank ?? "-"}</td>
                                <td style={{ padding: "2px 6px", color: C.t3 }}>{p.function || "User I/O"}</td>
                                <td style={{ padding: "2px 6px", color: C.t3 }}>{p.diffPair ?? "-"}</td>
                                {showAdvanced && <>
                                  <td style={{ padding: "2px 6px", color: C.t3, textAlign: "right" }}>{p.rOhms != null ? (p.rOhms * 1000).toFixed(1) : "-"}</td>
                                  <td style={{ padding: "2px 6px", color: C.t3, textAlign: "right" }}>{p.lNh != null ? p.lNh.toFixed(2) : "-"}</td>
                                  <td style={{ padding: "2px 6px", color: C.t3, textAlign: "right" }}>{p.cPf != null ? p.cPf.toFixed(2) : "-"}</td>
                                </>}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
              <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
                <Btn small primary onClick={addSelectedPkgPins} disabled={selectedPkgPins.size === 0}>
                  Add {selectedPkgPins.size} Pin{selectedPkgPins.size !== 1 ? "s" : ""}
                </Btn>
                <Btn small onClick={() => { setShowBrowsePins(false); setSelectedPkgPins(new Set()); }}>Close</Btn>
                <div style={{ flex: 1 }} />
                <span
                  onClick={() => { setShowBrowsePins(false); setTab("pinout"); }}
                  style={{ fontSize: 7, fontFamily: MONO, color: C.accent, cursor: "pointer" }}
                >
                  Open in Pinout tab {"\u2192"}
                </span>
              </div>
            </div>
          )}

          {/* Empty state */}
          {pins.length === 0 && !showAdd && (
            <div style={{
              textAlign: "center", padding: "30px 20px", color: C.t3,
              fontSize: 9, fontFamily: MONO, lineHeight: 1.8,
            }}>
              No pin constraints.{" "}
              {constraintFile
                ? "The constraint file is empty or has no pin assignments."
                : "Open a constraint file or click \"+ Add Pin\" to get started."
              }
            </div>
          )}

          {/* Spreadsheet Table */}
          {pins.length > 0 && (
            <div ref={gridRef} tabIndex={0} onKeyDown={handleKeyDown}
              style={{ overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 320px)", border: `1px solid ${C.b1}`, borderRadius: 4, outline: "none" }}>
              <table style={{ borderCollapse: "collapse", minWidth: 700 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 18 }} title="Lock pin assignment">{"\u2713"}</th>
                    <th style={{ ...thStyle, minWidth: 70 }} title="HDL net / signal name">Net</th>
                    <th style={{ ...thStyle, width: 40 }} title="Package pin (e.g. A1, B3)">Pin</th>
                    <th style={{ ...thStyle, width: 32 }} title="Direction: IN, OUT, or IO (bidirectional)">Dir</th>
                    <th style={{ ...thStyle, minWidth: 75 }} title="I/O voltage standard (e.g. LVCMOS33, LVDS)">I/O Std</th>
                    <th style={{ ...thStyle, width: 38 }} title="Drive strength (mA)">Drive</th>
                    <th style={{ ...thStyle, width: 38 }} title="Pull-up / pull-down resistor">Pull</th>
                    <th style={{ ...thStyle, width: 32 }} title="Slew rate: Slow or Fast">Slew</th>
                    <th style={{ ...thStyle, width: 22 }} title="Open Drain output">OD</th>
                    <th style={{ ...thStyle, width: 22 }} title="Schmitt Trigger input">ST</th>
                    <th style={{ ...thStyle, width: 28 }} title="I/O bank number">Bank</th>
                    <th style={{ ...thStyle, minWidth: 45 }} title="Differential pair partner pin">Diff</th>
                    <th style={{ ...thStyle, width: 22 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, i) => {
                    const realIdx = pins.indexOf(p);
                    const rowSel = selectedRows.has(i) || selected?.row === i;
                    const rowWarnings = pinValidation.get(realIdx);
                    const hasError = rowWarnings?.some((w) => w.type === "error");
                    const hasWarn = rowWarnings && !hasError;
                    return (
                      <tr
                        key={i}
                        style={{
                          borderBottom: `1px solid ${C.b1}15`,
                          cursor: "pointer",
                          background: selectedRows.has(i) ? `${C.accent}10` :
                            i % 2 === 0 ? "transparent" : `${C.bg}50`,
                          borderLeft: hasError ? `3px solid ${C.err}` : hasWarn ? `3px solid ${C.warn}` : "3px solid transparent",
                        }}
                      >
                        {/* Lock */}
                        <td style={cellStyle}>
                          <input type="checkbox" checked={p.locked}
                            onChange={(e) => { e.stopPropagation(); updatePin(realIdx, "locked", e.target.checked); }}
                            onClick={(e) => e.stopPropagation()}
                            style={{ accentColor: C.accent }} />
                        </td>
                        {/* Net (col 0) */}
                        <td style={{ ...cellStyle, color: C.t1, fontWeight: 600, ...cellSel(i, 0) }}
                          onClick={(e) => { e.stopPropagation(); handleCellClick(i, 0, e); }}
                          onDoubleClick={() => setEditingCell({ row: i, col: 0 })}>
                          {isCellEdit(i, 0)
                            ? <AutoInput value={p.net} onChange={(v) => updatePin(realIdx, "net", v)}
                                suggestions={netSuggestions} C={C} MONO={MONO} width={85} autoFocus />
                            : p.net}
                        </td>
                        {/* Pin (col 1) */}
                        <td style={{ ...cellStyle, color: C.accent, fontWeight: 600, ...cellSel(i, 1) }}
                          onClick={(e) => { e.stopPropagation(); handleCellClick(i, 1, e); }}
                          onDoubleClick={() => setEditingCell({ row: i, col: 1 })}>
                          {isCellEdit(i, 1)
                            ? cellInput(p.pin, (v) => updatePin(realIdx, "pin", v), C, MONO, 40, true)
                            : p.pin}
                        </td>
                        {/* Dir (col 2) */}
                        <td style={{ ...cellStyle, ...cellSel(i, 2) }}
                          onClick={(e) => { e.stopPropagation(); handleCellClick(i, 2, e); }}
                          onDoubleClick={() => setEditingCell({ row: i, col: 2 })}>
                          {isCellEdit(i, 2) ? (
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
                        {/* I/O Standard (col 3) */}
                        <td style={{ ...cellStyle, ...cellSel(i, 3) }}
                          onClick={(e) => { e.stopPropagation(); handleCellClick(i, 3, e); }}
                          onDoubleClick={() => setEditingCell({ row: i, col: 3 })}>
                          {isCellEdit(i, 3) ? (
                            <Select compact value={p.ioStandard}
                              onChange={(v) => updatePin(realIdx, "ioStandard", v)}
                              options={standards.map((s) => ({ value: s, label: s }))} />
                          ) : (
                            <span style={{ color: C.t2 }}>{p.ioStandard}</span>
                          )}
                        </td>
                        {/* Drive (col 4) */}
                        <td style={{ ...cellStyle, ...cellSel(i, 4) }}
                          onClick={(e) => { e.stopPropagation(); handleCellClick(i, 4, e); }}
                          onDoubleClick={() => setEditingCell({ row: i, col: 4 })}>
                          {isCellEdit(i, 4) ? (
                            <Select compact value={p.drive ?? ""}
                              onChange={(v) => updatePin(realIdx, "drive", v)}
                              options={[{ value: "", label: "-" }, ...drives.map((d) => ({ value: d, label: d }))]}
                              placeholder="-" />
                          ) : (
                            <span style={{ color: C.t3 }}>{p.drive ?? "-"}</span>
                          )}
                        </td>
                        {/* Pull (col 5) */}
                        <td style={{ ...cellStyle, ...cellSel(i, 5) }}
                          onClick={(e) => { e.stopPropagation(); handleCellClick(i, 5, e); }}
                          onDoubleClick={() => setEditingCell({ row: i, col: 5 })}>
                          {isCellEdit(i, 5) ? (
                            <Select compact value={p.pull ?? "None"}
                              onChange={(v) => updatePin(realIdx, "pull", v)}
                              options={PULL_OPTIONS.map((o) => ({ value: o, label: o }))} />
                          ) : (
                            <span style={{ color: p.pull && p.pull !== "None" ? C.warn : C.t3 }}>
                              {p.pull ?? "None"}
                            </span>
                          )}
                        </td>
                        {/* Slew (col 6) */}
                        <td style={{ ...cellStyle, ...cellSel(i, 6) }}
                          onClick={(e) => { e.stopPropagation(); handleCellClick(i, 6, e); }}
                          onDoubleClick={() => setEditingCell({ row: i, col: 6 })}>
                          {isCellEdit(i, 6) ? (
                            <Select compact value={p.slew ?? "Slow"}
                              onChange={(v) => updatePin(realIdx, "slew", v)}
                              options={SLEW_OPTIONS.map((o) => ({ value: o, label: o }))} />
                          ) : (
                            <span style={{ color: C.t3 }}>{p.slew ?? "Slow"}</span>
                          )}
                        </td>
                        {/* Open Drain (col 7) */}
                        <td style={{ ...cellStyle, ...cellSel(i, 7) }}
                          onClick={(e) => { e.stopPropagation(); handleCellClick(i, 7, e); }}>
                          <input type="checkbox" checked={p.openDrain ?? false}
                            onChange={(e) => { e.stopPropagation(); updatePin(realIdx, "openDrain", e.target.checked); }}
                            onClick={(e) => e.stopPropagation()}
                            style={{ accentColor: C.accent }} />
                        </td>
                        {/* Schmitt (col 8) */}
                        <td style={{ ...cellStyle, ...cellSel(i, 8) }}
                          onClick={(e) => { e.stopPropagation(); handleCellClick(i, 8, e); }}>
                          <input type="checkbox" checked={p.schmitt ?? false}
                            onChange={(e) => { e.stopPropagation(); updatePin(realIdx, "schmitt", e.target.checked); }}
                            onClick={(e) => e.stopPropagation()}
                            style={{ accentColor: C.accent }} />
                        </td>
                        {/* Bank (col 9) */}
                        <td style={{ ...cellStyle, ...cellSel(i, 9) }}
                          onClick={(e) => { e.stopPropagation(); handleCellClick(i, 9, e); }}
                          onDoubleClick={() => setEditingCell({ row: i, col: 9 })}>
                          {isCellEdit(i, 9) ? (
                            <Select compact value={p.bank ?? ""}
                              onChange={(v) => updatePin(realIdx, "bank", v)}
                              options={[{ value: "", label: "-" }, ...BANK_NUMBERS.map((b) => ({ value: b, label: b }))]}
                              placeholder="-" />
                          ) : (
                            <span style={{ color: C.t3 }}>{p.bank ?? "-"}</span>
                          )}
                        </td>
                        {/* Diff Pair (col 10) */}
                        <td style={{ ...cellStyle, ...cellSel(i, 10) }}
                          onClick={(e) => { e.stopPropagation(); handleCellClick(i, 10, e); }}
                          onDoubleClick={() => setEditingCell({ row: i, col: 10 })}>
                          {isCellEdit(i, 10)
                            ? cellInput(p.diffPair ?? "", (v) => updatePin(realIdx, "diffPair", v), C, MONO, 50, true)
                            : <span style={{ color: p.diffPair ? C.purple : C.t3 }}>{p.diffPair ?? "-"}</span>}
                        </td>
                        {/* Actions */}
                        <td style={cellStyle}>
                          {rowSel && selectedRows.size <= 1 ? (
                            <span
                              onClick={(e) => { e.stopPropagation(); removePin(realIdx); }}
                              title="Remove pin assignment (Del)"
                              style={{ color: C.t3, cursor: "pointer", fontSize: 10, fontWeight: 600, lineHeight: 1 }}
                            >
                              {"\u2212"}
                            </span>
                          ) : rowWarnings && rowWarnings.length > 0 && !rowSel ? (
                            <span
                              title={rowWarnings.map((w) => w.msg).join("\n")}
                              style={{ fontSize: 9, cursor: "default", color: hasError ? C.err : C.warn }}
                            >
                              {hasError ? "\u26D4" : "\u26A0"}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: 8, fontSize: 7, fontFamily: MONO, color: C.t3 }}>
            Click a cell to select, double-click or F2 to edit. Arrow keys navigate, Tab moves right, Enter moves down, Escape cancels edit. Ctrl+C copies rows, Ctrl+V pastes. Shift+Click or Shift+Arrow to select multiple rows.
          </div>
        </div>
      )}

      {/* Pinout Tab */}
      {tab === "pinout" && (
        <div style={panelP}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, position: "relative", zIndex: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.t1 }}>Device Pinout</span>
            <Badge color={C.accent}>{packagePins.length} pins</Badge>
            <Badge color={C.ok}>{pinToSignalMap.size} assigned</Badge>
            {buildPinout && <Badge color={C.cyan}>Build verified ({buildPinout.assignedPins.length})</Badge>}
            <div style={{ flex: 1 }} />
            {projectDir && (
              <Btn small onClick={() => {
                getPadReport(backendId, projectDir).then((r) => setBuildPinout(r)).catch(() => {});
              }}>Load Build Pinout</Btn>
            )}
            <Select compact value={pinoutFilter}
              onChange={(v) => setPinoutFilter(v as PinoutFilter)}
              options={[
                { value: "all", label: "All Pins" },
                { value: "user_io", label: "User I/O" },
                { value: "assigned", label: "Assigned" },
                { value: "unassigned", label: "Unassigned" },
                { value: "errors", label: "Errors" },
              ]}
            />
          </div>
          {pinsLoading && (
            <div style={{ fontSize: 9, fontFamily: MONO, color: C.t3, padding: 20, textAlign: "center" }}>
              Loading device pinout...
            </div>
          )}
          {!pinsLoading && packagePins.length === 0 && (
            <div style={{ fontSize: 9, fontFamily: MONO, color: C.t3, padding: 20, textAlign: "center" }}>
              No device pin data available. Install the vendor tool or select a device to view the pinout.
            </div>
          )}
          {!pinsLoading && packagePins.length > 0 && (() => {
            const buildPinMap = new Map<string, PadPinEntry>();
            if (buildPinout) {
              for (const bp of buildPinout.assignedPins) {
                buildPinMap.set(bp.pin, bp);
              }
            }

            const pinoutRows = packagePins.filter((dp) => {
              const assigned = pinToSignalMap.has(dp.pin);
              const fn = dp.function.toLowerCase();
              const isPower = fn.includes("gnd") || fn.includes("vcc") || fn.includes("power");
              const isConfig = fn.includes("config") || fn.includes("reserved");
              const hasError = assigned && pinValidation.get(pins.findIndex((p) => p.pin === dp.pin))?.some((w) => w.type === "error");

              switch (pinoutFilter) {
                case "user_io": return !isPower && !isConfig;
                case "assigned": return assigned;
                case "unassigned": return !assigned && !isPower && !isConfig;
                case "errors": return hasError;
                default: return true;
              }
            });

            return (
              <>
                <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, marginBottom: 4 }}>
                  {pinoutRows.length} of {packagePins.length} pins shown
                </div>
                <div style={{ overflowY: "auto", maxHeight: "calc(100vh - 340px)", border: `1px solid ${C.b1}`, borderRadius: 4 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8, fontFamily: MONO }}>
                    <thead>
                      <tr style={{ position: "sticky", top: 0, background: C.s1, zIndex: 1 }}>
                        <th style={{ padding: "3px 6px", textAlign: "left", color: C.t3, borderBottom: `2px solid ${C.b1}` }}>Pin</th>
                        <th style={{ padding: "3px 6px", textAlign: "left", color: C.t3, borderBottom: `2px solid ${C.b1}` }}>Bank</th>
                        <th style={{ padding: "3px 6px", textAlign: "left", color: C.t3, borderBottom: `2px solid ${C.b1}` }}>Function</th>
                        <th style={{ padding: "3px 6px", textAlign: "left", color: C.t3, borderBottom: `2px solid ${C.b1}` }}>Signal</th>
                        <th style={{ padding: "3px 6px", textAlign: "left", color: C.t3, borderBottom: `2px solid ${C.b1}` }}>I/O Std</th>
                        <th style={{ padding: "3px 6px", textAlign: "left", color: C.t3, borderBottom: `2px solid ${C.b1}` }}>Status</th>
                        <th style={{ padding: "3px 6px", textAlign: "left", color: C.t3, borderBottom: `2px solid ${C.b1}` }}>Diff Pair</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pinoutRows.slice(0, 300).map((dp) => {
                        const assigned = pinToSignalMap.get(dp.pin);
                        const buildEntry = buildPinMap.get(dp.pin);
                        const fn = dp.function.toLowerCase();
                        const isPower = fn.includes("gnd") || fn.includes("vcc") || fn.includes("power");
                        const isConfig = fn.includes("config") || fn.includes("reserved");

                        let status: string;
                        let statusColor: string;
                        if (buildEntry && assigned) {
                          // Check if build matches constraint
                          if (buildEntry.portName === assigned.net) {
                            status = "Verified";
                            statusColor = C.cyan;
                          } else {
                            status = "Mismatch";
                            statusColor = C.err;
                          }
                        } else if (assigned) {
                          status = "Assigned";
                          statusColor = C.ok;
                        } else if (isPower) {
                          status = "Power";
                          statusColor = C.t3;
                        } else if (isConfig) {
                          status = "Config";
                          statusColor = C.warn;
                        } else {
                          status = "Available";
                          statusColor = C.t3;
                        }

                        return (
                          <tr key={dp.pin} style={{ borderBottom: `1px solid ${C.b1}10` }}>
                            <td style={{ padding: "2px 6px", color: C.cyan, fontWeight: 600 }}>{dp.pin}</td>
                            <td style={{ padding: "2px 6px", color: C.t2 }}>{dp.bank ?? "-"}</td>
                            <td style={{ padding: "2px 6px", color: C.t3 }}>{dp.function || "User I/O"}</td>
                            <td style={{ padding: "2px 6px" }}>
                              {assigned ? (
                                <span
                                  onClick={() => {
                                    const idx = pins.findIndex((p) => p.pin === dp.pin);
                                    if (idx >= 0) {
                                      setTab("pins");
                                      setSelected({ row: idx, col: 0 });
                                    }
                                  }}
                                  style={{ color: C.ok, fontWeight: 600, cursor: "pointer" }}
                                >
                                  {assigned.net}
                                </span>
                              ) : buildEntry ? (
                                <span style={{ color: C.t2, fontStyle: "italic" }}>{buildEntry.portName}</span>
                              ) : (
                                <span style={{ color: C.t3 }}>-</span>
                              )}
                            </td>
                            <td style={{ padding: "2px 6px", color: C.t2 }}>
                              {assigned?.ioStandard ?? buildEntry?.ioStandard ?? "-"}
                            </td>
                            <td style={{ padding: "2px 6px" }}>
                              <span style={{
                                fontSize: 7, padding: "1px 4px", borderRadius: 2, fontWeight: 600,
                                color: statusColor,
                                background: `${statusColor}15`,
                              }}>
                                {status}
                              </span>
                            </td>
                            <td style={{ padding: "2px 6px", color: C.t3 }}>{dp.diffPair ?? "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
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
              <Btn small onClick={() => { setShowAddTiming(false); setValidationError(null); }}>Cancel</Btn>
            </div>
          )}
          {validationError && tab === "timing" && (
            <div style={{
              padding: "4px 10px", fontSize: 8, fontFamily: MONO, fontWeight: 600,
              color: C.err, background: `${C.err}10`, borderRadius: 3, marginBottom: 6,
            }}>
              {validationError}
            </div>
          )}

          {/* Timing constraints table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${C.b1}` }}>
                  <th style={{ ...thStyle, width: 30 }} title="Enable / disable this constraint">On</th>
                  <th style={{ ...thStyle, minWidth: 120 }} title="SDC constraint type">Command</th>
                  <th style={{ ...thStyle, width: 80 }} title="Constraint name (e.g. clock name)">Name</th>
                  <th style={{ ...thStyle, minWidth: 80 }} title="Target net, pin, or clock">Target</th>
                  <th style={{ ...thStyle, width: 70 }} title="Constraint value (period, delay, etc.)">Value</th>
                  <th style={{ ...thStyle, width: 70 }} title="Reference clock for delay constraints">Reference</th>
                  <th style={{ ...thStyle, width: 60 }} title="Generated SDC command preview">SDC</th>
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
