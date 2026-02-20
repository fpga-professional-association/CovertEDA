import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import AiAssistant from "../components/AiAssistant";

vi.mock("../hooks/useTauri", () => ({
  getAppConfig: vi.fn(() =>
    Promise.resolve({
      tool_paths: { diamond: null, radiant: null, quartus: null, vivado: null, yosys: null, nextpnr: null, oss_cad_suite: null },
      license_servers: [],
      default_backend: "radiant",
      theme: "dark",
      scale_factor: 1.0,
      license_file: null,
      ai_api_key: null,
      ai_model: null,
    })
  ),
  saveAppConfig: vi.fn(() => Promise.resolve()),
}));

describe("AiAssistant", () => {
  it("shows API key input when no key is configured", async () => {
    renderWithTheme(<AiAssistant />);
    // Wait for the async config load to settle
    await waitFor(() => {
      expect(screen.getByText("AI Assistant Setup")).toBeInTheDocument();
    });
    expect(screen.getByText("API KEY")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("sk-ant-api03-...")).toBeInTheDocument();
  });

  it("shows the Connect button on setup screen", async () => {
    renderWithTheme(<AiAssistant />);
    await waitFor(() => {
      expect(screen.getByText("Connect")).toBeInTheDocument();
    });
  });

  it("shows model selection options", async () => {
    renderWithTheme(<AiAssistant />);
    await waitFor(() => {
      expect(screen.getByText("MODEL")).toBeInTheDocument();
    });
    expect(screen.getByText("Claude Sonnet 4.6 (Fast)")).toBeInTheDocument();
    expect(screen.getByText("Claude Opus 4.6 (Best)")).toBeInTheDocument();
    expect(screen.getByText("Claude Haiku 4.5 (Cheapest)")).toBeInTheDocument();
  });

  it("Connect button is visually disabled when API key draft is empty", async () => {
    renderWithTheme(<AiAssistant />);
    await waitFor(() => {
      expect(screen.getByText("Connect")).toBeInTheDocument();
    });
    // The Btn component uses style-based disabling (opacity + cursor) rather than HTML disabled attr
    const connectBtn = screen.getByText("Connect").closest("button")!;
    expect(connectBtn).toHaveStyle({ opacity: "0.4", cursor: "not-allowed" });
  });

  it("shows setup description mentioning Claude AI", async () => {
    renderWithTheme(<AiAssistant projectContext="Backend: radiant, Device: LIFCL-40" />);
    await waitFor(() => {
      expect(screen.getByText(/Connect to Claude AI/)).toBeInTheDocument();
    });
  });
});
