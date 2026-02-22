import { screen, waitFor } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import StartScreen from "../components/StartScreen";
import { vi } from "vitest";

vi.mock("../hooks/useTauri", () => ({
  getRecentProjects: vi.fn(() => Promise.resolve([
    { path: "/projects/counter", name: "Counter", backendId: "radiant", device: "LIFCL-40", lastOpened: "2025-01-15T10:00:00Z" },
    { path: "/projects/uart", name: "UART", backendId: "quartus", device: "10CX220", lastOpened: "2025-01-14T10:00:00Z" },
  ])),
  openProject: vi.fn(() => Promise.resolve({
    name: "Counter", backendId: "radiant", device: "LIFCL-40", topModule: "top",
    sourcePatterns: [], constraintFiles: [], implDir: "impl1", backendConfig: {},
    createdAt: "2025-01-01", updatedAt: "2025-01-15",
  })),
  checkProjectDir: vi.fn(() => Promise.resolve(null)),
  pickDirectory: vi.fn(() => Promise.resolve(null)),
  removeRecentProject: vi.fn(() => Promise.resolve()),
  detectTools: vi.fn(() => Promise.resolve([
    { backendId: "radiant", name: "Lattice Radiant", version: "2025.2", installPath: "/mnt/c/lscc", available: true },
    { backendId: "quartus", name: "Intel Quartus", version: "23.1", installPath: null, available: false },
  ])),
  checkLicenses: vi.fn(() => Promise.resolve({ licenseFiles: [], features: [] })),
  refreshTools: vi.fn(() => Promise.resolve([
    { backendId: "radiant", name: "Lattice Radiant", version: "2025.2", installPath: "/mnt/c/lscc", available: true },
    { backendId: "quartus", name: "Intel Quartus", version: "23.1", installPath: null, available: false },
  ])),
}));

vi.mock("../components/NewProjectWizard", () => ({
  default: () => <div data-testid="wizard">Wizard</div>,
}));

describe("StartScreen", () => {
  const onOpenProject = vi.fn();

  it("renders recent projects", async () => {
    renderWithTheme(<StartScreen onOpenProject={onOpenProject} />);
    await waitFor(() => {
      expect(screen.getByText("Counter")).toBeInTheDocument();
      expect(screen.getByText("UART")).toBeInTheDocument();
    });
  });

  it("renders detected tool badges", async () => {
    renderWithTheme(<StartScreen onOpenProject={onOpenProject} />);
    await waitFor(() => {
      expect(screen.getByText(/Lattice Radiant/)).toBeInTheDocument();
    });
  });

  it("renders create new project card", () => {
    renderWithTheme(<StartScreen onOpenProject={onOpenProject} />);
    expect(screen.getByText("Create New Project")).toBeInTheDocument();
  });

  it("renders open existing directory card", () => {
    renderWithTheme(<StartScreen onOpenProject={onOpenProject} />);
    expect(screen.getByText("Open Existing Directory")).toBeInTheDocument();
  });

  it("shows CovertEDA branding", () => {
    renderWithTheme(<StartScreen onOpenProject={onOpenProject} />);
    expect(screen.getAllByText(/CovertEDA/i).length).toBeGreaterThan(0);
  });

  it("does not render templates or examples sections", () => {
    renderWithTheme(<StartScreen onOpenProject={onOpenProject} />);
    expect(screen.queryByText("PROJECT TEMPLATES")).not.toBeInTheDocument();
    expect(screen.queryByText("EXAMPLE PROJECTS")).not.toBeInTheDocument();
  });
});
