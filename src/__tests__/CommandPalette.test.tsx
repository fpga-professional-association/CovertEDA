import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import CommandPalette from "../components/CommandPalette";

const sampleCommands = [
  { label: "Start Build", category: "build", desc: "Run synthesis and place & route", action: vi.fn() },
  { label: "Switch Backend", category: "config", desc: "Change active FPGA toolchain", action: vi.fn() },
  { label: "View Timing Report", category: "report", desc: "Open timing analysis results", action: vi.fn() },
  { label: "Git Commit", category: "git", desc: "Commit staged changes", action: vi.fn() },
];

describe("CommandPalette", () => {
  beforeEach(() => {
    sampleCommands.forEach((cmd) => (cmd.action as ReturnType<typeof vi.fn>).mockClear());
  });

  it("does not render when open is false", () => {
    renderWithTheme(
      <CommandPalette open={false} onClose={vi.fn()} commands={sampleCommands} />
    );
    expect(screen.queryByPlaceholderText(/Commands/)).not.toBeInTheDocument();
    expect(screen.queryByText("Start Build")).not.toBeInTheDocument();
  });

  it("renders command list when open is true", () => {
    renderWithTheme(
      <CommandPalette open={true} onClose={vi.fn()} commands={sampleCommands} />
    );
    expect(screen.getByText("Start Build")).toBeInTheDocument();
    expect(screen.getByText("Switch Backend")).toBeInTheDocument();
    expect(screen.getByText("View Timing Report")).toBeInTheDocument();
    expect(screen.getByText("Git Commit")).toBeInTheDocument();
  });

  it("filters commands by label when searching", () => {
    renderWithTheme(
      <CommandPalette open={true} onClose={vi.fn()} commands={sampleCommands} />
    );
    const input = screen.getByPlaceholderText(/Commands/);
    fireEvent.change(input, { target: { value: "build" } });

    expect(screen.getByText("Start Build")).toBeInTheDocument();
    expect(screen.queryByText("Git Commit")).not.toBeInTheDocument();
  });

  it("calls action when a command is clicked", () => {
    const onClose = vi.fn();
    renderWithTheme(
      <CommandPalette open={true} onClose={onClose} commands={sampleCommands} />
    );
    fireEvent.click(screen.getByText("Start Build"));
    expect(sampleCommands[0].action).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    const { container } = renderWithTheme(
      <CommandPalette open={true} onClose={onClose} commands={sampleCommands} />
    );
    // Click on the backdrop (the outermost fixed div)
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows all commands when search is empty", () => {
    renderWithTheme(
      <CommandPalette open={true} onClose={vi.fn()} commands={sampleCommands} />
    );
    // Initially the search field should be empty and all commands visible
    expect(screen.getByText("Start Build")).toBeInTheDocument();
    expect(screen.getByText("Switch Backend")).toBeInTheDocument();
    expect(screen.getByText("View Timing Report")).toBeInTheDocument();
    expect(screen.getByText("Git Commit")).toBeInTheDocument();
  });
});
