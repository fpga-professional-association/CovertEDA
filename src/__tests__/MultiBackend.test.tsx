/**
 * Multi-backend parametrized tests.
 * These tests verify that components render correctly across ALL supported FPGA backends.
 */
import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme, makeTimingReport, makeUtilizationReport } from "../test/helpers";
import BuildPipeline from "../components/BuildPipeline";
import ReportViewer from "../components/ReportViewer";
import IpCatalogSection from "../components/IpCatalogSection";
import type { RuntimeBackend, LogEntry, ReportTab } from "../types";

vi.mock("../hooks/useTauri", () => ({
  getRawReport: vi.fn(() => Promise.resolve("")),
  listen: vi.fn(() => Promise.resolve(() => {})),
  executeIpGenerate: vi.fn(() => Promise.resolve()),
  pickDirectory: vi.fn(() => Promise.resolve("/custom/ip/path")),
}));

vi.mock("../data/deviceParts", () => ({
  DEVICE_MAP: {
    radiant: [{ family: "CertusPro-NX", parts: ["LIFCL-40-7BG400I"] }],
    quartus_std: [{ family: "Cyclone V", parts: ["5CEBA4F23C7"] }],
    vivado: [{ family: "Artix-7", parts: ["xc7a100tcsg324-1"] }],
    diamond: [{ family: "ECP5", parts: ["LFE5U-85F-6BG756C"] }],
    ace: [{ family: "Speedster7t", parts: ["AC7t1500ES0"] }],
    libero: [{ family: "PolarFire", parts: ["MPF300TS-1FCG1152I"] }],
  } as Record<string, { family: string; parts: string[]; editions?: string[] }[]>,
  validatePart: () => ({ valid: true, reason: "" }),
  parsePartInfo: () => ({ pins: "400", logic: "40K LUTs", speed: "-7", package: "BG400", grade: "Industrial" }),
}));

// ── Backend Definitions ──

interface BackendDef {
  id: string;
  name: string;
  short: string;
  defaultDev: string;
  constrExt: string;
  pipeline: { id: string; label: string; cmd: string; detail: string }[];
  ipSearchTerm: string; // A term to find in that backend's IP catalog
  expectedSource: string; // Source label for built-in IPs
}

const BACKENDS: BackendDef[] = [
  {
    id: "radiant",
    name: "Lattice Radiant",
    short: "RAD",
    defaultDev: "LIFCL-40-7BG400I",
    constrExt: ".pdc",
    pipeline: [
      { id: "synth", label: "Synthesis", cmd: "synth", detail: "RTL synthesis" },
      { id: "map", label: "Map", cmd: "map", detail: "Technology mapping" },
      { id: "par", label: "Place & Route", cmd: "par", detail: "Place and route" },
      { id: "bitgen", label: "Bitstream", cmd: "bitgen", detail: "Generate bitstream" },
    ],
    ipSearchTerm: "PLL",
    expectedSource: "Built-in: Radiant IP Library",
  },
  {
    id: "quartus",
    name: "Intel Quartus",
    short: "QRT",
    defaultDev: "5CEBA4F23C7",
    constrExt: ".sdc",
    pipeline: [
      { id: "synth", label: "Synthesis", cmd: "quartus_syn", detail: "Synthesis" },
      { id: "fit", label: "Fitter", cmd: "quartus_fit", detail: "Place and route" },
      { id: "sta", label: "Timing Analysis", cmd: "quartus_sta", detail: "Static timing" },
      { id: "asm", label: "Assembler", cmd: "quartus_asm", detail: "Generate bitstream" },
    ],
    ipSearchTerm: "ALTPLL",
    expectedSource: "Built-in: Quartus IP Library",
  },
  {
    id: "vivado",
    name: "AMD Vivado",
    short: "VIV",
    defaultDev: "xc7a100tcsg324-1",
    constrExt: ".xdc",
    pipeline: [
      { id: "synth", label: "Synthesis", cmd: "synth_design", detail: "Synthesis" },
      { id: "opt", label: "Optimize", cmd: "opt_design", detail: "Logic optimization" },
      { id: "place", label: "Place", cmd: "place_design", detail: "Placement" },
      { id: "route", label: "Route", cmd: "route_design", detail: "Routing" },
      { id: "bitgen", label: "Bitstream", cmd: "write_bitstream", detail: "Generate bitstream" },
    ],
    ipSearchTerm: "Clocking Wizard",
    expectedSource: "Built-in: Vivado IP Catalog",
  },
  {
    id: "diamond",
    name: "Lattice Diamond",
    short: "DIA",
    defaultDev: "LFE5U-85F-6BG756C",
    constrExt: ".lpf",
    pipeline: [
      { id: "synth", label: "Synthesis", cmd: "synth", detail: "Synthesis" },
      { id: "map", label: "Map", cmd: "map", detail: "Technology mapping" },
      { id: "par", label: "Place & Route", cmd: "par", detail: "Place and route" },
      { id: "bitgen", label: "Bitstream", cmd: "bitgen", detail: "Generate bitstream" },
    ],
    ipSearchTerm: "Distributed RAM",
    expectedSource: "Built-in: Diamond IP Library",
  },
  {
    id: "ace",
    name: "Achronix ACE",
    short: "ACE",
    defaultDev: "AC7t1500ES0",
    constrExt: ".pdc",
    pipeline: [
      { id: "synth", label: "Synthesis", cmd: "synth", detail: "Synthesis" },
      { id: "place", label: "Place", cmd: "place", detail: "Placement" },
      { id: "route", label: "Route", cmd: "route", detail: "Routing" },
      { id: "bitgen", label: "Bitstream", cmd: "bitgen", detail: "Generate bitstream" },
    ],
    ipSearchTerm: "BRAM72K",
    expectedSource: "Built-in: ACE IP Library",
  },
  {
    id: "libero",
    name: "Microchip Libero",
    short: "LIB",
    defaultDev: "MPF300TS-1FCG1152I",
    constrExt: ".pdc",
    pipeline: [
      { id: "synth", label: "Synthesis", cmd: "synth", detail: "Synthesis" },
      { id: "place", label: "Place", cmd: "place", detail: "Placement" },
      { id: "route", label: "Route", cmd: "route", detail: "Routing" },
      { id: "bitgen", label: "Bitstream", cmd: "bitgen", detail: "Generate bitstream" },
    ],
    ipSearchTerm: "LSRAM",
    expectedSource: "Built-in: Libero SoC IP Library",
  },
];

