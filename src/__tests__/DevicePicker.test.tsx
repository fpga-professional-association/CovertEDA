import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import DevicePicker from "../components/DevicePicker";

// Mock deviceParts with a small subset for each backend
vi.mock("../data/deviceParts", () => ({
  DEVICE_MAP: {
    radiant: [
      {
        family: "CertusNX",
        parts: ["LFCPNX-100-9ASG256C"],
      },
      {
        family: "CertusPro-NX",
        parts: ["LIFCL-40-7BG400I", "LIFCL-17-7MG121I"],
      },
    ],
    quartus_std: [
      {
        family: "Cyclone V",
        parts: ["5CEBA4F23C7", "5CEBA5F23C7"],
      },
    ],
    // oss has no entries → triggers plain input fallback
  } as Record<string, { family: string; parts: string[]; editions?: string[] }[]>,
  validatePart: (backendId: string, part: string) => ({ valid: part.length > 0, reason: "" }),
  parsePartInfo: () => ({ pins: "400", logic: "40K LUTs", speed: "-7", package: "BG400", grade: "Industrial" }),
}));

describe("DevicePicker", () => {
  it("renders a text input fallback for backends without device database", () => {
    renderWithTheme(
      <DevicePicker backendId="oss" value="ice40-hx1k-tq144" onChange={vi.fn()} />
    );
    const input = screen.getByPlaceholderText("Device part number");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("ice40-hx1k-tq144");
  });

  it("renders a trigger button showing the current device value", () => {
    renderWithTheme(
      <DevicePicker backendId="radiant" value="LIFCL-40-7BG400I" onChange={vi.fn()} />
    );
    // The trigger shows the current value
    expect(screen.getByText("LIFCL-40-7BG400I")).toBeInTheDocument();
  });

  it("opens modal with device families on click", () => {
    renderWithTheme(
      <DevicePicker backendId="radiant" value="" onChange={vi.fn()} />
    );
    // Click the trigger to open the modal
    const trigger = screen.getByText("Select device...");
    fireEvent.click(trigger);
    // Family headers should appear (uppercased in the component)
    expect(screen.getByText("CERTUSNX")).toBeInTheDocument();
    expect(screen.getByText("CERTUSPRO-NX")).toBeInTheDocument();
    // Modal title
    expect(screen.getByText("Select Target Device")).toBeInTheDocument();
  });

  it("families start collapsed and expand on click", () => {
    renderWithTheme(
      <DevicePicker backendId="radiant" value="" onChange={vi.fn()} />
    );
    fireEvent.click(screen.getByText("Select device..."));
    // Parts should not be visible initially (families collapsed)
    expect(screen.queryByText("LFCPNX-100-9ASG256C")).not.toBeInTheDocument();
    // Click family header to expand
    fireEvent.click(screen.getByText("CERTUSNX"));
    expect(screen.getByText("LFCPNX-100-9ASG256C")).toBeInTheDocument();
  });

  it("selecting a part and clicking OK calls onChange", () => {
    const onChange = vi.fn();
    renderWithTheme(
      <DevicePicker backendId="radiant" value="" onChange={onChange} />
    );
    fireEvent.click(screen.getByText("Select device..."));
    // Expand family
    fireEvent.click(screen.getByText("CERTUSPRO-NX"));
    // Click the part name to select it
    fireEvent.click(screen.getByText("LIFCL-40-7BG400I"));
    // Should NOT have called onChange yet (no auto-close)
    expect(onChange).not.toHaveBeenCalled();
    // Click OK to confirm
    fireEvent.click(screen.getByText("OK"));
    expect(onChange).toHaveBeenCalledWith("LIFCL-40-7BG400I");
  });
});
