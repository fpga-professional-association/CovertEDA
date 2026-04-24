import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import EcoEditor from "../components/EcoEditor";
import type { EcoChange } from "../types";

const mockChanges: EcoChange[] = [
  {
    type: "io_setting",
    target: "clk",
    parameter: "drive",
    old_value: "default",
    new_value: "12mA",
  },
];

describe("EcoEditor", () => {
  it("renders tab navigation for I/O, PLL, Memory, SysConfig", () => {
    renderWithTheme(<EcoEditor changes={mockChanges} />);
    expect(screen.getByText("I/O Settings")).toBeInTheDocument();
    expect(screen.getByText("PLL")).toBeInTheDocument();
    expect(screen.getByText("Memory Init")).toBeInTheDocument();
    expect(screen.getByText("SysConfig")).toBeInTheDocument();
  });

  it("displays I/O ports table by default", () => {
    renderWithTheme(<EcoEditor changes={mockChanges} />);
    expect(screen.getByText("Port Name")).toBeInTheDocument();
  });

  it("shows PLL parameters when PLL tab is clicked", () => {
    renderWithTheme(<EcoEditor changes={mockChanges} />);
    fireEvent.click(screen.getByText("PLL"));
    expect(screen.getByText("Instance")).toBeInTheDocument();
  });

  it("displays change list when changes are applied", () => {
    renderWithTheme(<EcoEditor changes={mockChanges} />);
    expect(screen.getByText("DEVICE ATTRIBUTES")).toBeInTheDocument();
  });

  it("renders Apply button", () => {
    renderWithTheme(<EcoEditor changes={mockChanges} />);
    const buttons = screen.getAllByRole("button");
    const applyBtn = buttons.find((b) => b.textContent?.trim() === "Apply");
    expect(applyBtn).toBeInTheDocument();
  });
});
