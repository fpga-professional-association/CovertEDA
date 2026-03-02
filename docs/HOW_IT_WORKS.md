# How CovertEDA Works

> Technical explanation of CovertEDA's architecture and operation, suitable for presentation slides.

---

## What CovertEDA Is

CovertEDA is a **unified frontend** for FPGA development tools. It replaces vendor-specific GUIs (Quartus, Vivado, Diamond, Radiant) with a single, fast, modern interface.

**Key point:** CovertEDA does NOT perform synthesis, place & route, or bitstream generation itself. It **orchestrates** vendor tools through their existing CLI/TCL interfaces.

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│            CovertEDA Desktop App             │
│                                              │
│  ┌────────────────┐  ┌───────────────────┐  │
│  │  React Frontend │◄─┤  Tauri IPC Bridge  │  │
│  │  (TypeScript)   │  │  (invoke/listen)   │  │
│  └────────────────┘  └───────┬───────────┘  │
│                              │               │
│  ┌───────────────────────────▼───────────┐  │
│  │           Rust Backend                 │  │
│  │  ┌─────────┐ ┌──────────┐ ┌────────┐ │  │
│  │  │ Backend  │ │  Report  │ │  File  │ │  │
│  │  │ Registry │ │  Parsers │ │ Watcher│ │  │
│  │  └────┬────┘ └──────────┘ └────────┘ │  │
│  └───────┼──────────────────────────────┘  │
│          │                                   │
└──────────┼───────────────────────────────────┘
           │ Subprocess spawning (TCL scripts)
           ▼
