import { useState, useRef, useCallback, useEffect } from "react";
import { useTheme } from "../context/ThemeContext";
import { sshExecCommand } from "../hooks/useTauri";
import type { SshExecResult } from "../types";

interface Props {
  onClose?: () => void;
}

interface TermLine {
  type: "cmd" | "out" | "err" | "exit";
  text: string;
}

export default function SshTerminal({ onClose }: Props) {
  const { C, MONO, SANS } = useTheme();
  const [lines, setLines] = useState<TermLine[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new output
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(async () => {
    const cmd = input.trim();
    if (!cmd || running) return;

    setInput("");
    setHistIdx(-1);

    // Add to history (deduplicate last entry)
    setHistory((prev) => {
      const next = prev[0] === cmd ? prev : [cmd, ...prev];
      return next.slice(0, 50);
    });

    // Show command in output
    setLines((prev) => [...prev, { type: "cmd", text: cmd }]);
    setRunning(true);

    try {
      const result: SshExecResult = await sshExecCommand(cmd);
      setLines((prev) => {
        const next = [...prev];
        if (result.stdout.trim()) {
          next.push({ type: "out", text: result.stdout.trimEnd() });
        }
        if (result.stderr.trim()) {
          next.push({ type: "err", text: result.stderr.trimEnd() });
        }
        if (result.exitCode !== 0) {
          next.push({ type: "exit", text: `exit code: ${result.exitCode}` });
        }
        return next;
      });
    } catch (e) {
      setLines((prev) => [
        ...prev,
        { type: "err", text: e instanceof Error ? e.message : String(e) },
      ]);
    }

    setRunning(false);
    inputRef.current?.focus();
  }, [input, running]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (history.length > 0) {
          const next = Math.min(histIdx + 1, history.length - 1);
          setHistIdx(next);
          setInput(history[next]);
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (histIdx > 0) {
          const next = histIdx - 1;
          setHistIdx(next);
          setInput(history[next]);
        } else {
          setHistIdx(-1);
          setInput("");
        }
      } else if (e.key === "l" && e.ctrlKey) {
        e.preventDefault();
        setLines([]);
      }
    },
    [handleSubmit, history, histIdx],
  );

  const lineColor = (type: TermLine["type"]) => {
    switch (type) {
      case "cmd": return C.cyan;
      case "out": return C.t2;
      case "err": return C.err;
      case "exit": return C.warn;
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: C.bg,
        border: `1px solid ${C.b1}`,
        borderRadius: 6,
        overflow: "hidden",
        fontFamily: MONO,
        fontSize: 11,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          background: C.s1,
          borderBottom: `1px solid ${C.b1}`,
        }}
      >
        <span style={{ fontSize: 10, color: C.t2, fontFamily: SANS, fontWeight: 600 }}>
          SSH Terminal
        </span>
        <div style={{ flex: 1 }} />
        <span
          onClick={() => setLines([])}
          style={{
            fontSize: 9,
            color: C.t3,
            cursor: "pointer",
            padding: "1px 6px",
            borderRadius: 3,
          }}
          title="Clear output (Ctrl+L)"
        >
          Clear
        </span>
        {onClose && (
          <span
            onClick={onClose}
            style={{
              fontSize: 12,
              color: C.t3,
              cursor: "pointer",
              padding: "0 2px",
              lineHeight: 1,
            }}
            title="Close terminal"
          >
            ×
          </span>
        )}
      </div>

      {/* Output */}
      <div
        ref={scrollRef}
        onClick={() => inputRef.current?.focus()}
        style={{
          height: 180,
          overflowY: "auto",
          padding: "6px 10px",
          cursor: "text",
        }}
      >
        {lines.length === 0 && (
          <div style={{ color: C.t3, fontSize: 10, fontStyle: "italic" }}>
            Type a command and press Enter...
          </div>
        )}
        {lines.map((line, i) => (
          <div
            key={i}
            style={{
              color: lineColor(line.type),
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              lineHeight: 1.4,
            }}
          >
            {line.type === "cmd" ? `$ ${line.text}` : line.text}
          </div>
        ))}
        {running && (
          <div style={{ color: C.t3, fontStyle: "italic" }}>running...</div>
        )}
      </div>

      {/* Input */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 10px",
          borderTop: `1px solid ${C.b1}`,
          background: C.s1,
        }}
      >
        <span style={{ color: C.cyan, fontSize: 11, flexShrink: 0 }}>$</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={running}
          placeholder={running ? "running..." : "command"}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: C.t1,
            fontFamily: MONO,
            fontSize: 11,
            padding: "2px 0",
          }}
        />
        <span
          onClick={handleSubmit}
          style={{
            fontSize: 9,
            color: running ? C.t3 : C.accent,
            cursor: running ? "default" : "pointer",
            padding: "2px 8px",
            borderRadius: 3,
            border: `1px solid ${running ? C.b1 : C.accent}40`,
            fontFamily: SANS,
            fontWeight: 600,
          }}
        >
          Send
        </span>
      </div>
    </div>
  );
}
