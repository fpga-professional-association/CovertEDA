import { useState, useMemo } from "react";
import { ProjectFile } from "../types";
import { useTheme } from "../context/ThemeContext";
import { Badge } from "./shared";

// ── FileTreeRow ──

function FileTreeRow({
  f,
  active,
  onPick,
  onContextMenu,
}: {
  f: ProjectFile;
  active: boolean;
  onPick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const { C, MONO } = useTheme();
  const [h, setH] = useState(false);

  // File type colors
  const FTC: Record<string, string> = {
    rtl: C.accent,
    tb: C.purple,
    constr: C.warn,
    ip: C.cyan,
    output: C.t3,
    config: C.t3,
    doc: C.t3,
    folder: C.warn,
  };

  // Git status colors
  const GTC: Record<string, string | null> = {
    M: C.warn,
    A: C.ok,
    U: C.orange,
    D: C.err,
    clean: null,
  };

  const handleCtx = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu?.(e);
  };

  if (f.ty === "folder") {
    return (
      <div
        onContextMenu={handleCtx}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "5px 8px",
          paddingLeft: 8 + f.d * 12,
          fontSize: 10,
          fontFamily: MONO,
          fontWeight: 700,
          color: C.t2,
          letterSpacing: 0.3,
          borderBottom: `1px solid ${C.b1}08`,
          marginTop: f.d === 0 ? 4 : 0,
        }}
      >
        <span style={{ color: C.warn, fontSize: 8 }}>
          {f.open ? "\u25BC" : "\u25B6"}
        </span>
        {f.n.toUpperCase()}
        <span style={{ fontSize: 8, color: C.t3, fontWeight: 400 }}>
          {"/"}
        </span>
      </div>
    );
  }

  return (
    <div
      onClick={onPick}
      onContextMenu={handleCtx}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 14px 14px 14px",
        gap: 2,
        alignItems: "center",
        padding: `3px 6px 3px ${8 + f.d * 12}px`,
        fontSize: 10,
        fontFamily: MONO,
        background: active ? C.accentDim : h ? `${C.s3}88` : "transparent",
        borderLeft: active
          ? `2px solid ${C.accent}`
          : "2px solid transparent",
        cursor: "pointer",
        transition: "all .08s",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {/* Git status letter */}
        {f.git && f.git !== "clean" ? (
          <span
            style={{
              color: GTC[f.git] ?? undefined,
              fontSize: 9,
              fontWeight: 700,
              width: 10,
              textAlign: "center",
              flexShrink: 0,
            }}
          >
            {f.git}
          </span>
        ) : (
          <span style={{ width: 10, flexShrink: 0 }} />
        )}
        {/* File name */}
        <span
          style={{
            color: active ? C.t1 : C.t2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {f.n}
        </span>
        {/* Unsaved dot */}
        {!f.saved && (
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: C.err,
              flexShrink: 0,
            }}
            title="Unsaved"
          />
        )}
      </div>
      {/* Synth indicator */}
      <span
        title={f.synth ? "In synthesis" : "Not in synthesis"}
        style={{
          fontSize: 8,
          textAlign: "center",
          color: f.synth ? C.ok : C.t3,
          opacity: f.synth ? 1 : 0.25,
        }}
      >
        S
      </span>
      {/* Sim indicator */}
      <span
        title={f.sim ? "In simulation" : "Not in simulation"}
        style={{
          fontSize: 8,
          textAlign: "center",
          color: f.sim ? C.purple : C.t3,
          opacity: f.sim ? 1 : 0.25,
        }}
      >
        T
      </span>
      {/* Type badge */}
      <span
        style={{
          fontSize: 7,
          textAlign: "center",
          color: FTC[f.ty] ?? C.t3,
          opacity: 0.7,
        }}
      >
        {f.ty === "rtl"
          ? "\u2B21"
          : f.ty === "tb"
            ? "\u25C8"
            : f.ty === "constr"
              ? "\u25C9"
              : f.ty === "ip"
                ? "\u25CE"
                : "\u00B7"}
      </span>
    </div>
  );
}

// ── FileTree ──

interface FileTreeProps {
  files: ProjectFile[];
  activeFile: string;
  setActiveFile: (name: string, path?: string) => void;
  onFileContextMenu?: (file: ProjectFile, x: number, y: number) => void;
}

