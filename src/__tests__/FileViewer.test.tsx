import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import FileViewer from "../components/FileViewer";
import type { FileContent } from "../types";

function makeFile(overrides: Partial<FileContent> = {}): FileContent {
  return {
    path: "/home/user/projects/counter/src/counter.v",
    content: "module counter(\n  input clk,\n  output reg [7:0] count\n);\nendmodule",
    sizeBytes: 1230,
    isBinary: false,
    lineCount: 5,
    ...overrides,
  };
}

describe("FileViewer", () => {
  it("renders file name from the last segment of path", () => {
    const file = makeFile({ path: "/a/b/c/top_module.sv" });
    renderWithTheme(<FileViewer file={file} onClose={vi.fn()} />);
    expect(screen.getByText("top_module.sv")).toBeInTheDocument();
  });

  it("shows line numbers for each line of content", () => {
    const file = makeFile({
      content: "line one\nline two\nline three",
      lineCount: 3,
    });
    renderWithTheme(<FileViewer file={file} onClose={vi.fn()} />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("line one")).toBeInTheDocument();
    expect(screen.getByText("line two")).toBeInTheDocument();
    expect(screen.getByText("line three")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    renderWithTheme(<FileViewer file={makeFile()} onClose={onClose} />);
    // The close button renders the unicode multiplication sign
    fireEvent.click(screen.getByText("\u2715"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows file size formatted as KB", () => {
    const file = makeFile({ sizeBytes: 1230 });
    renderWithTheme(<FileViewer file={file} onClose={vi.fn()} />);
    // formatSize: 1230 bytes >= 1024 => "1 KB" (toFixed(0))
    expect(screen.getByText("1 KB")).toBeInTheDocument();
  });

  it("shows binary file info instead of source content", () => {
    const file = makeFile({
      isBinary: true,
      content: "Binary file (1.2 MB bitstream)",
      sizeBytes: 1258291,
    });
    renderWithTheme(<FileViewer file={file} onClose={vi.fn()} />);
    expect(screen.getByText("Binary file (1.2 MB bitstream)")).toBeInTheDocument();
    // Line numbers should not appear for binary files
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });
});
