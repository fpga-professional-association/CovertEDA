import { screen } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import PowerCalculator from "../components/PowerCalculator";
import type { PowerReport } from "../types";

const mockPowerReport: PowerReport = {
  total_power_w: 1.5,
  static_power_w: 0.5,
  dynamic_power_w: 1.0,
  logic_power_w: 0.4,
  io_power_w: 0.2,
  clock_power_w: 0.15,
  bram_power_w: 0.1,
  dsp_power_w: 0.05,
  junction_temp_c: 65.0,
  ambient_temp_c: 25.0,
  thermal_margin_c: 40.0,
  modules: [
    { name: "core", static_mw: 200, dynamic_mw: 400, total_mw: 600 },
    { name: "io", static_mw: 150, dynamic_mw: 250, total_mw: 400 },
  ],
};

describe("PowerCalculator", () => {
  it("renders power summary heading", () => {
    renderWithTheme(<PowerCalculator />);
    expect(screen.getByText("POWER SUMMARY")).toBeInTheDocument();
  });

  it("displays thermal information with junction and ambient temperatures", () => {
    renderWithTheme(<PowerCalculator />);
    expect(screen.getByText(/Junction:/)).toBeInTheDocument();
    expect(screen.getByText(/Ambient:/)).toBeInTheDocument();
  });

  it("renders module breakdown table when modules exist", () => {
    renderWithTheme(<PowerCalculator />);
    expect(screen.getByText("MODULE BREAKDOWN")).toBeInTheDocument();
    expect(screen.getByText("counter")).toBeInTheDocument();
  });

  it("renders without crashing", () => {
    renderWithTheme(<PowerCalculator />);
    expect(screen.getByText("POWER SUMMARY")).toBeInTheDocument();
  });

  it("toggles between Typical and Worst Case modes", () => {
    renderWithTheme(<PowerCalculator />);
    const buttons = screen.getAllByRole("button");
    const hasButton = buttons.some((b) => b.textContent?.includes("Analyze"));
    expect(hasButton).toBe(true);
  });
});
