import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import DevicePicker from "../components/DevicePicker";

// Mock the devices module with a small subset
vi.mock("../data/devices", () => ({
  RADIANT_DEVICES: [
    {
      partNumber: "LFCPNX-100-9ASG256C",
      family: "CertusNX",
      luts: 96600,
      ffs: 96600,
      ebr: 208,
      dsp: 80,
      io: 128,
      package: "csfBGA256",
      speedGrade: "9",
    },
    {
      partNumber: "LIFCL-40-7BG400I",
      family: "CertusPro-NX",
      luts: 39600,
      ffs: 39744,
      ebr: 104,
      dsp: 28,
      io: 220,
      package: "caBGA400",
      speedGrade: "7",
    },
    {
      partNumber: "LIFCL-17-7MG121I",
      family: "CertusPro-NX",
      luts: 17000,
      ffs: 17000,
      ebr: 32,
      dsp: 10,
      io: 56,
      package: "csfBGA121",
      speedGrade: "7",
    },
  ],
}));

describe("DevicePicker", () => {
  it("renders a text input for non-radiant backends", () => {
    renderWithTheme(
      <DevicePicker backendId="quartus" value="10CL025YU256I7G" onChange={vi.fn()} />
    );
    const input = screen.getByPlaceholderText("Device part number");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("10CL025YU256I7G");
  });

  it("renders a search input for radiant backend", () => {
    renderWithTheme(
      <DevicePicker backendId="radiant" value="LIFCL-40-7BG400I" onChange={vi.fn()} />
    );
    // The radiant picker uses a search input
    const input = screen.getByPlaceholderText("Search devices...");
    expect(input).toBeInTheDocument();
    // When not focused/open, it shows the current value
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
