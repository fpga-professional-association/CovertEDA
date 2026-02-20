import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import BackendSwitcher from "../components/BackendSwitcher";
import type { RuntimeBackend } from "../types";

const backends: RuntimeBackend[] = [
  {
    id: "radiant", name: "Lattice Radiant", short: "RAD", color: "#3b9eff",
    icon: "\u25C6", version: "2025.2", cli: "radiantc", defaultDev: "LIFCL-40",
    constrExt: ".pdc", available: true,
    pipeline: [{ id: "synth", label: "Synthesis", cmd: "synth", detail: "RTL synthesis" }],
  },
  {
    id: "quartus", name: "Intel Quartus Prime", short: "QRT", color: "#0071c5",
    icon: "\u25A0", version: "23.1", cli: "quartus_sh", defaultDev: "10CL025YU256I7G",
    constrExt: ".sdc", available: true,
    pipeline: [{ id: "synth", label: "Synthesis", cmd: "synth", detail: "RTL synthesis" }],
  },
  {
    id: "vivado", name: "AMD Vivado", short: "VIV", color: "#ed1c24",
    icon: "\u25B2", version: "2024.1", cli: "vivado", defaultDev: "xc7a35t",
    constrExt: ".xdc", available: false,
    pipeline: [{ id: "synth", label: "Synthesis", cmd: "synth", detail: "RTL synthesis" }],
  },
];

function renderSwitcher(overrides: Partial<Parameters<typeof BackendSwitcher>[0]> = {}) {
  const defaults = {
    open: true,
    backends,
    activeId: "radiant",
    onSwitch: vi.fn(),
    onClose: vi.fn(),
  };
  return { ...renderWithTheme(<BackendSwitcher {...defaults} {...overrides} />), defaults };
}

describe("BackendSwitcher", () => {
  it("does not render when open is false", () => {
    renderSwitcher({ open: false });
    expect(screen.queryByText("SELECT BACKEND")).not.toBeInTheDocument();
    expect(screen.queryByText("Lattice Radiant")).not.toBeInTheDocument();
  });

  it("renders backend list when open is true", () => {
    renderSwitcher({ open: true });
    expect(screen.getByText("SELECT BACKEND")).toBeInTheDocument();
    expect(screen.getByText("Lattice Radiant")).toBeInTheDocument();
    expect(screen.getByText("Intel Quartus Prime")).toBeInTheDocument();
    expect(screen.getByText("AMD Vivado")).toBeInTheDocument();
  });

  it("shows AVAILABLE for available backends and NOT FOUND for unavailable", () => {
    renderSwitcher();
    const available = screen.getAllByText("AVAILABLE");
    expect(available.length).toBe(2); // radiant and quartus
    expect(screen.getByText("NOT FOUND")).toBeInTheDocument(); // vivado
  });

  it("calls onSwitch with backend id when an available backend is clicked", () => {
    const onSwitch = vi.fn();
    renderSwitcher({ onSwitch, activeId: "radiant" });
    fireEvent.click(screen.getByText("Intel Quartus Prime"));
    expect(onSwitch).toHaveBeenCalledWith("quartus");
  });

  it("does not call onSwitch when an unavailable backend is clicked", () => {
    const onSwitch = vi.fn();
    renderSwitcher({ onSwitch });
    fireEvent.click(screen.getByText("AMD Vivado"));
    expect(onSwitch).not.toHaveBeenCalled();
  });
});
