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

  it("renders a search input for backends with device database", () => {
    renderWithTheme(
      <DevicePicker backendId="radiant" value="LIFCL-40-7BG400I" onChange={vi.fn()} />
    );
    const input = screen.getByPlaceholderText("Search devices...");
    expect(input).toBeInTheDocument();
    // When not focused/open, shows the current value
    expect(input).toHaveValue("LIFCL-40-7BG400I");
  });

  it("opens dropdown and shows device families on focus", () => {
    renderWithTheme(
      <DevicePicker backendId="radiant" value="" onChange={vi.fn()} />
    );
    const input = screen.getByPlaceholderText("Search devices...");
    fireEvent.focus(input);
    // Family headers should appear (uppercased in the component)
    expect(screen.getByText("CERTUSNX")).toBeInTheDocument();
    expect(screen.getByText("CERTUSPRO-NX")).toBeInTheDocument();
  });

  it("filters devices when typing in search", () => {
    renderWithTheme(
      <DevicePicker backendId="radiant" value="" onChange={vi.fn()} />
    );
    const input = screen.getByPlaceholderText("Search devices...");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "LFCPNX" } });
    // Should find CertusNX device
    expect(screen.getByText("LFCPNX-100-9ASG256C")).toBeInTheDocument();
    // CertusPro-NX devices should be filtered out
    expect(screen.queryByText("LIFCL-40-7BG400I")).not.toBeInTheDocument();
  });

  it("calls onChange with selected device part number", () => {
    const onChange = vi.fn();
    renderWithTheme(
      <DevicePicker backendId="radiant" value="" onChange={onChange} />
    );
    const input = screen.getByPlaceholderText("Search devices...");
    fireEvent.focus(input);
    fireEvent.click(screen.getByText("LIFCL-40-7BG400I"));
    expect(onChange).toHaveBeenCalledWith("LIFCL-40-7BG400I");
  });
});
