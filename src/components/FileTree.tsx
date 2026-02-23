import { useState, useMemo, useCallback, useRef, useEffect, memo } from "react";
import { ProjectFile } from "../types";
import { useTheme } from "../context/ThemeContext";
import { Badge } from "./shared";
import { Refresh } from "./Icons";
import { openInFileManager } from "../hooks/useTauri";

/** Truncate a path to show the right side with ... at the front */
function truncatePath(path: string, maxChars: number = 40): string {
  if (path.length <= maxChars) return path;
  return "..." + path.slice(-(maxChars - 3));
}

// Git status tooltip text
function gitTooltip(git?: string): string {
  switch (git) {
    case "M": return "Modified — changed since last commit";
    case "A": return "Staged — added to index, ready to commit";
    case "U": return "Untracked — not tracked by git";
    case "D": return "Deleted — removed, pending commit";
    case "clean": return "Committed — matches HEAD";
    default: return "";
  }
}

// File type descriptions by extension
const FILE_EXT_TOOLTIPS: Record<string, string> = {
  // HDL sources
  ".v": "Verilog source — RTL or module definition",
  ".sv": "SystemVerilog source — RTL with advanced features",
  ".vhd": "VHDL source — RTL or entity/architecture",
  ".vhdl": "VHDL source — RTL or entity/architecture",
  // Constraints
  ".pdc": "Physical Design Constraints (Lattice) — pin assignments, I/O standards",
  ".lpf": "Logic Preference File (Lattice Diamond) — pin & timing constraints",
  ".sdc": "Synopsys Design Constraints — clock, timing, I/O delay definitions",
  ".xdc": "Xilinx Design Constraints — pin, timing, and placement rules",
  ".qsf": "Quartus Settings File — pin assignments, device settings",
  ".pcf": "Physical Constraints File (OSS) — pin mappings for nextpnr",
  // Build reports
  ".twr": "Timing Report — clock frequencies, setup/hold slack, critical paths",
  ".mrp": "Map Report — resource utilization after technology mapping",
  ".par": "Place & Route Report — placement stats, routing congestion",
  ".srp": "Synthesis Report — inference, optimization, warnings from synthesis",
  ".bgn": "Bitstream Generation Report — bitstream generation log",
  ".sta.rpt": "Static Timing Analysis Report — multi-corner timing results",
  ".fit.rpt": "Fitter Report — placement, routing, resource usage",
  ".map.rpt": "Map Report — technology mapping results",
  ".asm.rpt": "Assembler Report — bitstream generation results",
  // Build outputs
  ".bit": "Bitstream — FPGA configuration binary (Lattice/Xilinx)",
  ".bin": "Binary bitstream — raw configuration data",
  ".jed": "JEDEC file — CPLD/FPGA programming format (Lattice)",
  ".sof": "SRAM Object File — Quartus FPGA configuration",
  ".pof": "Programmer Object File — Quartus flash programming",
  ".svf": "Serial Vector Format — JTAG programming sequence",
  ".rbf": "Raw Binary File — Quartus raw bitstream",
  ".jic": "JTAG Indirect Configuration — Quartus flash config",
  ".mcs": "Memory Configuration Stream — Xilinx flash programming",
  // Build intermediates
  ".ncd": "Native Circuit Description — placed & routed design database",
  ".ngd": "Native Generic Database — mapped design netlist",
  ".edif": "EDIF netlist — technology-independent design exchange format",
  ".edf": "EDIF netlist — synthesis output netlist",
  ".json": "JSON — configuration, IP parameters, or synthesis output (Yosys)",
  ".blif": "Berkeley Logic Interchange — synthesis netlist for ABC",
  // Project files
  ".rdf": "Radiant Design File — Lattice Radiant project definition",
  ".ldf": "Lattice Diamond File — Diamond project definition",
  ".qpf": "Quartus Project File — Intel/Altera project container",
  ".xpr": "Vivado Project File — AMD/Xilinx project",
  ".coverteda": "CovertEDA Project — unified project configuration",
  ".sty": "Strategy File — Lattice implementation strategy settings",
  ".tcl": "TCL Script — tool automation, build flow, IP generation",
  // Config
  ".toml": "TOML config — settings, tool paths, preferences",
  ".cfg": "Configuration file — tool or project settings",
  ".ini": "INI settings — tool configuration",
  ".gitignore": "Git Ignore — patterns for files excluded from version control",
  // Lattice / vendor specific
  ".pfl": "Programming File List — Lattice programmer cable/device configuration",
  ".xcf": "XML Configuration File — Lattice pgrcmd programmer settings",
  ".acepro": "Achronix ACE Project — Speedster FPGA project definition",
  ".acxbit": "Achronix Bitstream — Speedster FPGA configuration binary",
  // General source
  ".c": "C source — firmware, testbench, or HLS input",
  ".h": "C/C++ header — type definitions and function declarations",
  ".cpp": "C++ source — firmware, SystemC, or HLS input",
  ".hpp": "C++ header — template and class declarations",
  ".rs": "Rust source — backend, build script, or plugin code",
  ".py": "Python script — automation, scripting, or cocotb testbench",
  ".ts": "TypeScript source — frontend application code",
  ".tsx": "TypeScript React — frontend UI component",
  ".js": "JavaScript source — scripts or configuration",
  ".jsx": "JavaScript React — frontend UI component",
  ".css": "CSS stylesheet — frontend styling",
  ".html": "HTML — web page or documentation template",
  ".scss": "SCSS stylesheet — compiled CSS with variables/nesting",
  // Data & config
  ".xml": "XML — configuration, IP definitions, or project metadata",
  ".yml": "YAML config — CI/CD pipelines, tool settings",
  ".yaml": "YAML config — CI/CD pipelines, tool settings",
  ".env": "Environment file — local environment variables",
  ".lock": "Lock file — dependency version lock",
  // Build
  ".mem": "Memory init file — block RAM initialization data (hex)",
  ".coe": "Coefficient file — Xilinx block RAM/ROM initialization",
  ".mif": "Memory Initialization File — Intel/Altera RAM init",
  ".hex": "Intel HEX — firmware or memory image",
  ".elf": "ELF binary — embedded processor firmware",
  ".do": "ModelSim do file — simulation automation script",
  ".f": "File list — Verilog source file list for compilation",
  ".prj": "Project file — source file list (ISE/Diamond format)",
  ".ucf": "User Constraints File — legacy Xilinx ISE constraints",
  ".ngc": "Netlist — Xilinx ISE synthesized core netlist",
  ".dcp": "Design Checkpoint — Vivado incremental compile snapshot",
  ".xci": "Xilinx Core Instance — IP core configuration",
  ".ip": "IP definition — IP core parameters and generation settings",
  ".qip": "Quartus IP File — Intel IP core reference",
  ".qsys": "Platform Designer — Intel FPGA system integration file",
  // Simulation
  ".vcd": "Value Change Dump — simulation waveform data",
  ".fst": "Fast Signal Trace — compressed waveform (GTKWave)",
  ".ghw": "GHDL Waveform — VHDL simulation output",
  ".saif": "Switching Activity — power estimation input from simulation",
  // Docs
  ".md": "Markdown — documentation or README",
  ".txt": "Text file — notes or documentation",
  ".log": "Log file — build or tool execution output",
  ".csv": "CSV data — tabular report data export",
  ".pdf": "PDF document — datasheet, reference manual, or report",
  ".png": "PNG image — diagram, schematic, or screenshot",
  ".svg": "SVG vector — schematic, block diagram, or icon",
  // Makefile
  "makefile": "Makefile — build automation rules",
  "Makefile": "Makefile — build automation rules",
};

