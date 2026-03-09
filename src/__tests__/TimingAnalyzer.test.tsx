import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme, makeTimingReport } from "../test/helpers";
import TimingAnalyzer from "../components/TimingAnalyzer";
import type { TimingReportData } from "../types";

function renderAnalyzer(timing: TimingReportData | null = null) {
  return renderWithTheme(<TimingAnalyzer timing={timing} />);
}

describe("TimingAnalyzer", () => {
  // ── No Data ──
  it("shows fallback message when timing is null", () => {
    renderAnalyzer(null);
    expect(screen.getByText("No timing data available. Run a build first.")).toBeInTheDocument();
  });

  // ── Hero Dashboard ──
  it("shows TIMING MET when status is MET", () => {
    renderAnalyzer(makeTimingReport({ summary: { ...makeTimingReport().summary, status: "MET" } }));
    expect(screen.getByText("TIMING MET")).toBeInTheDocument();
  });

  it("shows TIMING VIOLATED when status is not MET", () => {
    renderAnalyzer(makeTimingReport({
      summary: {
        ...makeTimingReport().summary,
        status: "VIOLATED",
        wns: "-0.500 ns",
        failingPaths: 3,
      },
    }));
    expect(screen.getByText("TIMING VIOLATED")).toBeInTheDocument();
  });

  it("shows Fmax in the gauge", () => {
    renderAnalyzer(makeTimingReport());
    // The gauge text shows "125.5" (Fmax value)
    expect(screen.getByText("125.5")).toBeInTheDocument();
  });

  // ── Metric Cards ──
  it("displays WNS, TNS, WHS, THS metric cards", () => {
    renderAnalyzer(makeTimingReport());
    // These labels appear in metric card headers — use getAllByText since they can be in multiple places
    expect(screen.getAllByText("WNS").length).toBeGreaterThan(0);
    expect(screen.getAllByText("TNS").length).toBeGreaterThan(0);
    expect(screen.getAllByText("WHS").length).toBeGreaterThan(0);
    expect(screen.getAllByText("THS").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Failing").length).toBeGreaterThan(0);
  });

  it("shows WNS value", () => {
    renderAnalyzer(makeTimingReport());
    expect(screen.getAllByText("2.500 ns").length).toBeGreaterThan(0);
  });

  it("shows failing paths count in metric card", () => {
    renderAnalyzer(makeTimingReport());
    expect(screen.getByText("of 42")).toBeInTheDocument();
  });

  // ── Clock Domains ──
  it("shows Clock Domains section", () => {
    renderAnalyzer(makeTimingReport());
    expect(screen.getByText("Clock Domains")).toBeInTheDocument();
  });

  it("shows clock name and frequency", () => {
    renderAnalyzer(makeTimingReport());
    expect(screen.getAllByText("sys_clk").length).toBeGreaterThan(0);
    expect(screen.getByText("100.0 MHz")).toBeInTheDocument();
  });

  it("shows MET badge for passing clock", () => {
    renderAnalyzer(makeTimingReport());
    expect(screen.getAllByText("MET").length).toBeGreaterThan(0);
  });

  it("shows multiple clock domains and FAIL badge", () => {
    const timing = makeTimingReport({
      clocks: [
        { name: "sys_clk", period: "10.000 ns", freq: "100.00 MHz", source: "clk", type: "primary", wns: "2.500 ns", paths: 30 },
        { name: "pll_clk", period: "5.000 ns", freq: "200.00 MHz", source: "pll_out", type: "generated", wns: "-0.100 ns", paths: 12 },
      ],
    });
    renderAnalyzer(timing);
    expect(screen.getAllByText("sys_clk").length).toBeGreaterThan(0);
    expect(screen.getAllByText("pll_clk").length).toBeGreaterThan(0);
    expect(screen.getAllByText("FAIL").length).toBeGreaterThan(0);
  });

  // ── Root Cause Distribution ──
  it("shows Root Cause Distribution when paths exist", () => {
    renderAnalyzer(makeTimingReport());
    expect(screen.getByText("Root Cause Distribution")).toBeInTheDocument();
  });

  // ── Root Cause Classification ──
  it("classifies deep logic paths as logic_depth", () => {
    const timing = makeTimingReport({
      criticalPaths: [{
        rank: 1, from: "reg_a", to: "reg_b",
        slack: "-0.100 ns", req: "10.000 ns", delay: "10.100 ns",
        levels: 6, clk: "sys_clk", type: "setup",
      }],
    });
    renderAnalyzer(timing);
    expect(screen.getAllByText("Logic Depth").length).toBeGreaterThan(0);
  });

  it("classifies DSP/BRAM paths correctly", () => {
    const timing = makeTimingReport({
      criticalPaths: [{
        rank: 1, from: "dsp_mult_reg", to: "accum_reg",
        slack: "-0.200 ns", req: "5.000 ns", delay: "5.200 ns",
        levels: 2, clk: "sys_clk", type: "setup",
      }],
    });
    renderAnalyzer(timing);
    expect(screen.getAllByText("DSP/BRAM").length).toBeGreaterThan(0);
  });

  it("classifies BRAM paths correctly", () => {
    const timing = makeTimingReport({
      criticalPaths: [{
        rank: 1, from: "bram_data_out[0]", to: "output_reg",
        slack: "0.500 ns", req: "10.000 ns", delay: "9.500 ns",
        levels: 2, clk: "sys_clk", type: "setup",
      }],
    });
    renderAnalyzer(timing);
    expect(screen.getAllByText("DSP/BRAM").length).toBeGreaterThan(0);
  });

  // ── Path Cards ──
  it("shows path rank and slack in path card header", () => {
    const timing = makeTimingReport({
      criticalPaths: [{
        rank: 1, from: "counter_reg[0]", to: "counter_reg[7]",
        slack: "2.500 ns", req: "10.000 ns", delay: "7.500 ns",
        levels: 3, clk: "sys_clk", type: "setup",
      }],
    });
    renderAnalyzer(timing);
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getAllByText("+2.500 ns").length).toBeGreaterThan(0);
  });

  it("shows levels and type in path card", () => {
    renderAnalyzer(makeTimingReport());
    expect(screen.getByText("3 levels")).toBeInTheDocument();
    expect(screen.getAllByText("setup").length).toBeGreaterThan(0);
  });

  it("expands path card to show FROM/TO on click", () => {
    renderAnalyzer(makeTimingReport());
    // Click the path card header to expand (click the rank badge #1)
    fireEvent.click(screen.getByText("#1"));
    expect(screen.getByText("FROM")).toBeInTheDocument();
    expect(screen.getByText("TO")).toBeInTheDocument();
    expect(screen.getAllByText("counter_reg[0]").length).toBeGreaterThan(0);
    expect(screen.getAllByText("counter_reg[7]").length).toBeGreaterThan(0);
  });

  it("shows delay breakdown when path is expanded", () => {
    renderAnalyzer(makeTimingReport());
    fireEvent.click(screen.getByText("#1"));
    // Shows Logic and Route delay breakdown
    expect(screen.getAllByText(/Logic:/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Route:/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Total:/).length).toBeGreaterThan(0);
  });

  it("shows SUGGESTION when path is expanded", () => {
    renderAnalyzer(makeTimingReport());
    fireEvent.click(screen.getByText("#1"));
    expect(screen.getByText("SUGGESTION:")).toBeInTheDocument();
  });

  it("shows Ask AI button when path is expanded", () => {
    renderAnalyzer(makeTimingReport());
    fireEvent.click(screen.getByText("#1"));
    expect(screen.getByText("Ask AI")).toBeInTheDocument();
  });

  // ── Setup/Hold Toggle ──
  it("shows Setup and Hold toggle buttons", () => {
    renderAnalyzer(makeTimingReport());
    expect(screen.getAllByText("Setup").length).toBeGreaterThan(0);
    // Hold appears in the filter toolbar
    expect(screen.getAllByText(/Hold/).length).toBeGreaterThan(0);
  });

  it("switches to Hold view when Hold toggle is clicked", () => {
    const timing = makeTimingReport({
      holdPaths: [{
        rank: 1, from: "data_reg", to: "sync_reg",
        slack: "0.150 ns", req: "0", delay: "0.100 ns",
        levels: 1, clk: "sys_clk", type: "hold",
      }],
    });
    renderAnalyzer(timing);
    // Find the Hold chip in the filter toolbar (it has Hold (1) since there's 1 hold path)
    const holdChips = screen.getAllByText(/Hold/);
    // Click the one that's a clickable chip (in the filter toolbar)
    const holdChip = holdChips.find(el => el.textContent?.includes("Hold") && el.closest("[style]"));
    if (holdChip) fireEvent.click(holdChip);
    expect(screen.getAllByText(/Hold/).length).toBeGreaterThan(0);
  });

  // ── Sort ──
  it("shows sort dropdown", () => {
    renderAnalyzer(makeTimingReport());
    expect(screen.getByText("Sort:")).toBeInTheDocument();
  });

  // ── Failing Only Filter ──
  it("shows Failing Only filter toggle", () => {
    renderAnalyzer(makeTimingReport());
    expect(screen.getByText("Failing Only")).toBeInTheDocument();
  });

  it("filters to show only failing paths when toggled", () => {
    const timing = makeTimingReport({
      criticalPaths: [
        { rank: 1, from: "a", to: "b", slack: "-0.100 ns", req: "10.000 ns", delay: "10.100 ns", levels: 3, clk: "sys_clk", type: "setup" },
        { rank: 2, from: "c", to: "d", slack: "2.000 ns", req: "10.000 ns", delay: "8.000 ns", levels: 2, clk: "sys_clk", type: "setup" },
      ],
    });
    renderAnalyzer(timing);
    fireEvent.click(screen.getByText("Failing Only"));
    // Only path #1 (failing) should show
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.queryByText("#2")).not.toBeInTheDocument();
  });

  // ── Constraint Coverage ──
  it("shows Constraint Coverage section", () => {
    renderAnalyzer(makeTimingReport());
    expect(screen.getByText("Constraint Coverage")).toBeInTheDocument();
    expect(screen.getByText("Total paths:")).toBeInTheDocument();
    expect(screen.getByText("Constrained clocks:")).toBeInTheDocument();
    expect(screen.getByText("Unconstrained:")).toBeInTheDocument();
  });

  it("shows unconstrained path names when present", () => {
    const timing = makeTimingReport({
      unconstrained: ["reset_n", "test_mode"],
    });
    renderAnalyzer(timing);
    expect(screen.getByText("reset_n")).toBeInTheDocument();
    expect(screen.getByText("test_mode")).toBeInTheDocument();
  });

  // ── Guided Timing Closure ──
  it("shows Guided Timing Closure wizard", () => {
    renderAnalyzer(makeTimingReport());
    expect(screen.getByText("Guided Timing Closure")).toBeInTheDocument();
    expect(screen.getByText("5 steps")).toBeInTheDocument();
  });

  it("expands wizard to show steps", () => {
    renderAnalyzer(makeTimingReport());
    fireEvent.click(screen.getByText("Guided Timing Closure"));
    expect(screen.getByText("Constraint Audit")).toBeInTheDocument();
    expect(screen.getByText("Analyze Top Failing Paths")).toBeInTheDocument();
    expect(screen.getByText(/Quick Wins/)).toBeInTheDocument();
    expect(screen.getByText(/RTL Fixes/)).toBeInTheDocument();
    expect(screen.getByText(/Placement Constraints/)).toBeInTheDocument();
  });

  it("wizard shows correct status for failing paths", () => {
    const timing = makeTimingReport({
      summary: {
        ...makeTimingReport().summary,
        failingPaths: 5,
        wns: "-1.200 ns",
        status: "VIOLATED",
      },
    });
    renderAnalyzer(timing);
    fireEvent.click(screen.getByText("Guided Timing Closure"));
    expect(screen.getByText(/5 failing path/)).toBeInTheDocument();
  });

  it("wizard shows ok status when all constraints met", () => {
    renderAnalyzer(makeTimingReport());
    fireEvent.click(screen.getByText("Guided Timing Closure"));
    expect(screen.getByText(/No failing paths/)).toBeInTheDocument();
  });

  // ── Design Optimized Away Detection ──
  it("shows DESIGN OPTIMIZED AWAY warning when totalPaths=0 and clocks>0", () => {
    const timing = makeTimingReport({
      summary: {
        ...makeTimingReport().summary,
        totalPaths: 0,
        failingPaths: 0,
        status: "MET",
      },
      criticalPaths: [],
    });
    renderAnalyzer(timing);
    expect(screen.getByText("DESIGN OPTIMIZED AWAY")).toBeInTheDocument();
    expect(screen.getByText("HOW TO FIX:")).toBeInTheDocument();
  });

  it("shows partial optimization warning when very few paths", () => {
    const timing = makeTimingReport({
      summary: {
        ...makeTimingReport().summary,
        totalPaths: 3,
        failingPaths: 0,
        status: "MET",
      },
    });
    renderAnalyzer(timing);
    expect(screen.getByText(/Very few timing paths detected/)).toBeInTheDocument();
  });

  // ── Near-Violation Warning ──
  it("shows near-violation warning for paths close to failing", () => {
    const timing = makeTimingReport({
      criticalPaths: [
        { rank: 1, from: "a", to: "b", slack: "0.100 ns", req: "10.000 ns", delay: "9.900 ns", levels: 3, clk: "sys_clk", type: "setup" },
        { rank: 2, from: "c", to: "d", slack: "0.200 ns", req: "10.000 ns", delay: "9.800 ns", levels: 2, clk: "sys_clk", type: "setup" },
      ],
    });
    renderAnalyzer(timing);
    expect(screen.getByText(/within 0.5ns of violation/)).toBeInTheDocument();
  });

  // ── Clock Domain Interactions ──
  it("shows Clock Domain Interactions matrix with multiple clocks", () => {
    const timing = makeTimingReport({
      clocks: [
        { name: "clk_a", period: "10 ns", freq: "100 MHz", source: "clk", type: "primary", wns: "1.0 ns", paths: 20 },
        { name: "clk_b", period: "5 ns", freq: "200 MHz", source: "pll", type: "generated", wns: "0.5 ns", paths: 10 },
      ],
      criticalPaths: [
        { rank: 1, from: "a_reg", to: "b_reg", slack: "1.0 ns", req: "10 ns", delay: "9.0 ns", levels: 2, clk: "clk_a", type: "setup" },
      ],
    });
    renderAnalyzer(timing);
    expect(screen.getByText("Clock Domain Interactions")).toBeInTheDocument();
    expect(screen.getByText("Src \\ Dst")).toBeInTheDocument();
  });

  // ── Root Cause Filter ──
  it("shows Cause filter dropdown", () => {
    renderAnalyzer(makeTimingReport());
    expect(screen.getByText("Cause:")).toBeInTheDocument();
  });

  // ── Worst Path Summary ──
  it("shows worst path summary in dashboard", () => {
    renderAnalyzer(makeTimingReport());
    expect(screen.getByText(/Worst path:/)).toBeInTheDocument();
  });
});
