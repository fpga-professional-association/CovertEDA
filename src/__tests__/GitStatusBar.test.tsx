import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme, makeGitState } from "../test/helpers";
import GitStatusBar from "../components/GitStatusBar";
import type { GitState } from "../types";

function renderGitBar(overrides: {
  git?: GitState | null;
  projectName?: string;
  gitExpanded?: boolean;
  setGitExpanded?: (v: boolean | ((p: boolean) => boolean)) => void;
  onRefresh?: () => void;
  onCommit?: () => void;
} = {}) {
  const defaults = {
    git: makeGitState(),
    projectName: "test-project",
    gitExpanded: false,
    setGitExpanded: vi.fn(),
    onRefresh: vi.fn(),
    onCommit: vi.fn(),
  };
  const props = { ...defaults, ...overrides };
  return { ...renderWithTheme(<GitStatusBar {...props} />), props };
}

describe("GitStatusBar", () => {
  it("shows branch name and commit hash", () => {
    renderGitBar({ git: makeGitState({ branch: "feature/timer", commit: "f3a9b12" }) });
    expect(screen.getByText("feature/timer")).toBeInTheDocument();
    expect(screen.getByText("f3a9b12")).toBeInTheDocument();
  });

  it("shows ahead/behind counts when non-zero", () => {
    renderGitBar({ git: makeGitState({ ahead: 3, behind: 1 }) });
    // Component renders: {"\u2191"}{git.ahead} inside a span, and {"\u2193"}{git.behind}
    expect(screen.getByText((_content, el) =>
      el?.tagName === "SPAN" && el?.textContent === "\u21913" || false
    )).toBeInTheDocument();
    expect(screen.getByText((_content, el) =>
      el?.tagName === "SPAN" && el?.textContent === "\u21931" || false
    )).toBeInTheDocument();
  });

  it("shows dirty indicators when dirty is true", () => {
    renderGitBar({
      git: makeGitState({ dirty: true, staged: 2, unstaged: 3, untracked: 1 }),
    });
    expect(screen.getByText("+2 staged")).toBeInTheDocument();
    expect(screen.getByText("~3 modified")).toBeInTheDocument();
    expect(screen.getByText("?1 untracked")).toBeInTheDocument();
  });

  it("calls onRefresh when refresh button is clicked", () => {
    const onRefresh = vi.fn();
    renderGitBar({ onRefresh });
    const refreshBtn = screen.getByTitle("Refresh git status");
    fireEvent.click(refreshBtn);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows fallback message when git is null", () => {
    renderGitBar({ git: null });
    expect(screen.getByText("No git repository detected")).toBeInTheDocument();
    expect(screen.queryByText("main")).not.toBeInTheDocument();
  });
});
