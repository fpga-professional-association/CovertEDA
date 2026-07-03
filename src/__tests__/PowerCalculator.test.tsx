import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import PowerCalculator from "../components/PowerCalculator";
import type { PowerReportData } from "../types";
import { vi } from "vitest";

const mockReport: PowerReportData = {
  title: "Power Estimation",
  generated: "2025-01-15T10:30:00Z",
  junction: "65.0°C",
  ambient: "25.0°C",
  theta_ja: "12.0°C/W",
  total: "1500.0 mW",
  confidence: "high",
  breakdown: [
    { cat: "Logic", mw: 400, pct: 27, color: "#4a9eff" },
    { cat: "I/O", mw: 200, pct: 13, color: "#00d4aa" },
  ],
  byRail: [
    { rail: "VCCINT", mw: 900 },
    { rail: "VCCIO", mw: 600 },
  ],
};

describe("PowerCalculator", () => {
  it("renders an empty state with no fabricated data when report is null", () => {
    renderWithTheme(<PowerCalculator report={null} />);
    expect(screen.getByText(/No power report available/)).toBeInTheDocument();
    expect(screen.queryByText("POWER SUMMARY")).not.toBeInTheDocument();
  });

  it("renders power summary heading with real report data", () => {
    renderWithTheme(<PowerCalculator report={mockReport} />);
    expect(screen.getByText("POWER SUMMARY")).toBeInTheDocument();
    expect(screen.getByText("1.500 W")).toBeInTheDocument();
  });

  it("displays thermal information with real junction and ambient temperatures", () => {
    renderWithTheme(<PowerCalculator report={mockReport} />);
    expect(screen.getByText(/Junction:/)).toBeInTheDocument();
    expect(screen.getByText("65.0°C")).toBeInTheDocument();
    expect(screen.getByText(/Ambient:/)).toBeInTheDocument();
    expect(screen.getByText("25.0°C")).toBeInTheDocument();
  });

  it("renders power breakdown from real report categories", () => {
    renderWithTheme(<PowerCalculator report={mockReport} />);
    expect(screen.getByText("POWER BREAKDOWN")).toBeInTheDocument();
    expect(screen.getByText("Logic")).toBeInTheDocument();
    expect(screen.getByText("I/O")).toBeInTheDocument();
  });

  it("renders power-by-rail table from real report data", () => {
    renderWithTheme(<PowerCalculator report={mockReport} />);
    expect(screen.getByText("POWER BY RAIL")).toBeInTheDocument();
    expect(screen.getByText("VCCINT")).toBeInTheDocument();
    expect(screen.getByText("VCCIO")).toBeInTheDocument();
  });

  it("invokes onAnalyze when the Analyze button is clicked", () => {
    const onAnalyze = vi.fn();
    renderWithTheme(<PowerCalculator report={mockReport} onAnalyze={onAnalyze} />);
    fireEvent.click(screen.getByText("Analyze"));
    expect(onAnalyze).toHaveBeenCalledTimes(1);
  });

  it("shows Analyze button in the empty state too, so users can trigger a fetch", () => {
    const onAnalyze = vi.fn();
    renderWithTheme(<PowerCalculator report={null} onAnalyze={onAnalyze} />);
    fireEvent.click(screen.getByText("Analyze"));
    expect(onAnalyze).toHaveBeenCalledTimes(1);
  });
});
