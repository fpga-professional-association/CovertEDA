import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import ConstraintEditor from "../components/ConstraintEditor";
import * as tauriHooks from "../hooks/useTauri";

vi.mock("../hooks/useTauri", () => ({
  readFile: vi.fn(() => Promise.reject(new Error("no file"))),
  writeTextFile: vi.fn(() => Promise.resolve()),
  pickSaveFile: vi.fn(() => Promise.resolve(null)),
}));

describe("ConstraintEditor", () => {
  it("renders with pins tab active by default", () => {
    renderWithTheme(<ConstraintEditor backendId="radiant" device="LIFCL-40" />);
    expect(screen.getByText("Pin Assignments")).toBeInTheDocument();
  });

  it("switches to timing tab when clicked", async () => {
    renderWithTheme(<ConstraintEditor backendId="radiant" device="LIFCL-40" />);

    // The timing tab text is rendered as a composite with icon + text
    const timingTab = screen.getByText(/Timing/);
    fireEvent.click(timingTab);

    await waitFor(() => {
      expect(screen.getByText("Timing Constraints")).toBeInTheDocument();
    });
  });

  it("shows empty state when no pins are defined", () => {
    renderWithTheme(<ConstraintEditor backendId="radiant" device="LIFCL-40" />);
    expect(screen.getByText(/No pin constraints/)).toBeInTheDocument();
  });

  it("shows add pin form when '+ Add Pin' is clicked", () => {
    renderWithTheme(<ConstraintEditor backendId="radiant" device="LIFCL-40" />);
    fireEvent.click(screen.getByText("+ Add Pin"));
    // The form should show input labels
    expect(screen.getByText("NET NAME")).toBeInTheDocument();
    expect(screen.getByText("PIN")).toBeInTheDocument();
  });

  it("validates that net name is required when adding a pin", () => {
    renderWithTheme(<ConstraintEditor backendId="radiant" device="LIFCL-40" />);
    fireEvent.click(screen.getByText("+ Add Pin"));
    // Click Add without filling anything
    fireEvent.click(screen.getByText("Add"));
    expect(screen.getByText("Net name is required")).toBeInTheDocument();
  });

  it("validates that pin location is required when net is filled", () => {
    renderWithTheme(<ConstraintEditor backendId="radiant" device="LIFCL-40" />);
    fireEvent.click(screen.getByText("+ Add Pin"));

    // Fill in net name but leave pin empty
    const inputs = screen.getAllByRole("textbox");
    // inputs[0] is the search filter, inputs[1] is the net name in the add form
    const netInput = inputs[1];
    fireEvent.change(netInput, { target: { value: "clk" } });

    fireEvent.click(screen.getByText("Add"));
    expect(screen.getByText("Pin location is required")).toBeInTheDocument();
  });

  it("shows pin count in tab label", () => {
    renderWithTheme(<ConstraintEditor backendId="radiant" device="LIFCL-40" />);
    expect(screen.getByText(/Pins \(0\)/)).toBeInTheDocument();
  });

  it("displays the device name", () => {
    renderWithTheme(<ConstraintEditor backendId="radiant" device="LIFCL-40-7BG400I" />);
    expect(screen.getByText("LIFCL-40-7BG400I")).toBeInTheDocument();
  });

  it("shows PDC format badge for radiant backend", () => {
    renderWithTheme(<ConstraintEditor backendId="radiant" device="LIFCL-40" />);
    expect(screen.getByText("PDC")).toBeInTheDocument();
  });

  it("shows XDC format badge for vivado backend", () => {
    renderWithTheme(<ConstraintEditor backendId="vivado" device="xc7a35t" />);
    expect(screen.getByText("XDC")).toBeInTheDocument();
  });

  it("shows QSF format badge for quartus backend", () => {
    renderWithTheme(<ConstraintEditor backendId="quartus" device="10CL025YU256C8G" />);
    expect(screen.getByText("QSF")).toBeInTheDocument();
  });

  it("shows keyboard navigation hint text", () => {
    renderWithTheme(<ConstraintEditor backendId="radiant" device="LIFCL-40" />);
    expect(screen.getByText(/Arrow keys navigate/)).toBeInTheDocument();
  });

  it("successfully adds a pin with both net and pin filled", async () => {
    renderWithTheme(<ConstraintEditor backendId="radiant" device="LIFCL-40" />);
    fireEvent.click(screen.getByText("+ Add Pin"));

    const inputs = screen.getAllByRole("textbox");
    // inputs[0]=search, inputs[1]=net, inputs[2]=pin
    fireEvent.change(inputs[1], { target: { value: "clk" } });
    fireEvent.change(inputs[2], { target: { value: "A5" } });
    fireEvent.click(screen.getByText("Add"));

    await waitFor(() => {
      expect(screen.getAllByText("clk").length).toBeGreaterThan(0);
      expect(screen.getByText("A5")).toBeInTheDocument();
    });
  });

  it("preserves unrecognized QSF directives across load-then-save (regression for #182)", async () => {
    // A real Quartus .qsf always has FAMILY/DEVICE/TOP_LEVEL_ENTITY/
    // VERILOG_FILE assignments alongside pin assignments -- none of those
    // are modeled by this editor's pin/timing grid.
    const originalQsf = [
      `set_global_assignment -name FAMILY "Cyclone IV E"`,
      `set_global_assignment -name DEVICE EP4CE6E22C8`,
      `set_global_assignment -name TOP_LEVEL_ENTITY top`,
      `set_global_assignment -name VERILOG_FILE top.v`,
      `set_location_assignment PIN_23 -to clk`,
      `set_instance_assignment -name IO_STANDARD "3.3-V LVTTL" -to clk`,
    ].join("\n");

    vi.mocked(tauriHooks.readFile).mockResolvedValueOnce({
      path: "/proj/top.qsf",
      content: originalQsf,
      sizeBytes: originalQsf.length,
      isBinary: false,
      lineCount: originalQsf.split("\n").length,
    });

    renderWithTheme(
      <ConstraintEditor backendId="quartus" device="EP4CE6E22C8" constraintFile="/proj/top.qsf" />
    );

    // Wait for the parsed pin to appear, confirming the file loaded.
    await waitFor(() => {
      expect(screen.getAllByText("clk").length).toBeGreaterThan(0);
    });

    // Save is disabled while the buffer isn't dirty -- toggle the pin's
    // "locked" checkbox to trigger a trivial edit, then Save.
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(tauriHooks.writeTextFile).toHaveBeenCalled();
    });

    const [savedPath, savedContent] = vi.mocked(tauriHooks.writeTextFile).mock.calls[0];
    expect(savedPath).toBe("/proj/top.qsf");
    // The regression: these directives must survive the round-trip instead
    // of being silently dropped because the editor only understands pin
    // location/IO-attribute lines and a whitelist of timing commands.
    expect(savedContent).toContain("FAMILY");
    expect(savedContent).toContain("Cyclone IV E");
    expect(savedContent).toContain("TOP_LEVEL_ENTITY");
    expect(savedContent).toContain("VERILOG_FILE");
  });
});
