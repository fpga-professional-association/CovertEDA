import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import ContextMenu from "../components/ContextMenu";
import type { ContextMenuItem } from "../components/ContextMenu";

function makeItems(overrides: Partial<ContextMenuItem>[] = []): ContextMenuItem[] {
  const defaults: ContextMenuItem[] = [
    { label: "Open", onClick: vi.fn() },
    { label: "Rename", onClick: vi.fn() },
    { label: "Delete", onClick: vi.fn(), danger: true },
  ];
  return overrides.length > 0
    ? overrides.map((o, i) => ({ ...defaults[i % defaults.length], ...o }))
    : defaults;
}

describe("ContextMenu", () => {
  it("renders all menu items", () => {
    const items = makeItems();
    renderWithTheme(<ContextMenu x={100} y={100} items={items} onClose={vi.fn()} />);
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Rename")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("fires onClick and closes when item is clicked", () => {
    const onClick = vi.fn();
    const onClose = vi.fn();
    const items: ContextMenuItem[] = [{ label: "Open", onClick }];
    renderWithTheme(<ContextMenu x={100} y={100} items={items} onClose={onClose} />);
    fireEvent.click(screen.getByText("Open"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick for disabled items", () => {
    const onClick = vi.fn();
    const items: ContextMenuItem[] = [{ label: "Locked", onClick, disabled: true }];
    renderWithTheme(<ContextMenu x={100} y={100} items={items} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Locked"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("closes on Escape key", () => {
    const onClose = vi.fn();
    const items: ContextMenuItem[] = [{ label: "Item", onClick: vi.fn() }];
    renderWithTheme(<ContextMenu x={100} y={100} items={items} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("renders danger items with error color styling", () => {
    const items: ContextMenuItem[] = [{ label: "Delete", onClick: vi.fn(), danger: true }];
    renderWithTheme(<ContextMenu x={100} y={100} items={items} onClose={vi.fn()} />);
    const el = screen.getByText("Delete");
    // Danger items get the C.err color — a red-ish value
    expect(el.style.color).toBeTruthy();
  });
});
