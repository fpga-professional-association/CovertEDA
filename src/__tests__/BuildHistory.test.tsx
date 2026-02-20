import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithTheme, makeBuildRecord } from "../test/helpers";
import BuildHistory from "../components/BuildHistory";
import { readFile } from "../hooks/useTauri";

vi.mock("../hooks/useTauri", () => ({
  readFile: vi.fn(),
}));

const mockedReadFile = vi.mocked(readFile);

describe("BuildHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows empty state when readFile rejects (no file)", async () => {
    mockedReadFile.mockRejectedValue(new Error("no file"));
    renderWithTheme(<BuildHistory projectDir="/test/project" />);
    await waitFor(() => {
      expect(screen.getByText("No build history yet")).toBeInTheDocument();
    });
  });

  it("shows loading state initially", () => {
    // Make readFile hang forever so loading persists
    mockedReadFile.mockReturnValue(new Promise(() => {}));
    renderWithTheme(<BuildHistory projectDir="/test/project" />);
    expect(screen.getByText("Loading build history...")).toBeInTheDocument();
  });

  it("renders table rows when history loads successfully", async () => {
    const records = [
      makeBuildRecord({ id: "b1", status: "success", fmaxMhz: 125.5 }),
      makeBuildRecord({ id: "b2", status: "failed", fmaxMhz: undefined }),
    ];
    mockedReadFile.mockResolvedValue({
      path: "/test/.coverteda_history.json",
      content: JSON.stringify(records),
      sizeBytes: 100,
      isBinary: false,
      lineCount: 1,
    });

    renderWithTheme(<BuildHistory projectDir="/test/project" />);
    await waitFor(() => {
      expect(screen.getByText("success")).toBeInTheDocument();
      expect(screen.getByText("failed")).toBeInTheDocument();
    });
  });

  it("displays formatted duration as '1m 35s' for 95s", async () => {
    const records = [makeBuildRecord({ id: "b1", duration: 95 })];
    mockedReadFile.mockResolvedValue({
      path: "/test/.coverteda_history.json",
      content: JSON.stringify(records),
      sizeBytes: 100,
      isBinary: false,
      lineCount: 1,
    });

    renderWithTheme(<BuildHistory projectDir="/test/project" />);
    await waitFor(() => {
      expect(screen.getByText("1m 35s")).toBeInTheDocument();
    });
  });

  it("shows build details when a row is clicked", async () => {
    const records = [
      makeBuildRecord({ id: "b1", backend: "radiant", device: "LIFCL-40-7BG400I", fmaxMhz: 125.5 }),
    ];
    mockedReadFile.mockResolvedValue({
      path: "/test/.coverteda_history.json",
      content: JSON.stringify(records),
      sizeBytes: 100,
      isBinary: false,
      lineCount: 1,
    });

    renderWithTheme(<BuildHistory projectDir="/test/project" />);
    await waitFor(() => {
      expect(screen.getByText("success")).toBeInTheDocument();
    });

    // Click on the row (find the status badge row)
    const row = screen.getByText("success").closest("tr")!;
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByText("Build Details")).toBeInTheDocument();
      expect(screen.getByText("radiant")).toBeInTheDocument();
    });
  });

  it("shows View Report button for selected successful build when onViewReport is provided", async () => {
    const onViewReport = vi.fn();
    const records = [
      makeBuildRecord({ id: "b1", status: "success" }),
    ];
    mockedReadFile.mockResolvedValue({
      path: "/test/.coverteda_history.json",
      content: JSON.stringify(records),
      sizeBytes: 100,
      isBinary: false,
      lineCount: 1,
    });

    renderWithTheme(<BuildHistory projectDir="/test/project" onViewReport={onViewReport} />);
    await waitFor(() => {
      expect(screen.getByText("success")).toBeInTheDocument();
    });

    // Click to select the row
    const row = screen.getByText("success").closest("tr")!;
    fireEvent.click(row);

    await waitFor(() => {
      const viewBtn = screen.getByText("View Report");
      expect(viewBtn).toBeInTheDocument();
      fireEvent.click(viewBtn);
      expect(onViewReport).toHaveBeenCalledWith("b1");
    });
  });

  it("shows summary cards with total builds and success rate", async () => {
    const records = [
      makeBuildRecord({ id: "b1", status: "success" }),
      makeBuildRecord({ id: "b2", status: "failed" }),
      makeBuildRecord({ id: "b3", status: "success" }),
    ];
    mockedReadFile.mockResolvedValue({
      path: "/test/.coverteda_history.json",
      content: JSON.stringify(records),
      sizeBytes: 100,
      isBinary: false,
      lineCount: 1,
    });

    renderWithTheme(<BuildHistory projectDir="/test/project" />);
    await waitFor(() => {
      // Total builds
      expect(screen.getByText("3")).toBeInTheDocument();
      // Success rate: 2/3 = 67%
      expect(screen.getByText("67%")).toBeInTheDocument();
    });
  });
});
