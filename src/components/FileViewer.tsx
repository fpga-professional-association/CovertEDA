import { useCallback } from "react";
import { FileContent } from "../types";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme";

interface FileViewerProps {
  file: FileContent;
  onClose: () => void;
}

function classifyLine(line: string, C: ThemeColors): string | null {
  const lower = line.toLowerCase();
  if (lower.includes("error") && !lower.includes("0 error")) return C.err;
  if (lower.includes("warning") && !lower.includes("0 warning")) return C.warn;
  if (lower.includes("info:") || lower.includes("[info]")) return C.accent;
  if (
    lower.includes("pass") ||
    lower.includes("done") ||
    lower.includes("complete") ||
    lower.includes("success")
  )
    return C.ok;
  return null;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function FileViewer({ file, onClose }: FileViewerProps) {
  const { C, MONO, SANS } = useTheme();
  const fileName = file.path.split("/").pop() ?? file.path;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(file.content);
  }, [file.content]);

  if (file.isBinary) {
    return (
      <div
        style={{
          background: C.s1,
          borderRadius: 7,
          border: `1px solid ${C.b1}`,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            borderBottom: `1px solid ${C.b1}`,
            background: C.s2,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontFamily: MONO,
              fontWeight: 600,
              color: C.t1,
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {fileName}
          </span>
          <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>
            {formatSize(file.sizeBytes)}
          </span>
          <span
            onClick={onClose}
            style={{
              cursor: "pointer",
              color: C.t3,
              fontSize: 12,
              padding: "0 4px",
            }}
          >
            {"\u2715"}
          </span>
        </div>
        {/* Binary info card */}
        <div
          style={{
            padding: 40,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 32, color: C.t3 }}>{"\u25A3"}</span>
          <span
            style={{
              fontSize: 11,
              fontFamily: MONO,
              color: C.t2,
              textAlign: "center",
            }}
          >
            {file.content}
          </span>
        </div>
      </div>
    );
  }

  const lines = file.content.split("\n");
  const gutterWidth = String(lines.length).length * 8 + 16;

  return (
    <div
      style={{
        background: C.s1,
        borderRadius: 7,
        border: `1px solid ${C.b1}`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: `1px solid ${C.b1}`,
          background: C.s2,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontFamily: MONO,
            fontWeight: 600,
            color: C.t1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {fileName}
        </span>
        <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>
          {formatSize(file.sizeBytes)}
        </span>
        <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>
          {file.lineCount} lines
        </span>
        <div style={{ flex: 1 }} />
        <span
          onClick={handleCopy}
          style={{
            cursor: "pointer",
            fontSize: 8,
            fontFamily: SANS,
            fontWeight: 600,
            color: C.accent,
            padding: "2px 8px",
            border: `1px solid ${C.b1}`,
            borderRadius: 3,
          }}
        >
          Copy
        </span>
        <span
          onClick={onClose}
          style={{
            cursor: "pointer",
            color: C.t3,
            fontSize: 12,
            padding: "0 4px",
          }}
        >
          {"\u2715"}
        </span>
      </div>
      {/* Content */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          background: C.bg,
        }}
      >
        <pre
          style={{
            margin: 0,
            padding: "8px 0",
            fontFamily: MONO,
            fontSize: 10,
            lineHeight: "16px",
            whiteSpace: "pre",
          }}
        >
          {lines.map((line, i) => {
            const highlight = classifyLine(line, C);
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  minHeight: 16,
                  background: highlight ? `${highlight}10` : undefined,
                }}
              >
                <span
                  style={{
                    width: gutterWidth,
                    flexShrink: 0,
                    textAlign: "right",
                    paddingRight: 12,
                    color: C.t3,
                    opacity: 0.4,
                    userSelect: "none",
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ color: highlight ?? C.t2, paddingRight: 16 }}>
                  {line}
                </span>
              </div>
            );
          })}
        </pre>
      </div>
    </div>
  );
}

export default FileViewer;