function fileTypeTooltip(filename: string, ty?: string): string {
  const lower = filename.toLowerCase();
  // Try multi-part extensions first
  for (const ext of [".sta.rpt", ".fit.rpt", ".map.rpt", ".asm.rpt"]) {
    if (lower.endsWith(ext) && FILE_EXT_TOOLTIPS[ext]) return FILE_EXT_TOOLTIPS[ext];
  }
  // Try exact filename match (e.g. Makefile)
  if (FILE_EXT_TOOLTIPS[lower]) return FILE_EXT_TOOLTIPS[lower];
  const dot = lower.lastIndexOf(".");
  if (dot >= 0) {
    const ext = lower.slice(dot);
    if (FILE_EXT_TOOLTIPS[ext]) return FILE_EXT_TOOLTIPS[ext];
  }
  // Fallback by type
  const typeDesc: Record<string, string> = {
    rtl: "HDL source file",
    tb: "Testbench file",
    constr: "Constraint file",
    ip: "IP core file",
    output: "Build output",
    config: "Configuration file",
    doc: "Documentation",
  };
  return typeDesc[ty ?? ""] ?? filename;
}

// ── FileTreeRow ──

const FileTreeRow = memo(function FileTreeRow({
  f,
  active,
  folderOpen,
  onPick,
  onToggleFolder,
  onContextMenu,
  onToggleSynth,
}: {
  f: ProjectFile;
  active: boolean;
  folderOpen?: boolean;
  onPick: () => void;
  onToggleFolder?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onToggleSynth?: () => void;
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
        onClick={onToggleFolder}
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
          cursor: "pointer",
        }}
      >
        <span style={{ color: C.warn, fontSize: 8 }}>
          {folderOpen ? "\u25BC" : "\u25B6"}
        </span>
        {f.n.toUpperCase()}
        <span style={{ fontSize: 8, color: C.t3, fontWeight: 400 }}>
          {"/"}
        </span>
      </div>
    );
  }

  const canToggleSynth = f.ty === "rtl" || f.ty === "tb" || f.ty === "constr";

  return (
    <div
      onClick={onPick}
      onContextMenu={handleCtx}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 14px 14px",
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
            title={gitTooltip(f.git)}
            style={{
              color: GTC[f.git] ?? undefined,
              fontSize: 9,
              fontWeight: 700,
              width: 10,
              textAlign: "center",
              flexShrink: 0,
              cursor: "help",
            }}
          >
            {f.git}
          </span>
        ) : f.git === "clean" ? (
          <span
            title={gitTooltip(f.git)}
            style={{
              color: `${C.ok}60`,
              fontSize: 9,
              width: 10,
              textAlign: "center",
              flexShrink: 0,
              cursor: "help",
            }}
          >
            {"\u2713"}
          </span>
        ) : (
          <span style={{ width: 10, flexShrink: 0 }} />
        )}
        {/* File name */}
        <span
          title={f.path ? `${f.path}\n${fileTypeTooltip(f.n, f.ty)}` : fileTypeTooltip(f.n, f.ty)}
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
      {/* Synth indicator — clickable for RTL/TB/constraint files */}
      <span
        title={f.synth ? "In synthesis (click to remove)" : canToggleSynth ? "Not in synthesis (click to add)" : "Not applicable"}
        onClick={canToggleSynth ? (e) => { e.stopPropagation(); onToggleSynth?.(); } : undefined}
        style={{
          fontSize: 8,
          textAlign: "center",
          color: f.synth ? C.ok : C.t3,
          opacity: f.synth ? 1 : 0.25,
          cursor: canToggleSynth ? "pointer" : "default",
        }}
      >
        S
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
});

