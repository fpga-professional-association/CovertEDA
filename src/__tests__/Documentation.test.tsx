import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import Documentation from "../components/Documentation";

describe("Documentation", () => {
  it("renders sidebar with all section titles", () => {
    renderWithTheme(<Documentation />);
    // Section titles appear in sidebar and possibly in content header, so use getAllByText
    expect(screen.getAllByText("Getting Started").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Build Pipeline").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Reports").length).toBeGreaterThan(0);
    expect(screen.getAllByText("About").length).toBeGreaterThan(0);
  });

  it("shows Getting Started content by default", () => {
    renderWithTheme(<Documentation />);
    // Getting Started section shows "Opening a Project" as first sub-heading
    expect(screen.getByText("Opening a Project")).toBeInTheDocument();
  });

  it("switches content when clicking a sidebar section", () => {
    renderWithTheme(<Documentation />);
    fireEvent.click(screen.getAllByText("About")[0]);
    expect(screen.getAllByText(/FPGA Professional Association/i).length).toBeGreaterThan(0);
  });

  it("shows all 16 sidebar sections", () => {
    renderWithTheme(<Documentation />);
    const sections = [
      "Getting Started", "Build Pipeline", "Reports", "Constraint Editor",
      "IP Catalog", "Build History", "File Tree", "AI Assistant",
      "Git Integration", "License Management", "Command Palette",
      "Keyboard Shortcuts", "Backend Support", "Settings",
      "Project Configuration", "About",
    ];
    for (const s of sections) {
      expect(screen.getAllByText(s).length).toBeGreaterThan(0);
    }
  });
});
