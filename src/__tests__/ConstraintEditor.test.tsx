import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import ConstraintEditor from "../components/ConstraintEditor";

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

  it("bulk-deletes the correct pins when a search filter narrows the row indices (regression for #212)", async () => {
    renderWithTheme(<ConstraintEditor backendId="radiant" device="LIFCL-40" />);
    fireEvent.click(screen.getByText("+ Add Pin"));
    const inputs = screen.getAllByRole("textbox");
    const netInput = inputs[1];
    const pinInput = inputs[2];

    // pins[] insertion order: alpha(0), target_1(1), beta(2), target_2(3), gamma(4)
    const toAdd: [string, string][] = [
      ["alpha", "P1"],
      ["target_1", "P2"],
      ["beta", "P3"],
      ["target_2", "P4"],
      ["gamma", "P5"],
    ];
    for (const [net, pin] of toAdd) {
      fireEvent.change(netInput, { target: { value: net } });
      fireEvent.change(pinInput, { target: { value: pin } });
      fireEvent.click(screen.getByText("Add"));
      // getAllByText: the net-name AutoInput's suggestion dropdown can also
      // render the just-added name, so more than one match is expected.
      await waitFor(() => expect(screen.getAllByText(net).length).toBeGreaterThan(0));
    }
    fireEvent.click(screen.getByText("Cancel"));

    // Filtering to "target" makes the visible rows [target_1, target_2],
    // at filtered-view indices 0 and 1 -- NOT their indices (1, 3) in the
    // underlying pins array.
    const searchInput = screen.getByPlaceholderText("Filter nets/pins...");
    fireEvent.change(searchInput, { target: { value: "target" } });

    await waitFor(() => {
      expect(screen.getByText("target_1")).toBeInTheDocument();
      expect(screen.getByText("target_2")).toBeInTheDocument();
      expect(screen.queryByText("alpha")).not.toBeInTheDocument();
    });

    // Select both visible rows via click + shift-click on the Net cells.
    fireEvent.click(screen.getByText("target_1"));
    fireEvent.click(screen.getByText("target_2"), { shiftKey: true });

    await waitFor(() => {
      expect(screen.getByText("Delete 2 Selected")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Delete 2 Selected"));

    // Clear the filter and verify target_1/target_2 (the actually-selected
    // rows) are gone, while alpha/beta/gamma (never selected) survive. The
    // old bug deleted pins[0] and pins[1] instead (alpha, target_1),
    // leaving target_2 behind and wrongly destroying alpha.
    fireEvent.change(searchInput, { target: { value: "" } });

    await waitFor(() => {
      expect(screen.queryByText("target_1")).not.toBeInTheDocument();
      expect(screen.queryByText("target_2")).not.toBeInTheDocument();
      expect(screen.getByText("alpha")).toBeInTheDocument();
      expect(screen.getByText("beta")).toBeInTheDocument();
      expect(screen.getByText("gamma")).toBeInTheDocument();
    });
  });
});
