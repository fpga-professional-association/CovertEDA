import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme, makeProjectFile } from "../test/helpers";
import FileTree from "../components/FileTree";
import type { ProjectFile } from "../types";

const defaultProps = {
  activeFile: "",
  setActiveFile: vi.fn(),
  width: 240,
  onWidthChange: vi.fn(),
};

function makeFileTree(): ProjectFile[] {
  return [
    makeProjectFile({ n: "src", d: 0, ty: "folder", path: "/project/src" }),
    makeProjectFile({ n: "counter.v", d: 1, ty: "rtl", path: "/project/src/counter.v", git: "clean", synth: true }),
    makeProjectFile({ n: "counter_tb.v", d: 1, ty: "tb", path: "/project/src/counter_tb.v", git: "M", synth: false, saved: false }),
    makeProjectFile({ n: "top.lpf", d: 0, ty: "constr", path: "/project/top.lpf", git: "clean", synth: true }),
  ];
}

describe("FileTree", () => {
  it("renders PROJECT FILES header", () => {
    renderWithTheme(<FileTree {...defaultProps} files={makeFileTree()} />);
    expect(screen.getByText("PROJECT FILES")).toBeInTheDocument();
  });

  it("renders file names from data", () => {
    renderWithTheme(<FileTree {...defaultProps} files={makeFileTree()} />);
    expect(screen.getByText("counter.v")).toBeInTheDocument();
    expect(screen.getByText("counter_tb.v")).toBeInTheDocument();
    expect(screen.getByText("top.lpf")).toBeInTheDocument();
  });

  it("calls setActiveFile when a file is clicked", () => {
    const setActiveFile = vi.fn();
    renderWithTheme(<FileTree {...defaultProps} files={makeFileTree()} setActiveFile={setActiveFile} />);
    fireEvent.click(screen.getByText("counter.v"));
    expect(setActiveFile).toHaveBeenCalledWith("counter.v", "/project/src/counter.v");
  });

  it("shows folder expand/collapse arrows", () => {
    const { container } = renderWithTheme(<FileTree {...defaultProps} files={makeFileTree()} />);
    // Folders default to open, so we should see the down arrow ▼
    expect(container.textContent).toContain("\u25BC");
  });

  it("collapses folder children when folder is clicked", () => {
    renderWithTheme(<FileTree {...defaultProps} files={makeFileTree()} />);
    // Initially counter.v is visible (child of "src" folder)
    expect(screen.getByText("counter.v")).toBeInTheDocument();

    // Click the folder name (rendered uppercase)
    fireEvent.click(screen.getByText("SRC"));

    // After collapse, counter.v should no longer be visible
    expect(screen.queryByText("counter.v")).not.toBeInTheDocument();
  });

  it("shows git status M indicator", () => {
    renderWithTheme(<FileTree {...defaultProps} files={makeFileTree()} />);
    // The "M" git status letter is shown for counter_tb.v
    expect(screen.getByText("M")).toBeInTheDocument();
  });

  it("shows footer with synth/dirty/unsaved counts", () => {
    const { container } = renderWithTheme(<FileTree {...defaultProps} files={makeFileTree()} />);
    const footer = container.textContent!;
    // 2 files have synth=true, 1 file has git="M" (dirty), 1 unsaved
    expect(footer).toContain("in synth");
    expect(footer).toContain("git");
    expect(footer).toContain("unsaved");
  });

  it("shows selected file detail panel", () => {
    renderWithTheme(
      <FileTree {...defaultProps} files={makeFileTree()} activeFile="counter.v" />
    );
    // The detail panel shows badges: type, language, lines
    expect(screen.getByText("rtl")).toBeInTheDocument();
    expect(screen.getByText("Verilog")).toBeInTheDocument();
    expect(screen.getByText("45 lines")).toBeInTheDocument();
  });
});
