import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme, makeLogEntry } from "../test/helpers";
import Console from "../components/Console";

const defaultProps = {
  logs: [],
  building: false,
  backendShort: "RAD",
  backendColor: "#00aaff",
  onClear: vi.fn(),
};

describe("Console", () => {
  it("renders log lines with correct prefixes", () => {
    const logs = [
      makeLogEntry("cmd", "yosys -p synth"),
      makeLogEntry("err", "synthesis failed"),
      makeLogEntry("warn", "latch inferred"),
      makeLogEntry("ok", "build complete"),
      makeLogEntry("info", "starting build"),
    ];
    renderWithTheme(<Console {...defaultProps} logs={logs} />);

    // cmd prefix is "$ "
    expect(screen.getByText("$")).toBeInTheDocument();
    // err prefix is the unicode cross mark
    expect(screen.getByText("\u2717")).toBeInTheDocument();
    // warn prefix is the warning sign
    expect(screen.getByText("\u26A0")).toBeInTheDocument();
    // ok prefix is the check mark
    expect(screen.getByText("\u2713")).toBeInTheDocument();
    // info prefix is the single right-pointing angle quotation mark
    expect(screen.getByText("\u203A")).toBeInTheDocument();
  });

  it("shows line count in the header", () => {
    const logs = [makeLogEntry("info", "one"), makeLogEntry("info", "two"), makeLogEntry("info", "three")];
    const { container } = renderWithTheme(<Console {...defaultProps} logs={logs} />);
    // The header div contains the count and "lines" as adjacent text nodes
    // Use container query to find the header area text content
    const headerDiv = container.querySelector("div > div:first-child")!;
    expect(headerDiv.textContent).toContain("3");
    expect(headerDiv.textContent).toContain("lines");
  });

  it("filters logs when search text is entered", () => {
    const logs = [
      makeLogEntry("info", "Alpha message"),
      makeLogEntry("info", "Beta message"),
      makeLogEntry("info", "Alpha again"),
    ];
    renderWithTheme(<Console {...defaultProps} logs={logs} />);

    const searchInput = screen.getByPlaceholderText("Search logs...");
    fireEvent.change(searchInput, { target: { value: "Alpha" } });

    // Should show 2 matches
    expect(screen.getByText("2 matches")).toBeInTheDocument();
    // The non-matching log should not be visible
    expect(screen.queryByText("Beta message")).not.toBeInTheDocument();
  });

  it("calls onClear when the Clear button is clicked", () => {
    const onClear = vi.fn();
    renderWithTheme(<Console {...defaultProps} onClear={onClear} logs={[makeLogEntry("info", "test")]} />);
    fireEvent.click(screen.getByText("Clear"));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("shows empty state message when no logs and not building", () => {
    renderWithTheme(<Console {...defaultProps} logs={[]} building={false} />);
    expect(screen.getByText("No build output yet. Hit Build to start.")).toBeInTheDocument();
  });

  it("shows building indicator when building is true", () => {
    renderWithTheme(<Console {...defaultProps} logs={[]} building={true} />);
    expect(screen.getByText("Building...")).toBeInTheDocument();
  });
});
