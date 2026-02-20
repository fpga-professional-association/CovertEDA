import { screen, fireEvent, waitFor } from "@testing-library/react";
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
  createProject: vi.fn(),
  checkProjectDir: vi.fn(() => Promise.resolve(null)),
  pickDirectory: vi.fn(() => Promise.resolve(null)),
  removeRecentProject: vi.fn(() => Promise.resolve()),
  detectTools: vi.fn(() => Promise.resolve([
    { backendId: "radiant", name: "Lattice Radiant", version: "2025.2", installPath: "/mnt/c/lscc", available: true },
    { backendId: "quartus", name: "Intel Quartus", version: "23.1", installPath: null, available: false },
  ])),
  checkLicenses: vi.fn(() => Promise.resolve({ licenseFiles: [], features: [] })),
}));

vi.mock("../components/NewProjectWizard", () => ({
  default: () => <div data-testid="wizard">Wizard</div>,
}));

vi.mock("../data/projectTemplates", () => ({
  PROJECT_TEMPLATES: [],
  TEMPLATE_CATEGORIES: ["All", "Basic"],
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

  it("renders new project button", () => {
    renderWithTheme(<StartScreen onOpenProject={onOpenProject} />);
    expect(screen.getByText(/New Project/i)).toBeInTheDocument();
  });

  it("renders open project button", () => {
    renderWithTheme(<StartScreen onOpenProject={onOpenProject} />);
    expect(screen.getByText(/Open Project/i)).toBeInTheDocument();
  });

  it("shows CovertEDA branding", () => {
    renderWithTheme(<StartScreen onOpenProject={onOpenProject} />);
    expect(screen.getByText(/CovertEDA/i)).toBeInTheDocument();
  });

  it("shows template filter tabs", () => {
    renderWithTheme(<StartScreen onOpenProject={onOpenProject} />);
    expect(screen.getByText("All")).toBeInTheDocument();
  });
});
