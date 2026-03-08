import { useState, useEffect, useCallback, useRef } from "react";
import { useTheme } from "../context/ThemeContext";
import { Btn, Badge, HoverRow } from "./shared";
import { Refresh, Branch, Git } from "./Icons";
import type { GitState } from "../types";
import { gitListBranches, gitListTags, gitPull, gitPush, gitCommit } from "../hooks/useTauri";

// ── Inject CSS for pulsing pull button ──
if (typeof document !== "undefined" && !document.getElementById("ceda-git-panel")) {
  const style = document.createElement("style");
  style.id = "ceda-git-panel";
  style.textContent = `
    @keyframes cedaPulse {
      0%, 100% { border-color: var(--ceda-pulse-color); }
      50% { border-color: transparent; }
    }
    .ceda-pulse-border {
      animation: cedaPulse 2s ease-in-out infinite;
    }
  `;
  document.head.appendChild(style);
}

interface BranchInfo {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  ahead: number;
  behind: number;
  lastCommitHash: string;
  lastCommitMsg: string;
  lastCommitTime: string;
}

interface TagInfo {
  name: string;
  targetHash: string;
  message: string | null;
  tagger: string | null;
  timeAgo: string | null;
}

interface GitPanelProps {
  git: GitState | null;
  projectDir?: string;
  onRefresh: () => void;
  onLog: (msg: string, type?: "info" | "ok" | "err" | "warn") => void;
}

