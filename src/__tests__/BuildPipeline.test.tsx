import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import BuildPipeline from "../components/BuildPipeline";
import type { RuntimeBackend, LogEntry } from "../types";

const mockBackend: RuntimeBackend = {
  id: "radiant",
  name: "Lattice Radiant",
  short: "RAD",
  color: "#3b9eff",
  icon: "\u25C6",
  version: "2025.2",
  cli: "radiantc",
  defaultDev: "LIFCL-40",
  constrExt: ".pdc",
  available: true,
  pipeline: [
    { id: "synth", label: "Synthesis", cmd: "synth", detail: "RTL synthesis" },
    { id: "map", label: "Map", cmd: "map", detail: "Technology mapping" },
    { id: "par", label: "Place & Route", cmd: "par", detail: "Place and route" },
    { id: "bitgen", label: "Bitstream", cmd: "bitgen", detail: "Generate bitstream" },
  ],
};

function renderPipeline(overrides: Partial<Parameters<typeof BuildPipeline>[0]> = {}) {
  const defaults = {
    backend: mockBackend,
    building: false,
    buildStep: -1,
    logs: [] as LogEntry[],
    activeStage: null as number | null,
    onStageClick: vi.fn(),
    selectedStages: [] as string[],
    onStagesChange: vi.fn(),
    buildOptions: {} as Record<string, string>,
    onOptionsChange: vi.fn(),
  };
  return renderWithTheme(<BuildPipeline {...defaults} {...overrides} />);
}

describe("BuildPipeline", () => {
  it("renders all pipeline stage labels", () => {
    renderPipeline();
    expect(screen.getByText("Synthesis")).toBeInTheDocument();
    expect(screen.getByText("Map")).toBeInTheDocument();
    expect(screen.getByText("Place & Route")).toBeInTheDocument();
    expect(screen.getByText("Bitstream")).toBeInTheDocument();
  });

  it("renders a checkbox for each pipeline stage", () => {
    renderPipeline();
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBe(mockBackend.pipeline.length);
    // All checked by default when selectedStages is empty (= all selected)
    checkboxes.forEach((cb) => expect(cb).toBeChecked());
  });

  it("shows the backend short name badge", () => {
    renderPipeline();
    expect(screen.getByText("RAD")).toBeInTheDocument();
  });

  it("shows the Advanced expander when a stage is expanded", () => {
    renderPipeline();
    // Click the expand arrow on the first stage (Synthesis has options)
    const expandArrows = screen.getAllByTitle("Configure stage options");
    expect(expandArrows.length).toBeGreaterThan(0);
    fireEvent.click(expandArrows[0]);
    // The Advanced toggle should now appear
    expect(screen.getByText("Advanced")).toBeInTheDocument();
  });

  it("shows Build Pipeline header", () => {
    renderPipeline();
    expect(screen.getByText(/Build Pipeline/)).toBeInTheDocument();
  });

  it("shows build complete message when all stages are done", () => {
    renderPipeline({ building: false, buildStep: 4 });
    expect(screen.getByText(/BUILD SUCCESSFUL/)).toBeInTheDocument();
  });
});