function FileTree({ files, activeFile, setActiveFile, onFileContextMenu }: FileTreeProps) {
  const { C, MONO } = useTheme();

  // File type colors for the detail panel
  const FTC: Record<string, string> = {
    rtl: C.accent,
    tb: C.purple,
    constr: C.warn,
    ip: C.cyan,
    output: C.t3,
    config: C.t3,
    doc: C.t3,
    folder: C.warn,
  };

  const unsavedFiles = useMemo(
    () => files.filter((f) => f.ty !== "folder" && !f.saved),
    [files],
  );
  const synthFiles = useMemo(
    () => files.filter((f) => f.synth),
    [files],
  );
  const dirtyGitFiles = useMemo(
    () =>
      files.filter(
        (f) => f.ty !== "folder" && f.git && f.git !== "clean",
      ),
    [files],
  );

  const selectedFile = useMemo(
    () => files.find((x) => x.n === activeFile),
    [files, activeFile],
  );

  return (
    <div
      style={{
        width: 230,
        flexShrink: 0,
        background: C.s1,
        borderRight: `1px solid ${C.b1}`,
        display: "flex",
        flexDirection: "column",
        fontSize: 10,
      }}
    >
      {/* File panel header */}
      <div
        style={{
          padding: "7px 10px",
          borderBottom: `1px solid ${C.b1}`,
          display: "flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontFamily: MONO,
            fontWeight: 700,
            color: C.t3,
            letterSpacing: 1,
          }}
        >
          PROJECT FILES
        </span>
        <div style={{ flex: 1 }} />
        {unsavedFiles.length > 0 && (
          <Badge color={C.err}>{unsavedFiles.length} unsaved</Badge>
        )}
      </div>

      {/* Legend row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 14px 14px 14px",
          gap: 2,
          padding: "4px 6px 4px 20px",
          fontSize: 7,
          fontFamily: MONO,
          color: C.t3,
          borderBottom: `1px solid ${C.b1}`,
          letterSpacing: 0.3,
        }}
      >
        <span>NAME</span>
        <span title="In Synthesis" style={{ textAlign: "center", color: C.ok }}>
          S
        </span>
        <span
          title="In Simulation"
          style={{ textAlign: "center", color: C.purple }}
        >
          T
        </span>
        <span style={{ textAlign: "center" }}>{"\u2302"}</span>
      </div>

      {/* File list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {files.map((f, i) => (
          <FileTreeRow
            key={i}
            f={f}
            active={f.n === activeFile}
            onPick={() => f.ty !== "folder" && setActiveFile(f.n, f.path)}
            onContextMenu={onFileContextMenu ? (e) => onFileContextMenu(f, e.clientX, e.clientY) : undefined}
          />
        ))}
      </div>

      {/* File panel footer stats */}
      <div
        style={{
          padding: "6px 10px",
          borderTop: `1px solid ${C.b1}`,
          fontSize: 8,
          fontFamily: MONO,
          color: C.t3,
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        <span>
          <span style={{ color: C.ok }}>{synthFiles.length}</span> in synth
        </span>
        <span>
          <span style={{ color: C.warn }}>{dirtyGitFiles.length}</span> git
          dirty
        </span>
        <span>
          <span style={{ color: C.err }}>{unsavedFiles.length}</span> unsaved
        </span>
      </div>

      {/* Selected file detail */}
      {selectedFile && selectedFile.ty !== "folder" && (
        <div
          style={{
            padding: "8px 10px",
            borderTop: `1px solid ${C.b1}`,
            background: C.bg,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontFamily: MONO,
              fontWeight: 600,
              color: C.t1,
              marginBottom: 4,
            }}
          >
            {selectedFile.n}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            <Badge color={FTC[selectedFile.ty] ?? C.t3}>
              {selectedFile.ty}
            </Badge>
            <Badge color={C.t3}>{selectedFile.lang}</Badge>
            {selectedFile.lines != null && selectedFile.lines > 0 && (
              <Badge color={C.t3}>{selectedFile.lines} lines</Badge>
            )}
            {!selectedFile.saved && <Badge color={C.err}>UNSAVED</Badge>}
            {selectedFile.git === "clean" && (
              <Badge color={C.ok}>committed</Badge>
            )}
            {selectedFile.git === "M" && (
              <Badge color={C.warn}>modified</Badge>
            )}
            {selectedFile.git === "A" && (
              <Badge color={C.ok}>staged</Badge>
            )}
            {selectedFile.git === "U" && (
              <Badge color={C.orange}>untracked</Badge>
            )}
            {selectedFile.synth && <Badge color={C.ok}>synthesis</Badge>}
            {selectedFile.sim && <Badge color={C.purple}>simulation</Badge>}
            {!selectedFile.synth && selectedFile.ty !== "folder" && (
              <Badge color={C.t3}>excluded</Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default FileTree;
