import { useRef, useEffect, useCallback } from "react";
import { LogEntry } from "../types";
import { useTheme } from "../context/ThemeContext";
import { Btn } from "./shared";

interface ConsoleProps {
  logs: LogEntry[];
  building: boolean;
  backendShort: string;
  backendColor: string;
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

export default function Console({
  logs,
  building,
  backendShort,
  backendColor,
  onClear,
}: ConsoleProps) {
  const { C, MONO } = useTheme();

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

  // Auto-scroll only if user was already at bottom
  useEffect(() => {
    const el = logRef.current;
    if (el && wasAtBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs.length]);

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
        height: "calc(100vh - 120px)",
        display: "flex",
        flexDirection: "column",
      }}
    >
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
        <span style={{ flex: 1 }} />
        {logs.length} lines
        <Btn small onClick={onClear}>
          Clear
        </Btn>
      </div>
      <div
        ref={logRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "6px 12px",
          background: "#030508",
        }}
      >
        {logs.length === 0 && !building && (
          <div
            style={{
              color: C.t3,
              fontSize: 10,
              fontFamily: MONO,
              padding: 12,
              textAlign: "center",
            }}
          >
            No build output yet. Hit Build to start.
          </div>
        )}
        {logs.map((l, i) => (
          <div
            key={i}
            style={{
              fontSize: 10,
              fontFamily: MONO,
              lineHeight: 1.6,
              color: lineColors[l.t] || C.t2,
            }}
          >
            <span style={{ opacity: 0.5 }}>{linePrefixes[l.t] || ""}</span>
            {l.m}
          </div>
        ))}
        {building && (
          <div style={{ fontSize: 10, color: C.accent, fontFamily: MONO }}>
            <span style={{ animation: "pulse 1s infinite" }}>{"\u25CF"}</span>{" "}
            Building...
          </div>
        )}
      </div>
    </div>
  );
}