function makeRuntimeBackend(def: BackendDef): RuntimeBackend {
  return {
    id: def.id,
    name: def.name,
    short: def.short,
    color: "#3b9eff",
    icon: "\u25C6",
    version: "1.0",
    cli: "tool",
    defaultDev: def.defaultDev,
    constrExt: def.constrExt,
    available: true,
    pipeline: def.pipeline,
  };
}

// ══════════════════════════════════════════════════════════
// BuildPipeline — parametrized across all backends
// ══════════════════════════════════════════════════════════

describe("BuildPipeline — multi-backend", () => {
  for (const def of BACKENDS) {
    describe(`backend: ${def.name}`, () => {
      const backend = makeRuntimeBackend(def);

      it("renders all pipeline stages", () => {
        renderWithTheme(
          <BuildPipeline
            backend={backend}
            building={false}
            buildStep={-1}
            logs={[] as LogEntry[]}
            activeStage={null}
            onStageClick={vi.fn()}
            selectedStages={[]}
            onStagesChange={vi.fn()}
            buildOptions={{}}
            onOptionsChange={vi.fn()}
          />
        );
        for (const stage of def.pipeline) {
          expect(screen.getByText(stage.label)).toBeInTheDocument();
        }
      });

      it("renders correct number of stage checkboxes", () => {
        renderWithTheme(
          <BuildPipeline
            backend={backend}
            building={false}
            buildStep={-1}
            logs={[] as LogEntry[]}
            activeStage={null}
            onStageClick={vi.fn()}
            selectedStages={[]}
            onStagesChange={vi.fn()}
            buildOptions={{}}
            onOptionsChange={vi.fn()}
          />
        );
        const checkboxes = screen.getAllByRole("checkbox");
        expect(checkboxes.length).toBe(def.pipeline.length);
      });

      it("shows backend short name badge", () => {
        renderWithTheme(
          <BuildPipeline
            backend={backend}
            building={false}
            buildStep={-1}
            logs={[] as LogEntry[]}
            activeStage={null}
            onStageClick={vi.fn()}
            selectedStages={[]}
            onStagesChange={vi.fn()}
            buildOptions={{}}
            onOptionsChange={vi.fn()}
          />
        );
        expect(screen.getByText(def.short)).toBeInTheDocument();
      });

      it("shows BUILD SUCCESSFUL when all stages complete", () => {
        renderWithTheme(
          <BuildPipeline
            backend={backend}
            building={false}
            buildStep={def.pipeline.length}
            logs={[] as LogEntry[]}
            activeStage={null}
            onStageClick={vi.fn()}
            selectedStages={[]}
            onStagesChange={vi.fn()}
            buildOptions={{}}
            onOptionsChange={vi.fn()}
          />
        );
        expect(screen.getByText(/BUILD SUCCESSFUL/)).toBeInTheDocument();
      });
    });
  }
});

// ══════════════════════════════════════════════════════════
// IpCatalogSection — parametrized across all backends
// ══════════════════════════════════════════════════════════

