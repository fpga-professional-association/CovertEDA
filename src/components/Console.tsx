import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import { LogEntry } from "../types";
import { useTheme } from "../context/ThemeContext";
import { Btn } from "./shared";

interface ConsoleProps {
  logs: LogEntry[];
  building: boolean;
  backendShort: string;
  backendColor: string;
  backendVersion?: string;
  live?: boolean;
  onClear: () => void;
}

const linePrefixes: Record<string, string> = {
  cmd: "$ ",
  err: "\u2717 ",
  warn: "\u26A0 ",
  ok: "\u2713 ",
  info: "\u203A ",
  out: "  ",
};

function HighlightedText({ text, search, highlightColor }: { text: string; search: string; highlightColor: string }) {
  if (!search) return <>{text}</>;
  const lower = text.toLowerCase();
  const needle = search.toLowerCase();
  const parts: { text: string; match: boolean }[] = [];
  let idx = 0;
  while (idx < text.length) {
    const found = lower.indexOf(needle, idx);
    if (found === -1) {
      parts.push({ text: text.slice(idx), match: false });
      break;
    }
    if (found > idx) parts.push({ text: text.slice(idx, found), match: false });
    parts.push({ text: text.slice(found, found + needle.length), match: true });
    idx = found + needle.length;
  }
  return (
    <>
      {parts.map((p, i) =>
        p.match ? (
          <span key={i} style={{ background: `${highlightColor}30`, borderRadius: 1 }}>{p.text}</span>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}

export default memo(function Console({
  logs,
  building,
  backendShort,
  backendColor,
  backendVersion,
  live,
  onClear,
}: ConsoleProps) {
  const { C, MONO } = useTheme();
  const [search, setSearch] = useState("");

  const lineColors: Record<string, string> = {
    info: C.t3,
    cmd: C.cyan,
    ok: C.ok,
    warn: C.warn,
    err: C.err,
    out: C.t2,
  };

  const logRef = useRef<HTMLDivElement>(null);
  const wasAtBottom = useRef(true);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const text = logs.map((l) => `${linePrefixes[l.t] || ""}${l.m}`).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [logs]);

  const filteredLogs = useMemo(() => {
    if (!search) return logs;
    const lower = search.toLowerCase();
    return logs.filter((l) => l.m.toLowerCase().includes(lower));
  }, [logs, search]);

  const matchCount = search ? filteredLogs.length : 0;

  // Time-range summary surfaced at the top of the log so the user can see
  // at a glance whether the lines they're looking at are from the build
  // that just ran or are stale from an earlier session.
  const { firstTs, lastTs } = useMemo(() => {
    let first: number | undefined;
    let last: number | undefined;
    for (const l of logs) {
      if (typeof l.ts !== "number") continue;
      if (first === undefined || l.ts < first) first = l.ts;
      if (last === undefined || l.ts > last) last = l.ts;
    }
    return { firstTs: first, lastTs: last };
  }, [logs]);

  const fmtTime = (ms: number) => {
    const d = new Date(ms);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  };
  const fmtDate = (ms: number) => {
    const d = new Date(ms);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "today";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  const fmtAgo = (ms: number) => {
    const d = (Date.now() - ms) / 1000;
    if (d < 60) return `${Math.floor(d)}s ago`;
    if (d < 3600) return `${Math.floor(d / 60)}m ago`;
    if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
    return `${Math.floor(d / 86400)}d ago`;
  };

  // Auto-scroll only if user was already at bottom
  useEffect(() => {
    const el = logRef.current;
    if (el && wasAtBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [filteredLogs.length]);

  const handleScroll = useCallback(() => {
    const el = logRef.current;
    if (el) {
      wasAtBottom.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
    }
  }, []);

  return (
    <div
      style={{
        background: C.s1,
        borderRadius: 7,
        border: `1px solid ${C.b1}`,
        overflow: "hidden",
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "6px 12px",
          borderBottom: `1px solid ${C.b1}`,
          fontSize: 9,
          fontFamily: MONO,
          color: C.t3,
        }}
      >
        <span style={{ color: backendColor }}>{"\u25CF"}</span>
        {backendShort} Output
        {live !== undefined && (
          <span
            style={{
              fontSize: 7,
              padding: "1px 5px",
              borderRadius: 3,
              background: live ? `${C.ok}20` : `${C.warn}20`,
              color: live ? C.ok : C.warn,
              fontWeight: 600,
            }}
          >
            {live ? `LIVE${backendVersion ? `: ${backendVersion}` : ""}` : "SIMULATION"}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {logs.length} lines
        <Btn small onClick={handleCopy} title="Copy all log output to clipboard">
          {copied ? "Copied!" : "Copy"}
        </Btn>
        <Btn small onClick={onClear} title="Clear log output">
          Clear
        </Btn>
      </div>

      {/* Timestamp banner — shows when the visible log started and when the
          most recent line landed, so the user can tell at a glance whether
          they're looking at fresh build output or an old session. Hidden
          entirely when no log lines have a timestamp. */}
      {firstTs !== undefined && lastTs !== undefined && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "5px 12px",
            borderBottom: `1px solid ${C.b1}`,
            background: `${C.accent}08`,
            fontSize: 8,
            fontFamily: MONO,
            color: C.t3,
            flexWrap: "wrap",
          }}
        >
          <span>
            <span style={{ color: C.t3 }}>started:</span>
            {" "}
            <span style={{ color: C.t1, fontWeight: 600 }}>
              {fmtTime(firstTs)}
            </span>
            {firstTs && fmtDate(firstTs) !== "today" && (
              <span style={{ color: C.t3 }}> ({fmtDate(firstTs)})</span>
            )}
          </span>
          <span style={{ color: C.b1 }}>{"\u2022"}</span>
          <span>
            <span style={{ color: C.t3 }}>latest:</span>
            {" "}
            <span style={{ color: C.t1, fontWeight: 600 }}>
              {fmtTime(lastTs)}
            </span>
            <span style={{ color: C.t3 }}> ({fmtAgo(lastTs)})</span>
          </span>
          {lastTs - firstTs > 0 && (
            <>
              <span style={{ color: C.b1 }}>{"\u2022"}</span>
              <span>
                <span style={{ color: C.t3 }}>span:</span>
                {" "}
                <span style={{ color: C.t1, fontWeight: 600 }}>
                  {((lastTs - firstTs) / 1000).toFixed(1)}s
                </span>
              </span>
            </>
          )}
        </div>
      )}

      {/* Search bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 12px",
          borderBottom: `1px solid ${C.b1}`,
          background: C.bg,
        }}
      >
        <span style={{ fontSize: 10, color: C.t3 }} title="Search build logs">{"\uD83D\uDD0D"}</span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search logs..."
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: 9,
            fontFamily: MONO,
            color: C.t1,
          }}
        />
        {search && (
          <>
            <span
              style={{
                fontSize: 7,
                fontFamily: MONO,
                fontWeight: 600,
                padding: "1px 5px",
                borderRadius: 3,
                background: matchCount > 0 ? `${C.accent}20` : `${C.warn}20`,
                color: matchCount > 0 ? C.accent : C.warn,
              }}
            >
              {matchCount} match{matchCount !== 1 ? "es" : ""}
            </span>
            <span
              onClick={() => setSearch("")}
              style={{ fontSize: 10, color: C.t3, cursor: "pointer" }}
              title="Clear search"
            >
              {"\u2715"}
            </span>
          </>
        )}
      </div>

      {/* Log content */}
      <div
        ref={logRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "6px 12px",
          background: C.bg,
        }}
      >
        {filteredLogs.length === 0 && !building && (
          <div
            style={{
              color: C.t3,
              fontSize: 10,
              fontFamily: MONO,
              padding: 12,
              textAlign: "center",
            }}
          >
            {search ? "No matching log lines." : "No build output yet. Hit Build to start."}
          </div>
        )}
        {filteredLogs.map((l, i) => (
          <div
            key={i}
            style={{
              fontSize: 10,
              fontFamily: MONO,
              lineHeight: 1.6,
              color: lineColors[l.t] || C.t2,
              display: "flex",
              gap: 6,
            }}
          >
            {typeof l.ts === "number" && (
              <span style={{
                color: C.t3, opacity: 0.65, flexShrink: 0,
                fontVariantNumeric: "tabular-nums",
                width: 64,
              }}>
                {fmtTime(l.ts)}
              </span>
            )}
            <span style={{ flex: 1, minWidth: 0, wordBreak: "break-word" }}>
              <span style={{ opacity: 0.5 }}>{linePrefixes[l.t] || ""}</span>
              <HighlightedText text={l.m} search={search} highlightColor={C.accent} />
            </span>
          </div>
        ))}
        {building && !search && (
          <div style={{ fontSize: 10, color: C.accent, fontFamily: MONO }}>
            <span style={{ animation: "pulse 1s infinite" }}>{"\u25CF"}</span>{" "}
            Building...
          </div>
        )}
      </div>
    </div>
  );
})
