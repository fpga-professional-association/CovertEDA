# CovertEDA Implementation Guide

**Version:** 1.0 Draft — February 2026
**Author:** Covert Logic Labs / Travis
**Status:** Architecture & Implementation Specification

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Decision: Tauri Desktop App](#2-architecture-decision-tauri-desktop-app)
3. [Project Structure & Setup](#3-project-structure--setup)
4. [Core Backend Trait System (Rust)](#4-core-backend-trait-system-rust)
5. [Lattice Diamond Backend](#5-lattice-diamond-backend)
6. [Intel Quartus Prime Backend](#6-intel-quartus-prime-backend)
7. [AMD Vivado Backend](#7-amd-vivado-backend)
8. [OSS CAD Suite Backend](#8-oss-cad-suite-backend)
9. [Report Parsing Engine](#9-report-parsing-engine)
10. [Git Integration](#10-git-integration)
11. [File Tree & Project Manager](#11-file-tree--project-manager)
12. [License Manager](#12-license-manager)
13. [IP Catalog Integration](#13-ip-catalog-integration)
14. [Interconnect Viewer](#14-interconnect-viewer)
15. [AI Report Analysis](#15-ai-report-analysis)
16. [Register Map Editor](#16-register-map-editor)
17. [Constraint Editor](#17-constraint-editor)
18. [UX Design Guidelines — MUST READ BEFORE BUILDING UI](#18-ux-design-guidelines--must-read-before-building-ui)
19. [Frontend (React UI)](#19-frontend-react-ui)
20. [IPC Contract: Rust ↔ Frontend](#20-ipc-contract-rust--frontend)
21. [Cross-Platform Considerations](#21-cross-platform-considerations)
22. [Testing Strategy](#22-testing-strategy)
23. [Vendor Documentation References](#23-vendor-documentation-references)
24. [Implementation Phases & Milestones](#24-implementation-phases--milestones)

---

## 1. Project Overview

### 1.1 What CovertEDA Is

CovertEDA is a **unified FPGA development frontend** that replaces vendor-specific GUIs (Lattice Diamond, Intel Quartus, AMD Vivado) and also wraps open-source toolchains (Yosys/nextpnr) behind a single, consistent interface. CovertEDA does NOT replace the vendor tools themselves — it **orchestrates** them via their documented CLI and TCL interfaces.

### 1.2 What CovertEDA Does NOT Do

- Does NOT contain any vendor IP, libraries, or binaries
- Does NOT perform synthesis, place-and-route, or bitstream generation itself
- Does NOT replace the programmer hardware interfaces — it shells out to vendor programmers
- Does NOT require any vendor EULA modification — it uses the same CLI interfaces as Makefiles and CI/CD

### 1.3 Core Capabilities

| Feature | Implementation Mechanism |
|---|---|
| Build pipeline orchestration | Spawn vendor CLI processes, monitor stdout/stderr |
| Report visualization | Parse vendor text report files with regex/grammar parsers |
| Constraint editing | Read/write .lpf/.sdc/.xdc/.pcf files |
| Git integration | libgit2 (via git2-rs crate) |
| File tree with metadata | Filesystem watcher + git status + project file parsing |
| License management | Query lmutil/vlm/tool license checkers |
| IP catalog | Enumerate vendor IP via TCL commands, generate instantiation scripts |
| Interconnect viewer | Parse Qsys .qsys / Vivado .bd files, or define topology in JSON |
| AI report analysis | Send parsed report text to LLM API with device/project context |
| Register map editor | JSON-based register definitions, export to C headers / SV packages |

---

## 2. Architecture Decision: Tauri Desktop App

### 2.1 Why Tauri Over Electron

| Factor | Tauri | Electron |
|---|---|---|
| Binary size | ~5–10 MB | ~150–200 MB |
| Memory footprint | ~30–50 MB | ~150–300 MB |
| Backend language | Rust (fast process spawning, safe concurrency) | Node.js |
| OS webview | Uses system WebView2 (Windows) / WebKitGTK (Linux) | Bundles Chromium |
| Process spawning | Native `std::process::Command`, zero overhead | child_process, heavier |
| File system access | Direct, native, fast | Via Node.js fs module |
| USB/serial | Via serialport crate or shelling out | Via serialport npm |
| Cross-platform | Single codebase → Linux + Windows binaries | Same, but much larger |

### 2.2 Why Not Pure Web-Based

A pure web app (browser + backend server) is viable for **remote build server** scenarios but has critical limitations for a desktop development tool:

- **No direct process spawning** — everything must round-trip through HTTP/WebSocket to a backend server
- **No file system watching** — must poll or use a WebSocket push model
- **No USB/JTAG** — programming requires the server to be on the machine with the hardware
- **Authentication complexity** — if the server is shared/remote
- **Latency** — every UI interaction that needs backend data has network latency

**Recommendation:** Build the Tauri app first. The React frontend is identical to what a web app would use. A web-based deployment can be added later by replacing Tauri IPC with WebSocket calls to a Python/Rust backend server.

### 2.3 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    TAURI APPLICATION                         │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              FRONTEND (React + TypeScript)            │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │   │
│  │  │ Build    │ │ Reports  │ │ File     │ │ AI     │  │   │
│  │  │ Pipeline │ │ Viewer   │ │ Tree     │ │ Chat   │  │   │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └───┬────┘  │   │
│  │       │             │            │           │       │   │
│  │  ─────┴─────────────┴────────────┴───────────┴────── │   │
│  │              Tauri IPC (invoke / listen)              │   │
│  └──────────────────────────┬───────────────────────────┘   │
│                             │                               │
│  ┌──────────────────────────▼───────────────────────────┐   │
│  │              BACKEND (Rust)                           │   │
│  │                                                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │ Process     │  │ Report      │  │ File        │  │   │
│  │  │ Manager     │  │ Parser      │  │ Watcher     │  │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │   │
│  │         │                │                │          │   │
│  │  ┌──────▼──────┐  ┌─────▼──────┐  ┌──────▼──────┐  │   │
│  │  │ Backend     │  │ License    │  │ Git         │  │   │
│  │  │ Adapters    │  │ Manager    │  │ Interface   │  │   │
│  │  │ ┌─────────┐ │  └────────────┘  └─────────────┘  │   │
│  │  │ │ Diamond │ │                                    │   │
│  │  │ │ Quartus │ │  ┌─────────────┐  ┌─────────────┐ │   │
│  │  │ │ Vivado  │ │  │ IP Catalog  │  │ Constraint  │ │   │
│  │  │ │ OSS CAD │ │  │ Manager     │  │ Editor      │ │   │
│  │  │ └─────────┘ │  └─────────────┘  └─────────────┘ │   │
│  │  └─────────────┘                                    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         │              │              │
         ▼              ▼              ▼
    ┌─────────┐   ┌──────────┐   ┌─────────┐
    │ pnmainc │   │quartus_sh│   │ vivado  │
    │ (Diamond)│   │(Quartus) │   │ (AMD)   │
    └─────────┘   └──────────┘   └─────────┘
                                      │
                                 ┌────▼────┐
                                 │ yosys + │
                                 │ nextpnr │
                                 └─────────┘
```

---

## 3. Project Structure & Setup

### 3.1 Prerequisites

```bash
# Install Rust (stable channel)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Node.js (v18+) and npm
# Linux: via nvm or package manager
# Windows: via installer from nodejs.org

# Install Tauri CLI
cargo install tauri-cli

# Create project
cargo tauri init
```

### 3.2 Directory Structure

```
coverteda/
├── src-tauri/                    # Rust backend
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs               # Tauri app entry point
│   │   ├── lib.rs                 # Module declarations
│   │   ├── config.rs              # User configuration (tool paths, prefs)
│   │   ├── backend/
│   │   │   ├── mod.rs             # Backend trait definition
│   │   │   ├── diamond.rs         # Lattice Diamond adapter
│   │   │   ├── quartus.rs         # Intel Quartus adapter
│   │   │   ├── vivado.rs          # AMD Vivado adapter
│   │   │   └── oss.rs             # Yosys/nextpnr adapter
│   │   ├── process/
│   │   │   ├── mod.rs             # Process spawning & management
│   │   │   ├── tcl_shell.rs       # Persistent TCL shell manager
│   │   │   └── stream.rs          # Stdout/stderr streaming to frontend
│   │   ├── parser/
│   │   │   ├── mod.rs             # Parser trait definition
│   │   │   ├── timing.rs          # Timing report parser (per backend)
│   │   │   ├── utilization.rs     # Utilization report parser
│   │   │   ├── power.rs           # Power report parser
│   │   │   ├── drc.rs             # DRC report parser
│   │   │   └── io_banking.rs      # I/O assignment parser
│   │   ├── git.rs                 # Git operations via git2-rs
│   │   ├── files.rs               # File tree, watching, metadata
│   │   ├── license.rs             # License server queries
│   │   ├── ip_catalog.rs          # IP enumeration and instantiation
│   │   ├── constraints.rs         # Constraint file read/write
│   │   ├── regmap.rs              # Register map data model
│   │   └── commands.rs            # All Tauri IPC command handlers
│   └── tauri.conf.json
├── src/                           # React frontend
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   │   ├── BuildPipeline.tsx
│   │   ├── ReportViewer.tsx
│   │   ├── FileTree.tsx
│   │   ├── GitStatusBar.tsx
│   │   ├── ConstraintEditor.tsx
│   │   ├── IPCatalog.tsx
│   │   ├── InterconnectViewer.tsx
│   │   ├── AIChat.tsx
│   │   ├── RegisterMap.tsx
│   │   ├── LicenseManager.tsx
│   │   ├── CommandPalette.tsx
│   │   └── Console.tsx
│   ├── hooks/
│   │   ├── useBackend.ts          # Backend switching state
│   │   ├── useBuild.ts            # Build pipeline state
│   │   └── useIPC.ts              # Tauri invoke/listen wrappers
│   ├── types/
│   │   └── index.ts               # All TypeScript interfaces
│   └── styles/
│       └── globals.css
├── package.json
└── tsconfig.json
```

### 3.3 Rust Dependencies (Cargo.toml)

```toml
[dependencies]
tauri = { version = "2", features = ["shell-open"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
regex = "1"
git2 = "0.19"                    # libgit2 bindings
notify = "6"                     # Filesystem watcher
walkdir = "2"                    # Recursive directory traversal
reqwest = { version = "0.12", features = ["json"] } # HTTP for AI API
dirs = "5"                       # Platform-specific directories
toml = "0.8"                     # Config file parsing
log = "0.4"
env_logger = "0.11"
thiserror = "1"                  # Error handling
```

---

## 4. Core Backend Trait System (Rust)

This is the foundational abstraction that makes multi-backend support possible. Every vendor adapter implements the same trait.

### 4.1 The `FpgaBackend` Trait

```rust
// src-tauri/src/backend/mod.rs

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Represents one stage in the build pipeline
#[derive(Clone, Serialize, Deserialize)]
pub struct PipelineStage {
    pub id: String,
    pub label: String,
    pub cli_command: String,
    pub description: String,
}

/// Result of parsing a timing report
#[derive(Clone, Serialize, Deserialize)]
pub struct TimingReport {
    pub fmax_mhz: f64,
    pub target_mhz: f64,
    pub wns_ns: f64,           // Worst Negative Slack
    pub tns_ns: f64,           // Total Negative Slack
    pub whs_ns: f64,           // Worst Hold Slack
    pub ths_ns: f64,           // Total Hold Slack
    pub failing_paths: u32,
    pub total_paths: u32,
    pub clock_domains: Vec<ClockDomain>,
    pub critical_paths: Vec<CriticalPath>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ClockDomain {
    pub name: String,
    pub period_ns: f64,
    pub frequency_mhz: f64,
    pub source: String,
    pub wns_ns: f64,
    pub path_count: u32,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct CriticalPath {
    pub rank: u32,
    pub from: String,
    pub to: String,
    pub slack_ns: f64,
    pub requirement_ns: f64,
    pub data_delay_ns: f64,
    pub logic_levels: u32,
    pub clock: String,
    pub path_type: String,     // "Setup" or "Hold"
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ResourceReport {
    pub device: String,
    pub categories: Vec<ResourceCategory>,
    pub by_module: Vec<ModuleUtilization>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ResourceCategory {
    pub category: String,      // "Logic", "Memory", "I/O", "Clock"
    pub items: Vec<ResourceItem>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ResourceItem {
    pub name: String,          // "LUT4", "ALM", "Slice LUT", etc.
    pub used: u64,
    pub total: u64,
    pub detail: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ModuleUtilization {
    pub module: String,
    pub lut: u64,
    pub ff: u64,
    pub bram: u64,
    pub percentage: f64,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct PinConstraint {
    pub pin: String,
    pub net: String,
    pub direction: String,     // "IN", "OUT", "BIDIR"
    pub io_standard: String,   // "LVCMOS33", "LVDS", etc.
    pub bank: String,
    pub locked: bool,
    pub extra: Vec<(String, String)>,  // Slew rate, drive strength, etc.
}

#[derive(Clone, Serialize, Deserialize)]
pub struct IPEntry {
    pub category: String,
    pub name: String,
    pub description: String,
    pub parameters: Vec<IPParameter>,
    pub tcl_command: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct IPParameter {
    pub name: String,
    pub param_type: String,    // "int", "enum", "bool"
    pub default_value: String,
    pub options: Vec<String>,  // For enum types
    pub description: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct LicenseInfo {
    pub feature: String,
    pub status: String,        // "active", "expired", "warning", "open"
    pub expires: String,
    pub seats_available: u32,
    pub seats_total: u32,
    pub server: String,
    pub vendor: String,
}

/// The core abstraction — every vendor adapter implements this
#[async_trait::async_trait]
pub trait FpgaBackend: Send + Sync {
    /// Human-readable backend name
    fn name(&self) -> &str;

    /// Short identifier ("diamond", "quartus", "vivado", "oss")
    fn id(&self) -> &str;

    /// CLI executable name (pnmainc, quartus_sh, vivado, yosys)
    fn cli_executable(&self) -> &str;

    /// Path to the CLI executable on this system
    fn cli_path(&self) -> Result<PathBuf, String>;

    /// Default device string for this backend
    fn default_device(&self) -> &str;

    /// Supported device families
    fn device_families(&self) -> Vec<String>;

    /// Build pipeline stages in order
    fn pipeline_stages(&self) -> Vec<PipelineStage>;

    /// Constraint file extension (.lpf, .sdc, .xdc, .pcf)
    fn constraint_extension(&self) -> &str;

    /// Project file extension (.ldf, .qpf, .xpr, Makefile)
    fn project_extension(&self) -> &str;

    /// Bitstream file extension (.jed, .sof, .bit, .bin)
    fn bitstream_extension(&self) -> &str;

    // ═══ BUILD OPERATIONS ═══

    /// Generate the TCL/shell script for a full build
    fn generate_build_script(
        &self,
        project_dir: &PathBuf,
        device: &str,
        top_module: &str,
        sources: &[PathBuf],
        constraints: &[PathBuf],
    ) -> Result<String, String>;

    /// Generate a TCL/shell command for a single pipeline stage
    fn stage_command(
        &self,
        stage_id: &str,
        project_dir: &PathBuf,
    ) -> Result<String, String>;

    /// Spawn the build process and return a handle
    async fn start_build(
        &self,
        project_dir: &PathBuf,
        script: &str,
    ) -> Result<tokio::process::Child, String>;

    // ═══ REPORT PARSING ═══

    /// Parse the timing report from build output directory
    fn parse_timing_report(
        &self,
        impl_dir: &PathBuf,
    ) -> Result<TimingReport, String>;

    /// Parse the utilization/resource report
    fn parse_utilization_report(
        &self,
        impl_dir: &PathBuf,
    ) -> Result<ResourceReport, String>;

    /// Parse the power report (if available)
    fn parse_power_report(
        &self,
        impl_dir: &PathBuf,
    ) -> Result<Option<serde_json::Value>, String>;

    // ═══ CONSTRAINTS ═══

    /// Read pin constraints from file
    fn read_constraints(
        &self,
        constraint_file: &PathBuf,
    ) -> Result<Vec<PinConstraint>, String>;

    /// Write pin constraints to file
    fn write_constraints(
        &self,
        constraints: &[PinConstraint],
        output_file: &PathBuf,
    ) -> Result<(), String>;

    // ═══ IP CATALOG ═══

    /// List available IPs (may require a live TCL shell)
    async fn list_ip_catalog(&self) -> Result<Vec<IPEntry>, String>;

    /// Generate TCL to instantiate an IP with given parameters
    fn generate_ip_tcl(
        &self,
        ip_name: &str,
        instance_name: &str,
        parameters: &[(String, String)],
    ) -> Result<String, String>;

    // ═══ LICENSE ═══

    /// Check license status
    async fn check_licenses(&self) -> Result<Vec<LicenseInfo>, String>;

    // ═══ PROGRAMMING ═══

    /// Generate the programming command for the given bitstream
    fn program_command(
        &self,
        bitstream: &PathBuf,
        cable: &str,
    ) -> Result<String, String>;
}
```

### 4.2 TODO for Implementor

- [ ] Create `mod.rs` with the trait definition above
- [ ] Create `diamond.rs`, `quartus.rs`, `vivado.rs`, `oss.rs` as empty struct implementations
- [ ] Implement `cli_path()` first for each backend — this is the "can we find the tool?" check
- [ ] Add a `BackendManager` struct that holds a `HashMap<String, Box<dyn FpgaBackend>>` and provides switching

---

## 5. Lattice Diamond Backend

### 5.1 Vendor Documentation References

| Document | Location |
|---|---|
| Diamond User Guide | `$DIAMOND_DIR/docs/Diamond_User_Guide.pdf` or [latticesemi.com UG35](https://www.latticesemi.com/-/media/LatticeSemi/Documents/UserManuals/1D/DiamondUG35.ashx) |
| TCL Command Reference | `$DIAMOND_DIR/docs/Tcl_Command_Reference.pdf` or [Lattice Diamond 3.4 TCL Help](https://manualzz.com/doc/o/nfq2g/lattice-3.4-help-diamond-help-tcl-command-reference-guide) |
| Synplify Pro User Guide | `$DIAMOND_DIR/synpbase/doc/` |
| LPF Constraint Reference | Diamond Help → "Preference File Reference" |

### 5.2 Tool Paths

```
# Linux
/usr/local/diamond/<version>/bin/lin64/pnmainc     # TCL shell
/usr/local/diamond/<version>/bin/lin64/pgrcmd       # Programmer CLI
/usr/local/diamond/<version>/bin/lin64/diamondc     # Alternative CLI name

# Windows
C:\lscc\diamond\<version>\bin\nt64\pnmainc.exe
C:\lscc\diamond\<version>\bin\nt64\pgrcmd.exe

# Environment variables to check
$LM_LICENSE_FILE    → license.dat path or port@server
```

### 5.3 TCL Command Reference

These are the exact TCL commands CovertEDA must generate and send to `pnmainc`:

#### Project Management
```tcl
# Create a new project
prj_project new -name "dc_scm_controller" \
    -impl "impl1" \
    -dev LCMXO3LF-6900C-5BG256C \
    -synthesis "synplify"

# Open existing project
prj_project open "dc_scm_controller.ldf"

# Add source files
prj_src add "src/top_level.sv" -work work
prj_src add "src/pqc_engine.sv" -work work
prj_src add "src/i2c_master.sv" -work work

# Add constraint file
prj_src add "constraints/dc_scm.lpf"

# Set active implementation
prj_impl option {top} {top_level}

# Close project
prj_project close
```

#### Build Pipeline Commands
```tcl
# Full flow (runs all stages sequentially)
prj_run Synthesis -impl impl1 -forceOne
prj_run Translate -impl impl1
prj_run Map -impl impl1
prj_run PAR -impl impl1
prj_run Export -impl impl1 -task Bitgen
prj_run Export -impl impl1 -task TimingSimFileVer

# Individual stage options
prj_run PAR -impl impl1 -exp "parPathBased=ON"
prj_run Synthesis -impl impl1 -forceOne -synargs "-frequency 125"
```

#### Report File Locations

After a build, reports are in `impl1/`:

| Report | File Pattern | Content |
|---|---|---|
| Synthesis | `impl1/*.srr` | Synplify report (resource count, warnings) |
| Map | `impl1/*.mrp` | Mapper report (resource binding) |
| Place & Route | `impl1/*.par` | **PRIMARY** — timing, utilization, routing stats |
| Timing | `impl1/*.twr` | Detailed timing report |
| Bitstream | `impl1/*.bgn` | Bitgen log |
| I/O | `impl1/*.pad` | Pin assignment report |

### 5.4 Report Parsing: Diamond PAR Report

The `.par` file is the most important report. Here are the exact patterns to match:

```
# TODO: For each regex, implement in parser/timing.rs

# Pattern: Fmax extraction
# Look for: "Maximum frequency for clock net 'CLOCK_NAME': XXX.XX MHz"
regex: r"Maximum frequency for clock net '([^']+)':\s+([\d.]+)\s+MHz"
capture_groups: (clock_name, fmax_mhz)

# Pattern: LUT utilization
# Look for: "   Number of LUT4s:        4217 out of  6864 (61%)"
regex: r"Number of (\w+)s?:\s+(\d+)\s+out of\s+(\d+)\s+\((\d+)%\)"
capture_groups: (resource_name, used, total, percentage)

# Pattern: Register utilization
# Look for: "   Number of FFs:           1842"
regex: r"Number of FFs?:\s+(\d+)"

# Pattern: EBR utilization
# Look for: "   Number of EBR blocks:    12 out of    26 (46%)"
regex: r"Number of EBR blocks:\s+(\d+)\s+out of\s+(\d+)"

# Pattern: I/O utilization
# Look for: "   Number of bonded user pins: 47 out of 206 (22%)"
regex: r"Number of bonded user pins:\s+(\d+)\s+out of\s+(\d+)"

# Pattern: Timing path slack
# Look for lines in timing section with slack values
# Format varies — see .twr file for structured timing paths

# Pattern: Build success/failure
# Look for: "PAR: Pair completed with 0 error(s)."
regex: r"PAR:.*completed with (\d+) error\(s\)"
```

### 5.5 LPF Constraint Format

CovertEDA must read and write Lattice Preference Files:

```
# Pin location
LOCATE COMP "clk_25mhz" SITE "A4" ;
LOCATE COMP "rst_n" SITE "B2" ;
LOCATE COMP "i2c_sda" SITE "C3" ;

# I/O buffer properties
IOBUF PORT "clk_25mhz" IO_TYPE=LVCMOS33 ;
IOBUF PORT "i2c_sda" IO_TYPE=LVCMOS33 DRIVE=4 SLEWRATE=SLOW PULLMODE=UP ;
IOBUF PORT "i2c_scl" IO_TYPE=LVCMOS33 DRIVE=4 SLEWRATE=SLOW PULLMODE=UP ;

# Clock constraint (for Synplify)
FREQUENCY NET "clk_25mhz" 25.0 MHz ;
FREQUENCY NET "pll_clk_125" 125.0 MHz ;

# Timing constraints
BLOCK PATH FROM PORT "rst_n" ;
MULTICYCLE FROM CELL "slow_reg*" TO CELL "fast_reg*" 2 X ;
```

### 5.6 TODO: Diamond Backend Implementation

- [ ] **5.6.1** Implement `cli_path()` — search `$PATH`, check `/usr/local/diamond/*/bin/lin64/pnmainc` (Linux), `C:\lscc\diamond\*\bin\nt64\pnmainc.exe` (Windows), and check `$DIAMOND_DIR` env var
- [ ] **5.6.2** Implement `pipeline_stages()` — return the 6-stage pipeline: Synthesis → Translate → Map → PAR → Bitgen → Timing
- [ ] **5.6.3** Implement `generate_build_script()` — output a complete `.tcl` file that `pnmainc` can source
- [ ] **5.6.4** Implement `start_build()` — spawn `pnmainc -t build.tcl` with tokio::process, capture stdout/stderr
- [ ] **5.6.5** Implement `parse_timing_report()` — parse `.par` and `.twr` files using the regex patterns above
- [ ] **5.6.6** Implement `parse_utilization_report()` — parse `.par` and `.mrp` files for resource counts
- [ ] **5.6.7** Implement `read_constraints()` — parse `.lpf` file into `Vec<PinConstraint>`
- [ ] **5.6.8** Implement `write_constraints()` — serialize `Vec<PinConstraint>` back to `.lpf` format
- [ ] **5.6.9** Implement `check_licenses()` — run `lmutil lmstat -c <license_path>` and parse output
- [ ] **5.6.10** Implement `program_command()` — generate `pgrcmd -infile programmer.xcf` command

---

## 6. Intel Quartus Prime Backend

### 6.1 Vendor Documentation References

| Document | Location |
|---|---|
| Quartus Prime Scripting Guide | [Intel UG-20144 (Std)](https://www.intel.com/content/www/us/en/docs/programmable/683325/18-1/command-line-scripting.html) / [UG-20132 (Pro)](https://manuals.plus/m/5da3c05736c21c23bf892b93468b3cf9ee03b4baccfe78a6f663a8f6368a4482) |
| Quartus II Scripting Reference Manual | [Intel PDF tclscriptrefmnl.pdf](https://cdrdv2-public.intel.com/654662/tclscriptrefmnl.pdf) |
| Timing Analyzer User Guide | [Intel UG-20243](https://www.intel.com/content/www/us/en/docs/programmable/683243/24-1/the-quartus-sta-executable.html) |
| Command-Line Help | Run `quartus_sh --qhelp` for interactive API explorer |

### 6.2 Tool Paths

```
# Linux
/opt/intelFPGA/<version>/quartus/bin/quartus_sh      # Main TCL shell
/opt/intelFPGA/<version>/quartus/bin/quartus_syn      # Synthesis
/opt/intelFPGA/<version>/quartus/bin/quartus_fit      # Fitter
/opt/intelFPGA/<version>/quartus/bin/quartus_asm      # Assembler
/opt/intelFPGA/<version>/quartus/bin/quartus_sta      # Timing Analyzer
/opt/intelFPGA/<version>/quartus/bin/quartus_pgm      # Programmer

# Windows
C:\intelFPGA\<version>\quartus\bin64\quartus_sh.exe
C:\intelFPGA\<version>\quartus\bin64\quartus_syn.exe
# ... etc

# Environment variables
$QUARTUS_ROOTDIR     → Quartus installation root
$LM_LICENSE_FILE     → license.dat path
```

### 6.3 CLI Command Reference

Quartus has two approaches: individual executables per stage, or `quartus_sh --flow` for one-shot.

#### One-Shot Full Compilation
```bash
quartus_sh --flow compile <project_name>
# Runs: Analysis → Synthesis → Fitter → Assembler → Timing → EDA
# Supports --flow compile --rev <revision> for specific revisions
# Supports --flow compile --resume to resume interrupted builds
```

#### Individual Stage Executables
```bash
# Synthesis
quartus_syn <project> --read_settings_files=on --write_settings_files=off

# Fitter (Place & Route)
quartus_fit <project> --read_settings_files=on --write_settings_files=off

# Assembler (Bitstream generation)
quartus_asm <project>

# Timing Analyzer (STA)
quartus_sta <project> --do_report_timing

# Programmer
quartus_pgm -c <cable_name> -m JTAG -o "P;<project>.sof"
```

#### TCL Scripting (via quartus_sh -t)
```tcl
# Create project
project_new dc_scm -overwrite
set_global_assignment -name FAMILY "Cyclone V"
set_global_assignment -name DEVICE 5CSEMA5F31C6
set_global_assignment -name TOP_LEVEL_ENTITY top_level

# Add sources
set_global_assignment -name SYSTEMVERILOG_FILE src/top_level.sv
set_global_assignment -name SYSTEMVERILOG_FILE src/pqc_engine.sv
set_global_assignment -name SDC_FILE constraints/timing.sdc

# Pin assignments (equivalent to .qsf entries)
set_location_assignment PIN_AF14 -to clk_100mhz
set_instance_assignment -name IO_STANDARD "3.3-V LVTTL" -to clk_100mhz

# Run compilation
execute_flow -compile

# Alternative: run individual stages
execute_module -tool syn
execute_module -tool fit
execute_module -tool asm
execute_module -tool sta

# Access reports programmatically
load_report
set num_rows [get_number_of_rows -name "Timing Analyzer||Slow 1100mV Model||Fmax Summary"]
for {set i 1} {$i < $num_rows} {incr i} {
    set fmax [get_report_panel_data -name "Timing Analyzer||Slow 1100mV Model||Fmax Summary" -row $i -col 0]
    puts "Fmax: $fmax"
}

project_close
```

### 6.4 Report File Locations

Reports are in the `output_files/` directory:

| Report | File Pattern | Content |
|---|---|---|
| Synthesis | `<project>.syn.rpt` | Resource mapping, synthesis warnings |
| Fitter | `<project>.fit.rpt` | Placement, routing, utilization |
| Timing (STA) | `<project>.sta.rpt` | **PRIMARY** — Fmax, setup/hold, critical paths |
| Assembler | `<project>.asm.rpt` | Bitstream generation log |
| Pin | `<project>.pin` | Pin assignments report |
| Flow Summary | `<project>.flow.rpt` | Overall compilation summary |

### 6.5 Report Parsing: Quartus STA Report

The `.sta.rpt` file has structured table sections. Key patterns:

```
# Pattern: Fmax from Fmax Summary table
# Section header: "; Fmax Summary"
# Table format:
# ; Fmax       ; Restricted Fmax ; Clock Name    ; Note
# ; 203.71 MHz ; 203.71 MHz      ; pll_clk_125   ;
regex: r";\s+([\d.]+)\s+MHz\s+;\s+[\d.]+\s+MHz\s+;\s+(\S+)"
capture_groups: (fmax_mhz, clock_name)

# Pattern: Setup Summary
# Section: "; Setup Summary"
# ; Clock  ; Slack ; TNS
# ; clk    ; 2.341 ; 0.000
regex: r";\s+(\S+)\s+;\s+([-\d.]+)\s+;\s+([-\d.]+)"

# Pattern: Utilization from fit.rpt
# Section: "; Fitter Resource Utilization by Entity"
# ; ALMs needed ; Registers ; Block memory bits ; DSP blocks
regex: r";\s+(\d[\d,]*)\s+/\s+(\d[\d,]*)\s+\(\s+(\d+)\s+%\s+\)"
```

### 6.6 SDC Constraint Format

Quartus uses Synopsys Design Constraints (SDC) plus Quartus-specific QSF assignments:

```tcl
# timing.sdc — SDC timing constraints
create_clock -name clk_100mhz -period 10.000 [get_ports {clk_100mhz}]
derive_pll_clocks
derive_clock_uncertainty

set_false_path -from [get_ports {rst_n}]
set_multicycle_path -from [get_registers {slow_reg[*]}] -to [get_registers {fast_reg[*]}] -setup 2

# Pin assignments go in .qsf, not .sdc
# set_location_assignment PIN_AF14 -to clk_100mhz
# set_instance_assignment -name IO_STANDARD "3.3-V LVTTL" -to clk_100mhz
```

### 6.7 TODO: Quartus Backend Implementation

- [ ] **6.7.1** Implement `cli_path()` — search `$QUARTUS_ROOTDIR`, `$PATH`, common install locations
- [ ] **6.7.2** Implement `pipeline_stages()` — return: Analysis → Synthesis → Fitter → Assembler → TimeQuest
- [ ] **6.7.3** Implement `generate_build_script()` — output a `.tcl` file for `quartus_sh -t`
- [ ] **6.7.4** Implement `start_build()` — either `quartus_sh --flow compile` or individual executables
- [ ] **6.7.5** Implement `parse_timing_report()` — parse `.sta.rpt` table sections
- [ ] **6.7.6** Implement `parse_utilization_report()` — parse `.fit.rpt` utilization tables
- [ ] **6.7.7** Implement `read_constraints()` — parse both `.sdc` (timing) and `.qsf` (pin assignments)
- [ ] **6.7.8** Implement `write_constraints()` — write pin assignments to `.qsf` format
- [ ] **6.7.9** Implement `check_licenses()` — run `quartus_sh --liccheck` and parse output
- [ ] **6.7.10** Implement `program_command()` — generate `quartus_pgm` command
- [ ] **6.7.11** Implement Quartus report panel TCL access for structured report data extraction

---

## 7. AMD Vivado Backend

### 7.1 Vendor Documentation References

| Document | ID | Location |
|---|---|---|
| Vivado TCL Scripting Guide | UG894 | [xilinx.com UG894](https://www.xilinx.com/support/documents/sw_manuals/xilinx2022_2/ug894-vivado-tcl-scripting.pdf) |
| Vivado TCL Command Reference | UG835 | [docs.amd.com UG835](https://docs.amd.com/r/en-US/ug835-vivado-tcl-commands/report_timing) |
| Vivado Implementation Guide | UG904 | [docs.amd.com UG904](https://docs.amd.com/r/en-US/ug904-vivado-implementation/Tcl-Commands-and-Options) |
| Vivado Constraints Guide | UG903 | XDC constraint syntax |
| Vivado Design Flows | UG892 | Project vs. Non-Project modes |

### 7.2 Tool Paths

```
# Linux
/tools/Xilinx/Vivado/<version>/bin/vivado
/tools/Xilinx/Vivado/<version>/bin/vivado_lab      # Programmer only

# Windows
C:\Xilinx\Vivado\<version>\bin\vivado.bat
C:\Xilinx\Vivado\<version>\bin\vivado_lab.bat

# Environment variables
$XILINX_VIVADO             → Vivado installation root
$XILINXD_LICENSE_FILE      → license file path
```

### 7.3 Invocation Modes

Vivado supports three invocation modes — CovertEDA uses **TCL mode** (option 2):

```bash
# 1. GUI mode (not used by CovertEDA)
vivado

# 2. TCL interactive mode — PREFERRED for CovertEDA
vivado -mode tcl

# 3. Batch mode — run a script and exit
vivado -mode batch -source build.tcl -notrace -nojournal
```

### 7.4 Non-Project Mode Build Script

Vivado has "Project Mode" and "Non-Project Mode". **Non-Project Mode** is preferred for CovertEDA because it gives full script control and doesn't create `.xpr` metadata:

```tcl
# build.tcl — Non-project mode build script for Vivado
# Reference: UG894, "Non-Project Mode Design Flow"

# Step 0: Setup
set outputDir ./output
file mkdir $outputDir
set_param general.maxThreads 8

# Step 1: Read sources
read_verilog [glob src/*.v]
read_verilog -sv [glob src/*.sv]
read_xdc constraints/dc_scm.xdc

# Step 2: Synthesis
synth_design -top top_level -part xc7a100tcsg324-1
write_checkpoint -force $outputDir/post_synth.dcp
report_timing_summary -file $outputDir/post_synth_timing.rpt
report_utilization -file $outputDir/post_synth_util.rpt

# Step 3: Optimization
opt_design -directive Explore
# Optional: report_timing_summary here too

# Step 4: Placement
place_design -directive ExtraPostPlacementOpt
write_checkpoint -force $outputDir/post_place.dcp
report_timing_summary -file $outputDir/post_place_timing.rpt

# Step 5: Physical optimization
phys_opt_design -directive AggressiveExplore

# Step 6: Routing
route_design -directive Explore
write_checkpoint -force $outputDir/post_route.dcp
report_timing_summary -file $outputDir/post_route_timing.rpt
report_utilization -file $outputDir/post_route_util.rpt
report_power -file $outputDir/post_route_power.rpt
report_drc -file $outputDir/post_route_drc.rpt
report_io -file $outputDir/post_route_io.rpt

# Step 7: Bitstream
write_bitstream -force $outputDir/output.bit
```

### 7.5 Key TCL Commands for Report Generation

Vivado's TCL commands can output reports to files AND return strings. This is the **best** of any vendor for programmatic access:

```tcl
# Timing — write to file
report_timing_summary -file timing.rpt -max_paths 10

# Timing — return as string (can parse in TCL or pipe to stdout)
set timing_text [report_timing_summary -return_string -max_paths 10]
puts $timing_text

# Utilization
report_utilization -file util.rpt
report_utilization -hierarchical -file util_hier.rpt

# Power
report_power -file power.rpt

# DRC
report_drc -file drc.rpt

# I/O
report_io -file io.rpt

# Clock networks
report_clock_networks -file clocks.rpt
report_clock_utilization -file clock_util.rpt

# IP status
report_ip_status
```

### 7.6 Report Parsing: Vivado Timing Summary

Vivado's `report_timing_summary` output has a predictable structure:

```
# Pattern: WNS/TNS header block
# "Timing Summary"
# "  WNS(ns)  TNS(ns)  TNS Coverage(%)  WHS(ns)  THS(ns)  THS Falling Edge(%)  ..."
# "  ------   ------   ---------------  ------   ------   --------------------  ..."
# "   1.923    0.000        100.000       0.031    0.000         100.000"
regex: r"^\s+([-\d.]+)\s+([-\d.]+)\s+[\d.]+\s+([-\d.]+)\s+([-\d.]+)"
capture_groups: (wns, tns, whs, ths)

# Pattern: Clock summary
# "Clock Summary"
# "Clock        Waveform(ns)    Period(ns)    Frequency(MHz)"
# "clk_100mhz   {0.000 5.000}   10.000        100.000"
regex: r"^(\S+)\s+\{[\d.\s]+\}\s+([\d.]+)\s+([\d.]+)"
capture_groups: (clock_name, period_ns, frequency_mhz)

# Pattern: Path detail
# Starts with "Slack (MET):" or "Slack (VIOLATED):"
# followed by structured path with source, destination, delays
regex: r"Slack\s+\((MET|VIOLATED)\)\s*:\s+([-\d.]+)ns"
capture_groups: (met_or_violated, slack_ns)
```

### 7.7 XDC Constraint Format

XDC is essentially TCL (SDC + Xilinx extensions):

```tcl
# Clock constraints
create_clock -period 10.000 -name clk_100mhz [get_ports clk_100mhz]

# Pin assignments
set_property PACKAGE_PIN E3 [get_ports clk_100mhz]
set_property IOSTANDARD LVCMOS33 [get_ports clk_100mhz]

set_property PACKAGE_PIN C12 [get_ports rst_n]
set_property IOSTANDARD LVCMOS33 [get_ports rst_n]

# Grouped with curly braces for multiple pins
set_property PACKAGE_PIN H17 [get_ports {led[0]}]
set_property IOSTANDARD LVCMOS33 [get_ports {led[0]}]

# False paths
set_false_path -from [get_ports rst_n]
```

### 7.8 TODO: Vivado Backend Implementation

- [ ] **7.8.1** Implement `cli_path()` — search `$XILINX_VIVADO`, `$PATH`, common install locations
- [ ] **7.8.2** Implement `pipeline_stages()` — return: synth_design → opt_design → place_design → phys_opt_design → route_design → write_bitstream
- [ ] **7.8.3** Implement `generate_build_script()` — output a non-project mode `.tcl` script per UG894
- [ ] **7.8.4** Implement `start_build()` — spawn `vivado -mode batch -source build.tcl -notrace`
- [ ] **7.8.5** Implement `parse_timing_report()` — parse `report_timing_summary` output
- [ ] **7.8.6** Implement `parse_utilization_report()` — parse `report_utilization` output (flat and hierarchical)
- [ ] **7.8.7** Implement `parse_power_report()` — parse `report_power` output
- [ ] **7.8.8** Implement `read_constraints()` — parse `.xdc` files for `set_property PACKAGE_PIN` and `IOSTANDARD`
- [ ] **7.8.9** Implement `write_constraints()` — serialize to XDC format
- [ ] **7.8.10** Implement `check_licenses()` — run Xilinx `vlm` or check license file
- [ ] **7.8.11** Implement `list_ip_catalog()` — use `get_ipdefs` TCL command in a Vivado shell
- [ ] **7.8.12** Implement `generate_ip_tcl()` — generate `create_ip` + `set_property CONFIG.*` commands
- [ ] **7.8.13** Implement `program_command()` — generate `program_hw_devices` TCL or `vivado_lab` command

---

## 8. OSS CAD Suite Backend

### 8.1 Documentation References

| Tool | Documentation |
|---|---|
| Yosys | [yosyshq.readthedocs.io](https://yosyshq.readthedocs.io/projects/yosys/en/latest/) — manual, command reference |
| nextpnr | [github.com/YosysHQ/nextpnr](https://github.com/YosysHQ/nextpnr) — README, architecture docs |
| Project Trellis (ECP5) | [github.com/YosysHQ/prjtrellis](https://github.com/YosysHQ/prjtrellis) |
| IceStorm (iCE40) | [github.com/YosysHQ/icestorm](https://github.com/YosysHQ/icestorm) |
| Yosys JSON format | [write_json docs](https://yosyshq.readthedocs.io/projects/yosys/en/latest/cmd/write_json.html) |

### 8.2 Tool Paths

```bash
# Typically on $PATH after installing OSS CAD Suite or individual tools
which yosys
which nextpnr-ecp5    # or nextpnr-ice40, nextpnr-himbaechel
which ecppack          # or icepack for iCE40
which openFPGALoader   # universal open-source programmer

# No license required — all open source
```

### 8.3 Build Flow Commands

The OSS flow is simpler — no persistent TCL shell needed, just sequential commands:

```bash
# Step 1: Yosys synthesis
# Input: Verilog/SystemVerilog sources
# Output: JSON netlist
yosys -p "read_verilog -sv src/top_level.sv src/pqc_engine.sv; \
          synth_ecp5 -top top_level -json output/synth.json" \
      2>&1 | tee output/yosys.log

# Step 2: nextpnr place and route
# Input: JSON netlist + constraint file
# Output: .config text bitstream
nextpnr-ecp5 --85k \
    --package BG381C \
    --speed 6 \
    --json output/synth.json \
    --lpf constraints/pins.lpf \
    --textcfg output/routed.config \
    --freq 125 \
    --report output/pnr_report.json \
    2>&1 | tee output/nextpnr.log

# Step 3: ecppack bitstream generation
# Input: .config text bitstream
# Output: .bit binary bitstream
ecppack --compress --svf output/output.svf \
    output/routed.config output/output.bit

# Step 4: Programming (openFPGALoader)
openFPGALoader --board <board_name> output/output.bit
```

### 8.4 nextpnr JSON Report

nextpnr can output a JSON report with `--report report.json`:

```json
{
    "utilization": {
        "TRELLIS_LC": { "available": 83640, "used": 6123 },
        "TRELLIS_FF": { "available": 83640, "used": 2981 },
        "TRELLIS_IO": { "available": 197, "used": 47 },
        "DP16KD": { "available": 208, "used": 18 },
        "EHXPLLL": { "available": 4, "used": 1 }
    },
    "fmax": {
        "clk_25mhz": { "achieved": 131.21, "constraint": 125.0 }
    }
}
```

This is the **easiest** report to parse — it's already structured JSON.

### 8.5 PCF / LPF Constraint Formats

For iCE40, use `.pcf`:
```
set_io clk_25mhz 35
set_io rst_n 34
set_io led[0] 11
```

For ECP5, use `.lpf` (same as Diamond):
```
LOCATE COMP "clk_25mhz" SITE "P3" ;
IOBUF PORT "clk_25mhz" IO_TYPE=LVCMOS33 ;
```

### 8.6 TODO: OSS Backend Implementation

- [ ] **8.6.1** Implement `cli_path()` — check `which yosys`, `which nextpnr-ecp5`, `which ecppack` on PATH
- [ ] **8.6.2** Implement `pipeline_stages()` — return: Yosys Synthesis → nextpnr PnR → ecppack Bitstream
- [ ] **8.6.3** Implement `generate_build_script()` — output a shell script or Makefile
- [ ] **8.6.4** Implement `start_build()` — spawn shell commands sequentially
- [ ] **8.6.5** Implement `parse_timing_report()` — parse nextpnr JSON report (trivial — it's already JSON)
- [ ] **8.6.6** Implement `parse_utilization_report()` — parse nextpnr JSON report utilization section
- [ ] **8.6.7** Implement `read_constraints()` — parse `.pcf` or `.lpf` depending on target family
- [ ] **8.6.8** Implement `write_constraints()` — write `.pcf` or `.lpf`
- [ ] **8.6.9** `check_licenses()` returns a single "open source — no license required" entry

---

## 9. Report Parsing Engine

### 9.1 Architecture

The parser module is a collection of vendor-specific parsers that all produce the same output types (defined in the backend trait). Each parser reads text files and extracts structured data.

```rust
// src-tauri/src/parser/mod.rs

pub mod timing;
pub mod utilization;
pub mod power;
pub mod drc;
pub mod io_banking;

/// Detect which vendor produced a report file based on content
pub fn detect_vendor(report_text: &str) -> Option<&'static str> {
    if report_text.contains("Lattice") || report_text.contains("Synplify") {
        Some("diamond")
    } else if report_text.contains("Quartus") || report_text.contains("Altera") || report_text.contains("Intel") {
        Some("quartus")
    } else if report_text.contains("Vivado") || report_text.contains("Xilinx") || report_text.contains("AMD") {
        Some("vivado")
    } else if report_text.contains("yosys") || report_text.contains("nextpnr") {
        Some("oss")
    } else {
        None
    }
}
```

### 9.2 Parser Design Pattern

Every parser function follows this pattern:

```rust
// Example: timing parser for Diamond
pub fn parse_diamond_timing(report_path: &Path) -> Result<TimingReport, ParseError> {
    let text = std::fs::read_to_string(report_path)?;

    // 1. Extract Fmax per clock domain
    let fmax_re = Regex::new(r"Maximum frequency for clock net '([^']+)':\s+([\d.]+)\s+MHz")?;
    let mut clocks = Vec::new();
    for cap in fmax_re.captures_iter(&text) {
        clocks.push(ClockDomain {
            name: cap[1].to_string(),
            frequency_mhz: cap[2].parse()?,
            // ... fill remaining fields
        });
    }

    // 2. Extract worst slack
    // 3. Extract critical paths
    // 4. Assemble TimingReport struct

    Ok(TimingReport { /* ... */ })
}
```

### 9.3 TODO: Parser Implementation

- [ ] **9.3.1** Create parser error type with `thiserror`
- [ ] **9.3.2** Implement Diamond `.par` / `.twr` timing parser
- [ ] **9.3.3** Implement Diamond `.par` / `.mrp` utilization parser
- [ ] **9.3.4** Implement Quartus `.sta.rpt` timing parser
- [ ] **9.3.5** Implement Quartus `.fit.rpt` utilization parser
- [ ] **9.3.6** Implement Vivado `report_timing_summary` output parser
- [ ] **9.3.7** Implement Vivado `report_utilization` output parser
- [ ] **9.3.8** Implement Vivado `report_power` output parser
- [ ] **9.3.9** Implement nextpnr JSON report parser (easiest — `serde_json::from_str`)
- [ ] **9.3.10** Implement DRC report parsers for each vendor
- [ ] **9.3.11** Write unit tests with sample report files from each tool (store in `tests/fixtures/`)
- [ ] **9.3.12** Handle version differences — Diamond 3.11 vs 3.13 report format changes, Quartus Standard vs Pro

---

## 10. Git Integration

### 10.1 Implementation via git2-rs

Use the `git2` Rust crate (libgit2 bindings) for all git operations. Do NOT shell out to `git` CLI — `git2` is faster and doesn't require `git` to be installed.

```rust
// src-tauri/src/git.rs

use git2::{Repository, StatusOptions, BranchType};
use serde::Serialize;

#[derive(Serialize)]
pub struct GitStatus {
    pub branch: String,
    pub commit_hash: String,
    pub commit_message: String,
    pub commit_author: String,
    pub commit_time: String,
    pub ahead: u32,
    pub behind: u32,
    pub staged: u32,
    pub modified: u32,
    pub untracked: u32,
    pub stashes: u32,
    pub tags: Vec<String>,
    pub is_dirty: bool,
}

#[derive(Serialize)]
pub struct GitCommit {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub time: String,
}

pub fn get_status(repo_path: &Path) -> Result<GitStatus, git2::Error> {
    let repo = Repository::open(repo_path)?;
    let head = repo.head()?;
    let commit = head.peel_to_commit()?;

    // Branch name
    let branch = head.shorthand().unwrap_or("detached").to_string();

    // Status counts
    let mut opts = StatusOptions::new();
    opts.include_untracked(true);
    let statuses = repo.statuses(Some(&mut opts))?;

    let mut staged = 0u32;
    let mut modified = 0u32;
    let mut untracked = 0u32;

    for entry in statuses.iter() {
        let s = entry.status();
        if s.intersects(
            git2::Status::INDEX_NEW
            | git2::Status::INDEX_MODIFIED
            | git2::Status::INDEX_DELETED
        ) {
            staged += 1;
        }
        if s.intersects(
            git2::Status::WT_MODIFIED
            | git2::Status::WT_DELETED
        ) {
            modified += 1;
        }
        if s.contains(git2::Status::WT_NEW) {
            untracked += 1;
        }
    }

    // Ahead/behind tracking branch
    // ... (use graph_ahead_behind)

    Ok(GitStatus {
        branch,
        commit_hash: commit.id().to_string(),
        // ... etc
    })
}

/// Get per-file git status (for the file tree)
pub fn get_file_statuses(repo_path: &Path) -> Result<HashMap<PathBuf, String>, git2::Error> {
    let repo = Repository::open(repo_path)?;
    let mut opts = StatusOptions::new();
    opts.include_untracked(true).recurse_untracked_dirs(true);
    let statuses = repo.statuses(Some(&mut opts))?;

    let mut result = HashMap::new();
    for entry in statuses.iter() {
        let path = PathBuf::from(entry.path().unwrap_or(""));
        let s = entry.status();
        let code = if s.contains(git2::Status::INDEX_NEW) { "A" }
            else if s.intersects(git2::Status::INDEX_MODIFIED | git2::Status::WT_MODIFIED) { "M" }
            else if s.contains(git2::Status::WT_NEW) { "U" }
            else if s.intersects(git2::Status::INDEX_DELETED | git2::Status::WT_DELETED) { "D" }
            else { "clean" };
        result.insert(path, code.to_string());
    }
    Ok(result)
}
```

### 10.2 TODO: Git Implementation

- [ ] **10.2.1** Implement `get_status()` — branch, commit, ahead/behind, dirty counts
- [ ] **10.2.2** Implement `get_file_statuses()` — per-file git status for the file tree
- [ ] **10.2.3** Implement `get_recent_commits(n)` — last N commits with hash, message, author, time
- [ ] **10.2.4** Implement `stage_file(path)` — `git add`
- [ ] **10.2.5** Implement `commit(message)` — `git commit -m`
- [ ] **10.2.6** Implement `stash()` / `stash_pop()`
- [ ] **10.2.7** Implement `get_stash_count()`
- [ ] **10.2.8** Expose all as Tauri IPC commands

---

## 11. File Tree & Project Manager

### 11.1 File Metadata Model

Each file in the tree needs these attributes:

```rust
#[derive(Serialize)]
pub struct FileEntry {
    pub path: PathBuf,
    pub name: String,
    pub is_directory: bool,
    pub file_type: FileType,       // rtl, tb, constr, ip, output, config, doc
    pub git_status: String,        // "clean", "M", "A", "U", "D"
    pub is_saved: bool,            // Buffer matches disk (managed by editor state)
    pub in_synthesis: bool,        // Included in synthesis fileset
    pub in_simulation: bool,       // Included in simulation fileset
    pub language: String,          // "SystemVerilog", "Verilog", "VHDL", etc.
    pub line_count: u32,
    pub size_bytes: u64,
}

pub enum FileType {
    Rtl,           // .v, .sv, .vhd
    Testbench,     // Files in testbench/ or matching tb_* pattern
    Constraint,    // .lpf, .sdc, .xdc, .pcf
    IpGenerated,   // IP core generated files
    Output,        // .bit, .jed, .sof, reports
    Config,        // .ldf, .qpf, .qsf, .xpr, Makefile, .do, .tcl
    Documentation, // .md, .txt, .pdf
}
```

### 11.2 Synthesis Fileset Detection

How to determine if a file is "in synthesis":

- **Diamond**: Parse `.ldf` XML project file — `<Source ... syn_sim="SimOnly">` vs `<Source ... syn_sim="Synthesis, Simulation">`
- **Quartus**: Parse `.qsf` — look for `set_global_assignment -name SYSTEMVERILOG_FILE <path>` entries
- **Vivado**: Parse `.xpr` XML — look for `<File Path="...">` entries with `<FileInfo ... Used_In="synthesis"`
- **OSS**: All files in `Makefile` `SOURCES` variable, or all `.v`/`.sv` in `src/`

### 11.3 File Watching

Use the `notify` crate to watch the project directory for changes:

```rust
use notify::{Watcher, RecursiveMode, watcher};

fn start_file_watcher(project_dir: &Path, tx: Sender<FileEvent>) {
    let mut watcher = notify::recommended_watcher(move |res| {
        match res {
            Ok(event) => { tx.send(FileEvent::from(event)).ok(); }
            Err(e) => { log::error!("Watch error: {}", e); }
        }
    }).unwrap();

    watcher.watch(project_dir, RecursiveMode::Recursive).unwrap();
}
```

### 11.4 TODO: File Tree Implementation

- [ ] **11.4.1** Implement `scan_project_directory()` — recursive walk with `walkdir`, classify each file
- [ ] **11.4.2** Implement project file parsers for fileset detection (Diamond `.ldf`, Quartus `.qsf`, Vivado `.xpr`)
- [ ] **11.4.3** Integrate git status per file via `get_file_statuses()`
- [ ] **11.4.4** Set up `notify` file watcher to emit events on file change/create/delete
- [ ] **11.4.5** Expose `get_file_tree()` as Tauri IPC command
- [ ] **11.4.6** Expose `toggle_synthesis(path)` and `toggle_simulation(path)` commands

---

## 12. License Manager

### 12.1 License Query Commands Per Vendor

| Vendor | Command | What It Returns |
|---|---|---|
| Lattice (FlexLM) | `lmutil lmstat -c <port@server> -a` | Feature list with status, expiry, seat count |
| Intel (FlexLM) | `lmutil lmstat -c <port@server> -a` OR `quartus_sh --liccheck` | Same FlexLM format, or Quartus-specific check |
| AMD (Xilinx) | `vlm` (Vivado License Manager) or `lmutil lmstat -c <port@server>` | FlexLM format |
| OSS | N/A | Always return "open source — no license" |

### 12.2 FlexLM Output Parsing

All three commercial vendors use Flexera FlexLM. The `lmutil lmstat` output format is consistent:

```
# Pattern: Feature line
# "Users of DIAMOND_BASE:  (Total of 5 licenses issued;  Total of 0 licenses in use)"
regex: r"Users of (\w+):\s+\(Total of (\d+) licenses issued;\s+Total of (\d+) licenses in use\)"
capture_groups: (feature_name, total_seats, used_seats)

# Pattern: License expiry (from lmutil lmstat -i)
# "  DIAMOND_BASE  lattice  3.13  31-dec-2025  5  ..."
regex: r"\s+(\S+)\s+(\S+)\s+[\d.]+\s+(\d+-\w+-\d+)\s+(\d+)"
capture_groups: (feature, vendor, expiry_date, seat_count)

# Pattern: Server status
# "License server status: 1710@license-srv"
# "  license-srv: license server UP (MASTER) v11.18.1"
regex: r"(\S+): license server (\w+)"
capture_groups: (server_name, up_or_down)
```

### 12.3 TODO: License Manager Implementation

- [ ] **12.3.1** Implement `lmutil` path detection (usually in vendor tool directory or on PATH)
- [ ] **12.3.2** Implement FlexLM output parser — extract features, seats, expiry, server status
- [ ] **12.3.3** Implement `quartus_sh --liccheck` parser as alternative for Quartus
- [ ] **12.3.4** Implement license expiry warning logic (warn if <30 days, error if expired)
- [ ] **12.3.5** Expose `check_all_licenses()` Tauri command that queries all configured servers

---

## 13. IP Catalog Integration

### 13.1 Approach Per Vendor

| Vendor | IP Enumeration Method | Instantiation Method |
|---|---|---|
| Diamond | Hardcoded PMI list + Clarity Designer catalog | `sbp_design` TCL commands |
| Quartus | `qsys-script` + `ip-catalog --list` | `add_instance` in Platform Designer TCL |
| Vivado | `get_ipdefs` TCL command in live Vivado shell | `create_ip` + `set_property CONFIG.*` |
| OSS | FuseSoC catalog or manual list of FOSS cores | Direct HDL instantiation |

### 13.2 Vivado IP Catalog (Best Documented)

```tcl
# In a live Vivado TCL shell:

# List all available IPs
set all_ips [get_ipdefs]
foreach ip $all_ips {
    puts "$ip: [get_property DISPLAY_NAME [get_ipdefs $ip]]"
}

# Get parameters for a specific IP
create_ip -name blk_mem_gen -vendor xilinx.com -library ip -version 8.4 -module_name bram_inst
report_property [get_ips bram_inst]

# Configure IP
set_property CONFIG.Memory_Type "True_Dual_Port_RAM" [get_ips bram_inst]
set_property CONFIG.Write_Width_A 32 [get_ips bram_inst]
set_property CONFIG.Write_Depth_A 1024 [get_ips bram_inst]

# Generate IP output products
generate_target all [get_ips bram_inst]
```

### 13.3 TODO: IP Catalog Implementation

- [ ] **13.3.1** Create static IP catalog definitions for Diamond PMI primitives (hardcoded — Lattice doesn't have a clean enumeration API)
- [ ] **13.3.2** Implement Quartus IP enumeration via `qsys-script` or Platform Designer CLI
- [ ] **13.3.3** Implement Vivado IP enumeration via `get_ipdefs` in a persistent TCL shell
- [ ] **13.3.4** Implement TCL generation for IP instantiation for each vendor
- [ ] **13.3.5** Create a static list of common FOSS IP cores (VexRiscv, PicoRV32, LiteX peripherals)
- [ ] **13.3.6** Implement parameter validation before TCL generation

---

## 14. Interconnect Viewer

### 14.1 Data Model

The interconnect viewer displays a block diagram of the system bus topology. Data is stored as a JSON graph:

```json
{
  "blocks": [
    {"id": "cpu", "name": "BMC CPU", "type": "master", "bus": "AXI4-Lite", "x": 50, "y": 30},
    {"id": "xbar", "name": "AXI Crossbar", "type": "switch", "bus": "AXI4", "x": 120, "y": 140},
    {"id": "i2c", "name": "I2C Controller", "type": "slave", "bus": "APB", "x": 20, "y": 250}
  ],
  "connections": [
    {"from": "cpu", "to": "xbar", "bus": "AXI4-Lite"},
    {"from": "xbar", "to": "i2c", "bus": "APB"}
  ]
}
```

### 14.2 Import Sources

- **Vivado Block Design**: Parse `.bd` files (XML format) to extract IP blocks and AXI connections
- **Quartus Platform Designer**: Parse `.qsys` files (XML) to extract Qsys components and Avalon/AXI connections
- **Manual**: User defines the topology in the CovertEDA UI or a JSON file

### 14.3 TODO: Interconnect Viewer Implementation

- [ ] **14.3.1** Define JSON schema for interconnect topology
- [ ] **14.3.2** Implement Vivado `.bd` file parser (XML → topology JSON)
- [ ] **14.3.3** Implement Quartus `.qsys` file parser (XML → topology JSON)
- [ ] **14.3.4** Implement React SVG renderer with interactive hover/click on blocks
- [ ] **14.3.5** Implement drag-and-drop block placement (later phase)
- [ ] **14.3.6** Implement export to Vivado BD TCL / Qsys TCL

---

## 15. AI Report Analysis

### 15.1 Architecture

The AI feature sends parsed report data + device context to an LLM API and displays the response in a chat interface.

```
User types question → Frontend sends to Rust backend
→ Backend assembles context (device, reports, constraints)
→ Backend calls LLM API (Gemini, Claude, or local Ollama)
→ Response streamed back to frontend chat
```

### 15.2 Context Assembly

Before sending to the LLM, the backend assembles a system prompt with project context:

```
You are an FPGA timing closure and optimization expert.
The user is working on a {device} design using {toolchain}.

Current build results:
- Fmax: {fmax} MHz (target: {target} MHz)
- LUT utilization: {lut_used}/{lut_total} ({pct}%)
- Worst setup slack: {wns} ns
- Critical path: {from} → {to} ({levels} logic levels)

Constraint file summary:
{constraint_summary}

Answer questions about timing closure, optimization strategies,
constraint issues, and tool-specific TCL commands.
```

### 15.3 LLM API Options

| Provider | API | Notes |
|---|---|---|
| Anthropic Claude | `api.anthropic.com/v1/messages` | Best for technical analysis |
| Google Gemini | `generativelanguage.googleapis.com` | Free tier available |
| Local Ollama | `localhost:11434/api/generate` | No API key needed, runs locally |

### 15.4 TODO: AI Implementation

- [ ] **15.4.1** Implement LLM API client in Rust (reqwest + streaming support)
- [ ] **15.4.2** Implement context assembly from parsed reports
- [ ] **15.4.3** Implement chat history management (in-memory, optionally persisted)
- [ ] **15.4.4** Implement streaming response to frontend via Tauri events
- [ ] **15.4.5** Add API key configuration in settings
- [ ] **15.4.6** Support multiple LLM backends (Claude, Gemini, Ollama)

---

## 16. Register Map Editor

### 16.1 Data Model

```json
{
  "name": "DC-SCM Controller",
  "base_address": "0x00000000",
  "bus_width": 32,
  "registers": [
    {
      "offset": "0x0000",
      "name": "CTRL",
      "description": "Main control register",
      "access": "RW",
      "reset_value": "0x00000000",
      "fields": [
        {"bits": "0", "name": "EN", "description": "Global enable", "access": "RW"},
        {"bits": "1", "name": "RST", "description": "Soft reset", "access": "RW"},
        {"bits": "7:2", "name": "MODE", "description": "Operating mode", "access": "RW"}
      ]
    }
  ]
}
```

### 16.2 Export Formats

- **C Header**: `#define REG_CTRL 0x0000` + `#define CTRL_EN_BIT 0` + bit mask macros
- **SystemVerilog Package**: `parameter logic [31:0] CTRL_ADDR = 32'h0000;` + typedef structs
- **Documentation**: Markdown table or HTML register map

### 16.3 TODO: Register Map Implementation

- [ ] **16.3.1** Define JSON schema for register maps
- [ ] **16.3.2** Implement C header generator
- [ ] **16.3.3** Implement SystemVerilog package generator
- [ ] **16.3.4** Implement register map JSON import/export
- [ ] **16.3.5** Implement React bit-field visualizer component

---

## 17. Constraint Editor

### 17.1 Unified Constraint Model

CovertEDA stores constraints in a backend-agnostic internal model, then serializes to the correct format per backend.

### 17.2 Format Translation Matrix

| Internal Field | LPF (Diamond) | QSF (Quartus) | XDC (Vivado) | PCF (OSS iCE40) |
|---|---|---|---|---|
| Pin location | `LOCATE COMP "net" SITE "pin"` | `set_location_assignment PIN_XX -to net` | `set_property PACKAGE_PIN XX [get_ports net]` | `set_io net pin_num` |
| I/O standard | `IOBUF PORT "net" IO_TYPE=LVCMOS33` | `set_instance_assignment -name IO_STANDARD "3.3-V LVTTL" -to net` | `set_property IOSTANDARD LVCMOS33 [get_ports net]` | N/A (device-level) |
| Drive strength | `IOBUF PORT "net" DRIVE=8` | `set_instance_assignment -name CURRENT_STRENGTH_NEW "8MA" -to net` | `set_property DRIVE 8 [get_ports net]` | N/A |
| Slew rate | `IOBUF PORT "net" SLEWRATE=SLOW` | `set_instance_assignment -name SLEW_RATE 1 -to net` | `set_property SLEW SLOW [get_ports net]` | N/A |

### 17.3 TODO: Constraint Editor Implementation

- [ ] **17.3.1** Implement LPF parser and writer
- [ ] **17.3.2** Implement QSF pin assignment parser and writer
- [ ] **17.3.3** Implement XDC parser and writer
- [ ] **17.3.4** Implement PCF parser and writer
- [ ] **17.3.5** Implement cross-format constraint translation (best-effort — not all properties map 1:1)

---

## 18. UX Design Guidelines — MUST READ BEFORE BUILDING UI

> **CRITICAL: Every UI component, menu, panel, and dialog in CovertEDA MUST follow these guidelines. These are not suggestions — they are hard requirements derived from Nielsen Norman Group research on complex application design, progressive disclosure patterns, and expert-user interaction studies. Read this entire section before writing ANY frontend code.**

### 18.1 The Three User Types — Design for All Three Simultaneously

CovertEDA will be used by three distinct user profiles (per NNG research, June 2025). Every screen must serve all three:

**The Legacy User** — Has used Vivado/Quartus/Diamond for 10+ years. Knows their vendor tool deeply but uses it inefficiently (drag-and-drop files, click through GUI wizards, never touches TCL). They fear losing productivity, not change itself. They need:
- A familiar file tree panel (like the vendor GUI Sources panel)
- Clickable pipeline stages (like the vendor GUI flow navigator)
- Visual report dashboards (replaces digging through `.rpt` files manually)
- Mouse-driven interaction for everything — never require keyboard shortcuts

**The Legend User** — Power user who has mastered TCL scripting, Makefiles, and command-line flows. They want maximum speed and keyboard control. They need:
- Command palette (⌘K) that indexes every action in the application
- Keyboard shortcuts for all frequent actions (⌘B = build, ⌘R = reports, etc.)
- TCL console with direct access to the backend shell
- Ability to see/copy the exact CLI command CovertEDA will execute before it runs
- Minimal UI chrome — they want information density, not whitespace

**The Learner** — Junior FPGA engineer who knows Verilog/VHDL but is new to timing closure, constraint writing, and vendor tool ecosystems. They need:
- Tooltips on every technical term (WNS, TNS, Fmax, slack, EBR, LUT4, etc.)
- AI chat that can explain reports in plain language
- Visual progress indicators showing where they are in the build flow
- Smart defaults so they can hit "Build" immediately without configuring 30 settings
- In-context "Explain this" options on report data

**Implementation Rule:** Every feature must be accessible through BOTH the GUI (menus, buttons, right-click context menus) AND the command palette. Never create a feature that only exists as a keyboard shortcut or only exists as a buried menu item.

### 18.2 Progressive Disclosure — The Organizing Principle

Progressive disclosure is the #1 design pattern for CovertEDA. The rule: **show only what's needed for the current task, reveal complexity on demand, never exceed two levels of depth.**

#### 18.2.1 Two-Level Maximum Rule

Every panel, dialog, and settings page follows this structure:

- **Level 1 (Primary View):** The essential information and most common controls. This is what the user sees by default. It must be sufficient to complete the 80% use case without expanding anything.
- **Level 2 (Expanded/Advanced View):** Additional options, parameters, and details revealed by clicking "Advanced," "Show Details," "▼ More Options," or similar affordance.
- **Level 3 DOES NOT EXIST.** If you feel the need for a third level, you have too much in Level 2. Reorganize by grouping into tabs or separate panels instead.

#### 18.2.2 Progressive Disclosure Applied to Each CovertEDA Panel

**Build Pipeline Panel:**
- Level 1: Pipeline stages as clickable cards (Synthesis → Map → PAR → Bitstream). Big green "▶ Build All" button. Status badges (✓ done, ⟳ running, ✕ failed, ○ pending).
- Level 2: Click a stage card to expand → shows strategy options, effort level, frequency target, seed value, custom TCL arguments. Collapse back with a single click.
- NEVER show Synplify arguments, PAR effort options, and bitstream compression settings all at once on the main screen.

**Constraint Editor:**
- Level 1: Table with columns: Pin | Net | Direction | I/O Standard | Bank. Searchable. Sortable.
- Level 2: Click a row → detail panel slides in from right showing: drive strength, slew rate, pull mode, differential pair, termination, ODT, DCI. These are per-pin advanced attributes most users never touch.
- NEVER show drive strength and slew rate columns in the main table.

**Timing Report:**
- Level 1: Hero card (PASS/FAIL, Fmax achieved vs target, margin). Clock domain summary table (name, frequency, WNS). Number of failing paths.
- Level 2: Click a clock domain → expands to show critical paths for that domain, each with a visual delay bar, logic levels, from/to endpoints, slack value. Click a path → shows full path detail with per-stage delays.
- NEVER show all critical paths for all clock domains simultaneously on page load.

**Utilization Report:**
- Level 1: Hero card (overall LUT/FF/BRAM/DSP usage with percentage bars). By-category summary (Logic, Memory, I/O, Clock).
- Level 2: Click a category → expands to show individual resource items (LUT4, LUT5, Carry chains, etc.) with used/total/percentage. Click "By Module" tab → shows hierarchical breakdown.

**File Tree:**
- Level 1: Folder tree with file names, type icons (RTL/TB/Constraint), and git status letter (M/A/U/D). Synthesis inclusion indicator (green dot).
- Level 2: Click a file → detail panel at bottom shows: language, line count, git status, last modified, synthesis/simulation inclusion toggles, and a "Show in TCL" button that displays the `prj_src add` or equivalent command.

**IP Catalog:**
- Level 1: Category list on left (Memory, Math/DSP, I/O, Clock, Interface). Clicking a category shows IP names with one-line descriptions.
- Level 2: Click an IP → parameter configuration panel on right. Show only the 3-5 most common parameters with defaults pre-filled. An "Advanced Parameters" toggle reveals the full parameter list.

**Settings/Preferences:**
- Level 1: Tabbed interface — General | Tool Paths | License | AI | Appearance. Each tab shows only the 5-8 most common settings.
- Level 2: "Show Advanced Settings" toggle at bottom of each tab reveals rarely-changed options (environment variables, custom TCL preambles, proxy settings).

### 18.3 Smart Defaults — Zero-Configuration First Build

**Hard Rule: A new user who selects a device and points to a source directory must be able to hit "Build" and get a bitstream without configuring ANY additional settings.**

Every configurable parameter MUST have an intelligent default:

| Setting | Smart Default | Rationale |
|---|---|---|
| Synthesis strategy | Area optimization (small devices), Timing optimization (large devices) | Matches what vendor GUIs do by default |
| Frequency target | 25 MHz (small), 100 MHz (medium), 250 MHz (large) | Based on device family typical use |
| I/O standard | LVCMOS33 | Most common standard, works on almost all banks |
| Drive strength | 8 mA | Safe middle value |
| Slew rate | Slow | Conservative, reduces EMI |
| PAR effort | Standard | Good enough for 90% of designs |
| Timing model | Worst-case (slow/hot) | Conservative — prevents field failures |
| Bitstream compression | Enabled | Saves flash space, minimal overhead |
| Build output directory | `./output/` or `./impl1/` | Matches vendor conventions |
| Programmer cable | Auto-detect | Don't make user type USB-Blaster or FTDI |

**Implementation:** When creating a new project via the UI, pre-populate ALL fields. The "New Project" dialog should have exactly 3 required inputs: project name, device part number, and top-module source file. Everything else auto-populates. An "Advanced Project Settings" expandable section (Level 2) allows overriding defaults.

### 18.4 Command Palette — The Expert Escape Hatch

The command palette (⌘K / Ctrl+K) is the universal access point for Legend users. Implementation requirements:

**Must Index:**
- Every navigation action: "Go to Timing Report", "Go to Build Pipeline", "Open Settings"
- Every build action: "Run Full Build", "Run Synthesis Only", "Run PAR Only", "Cancel Build"
- Every file action: "Open File...", "Toggle Synthesis Inclusion", "Toggle Simulation Inclusion"
- Every git action: "Commit", "Push", "Pull", "Stash", "Show Diff"
- Every report action: "Export Timing Report", "Show Critical Path #1", "Compare to Previous Build"
- Every backend action: "Switch to Vivado", "Switch to Diamond", "Switch to OSS CAD"
- Every setting: "Change Frequency Target", "Change Device", "Configure License Server"
- AI actions: "Ask AI about timing", "Explain worst path"

**Search Behavior:**
- Fuzzy matching (typing "tim rep" matches "Go to Timing Report")
- Most recently used commands float to top
- Show keyboard shortcut next to each command (teaches shortcuts passively)
- Results appear within 50ms of keystroke — must feel instant

**Visual Design:**
- Centered modal overlay, ~600px wide, dark background blur behind
- Single text input at top, results list below (max 8 visible, scrollable)
- Each result shows: icon + command name + keyboard shortcut (right-aligned, dimmed)
- Enter executes highlighted command, Escape closes, Arrow keys navigate

### 18.5 In-Context Learning — Tooltips and Teach-on-Hover

Instead of documentation or tutorials, CovertEDA teaches users through in-context cues embedded at the point of interaction.

**Tooltip Requirements:**

Every technical term in the UI must have a tooltip that explains it in one sentence:
- "WNS" → "Worst Negative Slack — the tightest setup timing margin. Negative values mean timing failure."
- "TNS" → "Total Negative Slack — sum of all negative slack across all failing paths. 0.0 = all paths pass."
- "Fmax" → "Maximum operating frequency the design can achieve after place and route."
- "LUT4" → "4-input Look-Up Table — the basic logic element in this FPGA family."
- "EBR" → "Embedded Block RAM — dedicated memory blocks on the FPGA die."
- "WHS" → "Worst Hold Slack — the tightest hold timing margin. Negative values mean hold violations."
- "DRC" → "Design Rule Check — automated validation of your design against device and tool rules."
- "Slack" → "Timing margin between your data arrival and the clock edge. Positive = passing, negative = failing."

**Action Tooltips — Show the TCL:**

When hovering over any build action button, show the TCL/CLI command that will execute:
- Hover over "▶ Run Synthesis" → tooltip: `prj_run Synthesis -impl impl1 -forceOne` (Diamond) or `execute_module -tool syn` (Quartus) or `synth_design -top top_level -part xc7a100t` (Vivado)
- Hover over "▶ Build All" → tooltip: `pnmainc -t build.tcl` or `quartus_sh --flow compile my_project`

This serves two purposes: it teaches Legacy users the CLI (helping them become Legends), and it gives Legend users confidence that CovertEDA is doing what they expect.

**Keyboard Shortcut Discovery:**

Every button that has a keyboard shortcut must show it in the tooltip:
- Hover over Build button → "Run Full Build (⌘B)"
- Hover over Reports nav icon → "Reports (⌘4)"
- Hover over Command Palette icon → "Command Palette (⌘K)"

### 18.6 Build History and Thought Tracking

Complex-application users face long waits (FPGA builds take minutes to hours) and frequent interruptions. NNG research shows that offloading working memory is critical.

**Build History Table:**

CovertEDA must maintain a persistent build history with the following columns:
- **#** — Sequential build number
- **Timestamp** — When the build started
- **Backend** — Which toolchain was used
- **Status** — ✓ Pass / ✕ Fail / ⚠ Warnings
- **Fmax** — Achieved frequency (MHz)
- **LUT %** — Logic utilization percentage
- **WNS** — Worst negative slack (ns)
- **Duration** — How long the build took
- **Notes** — User-editable free-text field (one line)

**Build Notes:**

Every build must have an optional "Notes" field where the user can type a one-line annotation:
- "Trying seed 3 with aggressive PAR effort"
- "Added pipeline register after PQC multiply stage"
- "Reduced clock to 100MHz to see if hold violations clear"

These notes appear in the build history table and are searchable via the command palette ("Find build where I tried seed 3").

**Build Comparison:**

Selecting two builds in the history should show a side-by-side diff:
- Fmax delta, utilization delta, WNS delta
- Which files changed between builds (via git diff)
- Which settings changed (frequency target, effort, seed, etc.)

### 18.7 Reduce Clutter Without Reducing Capability — Layout Rules

**Information Hierarchy (Pyramid Structure):**

Every data-heavy screen follows the pyramid: summary at top, details on demand below.

```
┌─────────────────────────────────────────────┐
│  HERO CARD — 1-3 key metrics, PASS/FAIL     │  ← Glanceable in <1 second
├─────────────────────────────────────────────┤
│  SUMMARY TABLE — 5-10 rows, sortable        │  ← Scannable in <5 seconds
├─────────────────────────────────────────────┤
│  DETAIL CARDS — expanded on click            │  ← Read on demand
└─────────────────────────────────────────────┘
```

**Density vs. Whitespace:**

- CovertEDA is a professional tool, not a marketing website. Prefer information density over generous whitespace.
- Use 12-14px body text (not 16-18px). Use compact row heights in tables (28-32px, not 48px).
- Use the full viewport — no max-width container that wastes side margins on wide monitors.
- Color and contrast do the work of separation — don't rely on massive padding between elements.
- Exception: report hero cards can have more breathing room since they convey the single most important status.

**Color Coding System (Consistent Across All Panels):**

| Color | Meaning | Used For |
|---|---|---|
| Green (#4ade80) | Pass / Good / Included | Timing pass, positive slack, file in synthesis |
| Red (#f87171) | Fail / Error / Critical | Timing fail, negative slack, DRC errors, git deleted |
| Yellow (#fbbf24) | Warning / Modified | DRC warnings, git modified, utilization >80% |
| Orange (#fb923c) | Caution / Untracked | Critical warnings, git untracked |
| Cyan (#22d3ee) | Info / Active / Accent | Selected items, active tab, info-level DRC |
| Purple (#c084fc) | Simulation | Files in simulation testbench |
| Dim gray (#6b7280) | Inactive / Excluded | Disabled options, files not in synthesis |

Use these consistently. Never use green for an error or red for success. The user should be able to glance at any screen and know the health of their design from color alone.

### 18.8 Context Menus — Right-Click Everything

Every item that can be acted upon must have a right-click context menu. This is how Legacy users discover features and how all users access secondary actions without hunting through menus.

**File Tree — Right-click a file:**
- Open in Editor
- Toggle Synthesis Inclusion
- Toggle Simulation Inclusion
- Show Git Diff
- Copy Path
- Reveal in File Manager
- Delete

**Report — Right-click a critical path:**
- Copy Path Details
- Explain with AI
- Create Timing Exception (generates `set_false_path` or `set_multicycle_path`)
- Highlight in Constraint Editor
- Show in TCL Console

**Build Pipeline — Right-click a stage:**
- Run This Stage Only
- Run From Here
- Show Stage Settings
- Copy TCL Command
- View Last Log for This Stage

### 18.9 Responsive Feedback — Never Leave the User Wondering

Per Nielsen's #1 heuristic (Visibility of System Status):

**During Builds:**
- Show a progress bar or spinner on the active pipeline stage
- Stream stdout/stderr to the console panel in real-time
- Update the stage card status immediately when a stage completes (✓ or ✕)
- Show elapsed time on the running stage, updating every second
- If a build takes >30 seconds, show an estimated time remaining (based on previous build duration)

**After Builds:**
- Flash the report icon in the nav if results are ready but the user is on a different panel
- Auto-navigate to the Timing Report if the build had timing failures (configurable)
- Show a toast notification: "Build #17 completed — Fmax 127.3 MHz (✓ PASS)" or "Build #18 failed — 3 timing violations"
- Badge the Reports nav icon with a red dot if there are new unreviewed failures

**During Long Operations (IP generation, programming):**
- Show a determinate progress bar if possible
- Show an indeterminate spinner with descriptive text: "Generating IP core output products..."
- NEVER show a blank screen or frozen UI during a multi-second operation

### 18.10 TODO: UX Implementation Checklist

- [ ] **18.10.1** Implement two-level progressive disclosure on Build Pipeline (collapsed stages → expanded settings)
- [ ] **18.10.2** Implement two-level progressive disclosure on Constraint Editor (summary table → detail panel)
- [ ] **18.10.3** Implement two-level progressive disclosure on all Report tabs (hero → detail)
- [ ] **18.10.4** Implement command palette with fuzzy search indexing all actions (target: <50ms response)
- [ ] **18.10.5** Add smart defaults for all project settings (zero-config first build)
- [ ] **18.10.6** Add tooltips to every technical term (WNS, TNS, Fmax, LUT, EBR, etc.)
- [ ] **18.10.7** Add TCL command preview tooltips on all build action buttons
- [ ] **18.10.8** Add keyboard shortcut hints to all button tooltips
- [ ] **18.10.9** Implement build history table with Notes field
- [ ] **18.10.10** Implement build comparison (side-by-side delta view)
- [ ] **18.10.11** Implement right-click context menus for file tree, reports, and pipeline
- [ ] **18.10.12** Implement real-time build progress (streaming console, elapsed timer, ETA)
- [ ] **18.10.13** Implement toast notifications for build completion
- [ ] **18.10.14** Apply consistent color coding system across all panels
- [ ] **18.10.15** Verify every feature is accessible via BOTH GUI click AND command palette
- [ ] **18.10.16** Test with all three user personas: Legacy (mouse-only), Legend (keyboard-only), Learner (needs tooltips)

---

## 19. Frontend (React UI)

### 19.1 Tech Stack

- React 18 + TypeScript
- Tailwind CSS (utility classes only — no build step needed in Tauri webview)
- Tauri IPC via `@tauri-apps/api`
- No external component library — custom components matching the mockup aesthetic

### 19.2 Component Hierarchy

```
App
├── GitStatusBar             (always visible, top)
├── LeftNav                  (icon sidebar, 56px wide)
├── FileTreePanel            (collapsible, 230px wide)
│   ├── FileTreeHeader       (project name, unsaved count)
│   ├── FileTreeRow[]        (individual file rows with status icons)
│   └── FileDetailPanel      (selected file metadata)
├── MainContent              (flex-1, switches by section)
│   ├── TopBar               (backend name, device, cmd palette trigger, build button)
│   ├── BuildPipeline        (pipeline steps + quick actions + history)
│   ├── ReportViewer         (tabbed: Timing / Util / Power / DRC / I/O)
│   │   ├── TimingReport     (hero card + clock domains + critical paths with visual bars)
│   │   ├── UtilizationReport (resource bars + by-module table)
│   │   ├── PowerReport      (stacked bar + breakdown + by-rail)
│   │   ├── DRCReport        (severity cards + item list)
│   │   └── IOBankingReport  (bank cards with pin lists)
│   ├── IPCatalog            (sidebar list + config panel)
│   ├── InterconnectViewer   (SVG canvas + detail sidebar)
│   ├── AIChat               (message list + input)
│   ├── RegisterMap          (register list + bit visualizer)
│   ├── ConstraintEditor     (searchable table)
│   ├── ResourceView         (quick utilization bars)
│   └── Console              (scrollable log output)
├── CommandPalette           (modal, ⌘K triggered)
├── BackendSwitcher          (dropdown from logo)
└── LicenseManager           (modal)
```

### 19.3 TODO: Frontend Implementation

- [ ] **19.3.1** Set up React + TypeScript project with Tauri
- [ ] **19.3.2** Port the mockup CSS/component structure to proper React components
- [ ] **19.3.3** Define TypeScript interfaces matching Rust struct `Serialize` types
- [ ] **19.3.4** Implement Tauri IPC hooks (`invoke`, `listen`)
- [ ] **19.3.5** Implement real-time build log streaming via Tauri events
- [ ] **19.3.6** Implement file tree with live git status updates
- [ ] **19.3.7** Implement report viewer with all 5 report tabs
- [ ] **19.3.8** Implement command palette with fuzzy search
- [ ] **19.3.9** Implement keyboard shortcuts (⌘K, ⌘B for build, etc.)

---

## 20. IPC Contract: Rust ↔ Frontend

### 20.1 Tauri Command Definitions

Every backend function exposed to the frontend is a Tauri command:

```rust
// src-tauri/src/commands.rs

#[tauri::command]
async fn get_git_status(project_dir: String) -> Result<GitStatus, String> { ... }

#[tauri::command]
async fn get_file_tree(project_dir: String) -> Result<Vec<FileEntry>, String> { ... }

#[tauri::command]
async fn start_build(backend_id: String, project_dir: String) -> Result<String, String> { ... }

#[tauri::command]
async fn get_timing_report(backend_id: String, impl_dir: String) -> Result<TimingReport, String> { ... }

#[tauri::command]
async fn get_utilization_report(backend_id: String, impl_dir: String) -> Result<ResourceReport, String> { ... }

#[tauri::command]
async fn switch_backend(backend_id: String) -> Result<(), String> { ... }

#[tauri::command]
async fn check_licenses() -> Result<Vec<LicenseInfo>, String> { ... }

#[tauri::command]
async fn list_ip_catalog(backend_id: String) -> Result<Vec<IPEntry>, String> { ... }

#[tauri::command]
async fn send_ai_message(message: String, context: String) -> Result<String, String> { ... }
```

### 20.2 Event-Based Communication (for streaming)

Build output and file watcher updates use Tauri events (push model):

```rust
// Rust side: emit events
app_handle.emit("build:stdout", line)?;
app_handle.emit("build:stage_complete", stage_id)?;
app_handle.emit("build:finished", result)?;
app_handle.emit("files:changed", changed_paths)?;

// Frontend side: listen
import { listen } from '@tauri-apps/api/event';
listen('build:stdout', (event) => {
    appendToConsole(event.payload);
});
```

---

## 21. Cross-Platform Considerations

### 21.1 Path Handling

```rust
// ALWAYS use PathBuf, never string concatenation for paths
// ALWAYS use std::path::MAIN_SEPARATOR or Path::join()
// NEVER hardcode "/" or "\" in path strings

let tool_path = if cfg!(target_os = "windows") {
    PathBuf::from(r"C:\lscc\diamond\3.13\bin\nt64\pnmainc.exe")
} else {
    PathBuf::from("/usr/local/diamond/3.13/bin/lin64/pnmainc")
};
```

### 21.2 Process Spawning

```rust
// Use tokio::process::Command for async process spawning
// Windows: use .creation_flags(CREATE_NO_WINDOW) to hide console windows
// Linux: set LD_LIBRARY_PATH if vendor tools need it

#[cfg(target_os = "windows")]
{
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}
```

### 21.3 WebView2 (Windows) vs WebKitGTK (Linux)

- Windows: WebView2 is auto-installed on Windows 10/11. For Windows 7/8, bundle the WebView2 bootstrapper.
- Linux: Install `libwebkit2gtk-4.1-dev` (Ubuntu/Debian) or equivalent.

---

## 22. Testing Strategy

### 22.1 Test Categories

| Category | What | How |
|---|---|---|
| Unit tests (Rust) | Report parsers, constraint parsers, git functions | `cargo test` with fixture files |
| Integration tests | Backend trait implementations with mock tool output | Spawn mock processes that output sample reports |
| Frontend tests | React components render correctly | Vitest + Testing Library |
| E2E tests | Full Tauri app launches, builds run | Tauri's WebDriver testing or manual |

### 22.2 Test Fixtures

Store sample report files from each vendor in `tests/fixtures/`:

```
tests/fixtures/
├── diamond/
│   ├── sample.par          # PAR report with known values
│   ├── sample.twr          # Timing report
│   ├── sample.mrp          # Map report
│   └── sample.lpf          # Constraint file
├── quartus/
│   ├── sample.sta.rpt      # STA report
│   ├── sample.fit.rpt      # Fitter report
│   └── sample.qsf          # Settings file
├── vivado/
│   ├── timing_summary.rpt  # report_timing_summary output
│   ├── utilization.rpt     # report_utilization output
│   └── sample.xdc          # Constraint file
└── oss/
    ├── nextpnr_report.json # nextpnr JSON report
    └── sample.pcf           # PCF constraint file
```

### 22.3 TODO: Testing

- [ ] **22.3.1** Collect sample report files from real builds of each vendor tool
- [ ] **22.3.2** Write parser unit tests for each report type with expected values
- [ ] **22.3.3** Write constraint parser round-trip tests (read → write → read should be identical)
- [ ] **22.3.4** Write git integration tests using `git2` to create test repos
- [ ] **22.3.5** Write frontend component tests for each major view

---

## 23. Vendor Documentation References

### 23.1 Master Reference List

| Vendor | Document | ID/URL |
|---|---|---|
| **Lattice** | Diamond User Guide | [latticesemi.com UG35](https://www.latticesemi.com/-/media/LatticeSemi/Documents/UserManuals/1D/DiamondUG35.ashx?document_id=51082) |
| **Lattice** | Diamond TCL Command Reference | [Diamond 3.4 TCL Help](https://manualzz.com/doc/o/nfq2g/lattice-3.4-help-diamond-help-tcl-command-reference-guide) |
| **Lattice** | Radiant TCL Reference (newer devices) | [Radiant TCL Guide](https://manualzz.com/doc/o/vm0jt/lattice-radiant-software-user-guide-tcl-command-reference-guide) |
| **Intel** | Quartus Prime Scripting Guide (Standard) | [Intel UG-20144](https://www.intel.com/content/www/us/en/docs/programmable/683325/18-1/command-line-scripting.html) |
| **Intel** | Quartus Prime Scripting Guide (Pro) | [Intel UG-20132](https://manuals.plus/m/5da3c05736c21c23bf892b93468b3cf9ee03b4baccfe78a6f663a8f6368a4482) |
| **Intel** | Quartus Scripting Reference Manual (PDF) | [tclscriptrefmnl.pdf](https://cdrdv2-public.intel.com/654662/tclscriptrefmnl.pdf) |
| **Intel** | Quartus Prime Timing Analyzer | [Intel UG-20243](https://www.intel.com/content/www/us/en/docs/programmable/683243/24-1/the-quartus-sta-executable.html) |
| **Intel** | Quartus Scripting Support Portal | [intel.com scripting](https://www.intel.com/content/www/us/en/support/programmable/support-resources/design-software/sof-qts-scripting.html) |
| **AMD** | Vivado TCL Scripting (UG894) | [xilinx.com UG894 PDF](https://www.xilinx.com/support/documents/sw_manuals/xilinx2022_2/ug894-vivado-tcl-scripting.pdf) |
| **AMD** | Vivado TCL Command Reference (UG835) | [docs.amd.com UG835](https://docs.amd.com/r/en-US/ug835-vivado-tcl-commands/report_timing) |
| **AMD** | Vivado Implementation Guide (UG904) | [docs.amd.com UG904](https://docs.amd.com/r/en-US/ug904-vivado-implementation/Tcl-Commands-and-Options) |
| **OSS** | Yosys Manual & Command Reference | [yosyshq.readthedocs.io](https://yosyshq.readthedocs.io/projects/yosys/en/latest/) |
| **OSS** | Yosys JSON Output Format | [write_json docs](https://yosyshq.readthedocs.io/projects/yosys/en/latest/cmd/write_json.html) |
| **OSS** | nextpnr Documentation | [github.com/YosysHQ/nextpnr](https://github.com/YosysHQ/nextpnr) |
| **OSS** | Yosys+nextpnr Academic Paper | [arXiv:1903.10407](https://arxiv.org/pdf/1903.10407) |
| **Framework** | Tauri v2 Documentation | [v2.tauri.app](https://v2.tauri.app/) |
| **Framework** | git2-rs (libgit2 for Rust) | [docs.rs/git2](https://docs.rs/git2/latest/git2/) |
| **Framework** | notify (file watcher for Rust) | [docs.rs/notify](https://docs.rs/notify/latest/notify/) |

### 23.2 Where to Find Tool-Specific Help

```bash
# Diamond: TCL help from within pnmainc
pnmainc
% help                          # List all command groups
% help prj_project              # Help for project commands
% help prj_run                  # Help for build commands

# Quartus: API explorer
quartus_sh --qhelp              # Interactive HTML help browser
quartus_sh -s                   # Interactive TCL shell
tcl> help                       # List packages
tcl> help -pkg ::quartus::flow  # Help for flow package

# Vivado: TCL help
vivado -mode tcl
Vivado% help report_timing      # Help for specific command
Vivado% help -category report   # List all report commands
Vivado% get_ipdefs              # List available IPs

# Yosys: command help
yosys
yosys> help                     # List all commands
yosys> help synth_ecp5          # Help for ECP5 synthesis
```

---

## 24. Implementation Phases & Milestones

### Phase 1: Foundation (Weeks 1–4)

**Goal:** Single backend (Diamond) working end-to-end: build, parse reports, display in UI.

- [ ] Tauri project scaffolding with React frontend
- [ ] Backend trait definition (Section 4)
- [ ] Diamond backend: `cli_path()`, `pipeline_stages()`, `generate_build_script()`, `start_build()`
- [ ] Diamond report parsers: timing (`.par`/`.twr`), utilization (`.par`/`.mrp`)
- [ ] Build pipeline UI with real-time console streaming
- [ ] Report viewer UI: Timing + Utilization tabs
- [ ] File tree (basic — filesystem walk, no git yet)

### Phase 2: Git + File Intelligence (Weeks 5–6)

**Goal:** Git status bar, per-file status in tree, save detection.

- [ ] Git integration via `git2-rs` (Section 10)
- [ ] Git status bar component
- [ ] Per-file git status in file tree
- [ ] File watcher via `notify`
- [ ] Synthesis/simulation fileset detection from `.ldf` project file

### Phase 3: Multi-Backend (Weeks 7–10)

**Goal:** Add Quartus, Vivado, and OSS backends.

- [ ] Quartus backend (Section 6) — all trait methods
- [ ] Quartus report parsers (`.sta.rpt`, `.fit.rpt`)
- [ ] Vivado backend (Section 7) — all trait methods
- [ ] Vivado report parsers (`report_timing_summary`, `report_utilization`, `report_power`)
- [ ] OSS backend (Section 8) — all trait methods
- [ ] nextpnr JSON report parser
- [ ] Backend switcher UI
- [ ] Command palette with backend-aware commands

### Phase 4: Advanced Features (Weeks 11–14)

**Goal:** License manager, IP catalog, constraint editor, interconnect viewer.

- [ ] License manager: FlexLM query + UI modal (Section 12)
- [ ] Constraint editor: read/write all formats (Section 17)
- [ ] IP catalog: static catalogs + Vivado `get_ipdefs` (Section 13)
- [ ] Interconnect viewer: SVG renderer + JSON topology (Section 14)
- [ ] Register map editor with C/SV export (Section 16)

### Phase 5: AI + Polish (Weeks 15–16)

**Goal:** AI report analysis, power/DRC reports, keyboard shortcuts, settings.

- [ ] AI chat integration with LLM API (Section 15)
- [ ] Power report parser + UI
- [ ] DRC report parser + UI
- [ ] I/O banking report parser + UI
- [ ] Settings/configuration UI (tool paths, license servers, AI API key)
- [ ] Keyboard shortcut system
- [ ] Cross-platform testing (Linux + Windows)

### Phase 6: Distribution (Week 17+)

- [ ] Tauri build for Linux (.deb, .AppImage)
- [ ] Tauri build for Windows (.msi, .exe)
- [ ] Auto-updater configuration
- [ ] User documentation
- [ ] Sample project with all four backends

---

## Appendix A: Quick Command Cheat Sheet

```bash
# ═══ LATTICE DIAMOND ═══
pnmainc -t build.tcl                           # Run TCL build script
pnmainc                                        # Interactive TCL shell
pgrcmd -infile programmer.xcf                  # Program device

# ═══ INTEL QUARTUS ═══
quartus_sh --flow compile <project>            # Full compilation
quartus_sh -t build.tcl                        # Run TCL script
quartus_syn <project>                          # Synthesis only
quartus_fit <project>                          # Fitter only
quartus_sta <project> --do_report_timing       # Timing analysis
quartus_pgm -c USB-Blaster -m JTAG -o "P;output.sof"  # Program

# ═══ AMD VIVADO ═══
vivado -mode batch -source build.tcl -notrace  # Batch build
vivado -mode tcl                               # Interactive TCL
vivado -mode gui                               # GUI (not used by CovertEDA)

# ═══ OSS CAD SUITE ═══
yosys -p 'synth_ecp5 -json out.json' *.v       # Yosys synthesis
nextpnr-ecp5 --85k --json out.json --lpf p.lpf --textcfg out.config  # PnR
ecppack --compress out.config out.bit           # Pack bitstream
openFPGALoader --board <name> out.bit           # Program

# ═══ LICENSE CHECKING ═══
lmutil lmstat -c 1710@server -a                # FlexLM status (all vendors)
quartus_sh --liccheck                          # Quartus-specific check
vlm                                            # Vivado License Manager
```

---

*This document is the implementation specification for CovertEDA. Every section maps to a module in the codebase. Follow the TODOs in order within each phase. When in doubt, reference the vendor documentation links in Section 22.*
