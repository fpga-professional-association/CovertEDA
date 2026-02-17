import { C, MONO, GitState } from "../types";
import { Badge, Btn, HoverRow } from "./shared";
import { Branch, Git } from "./Icons";

interface GitStatusBarProps {
  git: GitState;
  gitExpanded: boolean;
  setGitExpanded: (v: boolean | ((p: boolean) => boolean)) => void;
}

export default function GitStatusBar({
  git,
  gitExpanded,
  setGitExpanded,
}: GitStatusBarProps) {
  return (
    <>
      {/* ══════════════ GIT STATUS BAR ══════════════ */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 28,
          padding: "0 12px",
          background: "#080a10",
          borderBottom: `1px solid ${C.b1}`,
          gap: 8,
          fontSize: 9,
          fontFamily: MONO,
          flexShrink: 0,
        }}
      >
        <span style={{ display: "flex", color: C.t3 }}>
          <Branch />
        </span>
        <span
          style={{ color: C.accent, fontWeight: 700, cursor: "pointer" }}
          onClick={() => setGitExpanded((p: boolean) => !p)}
        >
          {git.branch}
        </span>
        {git.tags.length > 0 && (
          <Badge color={C.cyan} style={{ fontSize: 8 }}>
            {git.tags[0]}
          </Badge>
        )}
        <span style={{ color: C.t3, opacity: 0.4 }}>│</span>
        <span style={{ color: C.t3 }}>{git.commit}</span>
        <span
          style={{
            color: C.t2,
            maxWidth: 240,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          "{git.commitMsg}"
        </span>
        <span style={{ color: C.t3 }}>— {git.time}</span>
        <span style={{ color: C.t3, opacity: 0.4 }}>│</span>
        {git.ahead > 0 && <span style={{ color: C.ok }}>↑{git.ahead}</span>}
        {git.behind > 0 && (
          <span style={{ color: C.warn }}>↓{git.behind}</span>
        )}
        {git.ahead === 0 && git.behind === 0 && (
          <span style={{ color: C.t3 }}>in sync</span>
        )}
        <span style={{ color: C.t3, opacity: 0.4 }}>│</span>
        {git.dirty ? (
          <>
            {git.staged > 0 && (
              <span style={{ color: C.ok }}>+{git.staged} staged</span>
            )}
            {git.unstaged > 0 && (
              <span style={{ color: C.warn }}>~{git.unstaged} modified</span>
            )}
            {git.untracked > 0 && (
              <span style={{ color: C.orange }}>
                ?{git.untracked} untracked
              </span>
            )}
          </>
        ) : (
          <span style={{ color: C.ok }}>✓ clean</span>
        )}
        {git.stashes > 0 && (
          <>
            <span style={{ color: C.t3, opacity: 0.4 }}>│</span>
            <span style={{ color: C.purple }}>{git.stashes} stash</span>
          </>
        )}
        <div style={{ flex: 1 }} />
        <Btn small style={{ padding: "1px 6px", fontSize: 8 }}>
          Pull
        </Btn>
        <Btn small style={{ padding: "1px 6px", fontSize: 8 }}>
          Push ↑{git.ahead}
        </Btn>
        <Btn small style={{ padding: "1px 6px", fontSize: 8 }}>
          Stash
        </Btn>
      </div>

      {/* Git commit log dropdown */}
      {gitExpanded && (
        <div
          onClick={() => setGitExpanded(false)}
          style={{ position: "fixed", inset: 0, zIndex: 700 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: 28,
              left: 80,
              width: 520,
              background: C.s1,
              border: `1px solid ${C.b2}`,
              borderRadius: 8,
              overflow: "hidden",
              boxShadow: "0 12px 40px rgba(0,0,0,.5)",
              animation: "slideDown .12s ease",
              zIndex: 701,
            }}
          >
            <div
              style={{
                padding: "10px 14px",
                fontSize: 10,
                fontFamily: MONO,
                fontWeight: 700,
                color: C.t3,
                borderBottom: `1px solid ${C.b1}`,
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              <Git />
              RECENT COMMITS — {git.branch}
              <div style={{ flex: 1 }} />
              <Badge color={C.ok}>↑{git.ahead} ahead</Badge>
            </div>
            {git.recentCommits.map((c, i) => (
              <HoverRow
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 14px",
                  borderBottom: `1px solid ${C.b1}`,
                  fontSize: 10,
                  fontFamily: MONO,
                }}
              >
                <span
                  style={{
                    color: i < git.ahead ? C.ok : C.accent,
                    fontWeight: 700,
                    width: 56,
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
                  }}
                >
                  {c.msg}
                </span>
                <span style={{ color: C.t3, flexShrink: 0 }}>{c.author}</span>
                <span
                  style={{
                    color: C.t3,
                    flexShrink: 0,
                    width: 28,
                    textAlign: "right",
                  }}
                >
                  {c.time}
                </span>
                {i < git.ahead && (
                  <Badge color={C.ok} style={{ fontSize: 7 }}>
                    LOCAL
                  </Badge>
                )}
              </HoverRow>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