┌──────────────────────────────────────────────┐
│         Vendor CLIs (User's Installation)     │
│  quartus_sh  vivado  pnmainc  radiantc  ace  │
│              yosys   nextpnr   libero        │
└──────────────────────────────────────────────┘
```

---

## The Three Layers

### Layer 1: React Frontend
- Renders the entire UI in a native webview (not Electron — no bundled Chromium)
- Inline styles + custom theme system (Dark, Light, Colorblind)
- Components: FileTree, BuildPipeline, ReportViewer, ConstraintEditor, IP Catalog, AI Assistant
- All data comes from the Rust backend via Tauri IPC — the frontend has zero direct filesystem or tool access

### Layer 2: Rust Backend
- Async runtime (Tokio) for non-blocking I/O
- `FpgaBackend` trait defines the interface every vendor backend must implement
- 8 backend implementations: Diamond, Radiant, Quartus Standard, Quartus Pro, Vivado, Libero, ACE, OSS
- Report parsers (regex-based) convert vendor-specific text reports into unified data structures
- File watcher (notify crate) monitors project files for real-time updates
- Git integration (libgit2) — no shelling out to the git CLI

### Layer 3: Vendor CLIs
- CovertEDA detects installed vendor tools at startup (scans known paths)
- When the user clicks "Build", CovertEDA:
  1. Generates a TCL script tailored to the active backend
  2. Writes it to the project directory
  3. Spawns the vendor CLI as a subprocess
  4. Streams stdout/stderr back to the UI in real time
  5. Parses the resulting report files into unified structures

---

## Build Flow in Detail

```
User clicks "Build"
        │
        ▼
┌─────────────────────┐
│ Generate TCL Script  │  Backend-specific: Diamond uses pnmainc TCL,
│ (Rust backend)       │  Quartus uses quartus_sh TCL, Vivado uses
│                      │  vivado -mode batch TCL, etc.
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Spawn Vendor CLI     │  Subprocess with CREATE_NO_WINDOW (Windows)
│ as subprocess        │  or LD_LIBRARY_PATH set (Linux)
└──────────┬──────────┘
           │
    ┌──────┴──────┐
    │  Stream     │  stdout/stderr piped to UI in real time
    │  output     │  via Tauri events (build:stdout)
    └──────┬──────┘
           │
           ▼
┌─────────────────────┐
│ Parse Reports        │  Regex-based parsers extract timing (Fmax,
│ (Rust backend)       │  WNS, TNS), utilization (LUT, FF, BRAM, DSP),
│                      │  power, DRC from vendor-specific text files
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Display Results      │  Unified report viewer shows timing, utilization,
│ (React frontend)     │  power, DRC, I/O in consistent format regardless
│                      │  of which vendor backend generated them
└─────────────────────┘
```

---

## The FpgaBackend Trait

Every vendor backend implements this Rust trait:

```rust
pub trait FpgaBackend: Send + Sync {
    fn id(&self) -> &str;                    // "diamond", "quartus", "vivado"
    fn name(&self) -> &str;                  // "Lattice Diamond"
    fn version(&self) -> &str;               // "3.13"
    fn cli_tool(&self) -> &str;              // "pnmainc"
    fn default_device(&self) -> &str;        // "LCMXO3LF-6900C-5BG256C"
    fn constraint_ext(&self) -> &str;        // ".lpf"
    fn pipeline_stages(&self) -> Vec<PipelineStage>;
    fn generate_build_script(...) -> Result<String>;
    fn detect_tool(&self) -> bool;
    fn parse_timing_report(...) -> Result<TimingReport>;
    fn parse_utilization_report(...) -> Result<ResourceReport>;
    fn parse_power_report(...) -> Result<Option<PowerReport>>;
    fn parse_drc_report(...) -> Result<Option<DrcReport>>;
    fn read_constraints(...) -> Result<Vec<PinConstraint>>;
    fn write_constraints(...) -> Result<()>;
    fn generate_ip_script(...) -> Result<(String, String)>;
}
```

This trait is the **core abstraction** that lets CovertEDA support multiple vendors with one codebase.

---

## Why Not Electron?

| | Electron | Tauri 2 |
|---|---|---|
| **Binary size** | ~200 MB (bundles Chromium) | ~10 MB (uses OS webview) |
| **Memory** | 300-500 MB baseline | ~50 MB baseline |
| **Backend** | Node.js (JavaScript) | Rust (compiled, type-safe) |
| **Startup** | 3-5 seconds | < 1 second |
| **Security** | Full filesystem access from renderer | IPC-only — renderer has zero direct access |

CovertEDA chose Tauri 2 + Rust for performance, memory efficiency, and security. The Rust backend handles all I/O, subprocess management, and file parsing with zero garbage collection overhead.

---

## What CovertEDA Touches (and Doesn't)

### CovertEDA DOES:
- Read your HDL source files to list them in the file tree
- Write `.coverteda` project configuration (JSON) to your project directory
- Write temporary TCL build scripts to your project directory (cleaned up after build)
- Spawn your installed vendor CLI as a subprocess
- Read vendor-generated report files (`.twr`, `.mrp`, `.rpt`)
- Read/write constraint files (`.lpf`, `.pdc`, `.xdc`, `.sdc`, `.qsf`, `.pcf`)

### CovertEDA DOES NOT:
- Bundle or redistribute any vendor tools, IP, or libraries
- Modify vendor project databases (`.qpf`, `.xpr`, `.rdf`)
- Evaluate TCL code directly — all TCL runs inside vendor CLIs
- Send telemetry or phone home
- Require a network connection (except for AI assistant feature)
- Require its own license (open source)

---

## Performance Design

- **Deferred backend detection**: At startup, backends are created with zero I/O. Tool scanning happens asynchronously in the background.
- **Batched React state updates**: Build log streaming uses refs + periodic flush instead of per-line state updates.
- **CSS-only hover effects**: No JavaScript event handlers for hover states — pure CSS injected once at mount.
- **Lazy component loading**: Report viewer, IP catalog, AI assistant, etc. are loaded on demand.
- **Native webview**: Uses the operating system's built-in webview (WebKitGTK on Linux, WebView2 on Windows), not a bundled browser.
