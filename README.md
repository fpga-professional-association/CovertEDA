<p align="center">
  <img src="docs/assets/logo-placeholder.png" alt="CovertEDA Logo" width="120" />
</p>

<h1 align="center">CovertEDA</h1>

<p align="center">
  <strong>A unified FPGA development frontend for every toolchain.</strong><br />
  <em>Released by the <a href="https://github.com/fpga-professional-association">FPGA Professional Association</a></em>
</p>

<p align="center">
  <a href="#the-problem">The Problem</a> &middot;
  <a href="#what-makes-this-gui-different">The Solution</a> &middot;
  <a href="#features">Features</a> &middot;
  <a href="#supported-backends">Backends</a> &middot;
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#roadmap">Roadmap</a> &middot;
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-Beta-blue" alt="Beta" />
  <img src="https://img.shields.io/badge/Tauri-2.0-blue?logo=tauri" alt="Tauri 2" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react" alt="React 18" />
  <img src="https://img.shields.io/badge/Rust-stable-orange?logo=rust" alt="Rust" />
  <img src="https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/license-Open%20Source-green" alt="Open Source" />
</p>

---

## The Problem

FPGA engineers are forced to use vendor-specific IDEs that are slow, buggy, and stuck in the past. Every major vendor ships its own GUI -- built on aging Java or Qt frameworks -- with inconsistent interfaces, random crashes, and workflows that assume you never switch vendors.

**The pain points are universal:**

- **Vendor GUIs are slow.** Quartus takes 30+ seconds to open. Vivado's GUI lags on basic operations. Radiant hangs during IP generation. These tools were built a decade ago on frameworks that show their age.
- **They crash.** Every FPGA engineer has lost work to an unrecoverable vendor GUI crash. Vivado's "Fatal Error" dialogs. Quartus freezing during compilation. Diamond's random segfaults. This is not acceptable for professional tools.
- **The UIs are overwhelming.** Thousands of menu items, deeply nested option dialogs, and settings that belong in the 1990s. Finding the one option you need takes longer than writing the RTL.
- **No version control integration.** In 2026, vendor tools still have zero awareness of git. No branch display, no diff awareness, no commit-before-build workflow. Engineers manually track which source state produced which bitstream.
- **Four different interfaces for the same job.** Switch from Lattice to Intel? Relearn everything. The constraint syntax changes, the report format changes, the build flow changes, the keyboard shortcuts change. Your muscle memory is worthless.
- **No AI assistance.** When a junior engineer gets a timing violation, vendor tools offer a cryptic error message and a 400-page PDF. No contextual help, no suggested fixes, no understanding of what went wrong.

## What Makes This GUI Different

### Fast

CovertEDA launches instantly. The UI runs at 60fps on a native webview (Tauri 2 + Rust backend). There is no Java startup penalty, no loading splash screens, no "initializing workspace" delays. Every click responds immediately. Build output streams in real time with zero lag.

### It Doesn't Crash

The Rust backend handles all vendor tool orchestration through isolated subprocesses. If a vendor tool crashes (and they will), CovertEDA catches the failure, reports it cleanly, and keeps running. Your project state is never lost because of a vendor bug.

### Clean Interface

Progressive disclosure: Level 1 shows the essentials (build, reports, constraints). Level 2 is one click away for advanced options. There is no Level 3. No deeply nested menus, no overwhelming option dialogs, no settings you'll never use cluttering your screen.

### One Interface for Every Vendor

Radiant, Quartus, Vivado, Yosys -- same UI, same keyboard shortcuts, same report format, same constraint editor. Switch vendors by clicking a dropdown. Your workflow doesn't change because the FPGA vendor changed.

### Git-Aware

Built-in git status bar, branch display, commit-before-build workflow, and build-to-commit linking. Every build is recorded with the exact git commit that produced it. You can trace any bitstream back to its source code state. Uses libgit2 for fast, reliable operations -- no shelling out to the git CLI.

### AI-Powered

Built-in Claude AI assistant that understands FPGA design, HDL patterns, timing analysis, and vendor-specific errors. Ask about timing violations and get actionable suggestions. The assistant automatically knows your project context -- backend, device, top module, current build status.

