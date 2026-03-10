import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import SshPanel from "../components/SshPanel";

// Mock useTauri SSH functions
vi.mock("../hooks/useTauri", () => ({
  sshTestConnection: vi.fn(() =>
    Promise.resolve({ ok: true, hostname: "build-server", os: "Linux 6.1" })
  ),
  sshSaveConfig: vi.fn(() => Promise.resolve()),
  sshLoadConfig: vi.fn(() => Promise.resolve(null)),
  sshDetectTools: vi.fn(() =>
    Promise.resolve([
      { backendId: "radiant", name: "Radiant", path: "/opt/radiant/bin/radiantc", available: true },
      { backendId: "quartus", name: "Quartus", path: "", available: false },
      { backendId: "vivado", name: "Vivado", path: "/opt/vivado/bin/vivado", available: true },
    ])
  ),
  sshSetPassword: vi.fn(() => Promise.resolve()),
  sshGetPassword: vi.fn(() => Promise.resolve(null)),
  sshRemoteFileTree: vi.fn(() => Promise.resolve([])),
  sshReadRemoteFile: vi.fn(() => Promise.resolve("")),
  invoke: vi.fn(() => Promise.resolve()),
}));

function renderPanel(overrides: { onLog?: (msg: string, type?: "info" | "ok" | "err" | "warn") => void } = {}) {
  const onLog = overrides.onLog ?? vi.fn();
  return { ...renderWithTheme(<SshPanel onLog={onLog} />), onLog };
}

describe("SshPanel", () => {
  it("renders SSH Build Server header", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("SSH Build Server")).toBeInTheDocument();
    });
  });

  it("shows 3 tool selector chips", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/OpenSSH/)).toBeInTheDocument();
      expect(screen.getByText(/PuTTY/)).toBeInTheDocument();
      expect(screen.getByText(/Custom/)).toBeInTheDocument();
    });
  });

  it("shows custom path inputs only when Custom is selected", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/Custom/)).toBeInTheDocument();
    });

    // Custom paths should not be visible initially (OpenSSH is default)
    expect(screen.queryByPlaceholderText("/usr/bin/ssh")).not.toBeInTheDocument();

    // Click Custom
    fireEvent.click(screen.getByText(/Custom/));

    // Now custom path inputs should appear
    expect(screen.getByPlaceholderText("/usr/bin/ssh")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("/usr/bin/scp")).toBeInTheDocument();
  });

  it("shows connection form fields", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("hostname or IP")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("22")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("username")).toBeInTheDocument();
    });
  });

  it("shows auth method chips", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Key File")).toBeInTheDocument();
      expect(screen.getByText("SSH Agent")).toBeInTheDocument();
      expect(screen.getByText("Password")).toBeInTheDocument();
    });
  });

  it("shows key path input when Key File auth selected", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Key File")).toBeInTheDocument();
    });

    // Key path should not be visible with default Agent auth
    expect(screen.queryByPlaceholderText("~/.ssh/id_rsa")).not.toBeInTheDocument();

    // Click Key File
    fireEvent.click(screen.getByText("Key File"));

    expect(screen.getByPlaceholderText("~/.ssh/id_rsa")).toBeInTheDocument();
  });

  it("shows password input when Password auth selected", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Password")).toBeInTheDocument();
    });

    expect(screen.queryByPlaceholderText("Password (saved to OS keyring)")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Password"));

    expect(screen.getByPlaceholderText("Password (saved to OS keyring)")).toBeInTheDocument();
  });

  it("shows remote project directory input", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("/home/user/projects/my_fpga")).toBeInTheDocument();
    });
  });

  it("shows Test Connection button", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Test Connection")).toBeInTheDocument();
    });
  });

  it("Test Connection button is disabled without host and user", async () => {
    renderPanel();
    await waitFor(() => {
      const btn = screen.getByText("Test Connection");
      expect(btn.closest("button")).toBeDisabled();
    });
  });

  it("calls sshTestConnection when Test Connection is clicked", async () => {
    const { sshTestConnection } = await import("../hooks/useTauri");
    const onLog = vi.fn();
    renderPanel({ onLog });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("hostname or IP")).toBeInTheDocument();
    });

    // Fill in required fields
    fireEvent.change(screen.getByPlaceholderText("hostname or IP"), { target: { value: "10.0.0.1" } });
    fireEvent.change(screen.getByPlaceholderText("username"), { target: { value: "fpga" } });

    fireEvent.click(screen.getByText("Test Connection"));

    await waitFor(() => {
      expect(sshTestConnection).toHaveBeenCalled();
    });
  });

  it("shows Detect Tools button", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Detect Tools")).toBeInTheDocument();
    });
  });

  it("shows Save button", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Save")).toBeInTheDocument();
    });
  });

  it("calls sshSaveConfig when Save is clicked", async () => {
    const { sshSaveConfig } = await import("../hooks/useTauri");
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Save")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(sshSaveConfig).toHaveBeenCalled();
    });
  });

  it("shows Enable/Disable toggle", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Disabled")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Disabled"));

    expect(screen.getByText("Enabled")).toBeInTheDocument();
  });
});
