import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithTheme, makeGitState } from "../test/helpers";
import GitPanel from "../components/GitPanel";
import type { GitState } from "../types";

// Mock useTauri git functions
vi.mock("../hooks/useTauri", () => ({
  gitListBranches: vi.fn(() => Promise.resolve([])),
  gitListTags: vi.fn(() => Promise.resolve([])),
  gitPull: vi.fn(() => Promise.resolve()),
  gitPush: vi.fn(() => Promise.resolve()),
  gitCommit: vi.fn(() => Promise.resolve()),
  invoke: vi.fn(() => Promise.resolve()),
}));

function renderPanel(overrides: {
  git?: GitState | null;
  projectDir?: string;
  onRefresh?: () => void;
  onLog?: (msg: string, type?: "info" | "ok" | "err" | "warn") => void;
} = {}) {
  const defaults = {
    git: makeGitState(),
    projectDir: "/test/project",
    onRefresh: vi.fn(),
    onLog: vi.fn(),
  };
  const props = { ...defaults, ...overrides };
  return { ...renderWithTheme(<GitPanel {...props} />), props };
}

describe("GitPanel", () => {
  // ── No Git State ──
  it("shows fallback message when git is null", () => {
    renderPanel({ git: null });
    expect(screen.getByText("No git repository detected")).toBeInTheDocument();
  });

  it("shows Git header even when no git state", () => {
    renderPanel({ git: null });
    expect(screen.getByText("Git")).toBeInTheDocument();
  });

  it("calls onRefresh when refresh button is clicked with no git state", () => {
    const onRefresh = vi.fn();
    renderPanel({ git: null, onRefresh });
    fireEvent.click(screen.getByTitle("Refresh git status"));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  // ── Branch Display ──
  it("displays current branch name", () => {
    renderPanel({ git: makeGitState({ branch: "feature/uart-controller" }) });
    expect(screen.getByText("feature/uart-controller")).toBeInTheDocument();
  });

  it("shows ahead badge when ahead > 0", () => {
    renderPanel({ git: makeGitState({ ahead: 3 }) });
    // The component renders ↑3 inside a Badge span
    const badges = screen.getAllByText((_content, el) =>
      !!el?.textContent?.includes("\u2191") && !!el?.textContent?.includes("3")
    );
    expect(badges.length).toBeGreaterThan(0);
  });

  it("shows behind badge when behind > 0", () => {
    renderPanel({ git: makeGitState({ behind: 2 }) });
    // Shows "pull recommended" warning
    expect(screen.getByText(/behind remote/)).toBeInTheDocument();
  });

  // ── Status Section ──
  it("shows Clean when not dirty", () => {
    renderPanel({ git: makeGitState({ dirty: false }) });
    expect(screen.getByText("Clean")).toBeInTheDocument();
  });

  it("shows Dirty with change counts", () => {
    renderPanel({
      git: makeGitState({ dirty: true, staged: 5, unstaged: 3, untracked: 2 }),
    });
    expect(screen.getByText("Dirty")).toBeInTheDocument();
    expect(screen.getByText("+5 staged")).toBeInTheDocument();
    expect(screen.getByText("~3 modified")).toBeInTheDocument();
    expect(screen.getByText("?2 untracked")).toBeInTheDocument();
  });

  it("shows staged badge only when staged > 0", () => {
    renderPanel({
      git: makeGitState({ dirty: true, staged: 0, unstaged: 1, untracked: 0 }),
    });
    expect(screen.getByText("Dirty")).toBeInTheDocument();
    expect(screen.queryByText(/staged/)).not.toBeInTheDocument();
  });

  // ── Last Commit ──
  it("displays commit hash, message, author, and time", () => {
    renderPanel({
      git: makeGitState({
        commit: "f3a9b12",
        commitMsg: "Add counter module",
        author: "Test User",
        time: "5 minutes ago",
      }),
    });
    expect(screen.getByText("Last Commit")).toBeInTheDocument();
    expect(screen.getByText("f3a9b12")).toBeInTheDocument();
    expect(screen.getByText("Add counter module")).toBeInTheDocument();
    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(screen.getByText("5 minutes ago")).toBeInTheDocument();
  });

  // ── Action Buttons ──
  it("shows Commit, Pull, Push buttons", () => {
    renderPanel();
    expect(screen.getByText("Commit")).toBeInTheDocument();
    expect(screen.getByText("Pull")).toBeInTheDocument();
    expect(screen.getByText("Push")).toBeInTheDocument();
  });

  it("disables Commit button when not dirty", () => {
    renderPanel({ git: makeGitState({ dirty: false }) });
    const commitBtn = screen.getByText("Commit").closest("button")!;
    expect(commitBtn).toBeDisabled();
  });

  it("disables Push button when ahead = 0", () => {
    renderPanel({ git: makeGitState({ ahead: 0 }) });
    const pushBtn = screen.getByText("Push").closest("button")!;
    expect(pushBtn).toBeDisabled();
  });

  it("highlights Pull button when behind > 0", () => {
    renderPanel({ git: makeGitState({ behind: 5 }) });
    // Shows pull count in button text (Pull ↓5)
    const pullBtns = screen.getAllByText((_content, el) =>
      !!el?.textContent?.includes("Pull") && !!el?.textContent?.includes("\u2193")
    );
    expect(pullBtns.length).toBeGreaterThan(0);
  });

  it("shows push count when ahead > 0", () => {
    renderPanel({ git: makeGitState({ ahead: 2 }) });
    const pushBtns = screen.getAllByText((_content, el) =>
      !!el?.textContent?.includes("Push") && !!el?.textContent?.includes("\u2191")
    );
    expect(pushBtns.length).toBeGreaterThan(0);
  });

  // ── Commit Flow ──
  it("opens commit input when Commit is clicked while dirty", () => {
    renderPanel({ git: makeGitState({ dirty: true }) });
    fireEvent.click(screen.getByText("Commit"));
    expect(screen.getByPlaceholderText("Commit message...")).toBeInTheDocument();
    expect(screen.getByText("Confirm")).toBeInTheDocument();
  });

  it("toggles commit mode: shows Cancel text when open", () => {
    renderPanel({ git: makeGitState({ dirty: true }) });
    fireEvent.click(screen.getByText("Commit"));
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    // Click Cancel to close
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByPlaceholderText("Commit message...")).not.toBeInTheDocument();
  });

  it("calls gitCommit and onRefresh on commit confirm", async () => {
    const { gitCommit } = await import("../hooks/useTauri");
    const onRefresh = vi.fn();
    const onLog = vi.fn();
    renderPanel({
      git: makeGitState({ dirty: true }),
      onRefresh,
      onLog,
    });
    fireEvent.click(screen.getByText("Commit"));
    const input = screen.getByPlaceholderText("Commit message...");
    fireEvent.change(input, { target: { value: "fix: timing constraint" } });
    fireEvent.click(screen.getByText("Confirm"));
    await waitFor(() => {
      expect(gitCommit).toHaveBeenCalledWith("/test/project", "fix: timing constraint");
    });
  });

  it("calls gitPull and onRefresh on Pull click", async () => {
    const { gitPull } = await import("../hooks/useTauri");
    const onRefresh = vi.fn();
    renderPanel({ onRefresh });
    fireEvent.click(screen.getByText("Pull"));
    await waitFor(() => {
      expect(gitPull).toHaveBeenCalledWith("/test/project");
    });
  });

  it("calls gitPush on Push click when ahead > 0", async () => {
    const { gitPush } = await import("../hooks/useTauri");
    const onRefresh = vi.fn();
    renderPanel({ git: makeGitState({ ahead: 1 }), onRefresh });
    const pushBtn = screen.getAllByText((_content, el) =>
      !!el?.textContent?.includes("Push") && el?.tagName === "BUTTON"
    )[0];
    fireEvent.click(pushBtn);
    await waitFor(() => {
      expect(gitPush).toHaveBeenCalledWith("/test/project");
    });
  });

  // ── Branches Section ──
  it("shows Branches collapsible section", () => {
    renderPanel();
    expect(screen.getByText("Branches")).toBeInTheDocument();
  });

  it("loads branches when expanded and shows them", async () => {
    const { gitListBranches } = await import("../hooks/useTauri");
    (gitListBranches as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: "main", isCurrent: true, isRemote: false, ahead: 0, behind: 0, lastCommitHash: "abc1234def", lastCommitMsg: "Initial", lastCommitTime: "2h ago" },
      { name: "dev", isCurrent: false, isRemote: false, ahead: 1, behind: 0, lastCommitHash: "bbb2222ddd", lastCommitMsg: "Feature", lastCommitTime: "1h ago" },
    ]);
    renderPanel();
    // Branches section is expanded by default, triggers load
    await waitFor(() => {
      expect(gitListBranches).toHaveBeenCalledWith("/test/project");
    });
    await waitFor(() => {
      expect(screen.getByText("CURRENT")).toBeInTheDocument();
    });
  });

  it("shows Checkout button for non-current branches", async () => {
    const { gitListBranches } = await import("../hooks/useTauri");
    (gitListBranches as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: "main", isCurrent: true, isRemote: false, ahead: 0, behind: 0, lastCommitHash: "abc1234def", lastCommitMsg: "Init", lastCommitTime: "2h" },
      { name: "feature", isCurrent: false, isRemote: false, ahead: 0, behind: 0, lastCommitHash: "bbb2222ddd", lastCommitMsg: "WIP", lastCommitTime: "1h" },
    ]);
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Checkout")).toBeInTheDocument();
    });
  });

  // ── Tags Section ──
  it("shows Tags section collapsed by default", () => {
    renderPanel({ git: makeGitState({ tags: ["v0.1.0", "v0.2.0"] }) });
    expect(screen.getByText("Tags")).toBeInTheDocument();
  });

  it("loads tags when Tags section is expanded", async () => {
    const { gitListTags } = await import("../hooks/useTauri");
    (gitListTags as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: "v1.0.0", targetHash: "aaa1111bbb", message: "Release 1.0", tagger: "Dev", timeAgo: "1 week ago" },
    ]);
    renderPanel({ git: makeGitState({ tags: ["v1.0.0"] }) });
    // Click Tags header to expand
    fireEvent.click(screen.getByText("Tags"));
    await waitFor(() => {
      expect(screen.getByText("v1.0.0")).toBeInTheDocument();
    });
  });

  // ── Graph & Commit Log ──
  it("shows Graph section collapsed by default", () => {
    renderPanel({
      git: makeGitState({
        recentCommits: [
          { hash: "abc1234", msg: "feat: add counter", author: "Dev", time: "1h" },
        ],
      }),
    });
    expect(screen.getByText("Graph")).toBeInTheDocument();
  });

  it("shows Commit Log section collapsed by default", () => {
    renderPanel({
      git: makeGitState({
        recentCommits: [
          { hash: "abc1234", msg: "Initial commit", author: "Dev", time: "2h" },
        ],
      }),
    });
    expect(screen.getByText("Commit Log")).toBeInTheDocument();
  });

  it("expands Commit Log and shows commits", () => {
    renderPanel({
      git: makeGitState({
        recentCommits: [
          { hash: "abc1234", msg: "Add UART module", author: "Dev", time: "1h" },
          { hash: "def5678", msg: "Fix timing", author: "Dev", time: "2h" },
        ],
      }),
    });
    fireEvent.click(screen.getByText("Commit Log"));
    expect(screen.getAllByText("abc1234").length).toBeGreaterThan(0);
    expect(screen.getAllByText("def5678").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Add UART module").length).toBeGreaterThan(0);
  });

  it("marks first N commits as LOCAL when ahead > 0", () => {
    renderPanel({
      git: makeGitState({
        ahead: 1,
        recentCommits: [
          { hash: "abc1234", msg: "New commit", author: "Dev", time: "1h" },
          { hash: "def5678", msg: "Old commit", author: "Dev", time: "2h" },
        ],
      }),
    });
    fireEvent.click(screen.getByText("Commit Log"));
    // LOCAL badge should be present for the first commit
    expect(screen.getAllByText("LOCAL").length).toBeGreaterThan(0);
  });

  it("shows 'No commits yet' when recentCommits is empty", () => {
    renderPanel({
      git: makeGitState({ recentCommits: [] }),
    });
    // Expand Graph
    fireEvent.click(screen.getByText("Graph"));
    expect(screen.getByText("No commits yet")).toBeInTheDocument();
  });

  // ── Refresh ──
  it("calls onRefresh when refresh button is clicked", () => {
    const onRefresh = vi.fn();
    renderPanel({ onRefresh });
    fireEvent.click(screen.getByTitle("Refresh git status"));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
