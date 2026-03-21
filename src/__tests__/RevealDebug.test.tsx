import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import RevealDebug from "../components/RevealDebug";
import type { RevealConfig } from "../types";

const mockRevealConfig: RevealConfig = {
  project_name: "test_project",
  sample_depth: 1024,
  sample_clock: "clk",
  trigger_signals: [
    { name: "reset", operator: "equals", value: "0" },
  ],
  trace_signals: ["clk", "reset", "data"],
  trigger_mode: "and",
};

describe("RevealDebug", () => {
  it("renders with Inserter and Analyzer tabs", () => {
    renderWithTheme(<RevealDebug />);
    expect(screen.getByText("Inserter")).toBeInTheDocument();
    expect(screen.getByText("Analyzer")).toBeInTheDocument();
  });

  it("shows trigger signal configuration in Inserter tab", () => {
    renderWithTheme(<RevealDebug />);
    expect(screen.getByText("Trigger Configuration")).toBeInTheDocument();
  });

  it("displays sample depth selector", () => {
    renderWithTheme(<RevealDebug />);
    const selects = screen.queryAllByRole("combobox");
    expect(selects.length).toBeGreaterThan(0);
  });

  it("renders waveform view area", () => {
    renderWithTheme(<RevealDebug />);
    const analyzerTab = screen.getByText("Analyzer");
    fireEvent.click(analyzerTab);
    expect(screen.getByText("WAVEFORM VIEW")).toBeInTheDocument();
  });

  it("has a connect button for the analyzer", () => {
    renderWithTheme(<RevealDebug />);
    const analyzerTab = screen.getByText("Analyzer");
    fireEvent.click(analyzerTab);
    expect(screen.getByText("Connect")).toBeInTheDocument();
  });
});
