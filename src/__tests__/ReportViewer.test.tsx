import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme, makeTimingReport, makeUtilizationReport } from "../test/helpers";
import ReportViewer from "../components/ReportViewer";
import type { ReportTab } from "../types";

vi.mock("../hooks/useTauri", () => ({
  getRawReport: vi.fn(() => Promise.resolve("")),
}));

const nullReports = {
  timing: null,
  utilization: null,
  power: null,
  drc: null,
  io: null,
};

function makeProps(overrides: Partial<{
  rptTab: ReportTab;
  setRptTab: (tab: ReportTab) => void;
  reports: typeof nullReports;
  device: string;
  projectDir: string;
}> = {}) {
  return {
    rptTab: "timing" as ReportTab,
    setRptTab: vi.fn(),
    reports: nullReports,
    device: "LIFCL-40-7BG400I",
    projectDir: "/test/project",
    ...overrides,
  };
}

describe("ReportViewer", () => {
  it("renders tab buttons for all report types", () => {
    const props = makeProps();
    renderWithTheme(<ReportViewer {...props} />);

    // Analysis tabs
    expect(screen.getByText(/Timing/)).toBeInTheDocument();
    expect(screen.getByText(/Utilization/)).toBeInTheDocument();
    expect(screen.getByText(/Power/)).toBeInTheDocument();
    expect(screen.getByText(/DRC/)).toBeInTheDocument();
    expect(screen.getByText(/I\/O/)).toBeInTheDocument();
    // Stage tabs
    expect(screen.getByText("Synth")).toBeInTheDocument();
    expect(screen.getByText("Map")).toBeInTheDocument();
    expect(screen.getByText("P&R")).toBeInTheDocument();
    expect(screen.getByText("Bitstream")).toBeInTheDocument();
  });

  it("shows 'No data' message when timing report is null", () => {
    const props = makeProps({ rptTab: "timing" });
    renderWithTheme(<ReportViewer {...props} />);
    expect(screen.getByText(/No timing data available/)).toBeInTheDocument();
  });

  it("shows timing Fmax when timing report is provided", () => {
    const timing = makeTimingReport();
    const props = makeProps({
      rptTab: "timing",
      reports: { ...nullReports, timing },
    });
    renderWithTheme(<ReportViewer {...props} />);
    expect(screen.getByText("125.50 MHz")).toBeInTheDocument();
  });

  it("shows utilization categories when utilization report is provided", () => {
    const utilization = makeUtilizationReport();
    const props = makeProps({
      rptTab: "util",
      reports: { ...nullReports, utilization },
    });
    renderWithTheme(<ReportViewer {...props} />);
    expect(screen.getByText("LOGIC")).toBeInTheDocument();
    expect(screen.getByText("I/O")).toBeInTheDocument();
    expect(screen.getByText("LUT4")).toBeInTheDocument();
    expect(screen.getByText("Registers")).toBeInTheDocument();
    expect(screen.getByText("PIO")).toBeInTheDocument();
  });

  it("shows critical paths table with rank, from, to, slack", () => {
    const timing = makeTimingReport();
    const props = makeProps({
      rptTab: "timing",
      reports: { ...nullReports, timing },
    });
    renderWithTheme(<ReportViewer {...props} />);

    // The critical path data should be present (inside a collapsible - default is closed)
    // The section header should be visible
    expect(screen.getByText(/Critical Paths/)).toBeInTheDocument();

    // Expand it
    fireEvent.click(screen.getByText(/Critical Paths/));

    // Now the path details should be visible
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("counter_reg[0]")).toBeInTheDocument();
    expect(screen.getByText("counter_reg[7]")).toBeInTheDocument();
    // "2.500 ns" appears in multiple places (clock WNS and critical path slack)
    const slackElements = screen.getAllByText("2.500 ns");
    expect(slackElements.length).toBeGreaterThanOrEqual(1);
  });

  it("calls setRptTab when a tab is clicked", () => {
    const setRptTab = vi.fn();
    const props = makeProps({ setRptTab });
    renderWithTheme(<ReportViewer {...props} />);

    fireEvent.click(screen.getByText(/Utilization/));
    expect(setRptTab).toHaveBeenCalledWith("util");
  });

  it("shows the clock domain section in timing report", () => {
    const timing = makeTimingReport();
    const props = makeProps({
      rptTab: "timing",
      reports: { ...nullReports, timing },
    });
    renderWithTheme(<ReportViewer {...props} />);
    // Clock Domains collapsible header
    expect(screen.getByText(/Clock Domains/)).toBeInTheDocument();
  });
});
