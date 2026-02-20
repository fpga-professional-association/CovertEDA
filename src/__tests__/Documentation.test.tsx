import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import Documentation from "../components/Documentation";

describe("Documentation", () => {
  it("renders sidebar with all section titles", () => {
    renderWithTheme(<Documentation />);
    expect(screen.getByText("Getting Started")).toBeInTheDocument();
    expect(screen.getByText("Build Pipeline")).toBeInTheDocument();
    expect(screen.getByText("Reports")).toBeInTheDocument();
    expect(screen.getByText("About")).toBeInTheDocument();
  });

  it("shows Getting Started content by default", () => {
    renderWithTheme(<Documentation />);
    expect(screen.getByText(/Welcome to CovertEDA/i)).toBeInTheDocument();
  });

  it("switches content when clicking a sidebar section", () => {
    renderWithTheme(<Documentation />);
    fireEvent.click(screen.getByText("About"));
    expect(screen.getByText(/FPGA Professional Association/i)).toBeInTheDocument();
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
      expect(screen.getByText(s)).toBeInTheDocument();
    }
  });
});