export default function GitPanel({ git, projectDir, onRefresh, onLog }: GitPanelProps) {
  const { C, MONO, SANS } = useTheme();

  // ── State ──
  const [commitMode, setCommitMode] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pushing, setPushing] = useState(false);

  // Lazy-loaded data
  const [branches, setBranches] = useState<BranchInfo[] | null>(null);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchesExpanded, setBranchesExpanded] = useState(true);
  const [branchesLoaded, setBranchesLoaded] = useState(false);

  const [tags, setTags] = useState<TagInfo[] | null>(null);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [tagsLoaded, setTagsLoaded] = useState(false);

  const [logExpanded, setLogExpanded] = useState(false);
  const [graphExpanded, setGraphExpanded] = useState(false);

  const commitInputRef = useRef<HTMLInputElement>(null);

  // ── Load branches on first expand ──
  useEffect(() => {
    if (branchesExpanded && !branchesLoaded && projectDir && git) {
      setBranchesLoading(true);
      gitListBranches(projectDir)
        .then((data: BranchInfo[]) => {
          setBranches(data);
          setBranchesLoaded(true);
        })
        .catch(() => {
          setBranches([]);
          setBranchesLoaded(true);
        })
        .finally(() => setBranchesLoading(false));
    }
  }, [branchesExpanded, branchesLoaded, projectDir, git]);

  // ── Load tags on first expand ──
  useEffect(() => {
    if (tagsExpanded && !tagsLoaded && projectDir && git) {
      setTagsLoading(true);
      gitListTags(projectDir)
        .then((data: TagInfo[]) => {
          setTags(data);
          setTagsLoaded(true);
        })
        .catch(() => {
          setTags([]);
          setTagsLoaded(true);
        })
        .finally(() => setTagsLoading(false));
    }
  }, [tagsExpanded, tagsLoaded, projectDir, git]);

  // ── Focus commit input ──
  useEffect(() => {
    if (commitMode && commitInputRef.current) {
      commitInputRef.current.focus();
    }
  }, [commitMode]);

  // ── Actions ──
  const handleCommit = useCallback(async () => {
    if (!projectDir || !commitMsg.trim()) return;
    setCommitting(true);
    try {
      await gitCommit(projectDir, commitMsg.trim());
      onLog(`Committed: "${commitMsg.trim()}"`, "ok");
      setCommitMsg("");
      setCommitMode(false);
      onRefresh();
    } catch (err) {
      onLog(`Commit failed: ${err instanceof Error ? err.message : String(err)}`, "err");
    } finally {
      setCommitting(false);
    }
  }, [projectDir, commitMsg, onLog, onRefresh]);

  const handlePull = useCallback(async () => {
    if (!projectDir) return;
    setPulling(true);
    try {
      await gitPull(projectDir);
      onLog("Pull successful", "ok");
      onRefresh();
    } catch (err) {
      onLog(`Pull failed: ${err instanceof Error ? err.message : String(err)}`, "err");
    } finally {
      setPulling(false);
    }
  }, [projectDir, onLog, onRefresh]);

  const handlePush = useCallback(async () => {
    if (!projectDir) return;
    setPushing(true);
    try {
      await gitPush(projectDir);
      onLog("Push successful", "ok");
      onRefresh();
    } catch (err) {
      onLog(`Push failed: ${err instanceof Error ? err.message : String(err)}`, "err");
    } finally {
      setPushing(false);
    }
  }, [projectDir, onLog, onRefresh]);

  const handleCheckout = useCallback(async (branchName: string) => {
    if (!projectDir) return;
    try {
      // Use the invoke directly since gitCheckout is not in useTauri yet
      const { invoke } = await import("../hooks/useTauri");
      await invoke("git_checkout", { projectDir, branch: branchName });
      onLog(`Switched to branch: ${branchName}`, "ok");
      setBranchesLoaded(false);
      onRefresh();
    } catch (err) {
      onLog(`Checkout failed: ${err instanceof Error ? err.message : String(err)}`, "err");
    }
  }, [projectDir, onLog, onRefresh]);

  // ── No git state ──
  if (!git) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          background: C.s1,
          fontFamily: SANS,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px",
            borderBottom: `1px solid ${C.b1}`,
            flexShrink: 0,
          }}
        >
          <span style={{ display: "flex", color: C.t3 }}><Git /></span>
          <span style={{ fontSize: 12, fontFamily: MONO, fontWeight: 700, color: C.t1 }}>
            Git
          </span>
          <div style={{ flex: 1 }} />
          <span
            onClick={onRefresh}
            title="Refresh git status"
            style={{ cursor: "pointer", color: C.t3, display: "flex", alignItems: "center" }}
          >
            <Refresh size={11} />
          </span>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <span style={{ fontSize: 10, fontFamily: MONO, color: C.t3, textAlign: "center" }}>
            No git repository detected
          </span>
        </div>
      </div>
    );
  }

  const localBranches = branches?.filter((b) => !b.isRemote) ?? [];
  const remoteBranches = branches?.filter((b) => b.isRemote) ?? [];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: C.s1,
        fontFamily: SANS,
        overflow: "hidden",
      }}
    >
      {/* ══════════ Header ══════════ */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderBottom: `1px solid ${C.b1}`,
          flexShrink: 0,
        }}
      >
        <span style={{ display: "flex", color: C.t3 }}><Git /></span>
        <span style={{ fontSize: 12, fontFamily: MONO, fontWeight: 700, color: C.t1 }}>
          Git
        </span>
        <div style={{ flex: 1 }} />
        <span
          onClick={onRefresh}
          title="Refresh git status"
          style={{ cursor: "pointer", color: C.t3, display: "flex", alignItems: "center" }}
        >
          <Refresh size={11} />
        </span>
      </div>

      {/* ══════════ Scrollable Body ══════════ */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {/* ──── Current Branch ──── */}
        <div
          style={{
            padding: "10px 12px",
            borderBottom: `1px solid ${C.b1}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "flex", color: C.accent }}><Branch /></span>
            <span
              style={{
                fontSize: 14,
                fontFamily: MONO,
                fontWeight: 700,
                color: C.accent,
                letterSpacing: -0.3,
              }}
            >
              {git.branch}
            </span>
            {git.ahead > 0 && (
              <Badge color={C.ok} title={`${git.ahead} commit${git.ahead === 1 ? "" : "s"} ahead of remote`}>
                {"\u2191"}{git.ahead}
              </Badge>
            )}
            {git.behind > 0 && (
              <Badge color={C.err} title={`${git.behind} commit${git.behind === 1 ? "" : "s"} behind remote`}>
                {"\u2193"}{git.behind}
              </Badge>
            )}
          </div>
          {git.behind > 0 && (
            <div
              style={{
                marginTop: 6,
                padding: "4px 8px",
                borderRadius: 4,
                background: `${C.warn}14`,
                border: `1px solid ${C.warn}33`,
                fontSize: 9,
                fontFamily: MONO,
                color: C.warn,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 10 }}>{"\u26A0"}</span>
              Branch is {git.behind} commit{git.behind === 1 ? "" : "s"} behind remote — pull recommended
            </div>
          )}
        </div>

        {/* ──── Status Section ──── */}
        <div
          style={{
            padding: "8px 12px",
            borderBottom: `1px solid ${C.b1}`,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {git.dirty ? (
            <>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  background: C.warn,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 9, fontFamily: MONO, color: C.warn, fontWeight: 600 }}>
                Dirty
              </span>
              {git.staged > 0 && (
                <Badge color={C.ok} title={`${git.staged} staged`}>+{git.staged} staged</Badge>
              )}
              {git.unstaged > 0 && (
                <Badge color={C.warn} title={`${git.unstaged} modified`}>~{git.unstaged} modified</Badge>
              )}
              {git.untracked > 0 && (
                <Badge color={C.orange} title={`${git.untracked} untracked`}>?{git.untracked} untracked</Badge>
              )}
            </>
          ) : (
            <>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  background: C.ok,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 9, fontFamily: MONO, color: C.ok, fontWeight: 600 }}>
                Clean
              </span>
            </>
          )}
        </div>

        {/* ──── Last Commit ──── */}
        <div
          style={{
            padding: "8px 12px",
            borderBottom: `1px solid ${C.b1}`,
          }}
        >
          <div
            style={{
              fontSize: 8,
              fontFamily: MONO,
              fontWeight: 700,
              color: C.t3,
              letterSpacing: 0.8,
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Last Commit
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 10,
                fontWeight: 700,
                color: C.accent,
                letterSpacing: 0.3,
              }}
              title={`Full hash: ${git.commit}`}
            >
              {git.commit}
            </span>
            <span style={{ fontSize: 9, fontFamily: MONO, color: C.t3 }}>
              {git.time}
            </span>
          </div>
          <div
            style={{
              fontSize: 10,
              fontFamily: SANS,
              color: C.t1,
              lineHeight: 1.4,
              marginBottom: 2,
            }}
          >
            {git.commitMsg}
          </div>
          <div style={{ fontSize: 9, fontFamily: MONO, color: C.t3 }}>
            {git.author}
          </div>
        </div>

        {/* ──── Actions Bar ──── */}
        <div
          style={{
            padding: "8px 12px",
            borderBottom: `1px solid ${C.b1}`,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", gap: 6 }}>
            <Btn
              small
              disabled={!git.dirty}
              onClick={() => {
                if (commitMode) {
                  setCommitMode(false);
                  setCommitMsg("");
                } else {
                  setCommitMode(true);
                }
              }}
              style={{
                flex: 1,
                justifyContent: "center",
                color: git.dirty ? C.ok : undefined,
                borderColor: git.dirty ? `${C.ok}44` : undefined,
              }}
              title={git.dirty ? "Commit staged changes" : "No changes to commit"}
            >
              {commitMode ? "Cancel" : "Commit"}
            </Btn>
            <Btn
              small
              onClick={handlePull}
              disabled={pulling}
              style={{
                ["--ceda-pulse-color" as string]: C.warn,
                flex: 1,
                justifyContent: "center",
                ...(git.behind > 0
                  ? {
                      color: C.warn,
                      borderColor: C.warn,
                      animation: "cedaPulse 2s ease-in-out infinite",
                    }
                  : {}),
              }}
              title={
                git.behind > 0
                  ? `Pull ${git.behind} commit${git.behind === 1 ? "" : "s"} from remote`
                  : "Pull from remote"
              }
            >
              {pulling ? "Pulling\u2026" : "Pull"}
              {git.behind > 0 && ` \u2193${git.behind}`}
            </Btn>
            <Btn
              small
              onClick={handlePush}
              disabled={pushing || git.ahead === 0}
              style={{
                flex: 1,
                justifyContent: "center",
                ...(git.ahead > 0
                  ? { color: C.accent, borderColor: `${C.accent}44` }
                  : {}),
              }}
              title={
                git.ahead > 0
                  ? `Push ${git.ahead} commit${git.ahead === 1 ? "" : "s"} to remote`
                  : "Nothing to push"
              }
            >
              {pushing ? "Pushing\u2026" : "Push"}
              {git.ahead > 0 && ` \u2191${git.ahead}`}
            </Btn>
          </div>

          {/* Commit inline input */}
          {commitMode && (
            <div style={{ display: "flex", gap: 6 }}>
              <input
                ref={commitInputRef}
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && commitMsg.trim()) handleCommit();
                  if (e.key === "Escape") {
                    setCommitMode(false);
                    setCommitMsg("");
                  }
                }}
                placeholder="Commit message..."
                disabled={committing}
                style={{
                  flex: 1,
                  padding: "5px 8px",
                  borderRadius: 4,
                  border: `1px solid ${C.b1}`,
                  background: C.bg,
                  color: C.t1,
                  fontFamily: MONO,
                  fontSize: 10,
                  outline: "none",
                }}
              />
              <Btn
                small
                primary
                disabled={!commitMsg.trim() || committing}
                onClick={handleCommit}
                title="Confirm commit"
              >
                {committing ? "..." : "Confirm"}
              </Btn>
            </div>
          )}
        </div>

        {/* ──── Branches Section ──── */}
        <div style={{ borderBottom: `1px solid ${C.b1}` }}>
          <div
            onClick={() => setBranchesExpanded((p) => !p)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              cursor: "pointer",
              userSelect: "none",
              fontSize: 8,
              fontFamily: MONO,
              fontWeight: 700,
              color: C.t3,
              letterSpacing: 0.8,
              textTransform: "uppercase",
            }}
          >
            <span style={{ fontSize: 6, color: C.t3, width: 8, textAlign: "center" }}>
              {branchesExpanded ? "\u25BC" : "\u25B6"}
            </span>
            Branches
            {localBranches.length > 0 && (
              <Badge color={C.t3} style={{ fontSize: 7, marginLeft: 2 }}>
                {localBranches.length}
              </Badge>
            )}
          </div>
          {branchesExpanded && (
            <div style={{ padding: "0 0 4px 0" }}>
              {branchesLoading ? (
                <div style={{ padding: "8px 12px", fontSize: 9, fontFamily: MONO, color: C.t3 }}>
                  Loading branches...
                </div>
              ) : branches === null ? (
                <div style={{ padding: "8px 12px", fontSize: 9, fontFamily: MONO, color: C.t3 }}>
                  No branch data
                </div>
              ) : (
                <>
                  {/* Local branches */}
                  {localBranches.length > 0 && (
                    <div>
                      <div
                        style={{
                          padding: "3px 12px 3px 26px",
                          fontSize: 7,
                          fontFamily: MONO,
                          fontWeight: 600,
                          color: C.t3,
                          letterSpacing: 0.5,
                          textTransform: "uppercase",
                          opacity: 0.7,
                        }}
                      >
                        Local
                      </div>
                      {localBranches.map((b) => (
                        <HoverRow
                          key={b.name}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "4px 12px 4px 26px",
                            fontSize: 9,
                            fontFamily: MONO,
                            background: b.isCurrent ? `${C.accent}10` : undefined,
                          }}
                        >
                          <span style={{ display: "flex", color: b.isCurrent ? C.accent : C.t3, flexShrink: 0 }}>
                            <Branch />
                          </span>
                          <span
                            style={{
                              color: b.isCurrent ? C.accent : C.t1,
                              fontWeight: b.isCurrent ? 700 : 400,
                              flex: 1,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {b.name}
                          </span>
                          {b.isCurrent && (
                            <Badge color={C.accent} style={{ fontSize: 7 }}>CURRENT</Badge>
                          )}
                          {b.ahead > 0 && (
                            <Badge color={C.ok} style={{ fontSize: 7 }}>{"\u2191"}{b.ahead}</Badge>
                          )}
                          {b.behind > 0 && (
                            <Badge color={C.err} style={{ fontSize: 7 }}>{"\u2193"}{b.behind}</Badge>
                          )}
                          <span
                            style={{
                              fontSize: 8,
                              color: C.t3,
                              fontFamily: MONO,
                              flexShrink: 0,
                            }}
                            title={b.lastCommitMsg}
                          >
                            {b.lastCommitHash.slice(0, 7)}
                          </span>
                          {!b.isCurrent && (
                            <Btn
                              small
                              onClick={() => handleCheckout(b.name)}
                              style={{ padding: "1px 5px", fontSize: 7 }}
                              title={`Switch to branch ${b.name}`}
                            >
                              Checkout
                            </Btn>
                          )}
                        </HoverRow>
                      ))}
                    </div>
                  )}

                  {/* Remote branches */}
                  {remoteBranches.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <div
                        style={{
                          padding: "3px 12px 3px 26px",
                          fontSize: 7,
                          fontFamily: MONO,
                          fontWeight: 600,
                          color: C.t3,
                          letterSpacing: 0.5,
                          textTransform: "uppercase",
                          opacity: 0.7,
                        }}
                      >
                        Remote
                      </div>
                      {remoteBranches.map((b) => (
                        <HoverRow
                          key={b.name}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "4px 12px 4px 26px",
                            fontSize: 9,
                            fontFamily: MONO,
                          }}
                        >
                          <span style={{ display: "flex", color: C.t3, flexShrink: 0 }}>
                            <Branch />
                          </span>
                          <span
                            style={{
                              color: C.t2,
                              flex: 1,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {b.name}
                          </span>
                          <span
                            style={{
                              fontSize: 8,
                              color: C.t3,
                              fontFamily: MONO,
                              flexShrink: 0,
                            }}
                            title={b.lastCommitMsg}
                          >
                            {b.lastCommitHash.slice(0, 7)}
                          </span>
                          <span
                            style={{
                              fontSize: 8,
                              color: C.t3,
                              fontFamily: MONO,
                              flexShrink: 0,
                            }}
                          >
                            {b.lastCommitTime}
                          </span>
                        </HoverRow>
                      ))}
                    </div>
                  )}

                  {localBranches.length === 0 && remoteBranches.length === 0 && (
                    <div style={{ padding: "8px 12px", fontSize: 9, fontFamily: MONO, color: C.t3 }}>
                      No branches found
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* ──── Tags Section ──── */}
        <div style={{ borderBottom: `1px solid ${C.b1}` }}>
          <div
            onClick={() => setTagsExpanded((p) => !p)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              cursor: "pointer",
              userSelect: "none",
              fontSize: 8,
              fontFamily: MONO,
              fontWeight: 700,
              color: C.t3,
              letterSpacing: 0.8,
              textTransform: "uppercase",
            }}
          >
            <span style={{ fontSize: 6, color: C.t3, width: 8, textAlign: "center" }}>
              {tagsExpanded ? "\u25BC" : "\u25B6"}
            </span>
            Tags
            {git.tags.length > 0 && (
              <Badge color={C.cyan} style={{ fontSize: 7, marginLeft: 2 }}>
                {git.tags.length}
              </Badge>
            )}
          </div>
          {tagsExpanded && (
            <div style={{ padding: "0 0 4px 0" }}>
              {tagsLoading ? (
                <div style={{ padding: "8px 12px", fontSize: 9, fontFamily: MONO, color: C.t3 }}>
                  Loading tags...
                </div>
              ) : tags === null || tags.length === 0 ? (
                <div style={{ padding: "8px 12px", fontSize: 9, fontFamily: MONO, color: C.t3 }}>
                  {tags === null ? "No tag data" : "No tags"}
                </div>
              ) : (
                tags.map((tag) => (
                  <HoverRow
                    key={tag.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 12px 4px 26px",
                      fontSize: 9,
                      fontFamily: MONO,
                    }}
                  >
                    <Badge color={C.cyan} style={{ fontSize: 8 }}>{tag.name}</Badge>
                    <span
                      style={{
                        color: C.t3,
                        fontSize: 8,
                        fontFamily: MONO,
                        flexShrink: 0,
                      }}
                    >
                      {tag.targetHash.slice(0, 7)}
                    </span>
                    {tag.message && (
                      <span
                        style={{
                          color: C.t2,
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontSize: 9,
                        }}
                      >
                        {tag.message}
                      </span>
                    )}
                    {tag.tagger && (
                      <span style={{ color: C.t3, fontSize: 8, flexShrink: 0 }}>
                        {tag.tagger}
                      </span>
                    )}
                    {tag.timeAgo && (
                      <span style={{ color: C.t3, fontSize: 8, flexShrink: 0 }}>
                        {tag.timeAgo}
                      </span>
                    )}
                  </HoverRow>
                ))
              )}
            </div>
          )}
        </div>

        {/* ──── Git Graph Section ──── */}
        <div style={{ borderBottom: `1px solid ${C.b1}` }}>
          <div
            onClick={() => setGraphExpanded((p) => !p)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              cursor: "pointer",
              userSelect: "none",
              fontSize: 8,
              fontFamily: MONO,
              fontWeight: 700,
              color: C.t3,
              letterSpacing: 0.8,
              textTransform: "uppercase",
            }}
          >
            <span style={{ fontSize: 6, color: C.t3, width: 8, textAlign: "center" }}>
              {graphExpanded ? "\u25BC" : "\u25B6"}
            </span>
            Graph
            {git.recentCommits.length > 0 && (
              <Badge color={C.t3} style={{ fontSize: 7, marginLeft: 2 }}>
                {git.recentCommits.length}
              </Badge>
            )}
          </div>
          {graphExpanded && (
            <div style={{ maxHeight: 300, overflowY: "auto", padding: "0 0 4px 0" }}>
              {git.recentCommits.length === 0 ? (
                <div style={{ padding: "12px", fontSize: 9, fontFamily: MONO, color: C.t3, textAlign: "center" }}>
                  No commits yet
                </div>
              ) : (
                git.recentCommits.map((c, i) => {
                  const isLocal = i < git.ahead;
                  const isFirst = i === 0;
                  const isLast = i === git.recentCommits.length - 1;
                  const nodeColor = isLocal ? C.ok : C.accent;
                  return (
                    <div
                      key={`graph-${c.hash}-${i}`}
                      style={{
                        display: "flex",
                        alignItems: "stretch",
                        fontSize: 9,
                        fontFamily: MONO,
                      }}
                    >
                      {/* Graph column */}
                      <div style={{
                        width: 28,
                        flexShrink: 0,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        position: "relative",
                      }}>
                        {/* Line above node */}
                        {!isFirst && (
                          <div style={{
                            width: 2,
                            flex: 1,
                            background: C.t3,
                            opacity: 0.3,
                          }} />
                        )}
                        {isFirst && <div style={{ flex: 1 }} />}
                        {/* Node */}
                        <div style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          background: nodeColor,
                          flexShrink: 0,
                          border: `1.5px solid ${nodeColor}`,
                          boxShadow: isFirst ? `0 0 4px ${nodeColor}60` : "none",
                        }} />
                        {/* Line below node */}
                        {!isLast && (
                          <div style={{
                            width: 2,
                            flex: 1,
                            background: C.t3,
                            opacity: 0.3,
                          }} />
                        )}
                        {isLast && <div style={{ flex: 1 }} />}
                      </div>
                      {/* Commit info */}
                      <div style={{
                        flex: 1,
                        padding: "4px 8px 4px 0",
                        display: "flex",
                        flexDirection: "column",
                        gap: 1,
                        minWidth: 0,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ color: nodeColor, fontWeight: 700, fontSize: 8, flexShrink: 0 }}>
                            {c.hash}
                          </span>
                          <span style={{
                            color: C.t1,
                            flex: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontFamily: SANS,
                            fontSize: 9,
                          }}>
                            {c.msg}
                          </span>
                          {isLocal && (
                            <Badge color={C.ok} style={{ fontSize: 6 }}>LOCAL</Badge>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 8, fontSize: 7, color: C.t3 }}>
                          <span>{c.author}</span>
                          <span>{c.time}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* ──── Commit Log Section ──── */}
        <div style={{ borderBottom: `1px solid ${C.b1}` }}>
          <div
            onClick={() => setLogExpanded((p) => !p)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              cursor: "pointer",
              userSelect: "none",
              fontSize: 8,
              fontFamily: MONO,
              fontWeight: 700,
              color: C.t3,
              letterSpacing: 0.8,
              textTransform: "uppercase",
            }}
          >
            <span style={{ fontSize: 6, color: C.t3, width: 8, textAlign: "center" }}>
              {logExpanded ? "\u25BC" : "\u25B6"}
            </span>
            Commit Log
            {git.recentCommits.length > 0 && (
              <Badge color={C.t3} style={{ fontSize: 7, marginLeft: 2 }}>
                {git.recentCommits.length}
              </Badge>
            )}
          </div>
          {logExpanded && (
            <div
              style={{
                maxHeight: 320,
                overflowY: "auto",
                padding: "0 0 4px 0",
              }}
            >
              {git.recentCommits.length === 0 ? (
                <div
                  style={{
                    padding: "12px",
                    fontSize: 9,
                    fontFamily: MONO,
                    color: C.t3,
                    textAlign: "center",
                  }}
                >
                  No commits yet
                </div>
              ) : (
                git.recentCommits.map((c, i) => (
                  <HoverRow
                    key={`${c.hash}-${i}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "5px 12px 5px 26px",
                      fontSize: 9,
                      fontFamily: MONO,
                      borderBottom: `1px solid ${C.b1}08`,
                    }}
                  >
                    <span
                      style={{
                        color: i < git.ahead ? C.ok : C.accent,
                        fontWeight: 700,
                        width: 50,
                        flexShrink: 0,
                        fontFamily: MONO,
                      }}
                    >
                      {c.hash}
                    </span>
                    <span
                      style={{
                        color: C.t1,
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontFamily: SANS,
                        fontSize: 10,
                      }}
                    >
                      {c.msg}
                    </span>
                    <span
                      style={{
                        color: C.t3,
                        flexShrink: 0,
                        fontSize: 8,
                      }}
                    >
                      {c.author}
                    </span>
                    <span
                      style={{
                        color: C.t3,
                        flexShrink: 0,
                        fontSize: 8,
                        width: 32,
                        textAlign: "right",
                      }}
                    >
                      {c.time}
                    </span>
                    {i < git.ahead && (
                      <Badge color={C.ok} style={{ fontSize: 7 }}>LOCAL</Badge>
                    )}
                  </HoverRow>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
