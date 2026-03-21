import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import SimWizard from "../components/SimWizard";
import type { SimConfig } from "../types";

const mockSimConfig: SimConfig = {
  simulator: "modelsim",
  top_module: "counter",
  testbench: "tb_counter.v",
  sim_time: "1000ns",
  timescale: "1ns/1ps",
  use_sdf: false,
};

describe("SimWizard", () => {
  it("renders simulator selection dropdown", () => {
    renderWithTheme(<SimWizard />);
    expect(screen.getByText("HDL Simulator")).toBeInTheDocument();
  });

  it("displays testbench file input", () => {
    renderWithTheme(<SimWizard />);
    const inputs = screen.queryAllByDisplayValue("tb_counter.v");
    expect(inputs.length).toBeGreaterThan(0);
  });

  it("shows source file list", () => {
    renderWithTheme(<SimWizard />);
    expect(screen.getByText(/SOURCE FILES/)).toBeInTheDocument();
  });

  it("renders SDF back-annotation toggle checkbox", () => {
    renderWithTheme(<SimWizard />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeInTheDocument();
  });

  it("displays Generate Script button", () => {
    renderWithTheme(<SimWizard />);
    const buttons = screen.getAllByRole("button");
    const generateBtn = buttons.find((b) => b.textContent?.includes("Generate Script"));
    expect(generateBtn).toBeInTheDocument();
  });
});
