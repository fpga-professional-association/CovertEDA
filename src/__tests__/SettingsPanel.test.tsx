import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import SettingsPanel from "../components/SettingsPanel";
import { vi } from "vitest";

vi.mock("../hooks/useTauri", () => ({
  getAppConfig: vi.fn(() => Promise.resolve({
    tool_paths: { diamond: null, radiant: "/mnt/c/lscc/radiant/2025.2", quartus: null, vivado: null, yosys: null, nextpnr: null, oss_cad_suite: null },
    license_servers: [],
    default_backend: "radiant",
    theme: "dark",
    scale_factor: 1.2,
    license_file: null,
    license_files: {},
    ai_api_key: null,
    ai_model: null,
    ai_provider: null,
    ai_base_url: null,
    selected_versions: {},
  })),
  saveAppConfig: vi.fn(() => Promise.resolve()),
  pickDirectory: vi.fn(() => Promise.resolve(null)),
  pickFile: vi.fn(() => Promise.resolve(null)),
  getAiApiKey: vi.fn(() => Promise.resolve(null)),
  setAiApiKey: vi.fn(() => Promise.resolve()),
  getAiApiKeyForProvider: vi.fn(() => Promise.resolve(null)),
  setAiApiKeyForProvider: vi.fn(() => Promise.resolve()),
  listAiProvidersWithKeys: vi.fn(() => Promise.resolve([])),
}));

describe("SettingsPanel", () => {
  const onClose = vi.fn();

  it("renders theme options", async () => {
    renderWithTheme(<SettingsPanel onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByText("Dark")).toBeInTheDocument();
      expect(screen.getByText("Light")).toBeInTheDocument();
      expect(screen.getByText("Colorblind")).toBeInTheDocument();
    });
  });

  it("renders zoom preset buttons", async () => {
    renderWithTheme(<SettingsPanel onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByText("100%")).toBeInTheDocument();
      expect(screen.getByText("150%")).toBeInTheDocument();
    });
  });

  it("renders tool path labels", async () => {
    renderWithTheme(<SettingsPanel onClose={onClose} />);
    await waitFor(() => {
      // Labels appear in both Tool Paths and License Files sections
      expect(screen.getAllByText("LATTICE RADIANT").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("INTEL QUARTUS").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("AMD VIVADO").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders close button that calls onClose", async () => {
    renderWithTheme(<SettingsPanel onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByText("Close")).toBeInTheDocument();
    });
    const closeBtn = screen.getByText("Close");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows Settings title", () => {
    renderWithTheme(<SettingsPanel onClose={onClose} />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });
});
