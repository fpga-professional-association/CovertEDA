import { render, RenderOptions } from "@testing-library/react";
import { ThemeProvider } from "../context/ThemeContext";
import { ReactElement } from "react";
import type { BuildRecord } from "../components/BuildHistory";
import type { PinAssignment, TimingConstraint } from "../components/ConstraintEditor";
import type { LogEntry, GitState, TimingReportData, UtilizationReportData } from "../types";

function AllProviders({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

export function renderWithTheme(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return render(ui, { wrapper: AllProviders, ...options });
}

export function makeBuildRecord(overrides: Partial<BuildRecord> = {}): BuildRecord {
  return {
    id: "build-001",
    timestamp: "2025-01-15T10:30:00Z",
    duration: 95,
    status: "success",
    backend: "radiant",
    device: "LIFCL-40-7BG400I",
    stages: ["synthesize", "map", "place_route", "bitstream"],
    fmaxMhz: 125.5,
    lutUsed: 1200,
    lutTotal: 38400,
    ffUsed: 800,
    ffTotal: 38400,
    warnings: 3,
    errors: 0,
    commitHash: "abc1234",
    commitMsg: "Add counter module",
    ...overrides,
  };
}

export function makePinAssignment(overrides: Partial<PinAssignment> = {}): PinAssignment {
  return {
    net: "clk",
    pin: "A10",
    dir: "input",
    ioStandard: "LVCMOS33",
    pull: "None",
    slew: "Slow",
    locked: true,
    ...overrides,
  };
}

export function makeTimingConstraint(overrides: Partial<TimingConstraint> = {}): TimingConstraint {
  return {
    type: "clock",
    name: "sys_clk",
    target: "clk",
    value: "100.0",
    enabled: true,
    ...overrides,
  };
}

export function makeLogEntry(t: LogEntry["t"] = "info", m = "Test message"): LogEntry {
  return { t, m };
}

export function makeGitState(overrides: Partial<GitState> = {}): GitState {
  return {
    branch: "main",
    commit: "abc1234",
    commitMsg: "Initial commit",
    author: "Test User",
    time: "2 hours ago",
    ahead: 0,
    behind: 0,
    dirty: false,
    staged: 0,
    unstaged: 0,
    untracked: 0,
    stashes: 0,
    tags: [],
    recentCommits: [],
    ...overrides,
  };
}

export function makeTimingReport(overrides: Partial<TimingReportData> = {}): TimingReportData {
  return {
    title: "Timing Report",
    generated: "2025-01-15T10:30:00Z",
    tool: "Lattice Radiant",
    summary: {
      status: "MET",
      fmax: "125.50 MHz",
      target: "100.00 MHz",
      margin: "25.50 MHz",
      wns: "2.500 ns",
      tns: "0.000 ns",
      whs: "0.150 ns",
      ths: "0.000 ns",
      failingPaths: 0,
      totalPaths: 42,
      clocks: 1,
    },
    clocks: [{
      name: "sys_clk",
      period: "10.000 ns",
      freq: "100.00 MHz",
      source: "clk",
      type: "primary",
      wns: "2.500 ns",
      paths: 42,
    }],
    criticalPaths: [{
      rank: 1,
      from: "counter_reg[0]",
      to: "counter_reg[7]",
      slack: "2.500 ns",
      req: "10.000 ns",
      delay: "7.500 ns",
      levels: 3,
      clk: "sys_clk",
      type: "setup",
    }],
    holdPaths: [],
    unconstrained: [],
    ...overrides,
  };
}

export function makeProjectFile(overrides: Partial<import("../types").ProjectFile> = {}): import("../types").ProjectFile {
  return {
    n: "counter.v",
    d: 0,
    ty: "rtl",
    path: "/project/counter.v",
    saved: true,
    git: "clean",
    synth: true,
    lines: 45,
    lang: "Verilog",
    ...overrides,
  };
}

export function makeUtilizationReport(overrides: Partial<UtilizationReportData> = {}): UtilizationReportData {
  return {
    title: "Utilization Report",
    generated: "2025-01-15T10:30:00Z",
    device: "LIFCL-40-7BG400I",
    summary: [{
      cat: "Logic",
      items: [
        { r: "LUT4", used: 120, total: 38400, detail: "" },
        { r: "Registers", used: 80, total: 38400, detail: "" },
      ],
    }, {
      cat: "I/O",
      items: [
        { r: "PIO", used: 18, total: 204, detail: "" },
      ],
    }],
    byModule: [{
      module: "counter",
      lut: 120,
      ff: 80,
      ebr: 0,
      pct: "0.3%",
    }],
    ...overrides,
  };
}