describe("IpCatalogSection — multi-backend", () => {
  for (const def of BACKENDS) {
    describe(`backend: ${def.name}`, () => {
      it("renders IP Catalog with correct source label", () => {
        renderWithTheme(
          <IpCatalogSection
            backendId={def.id}
            projectDir="/test/project"
            device={def.defaultDev}
          />
        );
        expect(screen.getByText("IP Catalog")).toBeInTheDocument();
        const sources = screen.getAllByText(new RegExp(def.expectedSource.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        expect(sources.length).toBeGreaterThan(0);
      });

      it("has non-zero core count", () => {
        renderWithTheme(
          <IpCatalogSection
            backendId={def.id}
            projectDir="/test/project"
            device={def.defaultDev}
          />
        );
        const countEls = screen.getAllByText(/\d+ cores/);
        const count = parseInt(countEls[0].textContent?.match(/\d+/)?.[0] ?? "0");
        expect(count).toBeGreaterThan(0);
      });

      it(`can find "${def.ipSearchTerm}" via search`, () => {
        renderWithTheme(
          <IpCatalogSection
            backendId={def.id}
            projectDir="/test/project"
            device={def.defaultDev}
          />
        );
        const search = screen.getByPlaceholderText("Search IP cores...");
        fireEvent.change(search, { target: { value: def.ipSearchTerm } });
        expect(screen.getByText(def.ipSearchTerm)).toBeInTheDocument();
      });
    });
  }
});

// ══════════════════════════════════════════════════════════
// ReportViewer — timing report across different clock scenarios
// ══════════════════════════════════════════════════════════

const nullReports = { timing: null, utilization: null, power: null, drc: null, io: null };

describe("ReportViewer — multi-scenario", () => {
  const scenarios = [
    {
      name: "single clock passing",
      report: makeTimingReport({
        summary: { ...makeTimingReport().summary, status: "MET", wns: "2.500 ns", failingPaths: 0 },
      }),
      expectMet: true,
    },
    {
      name: "single clock failing",
      report: makeTimingReport({
        summary: { ...makeTimingReport().summary, status: "VIOLATED", wns: "-1.200 ns", failingPaths: 5, totalPaths: 42 },
      }),
      expectMet: false,
    },
    {
      name: "multi-clock mixed",
      report: makeTimingReport({
        summary: { ...makeTimingReport().summary, status: "VIOLATED", wns: "-0.100 ns", failingPaths: 2 },
        clocks: [
          { name: "sys_clk", period: "10 ns", freq: "100 MHz", source: "clk", type: "primary", wns: "1.0 ns", paths: 30 },
          { name: "pll_clk", period: "5 ns", freq: "200 MHz", source: "pll", type: "generated", wns: "-0.1 ns", paths: 12 },
        ],
      }),
      expectMet: false,
    },
    {
      name: "no paths (optimized away)",
      report: makeTimingReport({
        summary: { ...makeTimingReport().summary, status: "MET", totalPaths: 0, failingPaths: 0 },
        criticalPaths: [],
      }),
      expectMet: true, // Technically reports MET even though optimized away
    },
  ];

  for (const scenario of scenarios) {
    it(`shows correct status for ${scenario.name}`, () => {
      renderWithTheme(
        <ReportViewer
          rptTab={"timing" as ReportTab}
          setRptTab={vi.fn()}
          reports={{ ...nullReports, timing: scenario.report }}
          device="LIFCL-40-7BG400I"
          projectDir="/test"
        />
      );
      // ReportViewer shows t.summary.status directly (e.g., "MET" or "VIOLATED")
      if (scenario.expectMet) {
        expect(screen.getAllByText("MET").length).toBeGreaterThan(0);
      } else {
        expect(screen.getAllByText("VIOLATED").length).toBeGreaterThan(0);
      }
    });
  }

  it("shows utilization data for all category types", () => {
    const util = makeUtilizationReport({
      summary: [
        { cat: "Logic", items: [{ r: "LUT4", used: 120, total: 38400, detail: "" }] },
        { cat: "Memory", items: [{ r: "EBR", used: 4, total: 100, detail: "" }] },
        { cat: "I/O", items: [{ r: "PIO", used: 18, total: 204, detail: "" }] },
        { cat: "DSP", items: [{ r: "DSP48", used: 2, total: 240, detail: "" }] },
      ],
    });
    renderWithTheme(
      <ReportViewer
        rptTab={"util" as ReportTab}
        setRptTab={vi.fn()}
        reports={{ ...nullReports, utilization: util }}
        device="LIFCL-40-7BG400I"
        projectDir="/test"
      />
    );
    expect(screen.getByText("LOGIC")).toBeInTheDocument();
    expect(screen.getByText("MEMORY")).toBeInTheDocument();
    expect(screen.getByText("DSP")).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════
// OSS sub-variants (ice40 vs ECP5 vs Gowin)
// ══════════════════════════════════════════════════════════

describe("IpCatalogSection — OSS sub-variants", () => {
  const ossVariants = [
    { device: "ice40-hx8k-ct256", expectedSource: "iCE40 IP Library" },
    { device: "ecp5-25k", expectedSource: "OSS CAD Suite" },
    { device: "GW1N-LV1QN48C6/I5", expectedSource: "Gowin IP Library" },
  ];

  for (const variant of ossVariants) {
    it(`shows ${variant.expectedSource} for device ${variant.device}`, () => {
      renderWithTheme(
        <IpCatalogSection
          backendId="oss"
          projectDir="/test/project"
          device={variant.device}
        />
      );
      const sources = screen.getAllByText(new RegExp(variant.expectedSource.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      expect(sources.length).toBeGreaterThan(0);
    });
  }
});