### Open Source

CovertEDA is released by the [FPGA Professional Association](https://github.com/fpga-professional-association) as an open-source project. No vendor lock-in, no license fees for the GUI itself, no telemetry. The FPGA community deserves better tools, and open source is how we build them.

### Transparent

CovertEDA generates TCL scripts and passes them to vendor CLIs as subprocesses. You can see exactly what commands are being sent to your vendor tools. No black boxes, no hidden modifications to vendor databases, no bundled IP or binaries. Your vendor installation is untouched.

## Performance Comparison

| Metric | Vendor GUIs (Typical) | CovertEDA |
|---|---|---|
| **Startup time** | 15-45 seconds | < 2 seconds |
| **UI responsiveness** | Frequent lag, thread blocking | 60fps, async Rust backend |
| **Memory usage** | 1-4 GB (Java/Qt overhead) | ~150 MB (native webview) |
| **Crash recovery** | Lost work, corrupted state | Isolated subprocess model |
| **Multi-vendor switching** | Close GUI, open different GUI | One dropdown click |
| **Git integration** | None | Built-in (libgit2) |
| **AI assistance** | None | Built-in (Claude) |
| **Build history tracking** | Manual / none | Automatic with git linking |

## Features

### Build Pipeline
Run synthesis, map, place & route, and bitstream generation through a visual pipeline. Select individual stages, configure per-stage options, and watch live build output stream in real time.

### Unified Reports
Timing analysis (Fmax, WNS, TNS, slack, critical paths), utilization (LUT, FF, BRAM, DSP), power estimation, DRC, and I/O bank reports -- all parsed from vendor-specific formats into a consistent, readable layout.

### Constraint Editor
Edit pin assignments and timing constraints in a table view. Supports PDC, LPF, QSF, SDC, XDC, and PCF formats. Save, load, and sync with external file edits. Validates pin names and net names before saving.

### IP Catalog
Browse, configure, and generate vendor IP cores. Set parameters via a form UI, preview the generated TCL, and add instantiation templates to your design with one click.

### Build History & Fmax Trends
Every build is recorded with its timestamp, status, Fmax, utilization, and linked git commit. A bar chart tracks Fmax across builds so you can see if your design is improving or regressing.

### Git Integration
Status bar showing branch, commit, dirty state, and ahead/behind counts. Commit-before-build workflow links each build to a specific source state. Uses libgit2 for fast, reliable git operations.

### AI Assistant
Built-in chat interface powered by Claude. Ask about timing violations, HDL patterns, vendor tool errors, or constraint syntax. The assistant automatically knows your project context (backend, device, top module).

### Command Palette
Press Ctrl+K to search and execute any action: build, navigate to reports, switch backends, adjust zoom, open settings. Fuzzy matching finds commands as you type.

### File Tree with Context Menu
Browse project files with type-based icons and git status indicators. Right-click for actions: open, copy path, toggle synthesis inclusion, delete. Drag to resize.

### License Management
Auto-detects FlexLM license files for Radiant and Quartus. Parses and displays license features with expiration status.

### Themes & Accessibility
Dark (default), Light, and Colorblind (deuteranopia-safe) themes. Zoom from 50% to 300% via keyboard shortcuts or native webview scaling.

### In-App Documentation
Comprehensive built-in user guide covering every feature, with collapsible sections, keyboard shortcut reference, and backend-specific details. No external documentation needed to get started.

## Supported Backends

| Backend | Status | CLI Tool(s) | Constraint Format | Bitstream | License |
|---|---|---|---|---|---|
| **Lattice Radiant** | Implemented | `radiantc` | `.pdc` / `.sdc` | `.bit` | FlexLM |
| **Lattice Diamond** | Implemented | `pnmainc` | `.lpf` | `.jed` | FlexLM |
| **Intel Quartus** | Implemented | `quartus_sh`, `quartus_syn`, `quartus_fit`, `quartus_sta` | `.qsf` / `.sdc` | `.sof` | FlexLM |
| **AMD Vivado** | Implemented | `vivado` (batch/TCL mode) | `.xdc` | `.bit` | FlexLM |
| **OSS CAD Suite** | Implemented | `yosys`, `nextpnr-ecp5`, `ecppack` | `.pcf` / `.lpf` | `.bin` | None |
| **Microchip Libero SoC** | Planned | `libero` | `.pdc` / `.sdc` | `.stp` | FlexLM |

CovertEDA **orchestrates** these tools via their CLI/TCL interfaces. It generates TCL scripts and spawns vendor processes as subprocesses -- it never evaluates TCL directly, modifies vendor databases, or bundles any vendor IP or binaries.

## Quick Start

### Prerequisites

- [Rust](https://rustup.rs/) (stable toolchain)
- [Node.js](https://nodejs.org/) 18+ and npm
- At least one supported FPGA toolchain installed (or use browser dev mode without one)
- **Linux only (for Tauri):** `libwebkit2gtk-4.1-dev`, `libsoup-3.0-dev`, `libjavascriptcoregtk-4.1-dev`

### Install & Run

```bash
# Clone the repository
git clone https://github.com/fpga-professional-association/CovertEDA.git
cd CovertEDA

# Install frontend dependencies
npm install

# Run frontend in browser (no Tauri, mock data)
npm run dev
# Opens http://localhost:1420

# Run full Tauri app (requires system WebKitGTK deps)
npx tauri dev
```

### Creating a Project

1. Launch CovertEDA and click **New Project** on the Start Screen.
2. Choose a backend, target device, and top module name.
3. Select a project directory and optionally start from a template.
4. Click **Create** -- CovertEDA generates a `.coverteda` project file.
5. Add your HDL sources and constraints, then hit **Build** (or Ctrl+B).

## Architecture

```
Frontend (React 18 + TypeScript)
    |  Tauri IPC (invoke / listen)
Backend (Rust + Tokio async)
    |  subprocess spawning (TCL scripts)
Vendor CLIs (not bundled -- user's own installation)
```

### Frontend
React 18 single-page application with inline styles and a custom theme system. All data flows through Tauri IPC commands and events. In browser dev mode (no Tauri), mock data provides a full UI demo.

### Backend
Rust async backend using Tokio for non-blocking process spawning and file I/O. A trait-based architecture (`FpgaBackend`) ensures all vendor backends implement the same interface: build pipeline, report parsing, constraint I/O, and IP generation.

### Report Parsers
Custom regex-based parsers convert vendor-specific text reports (`.twr`, `.mrp`, `.par`, timing summaries) into unified Rust structs (`TimingReport`, `ResourceReport`, etc.). No third-party EDA parsing libraries.

### Key Dependencies

| Crate | Purpose |
|---|---|
| `tauri 2` | App framework and IPC |
| `tokio` | Async runtime for process spawning |
| `git2` | libgit2 bindings for git operations |
| `notify` | Filesystem watcher for real-time file changes |
| `regex` | Vendor report parsing |
| `serde` / `serde_json` | Serialization |

## Development

```bash
# Frontend dev server (browser, mock data)
npm run dev

# Full Tauri dev (hot reload)
npx tauri dev

# TypeScript type checking
npx tsc --noEmit

# Rust tests (report parsers, backend logic)
cargo test --manifest-path src-tauri/Cargo.toml

# Frontend tests
npx vitest

# Production build
npx tauri build
```

### Project Structure

```
src/                    # React frontend
  components/           # UI components (inline styles)
  context/              # React context (ThemeContext)
  data/                 # IP catalog data, device part lists
  hooks/                # Tauri IPC wrappers (useTauri.ts)
  theme.ts              # Color palettes (Dark, Light, Colorblind)
  types/                # TypeScript interfaces

src-tauri/              # Rust backend
  src/
    backend/            # FpgaBackend trait + vendor implementations
      mod.rs            # Trait definition + BackendRegistry
      diamond.rs        # Lattice Diamond backend
      radiant.rs        # Lattice Radiant backend
      quartus.rs        # Intel Quartus backend
      vivado.rs         # AMD Vivado backend
      oss.rs            # OSS CAD Suite backend
    parser/             # Vendor report parsers
    commands.rs         # Tauri IPC command handlers
    main.rs             # App entry point
  tests/fixtures/       # Real vendor report fixtures for parser tests
```

## Roadmap

### Beta (Current)
- [x] Build pipeline with live output streaming
- [x] Unified report viewer (timing, utilization, power, DRC, I/O)
- [x] Constraint editor with save/load and external sync
- [x] IP catalog with configuration and generation
- [x] Build history with Fmax trends and git linking
- [x] Git integration (status bar, commit-before-build)
- [x] AI assistant (Claude)
- [x] Command palette and keyboard shortcuts
- [x] Theme support (Dark, Light, Colorblind)
- [x] Lattice Radiant, Diamond, Intel Quartus, AMD Vivado, OSS CAD Suite backends
- [x] FlexLM license detection and feature display
- [x] In-app documentation

### v1.0
- [ ] Waveform viewer integration
- [ ] Schematic viewer for post-synthesis netlist
- [ ] Multi-clock domain analysis visualization
- [ ] Constraint editor: graphical pin assignment on package view
- [ ] Microchip Libero SoC backend
- [ ] Plugin system for community extensions
- [ ] Cross-platform installers (Windows, macOS, Linux)

### Future
- [ ] Remote build server support
- [ ] Team collaboration features (shared build history, report sharing)
- [ ] Resource estimation before synthesis (pre-build utilization prediction)
- [ ] Formal verification integration
- [ ] HDL linting and static analysis
- [ ] Board-level design integration (schematic-to-FPGA pin mapping)

## Contributing

CovertEDA is maintained by the [FPGA Professional Association](https://github.com/fpga-professional-association), a community organization dedicated to advancing the FPGA engineering profession through open-source tooling, education, and professional development.

We welcome contributions from the FPGA community:

- **Bug reports** -- Open an issue with reproduction steps and your environment details.
- **Feature requests** -- Describe the problem you're trying to solve and the workflow you envision.
- **Pull requests** -- Fork the repo, create a feature branch, and submit a PR. Please include tests for new backend functionality and ensure `npx tsc --noEmit` passes with zero errors.
- **Backend implementations** -- Adding support for new vendor toolchains (e.g., Microchip Libero SoC) is a great way to contribute. See the `FpgaBackend` trait in `src-tauri/src/backend/mod.rs` for the interface.
- **Report parser fixtures** -- Real vendor report output files help us test and improve parsing accuracy. See `src-tauri/tests/fixtures/` for examples.

Connect with us:
- **GitHub:** [github.com/fpga-professional-association](https://github.com/fpga-professional-association)
- **LinkedIn:** [FPGA Professional Association](https://www.linkedin.com/company/fpga-professional-association)

## About

The **FPGA Professional Association** is a community organization focused on advancing the FPGA engineering profession. We believe FPGA engineers deserve modern, open-source tools that match the quality and usability standards of the broader software development ecosystem.

CovertEDA is our flagship project -- a direct response to the frustration that every FPGA engineer experiences with vendor toolchains. Rather than waiting for vendors to modernize their GUIs (which they have little incentive to do), we're building the tool we want to use ourselves.

Our goals:
- **Open-source FPGA tooling** that rivals proprietary vendor GUIs in usability and exceeds them in reliability.
- **Community-driven development** where practicing FPGA engineers shape the tool's direction.
- **Education and professional development** resources for FPGA engineers at all levels.
- **Vendor-neutral advocacy** for better tool interoperability and open standards.

## License

Open Source. License TBD.

CovertEDA does **not** include or redistribute any vendor tools, IP, libraries, or binaries. Users must have their own licensed installations of Lattice Radiant, Intel Quartus, AMD Vivado, Microchip Libero SoC, or the open-source Yosys/nextpnr toolchain.

---

<p align="center">
  Built with <a href="https://tauri.app">Tauri</a>, <a href="https://react.dev">React</a>, and <a href="https://www.rust-lang.org">Rust</a>.<br />
  A project of the <a href="https://github.com/fpga-professional-association">FPGA Professional Association</a>.
</p>
