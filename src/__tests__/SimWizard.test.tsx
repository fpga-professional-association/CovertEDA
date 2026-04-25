import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import SimWizard from "../components/SimWizard";

// SimWizard defaults to the Cocotb Tests tab when opened without a project
// dir (matches the new flow that lets users discover tb/ tests). Each of
// these legacy assertions targets the "Generate Script" tab, so the tests
// click into it first.
function renderScriptTab() {
  renderWithTheme(<SimWizard />);
  const scriptTab = screen.getAllByRole("button").find(
    (b) => b.textContent?.trim() === "Generate Script",
  );
  if (scriptTab) fireEvent.click(scriptTab);
}

describe("SimWizard", () => {
  it("renders simulator selection dropdown", () => {
    renderScriptTab();
    expect(screen.getByText("HDL Simulator")).toBeInTheDocument();
  });

  it("displays testbench file input", () => {
    renderScriptTab();
    const inputs = screen.queryAllByDisplayValue("tb_counter.v");
    expect(inputs.length).toBeGreaterThan(0);
  });

  it("shows source file list", () => {
    renderScriptTab();
    expect(screen.getByText(/SOURCE FILES/)).toBeInTheDocument();
  });

  it("renders SDF back-annotation toggle checkbox", () => {
    renderScriptTab();
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeInTheDocument();
  });

  it("displays Generate Script button", () => {
    renderScriptTab();
    const buttons = screen.getAllByRole("button");
    const generateBtn = buttons.find((b) => b.textContent?.includes("Generate Script"));
    expect(generateBtn).toBeInTheDocument();
  });
});
