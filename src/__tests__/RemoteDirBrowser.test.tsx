import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import RemoteDirBrowser from "../components/RemoteDirBrowser";

// Mock useTauri SSH functions
const mockBrowseDirectory = vi.fn();
const mockCheckProjectDir = vi.fn();

vi.mock("../hooks/useTauri", () => ({
  sshBrowseDirectory: (...args: unknown[]) => mockBrowseDirectory(...args),
  sshCheckProjectDir: (...args: unknown[]) => mockCheckProjectDir(...args),
}));

const MOCK_ENTRIES = [
  { name: "src", path: "/home/fpga/project/src", isDir: true },
  { name: "build", path: "/home/fpga/project/build", isDir: true },
  { name: "top.v", path: "/home/fpga/project/top.v", isDir: false },
  { name: ".coverteda", path: "/home/fpga/project/.coverteda", isDir: false },
];

function renderBrowser(overrides?: {
  initialDir?: string;
  onSelect?: (dir: string, config: unknown) => void;
  onClose?: () => void;
}) {
  const onSelect = overrides?.onSelect ?? vi.fn();
  const onClose = overrides?.onClose ?? vi.fn();
  const initialDir = overrides?.initialDir ?? "/home/fpga/project";
  return {
    ...renderWithTheme(
      <RemoteDirBrowser
        initialDir={initialDir}
        onSelect={onSelect}
        onClose={onClose}
      />
    ),
    onSelect,
    onClose,
  };
}

describe("RemoteDirBrowser", () => {
  beforeEach(() => {
    mockBrowseDirectory.mockResolvedValue(MOCK_ENTRIES);
    mockCheckProjectDir.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the browser header", async () => {
    renderBrowser();
    expect(screen.getByText("Browse Remote Directory")).toBeInTheDocument();
  });

  it("displays directory entries after loading", async () => {
    renderBrowser();
    await waitFor(() => {
      expect(screen.getByText("src")).toBeInTheDocument();
    });
    expect(screen.getByText("build")).toBeInTheDocument();
    expect(screen.getByText(/top\.v/)).toBeInTheDocument();
  });

  it("shows 'Project Found' badge when .coverteda exists", async () => {
    mockCheckProjectDir.mockResolvedValue({
      name: "test",
      backendId: "radiant",
      device: "LIFCL-40",
      topModule: "top",
    });
    renderBrowser();
    await waitFor(() => {
      expect(screen.getByText("Project Found")).toBeInTheDocument();
    });
  });

  it("clicking a directory navigates into it", async () => {
    renderBrowser();
    await waitFor(() => {
      expect(screen.getByText("src")).toBeInTheDocument();
    });

    // Set up mock for the sub-directory
    mockBrowseDirectory.mockResolvedValue([
      { name: "counter.v", path: "/home/fpga/project/src/counter.v", isDir: false },
    ]);
    mockCheckProjectDir.mockResolvedValue(null);

    fireEvent.click(screen.getByText("src"));
    await waitFor(() => {
      expect(mockBrowseDirectory).toHaveBeenCalledWith("/home/fpga/project/src");
    });
  });

  it("Cancel button calls onClose", async () => {
    const onClose = vi.fn();
    renderBrowser({ onClose });
    await waitFor(() => {
      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("Select button calls onSelect with current dir", async () => {
    const onSelect = vi.fn();
    renderBrowser({ onSelect });
    await waitFor(() => {
      expect(screen.getByText("Select Directory")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Select Directory"));
    expect(onSelect).toHaveBeenCalledWith("/home/fpga/project", null);
  });

  it("shows 'Open Project' button when project is found", async () => {
    const projectConfig = {
      name: "test",
      backendId: "radiant",
      device: "LIFCL-40",
      topModule: "top",
    };
    mockCheckProjectDir.mockResolvedValue(projectConfig);
    const onSelect = vi.fn();
    renderBrowser({ onSelect });
    await waitFor(() => {
      expect(screen.getByText("Open Project")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Open Project"));
    expect(onSelect).toHaveBeenCalledWith("/home/fpga/project", projectConfig);
  });

  it("shows breadcrumb path segments", async () => {
    renderBrowser({ initialDir: "/home/fpga/project" });
    await waitFor(() => {
      expect(screen.getByText("home")).toBeInTheDocument();
    });
    expect(screen.getByText("fpga")).toBeInTheDocument();
    expect(screen.getByText("project")).toBeInTheDocument();
  });
});
