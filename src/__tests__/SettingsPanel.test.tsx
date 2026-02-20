import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import SettingsPanel from "../components/SettingsPanel";
import { vi } from "vitest";

vi.mock("../hooks/useTauri", () => ({
  getAppConfig: vi.fn(() => Promise.resolve({
    tool_paths: { diamond: null, radiant: "/mnt/c/lscc/radiant/2025.2", quartus: null, vivado: null, yosys: null, nextpnr: null },
    license_servers: [],
    default_backend: "radiant",
    theme: "dark",
    scale_factor: 1.2,
    license_file: null,
    ai_api_key: null,
    ai_model: null,
  })),
  saveAppConfig: vi.fn(() => Promise.resolve()),
  pickDirectory: vi.fn(() => Promise.resolve(null)),
  pickFile: vi.fn(() => Promise.resolve(null)),
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
      expect(screen.getByText("Lattice Radiant")).toBeInTheDocument();
      expect(screen.getByText("Intel Quartus")).toBeInTheDocument();
      expect(screen.getByText("AMD Vivado")).toBeInTheDocument();
    });
  });

  it("renders close button that calls onClose", async () => {
    renderWithTheme(<SettingsPanel onClose={onClose} />);
    // Settings panel has a close mechanism (×)
    const closeBtn = screen.getByText("\u2715");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows Settings title", () => {
    renderWithTheme(<SettingsPanel onClose={onClose} />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });
});
