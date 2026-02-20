import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import KeyboardShortcuts from "../components/KeyboardShortcuts";

describe("KeyboardShortcuts", () => {
  it("renders the title", () => {
    renderWithTheme(<KeyboardShortcuts onClose={vi.fn()} />);
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
  });

  it("shows all shortcut categories", () => {
    renderWithTheme(<KeyboardShortcuts onClose={vi.fn()} />);
    expect(screen.getByText("GENERAL")).toBeInTheDocument();
    expect(screen.getByText("ZOOM")).toBeInTheDocument();
    expect(screen.getByText("NAVIGATION")).toBeInTheDocument();
  });

  it("shows specific shortcut keys", () => {
    renderWithTheme(<KeyboardShortcuts onClose={vi.fn()} />);
    expect(screen.getByText("Ctrl+K")).toBeInTheDocument();
    expect(screen.getByText("Ctrl+B")).toBeInTheDocument();
    expect(screen.getByText("Escape")).toBeInTheDocument();
    expect(screen.getByText("Ctrl+=")).toBeInTheDocument();
  });

  it("fires onClose when Close button is clicked", () => {
    const onClose = vi.fn();
    renderWithTheme(<KeyboardShortcuts onClose={onClose} />);
    fireEvent.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("fires onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    const { container } = renderWithTheme(<KeyboardShortcuts onClose={onClose} />);
    // The backdrop is the outermost fixed div
    const backdrop = container.firstElementChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
