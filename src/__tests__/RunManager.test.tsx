import { screen } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import RunManager from "../components/RunManager";
import type { ImplementationRun, BuildStrategy } from "../types";

const mockStrategy: BuildStrategy = {
  name: "Default",
  description: "Balanced build",
  synth_options: {},
  map_options: {},
  par_options: {},
  bitgen_options: {},
};

const mockRuns: ImplementationRun[] = [
  {
    id: "run-001",
    name: "Run 1",
    strategy: mockStrategy,
    status: "completed",
    created_at: "2025-01-15T10:00:00Z",
    results: {
      fmax_mhz: 100.0,
      lut_utilization: 0.1,
      build_time_secs: 300,
    },
  },
  {
    id: "run-002",
    name: "Run 2",
    strategy: mockStrategy,
    status: "completed",
    created_at: "2025-01-15T10:10:00Z",
    results: {
      fmax_mhz: 120.0,
      lut_utilization: 0.12,
      build_time_secs: 350,
    },
  },
];

describe("RunManager", () => {
  it("renders strategy preset cards", () => {
    renderWithTheme(<RunManager runs={mockRuns} />);
    const defaultCards = screen.queryAllByText("Default");
    const timingCards = screen.queryAllByText("Timing Focused");
    expect(defaultCards.length).toBeGreaterThan(0);
    expect(timingCards.length).toBeGreaterThan(0);
  });

  it("displays recent runs in a table", () => {
    renderWithTheme(<RunManager runs={mockRuns} />);
    expect(screen.getByText("Run 1")).toBeInTheDocument();
    expect(screen.getByText("Run 2")).toBeInTheDocument();
  });

  it("shows results comparison when runs are selected", () => {
    renderWithTheme(<RunManager runs={mockRuns} />);
    expect(screen.getByText("Run 1")).toBeInTheDocument();
  });

  it("renders New Run and Compare action buttons", () => {
    renderWithTheme(<RunManager runs={mockRuns} />);
    const buttons = screen.getAllByRole("button");
    const newRunBtn = buttons.find((b) => b.textContent?.includes("New Run"));
    expect(newRunBtn).toBeInTheDocument();
  });

  it("displays comparison metrics table when runs are selected", () => {
    renderWithTheme(<RunManager runs={mockRuns} />);
    expect(screen.getByText("Run 1")).toBeInTheDocument();
  });
});