// ── FileTree ──

interface FileTreeProps {
  files: ProjectFile[];
  activeFile: string;
  setActiveFile: (name: string, path?: string) => void;
  onFileContextMenu?: (file: ProjectFile, x: number, y: number) => void;
  onRefresh?: () => void;
  onToggleSynth?: (file: ProjectFile) => void;
  width: number;
  onWidthChange: (w: number) => void;
  projectDir?: string;
  device?: string;
  onDeviceClick?: () => void;
}

function FileTree({ files, activeFile, setActiveFile, onFileContextMenu, onRefresh, onToggleSynth, width, onWidthChange, projectDir, device, onDeviceClick }: FileTreeProps) {
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

  // Collapsible folder state — build unique keys from path or name+depth
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => {
    const keys = new Set<string>();
    files.forEach((f) => {
      if (f.ty === "folder") keys.add(folderKey(f));
    });
    return keys;
  });

  // Update openFolders when files change (e.g. new folders appear)
  useEffect(() => {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      files.forEach((f) => {
        if (f.ty === "folder") {
          const key = folderKey(f);
          if (!next.has(key)) next.add(key); // new folders default open
        }
      });
      return next;
    });
  }, [files]);

  const toggleFolder = useCallback((key: string) => {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Compute visible files (hide children of collapsed folders)
  const visibleFiles = useMemo(() => {
    const result: ProjectFile[] = [];
    // Track folder open state at each depth using a stack
    const folderStack: { depth: number; open: boolean }[] = [];

    for (const f of files) {
      // Pop stack entries with depth >= current
      while (folderStack.length > 0 && folderStack[folderStack.length - 1].depth >= f.d) {
        folderStack.pop();
      }

      // Check if any ancestor is closed
      const parentClosed = folderStack.some((entry) => !entry.open);
      if (parentClosed) {
        if (f.ty === "folder") {
          folderStack.push({ depth: f.d, open: openFolders.has(folderKey(f)) });
        }
        continue;
      }

      result.push(f);

      if (f.ty === "folder") {
        folderStack.push({ depth: f.d, open: openFolders.has(folderKey(f)) });
      }
    }

    return result;
  }, [files, openFolders]);

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

  // Drag-to-resize logic
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(width);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [width]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = e.clientX - startX.current;
      const newW = Math.max(160, Math.min(600, startW.current + delta));
      onWidthChange(newW);
    };
    const onUp = () => {
      if (dragging.current) {
        dragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onWidthChange]);

  return (
    <div style={{ display: "flex", flexShrink: 0 }}>
    <div
      style={{
        width,
        flexShrink: 0,
        background: C.s1,
        display: "flex",
        flexDirection: "column",
        fontSize: 10,
        overflow: "hidden",
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
        {onRefresh && (
          <span
            onClick={onRefresh}
            title="Refresh file tree & git status"
            style={{
              cursor: "pointer",
              color: C.t3,
              display: "flex",
              alignItems: "center",
              padding: 2,
              borderRadius: 3,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = C.t1; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = C.t3; }}
          >
            <Refresh size={11} />
          </span>
        )}
        {unsavedFiles.length > 0 && (
          <Badge color={C.err}>{unsavedFiles.length} unsaved</Badge>
        )}
      </div>

      {/* Project directory path */}
      {projectDir && (
        <div
          style={{
            padding: "3px 10px",
            borderBottom: `1px solid ${C.b1}`,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <div
            title={projectDir}
            style={{
              flex: 1,
              fontSize: 8,
              fontFamily: MONO,
              color: C.t3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              cursor: "default",
              direction: "rtl",
              textAlign: "left",
              unicodeBidi: "plaintext",
            }}
          >
            {truncatePath(projectDir, 50)}
          </div>
          <span
            title="Open project location"
            onClick={() => openInFileManager(projectDir)}
            style={{
              fontSize: 10,
              cursor: "pointer",
              color: C.t3,
              flexShrink: 0,
              padding: 2,
              borderRadius: 3,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = C.accent; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = C.t3; }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M2 3h4l1.5 1.5H12a1 1 0 011 1V11a1 1 0 01-1 1H2a1 1 0 01-1-1V4a1 1 0 011-1z" />
            </svg>
          </span>
        </div>
      )}

      {/* Device / Part */}
      {device && (
        <div
          style={{
            padding: "3px 10px",
            borderBottom: `1px solid ${C.b1}`,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span style={{ fontSize: 7, fontFamily: MONO, color: C.t3, fontWeight: 600, letterSpacing: 0.3 }}>
            DEVICE
          </span>
          <span
            onClick={onDeviceClick}
            style={{
              fontSize: 8,
              fontFamily: MONO,
              color: C.accent,
              fontWeight: 600,
              cursor: onDeviceClick ? "pointer" : "default",
              borderBottom: onDeviceClick ? `1px dashed ${C.accent}40` : "none",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={onDeviceClick ? "Click to change device/part" : device}
          >
            {device}
          </span>
        </div>
      )}

      {/* Legend row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 14px 14px",
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
        <span title="In Synthesis — click to toggle" style={{ textAlign: "center", color: C.ok }}>
          S
        </span>
        <span style={{ textAlign: "center" }}>{"\u2302"}</span>
      </div>

      {/* File list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {visibleFiles.map((f, i) => (
          <FileTreeRow
            key={`${f.n}-${f.d}-${i}`}
            f={f}
            active={f.n === activeFile}
            folderOpen={f.ty === "folder" ? openFolders.has(folderKey(f)) : undefined}
            onPick={() => f.ty !== "folder" && setActiveFile(f.n, f.path)}
            onToggleFolder={f.ty === "folder" ? () => toggleFolder(folderKey(f)) : undefined}
            onContextMenu={onFileContextMenu ? (e) => onFileContextMenu(f, e.clientX, e.clientY) : undefined}
            onToggleSynth={onToggleSynth ? () => onToggleSynth(f) : undefined}
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
            {!selectedFile.synth && selectedFile.ty !== "folder" && (
              <Badge color={C.t3}>excluded</Badge>
            )}
          </div>
        </div>
      )}
    </div>
    {/* Resize handle */}
    <div
      onMouseDown={onMouseDown}
      style={{
        width: 4,
        cursor: "col-resize",
        background: "transparent",
        flexShrink: 0,
        borderRight: `1px solid ${C.b1}`,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `${C.accent}40`; }}
      onMouseLeave={(e) => { if (!dragging.current) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    />
    </div>
  );
}

/** Generate a unique key for a folder based on name + depth */
function folderKey(f: ProjectFile): string {
  return f.path ?? `${f.d}:${f.n}`;
}

export default FileTree;
