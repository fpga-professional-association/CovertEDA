import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import IpCatalogSection from "../components/IpCatalogSection";
import type { IpCore } from "../data/ipCatalog";

vi.mock("../hooks/useTauri", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  executeIpGenerate: vi.fn(() => Promise.resolve()),
  pickDirectory: vi.fn(() => Promise.resolve("/custom/ip/path")),
}));

function renderCatalog(overrides: Partial<{
  backendId: string;
  projectDir: string;
  device: string;
  onRefreshFiles: () => void;
  onAddToSynth: (name: string) => void;
  customIps: IpCore[];
  onCustomIpsChange: (ips: IpCore[]) => void;
}> = {}) {
  const defaults = {
    backendId: "radiant",
    projectDir: "/test/project",
    device: "LIFCL-40-7BG400I",
    onRefreshFiles: vi.fn(),
    onAddToSynth: vi.fn(),
    customIps: [] as IpCore[],
    onCustomIpsChange: vi.fn(),
  };
  const props = { ...defaults, ...overrides };
  return { ...renderWithTheme(<IpCatalogSection {...props} />), props };
}

describe("IpCatalogSection", () => {
  // ── Basic Rendering ──
  it("renders IP Catalog title", () => {
    renderCatalog();
    expect(screen.getByText("IP Catalog")).toBeInTheDocument();
  });

  it("shows core count", () => {
    renderCatalog();
    // Shows "N cores" text
    expect(screen.getByText(/cores/)).toBeInTheDocument();
  });

  it("shows search input", () => {
    renderCatalog();
    expect(screen.getByPlaceholderText("Search IP cores...")).toBeInTheDocument();
  });

  // ── Backend-Specific Catalogs ──
  it("shows Radiant IPs for radiant backend", () => {
    renderCatalog({ backendId: "radiant" });
    // Radiant catalogs should have IPs and show source
    expect(screen.getAllByText(/Built-in: Radiant IP Library/).length).toBeGreaterThan(0);
  });

  it("shows Quartus IPs for quartus backend", () => {
    renderCatalog({ backendId: "quartus" });
    // Quartus has ALTPLL
    expect(screen.getByText("ALTPLL")).toBeInTheDocument();
  });

  it("shows Vivado IPs for vivado backend", () => {
    renderCatalog({ backendId: "vivado" });
    // Vivado catalog includes Clocking Wizard
    expect(screen.getByText("Clocking Wizard")).toBeInTheDocument();
  });

  it("shows Diamond IPs for diamond backend", () => {
    renderCatalog({ backendId: "diamond" });
    // Diamond catalog includes "EBR (Embedded Block RAM)"
    expect(screen.getByText(/EBR \(Embedded Block RAM\)/)).toBeInTheDocument();
  });

  it("shows ACE IPs for ace backend", () => {
    renderCatalog({ backendId: "ace" });
    // ACE catalog includes BRAM72K
    expect(screen.getByText("BRAM72K")).toBeInTheDocument();
  });

  it("shows Libero IPs for libero backend", () => {
    renderCatalog({ backendId: "libero" });
    // Libero catalog includes LSRAM
    expect(screen.getByText("LSRAM")).toBeInTheDocument();
  });

  it("shows OSS IPs for opensource backend", () => {
    renderCatalog({ backendId: "opensource", device: "ecp5-25k" });
    expect(screen.getByText(/cores/)).toBeInTheDocument();
  });

  it("shows iCE40 IPs for ice40 device with oss backend", () => {
    renderCatalog({ backendId: "oss", device: "ice40-hx8k" });
    expect(screen.getByText(/cores/)).toBeInTheDocument();
  });

  // ── Source Location Display ──
  it("displays source location on IP cards", () => {
    renderCatalog({ backendId: "radiant" });
    const sources = screen.getAllByText(/Built-in: Radiant IP Library/);
    expect(sources.length).toBeGreaterThan(0);
  });

  it("shows correct source for Vivado IPs", () => {
    renderCatalog({ backendId: "vivado" });
    const sources = screen.getAllByText(/Built-in: Vivado IP Catalog/);
    expect(sources.length).toBeGreaterThan(0);
  });

  it("shows correct source for Diamond IPs", () => {
    renderCatalog({ backendId: "diamond" });
    const sources = screen.getAllByText(/Built-in: Diamond IP Library/);
    expect(sources.length).toBeGreaterThan(0);
  });

  it("shows correct source for ACE IPs", () => {
    renderCatalog({ backendId: "ace" });
    const sources = screen.getAllByText(/Built-in: ACE IP Library/);
    expect(sources.length).toBeGreaterThan(0);
  });

  it("shows correct source for Libero IPs", () => {
    renderCatalog({ backendId: "libero" });
    const sources = screen.getAllByText(/Built-in: Libero SoC IP Library/);
    expect(sources.length).toBeGreaterThan(0);
  });

  // ── Search ──
  it("filters IPs by search query", () => {
    renderCatalog({ backendId: "vivado" });
    const search = screen.getByPlaceholderText("Search IP cores...");
    fireEvent.change(search, { target: { value: "Clocking Wizard" } });
    expect(screen.getByText("Clocking Wizard")).toBeInTheDocument();
    // Other IPs like Block Memory Generator should be filtered out
    expect(screen.queryByText("Block Memory Generator")).not.toBeInTheDocument();
  });

  it("searches by category name", () => {
    renderCatalog({ backendId: "vivado" });
    const search = screen.getByPlaceholderText("Search IP cores...");
    fireEvent.change(search, { target: { value: "memory" } });
    expect(screen.getByText(/cores/)).toBeInTheDocument();
  });

  it("searches by description text", () => {
    renderCatalog({ backendId: "vivado" });
    const search = screen.getByPlaceholderText("Search IP cores...");
    fireEvent.change(search, { target: { value: "FIFO" } });
    expect(screen.getByText("FIFO Generator")).toBeInTheDocument();
  });

  // ── Category Grouping ──
  it("groups IPs by category with uppercase headers", () => {
    renderCatalog({ backendId: "vivado" });
    // IP_CATEGORIES = ["Memory", "DSP", "Interface", "Clock", "I/O", "Misc"]
    // Displayed as .toUpperCase()
    expect(screen.getByText("MEMORY")).toBeInTheDocument();
    expect(screen.getByText("CLOCK")).toBeInTheDocument();
  });

  // ── Configure Button ──
  it("shows Configure button on IPs with params", () => {
    renderCatalog({ backendId: "radiant" });
    const configBtns = screen.getAllByText("Configure");
    expect(configBtns.length).toBeGreaterThan(0);
  });

  it("opens configurator when Configure is clicked", () => {
    renderCatalog({ backendId: "radiant" });
    const configBtns = screen.getAllByText("Configure");
    fireEvent.click(configBtns[0]);
    // Configurator shows instance name field
    expect(screen.getByText("INSTANCE NAME")).toBeInTheDocument();
  });

  it("shows back button in configurator that returns to catalog", () => {
    renderCatalog({ backendId: "radiant" });
    const configBtns = screen.getAllByText("Configure");
    fireEvent.click(configBtns[0]);
    // Click back button
    fireEvent.click(screen.getByTitle("Back to IP catalog list"));
    // Should be back in the catalog view
    expect(screen.getByPlaceholderText("Search IP cores...")).toBeInTheDocument();
  });

  // ── Custom IP ──
  it("shows Add Custom IP button when onCustomIpsChange is provided", () => {
    renderCatalog();
    expect(screen.getByText("+ Add Custom IP")).toBeInTheDocument();
  });

  it("does not show Add Custom IP when onCustomIpsChange is undefined", () => {
    renderCatalog({ onCustomIpsChange: undefined });
    expect(screen.queryByText("+ Add Custom IP")).not.toBeInTheDocument();
  });

  it("opens add custom IP form when button is clicked", () => {
    renderCatalog();
    fireEvent.click(screen.getByText("+ Add Custom IP"));
    expect(screen.getByText("ADD CUSTOM IP")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("IP name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("IP source path")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Description (optional)")).toBeInTheDocument();
  });

  it("calls onCustomIpsChange when custom IP is added", () => {
    const onCustomIpsChange = vi.fn();
    renderCatalog({ onCustomIpsChange });
    fireEvent.click(screen.getByText("+ Add Custom IP"));
    fireEvent.change(screen.getByPlaceholderText("IP name"), { target: { value: "MyIP" } });
    fireEvent.change(screen.getByPlaceholderText("IP source path"), { target: { value: "/path/to/ip" } });
    fireEvent.change(screen.getByPlaceholderText("Description (optional)"), { target: { value: "My custom IP" } });
    fireEvent.click(screen.getByTitle("Add this custom IP to the catalog"));
    expect(onCustomIpsChange).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "MyIP",
        source: "/path/to/ip",
        description: "My custom IP",
        isCustom: true,
      }),
    ]);
  });

  it("disables Add IP button when name or path is empty", () => {
    renderCatalog();
    fireEvent.click(screen.getByText("+ Add Custom IP"));
    const addBtn = screen.getByTitle("Add this custom IP to the catalog").closest("button")!;
    expect(addBtn).toBeDisabled();
  });

  it("closes form when Cancel is clicked", () => {
    renderCatalog();
    fireEvent.click(screen.getByText("+ Add Custom IP"));
    expect(screen.getByText("ADD CUSTOM IP")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByText("ADD CUSTOM IP")).not.toBeInTheDocument();
  });

  it("displays custom IPs in the catalog", () => {
    const customIps: IpCore[] = [{
      name: "MyCustomCore",
      category: "Memory",
      description: "A custom memory core",
      families: [],
      source: "/home/user/ips/my_core",
      isCustom: true,
    }];
    renderCatalog({ customIps });
    expect(screen.getByText("MyCustomCore")).toBeInTheDocument();
    expect(screen.getByText("A custom memory core")).toBeInTheDocument();
  });

  it("shows Remove button on custom IPs", () => {
    const customIps: IpCore[] = [{
      name: "MyCustomCore",
      category: "Misc",
      description: "Custom",
      families: [],
      source: "/path",
      isCustom: true,
    }];
    renderCatalog({ customIps });
    expect(screen.getByTitle("Remove custom IP")).toBeInTheDocument();
  });

  it("calls onCustomIpsChange with filtered list when Remove is clicked", () => {
    const onCustomIpsChange = vi.fn();
    const customIps: IpCore[] = [{
      name: "ToRemove",
      category: "Misc",
      description: "Remove me",
      families: [],
      source: "/path",
      isCustom: true,
    }];
    renderCatalog({ customIps, onCustomIpsChange });
    fireEvent.click(screen.getByTitle("Remove custom IP"));
    expect(onCustomIpsChange).toHaveBeenCalledWith([]);
  });

  // ── IP Configurator Details ──
  it("shows instance name input in configurator", () => {
    renderCatalog({ backendId: "radiant" });
    const configBtns = screen.getAllByText("Configure");
    fireEvent.click(configBtns[0]);
    expect(screen.getByText("INSTANCE NAME")).toBeInTheDocument();
  });

  it("shows Preview TCL button in configurator", () => {
    renderCatalog({ backendId: "radiant" });
    const configBtns = screen.getAllByText("Configure");
    fireEvent.click(configBtns[0]);
    expect(screen.getByText("Preview TCL")).toBeInTheDocument();
  });

  it("toggles TCL preview on button click", () => {
    renderCatalog({ backendId: "radiant" });
    const configBtns = screen.getAllByText("Configure");
    fireEvent.click(configBtns[0]);
    fireEvent.click(screen.getByText("Preview TCL"));
    // Should now show "Hide TCL" and "Generate IP"
    expect(screen.getByText("Hide TCL")).toBeInTheDocument();
    expect(screen.getByTitle("Generate IP core with current configuration")).toBeInTheDocument();
  });

  // ── Multi-Backend Catalog Counts ──
  it("different backends have different core counts", () => {
    const { unmount: u1 } = renderCatalog({ backendId: "radiant" });
    const radiantText = screen.getByText(/\d+ cores/).textContent;
    u1();
    const { unmount: u2 } = renderCatalog({ backendId: "vivado" });
    const vivadoText = screen.getByText(/\d+ cores/).textContent;
    u2();
    // Different backends should have different catalog sizes
    expect(radiantText).not.toBe(vivadoText);
  });
});
