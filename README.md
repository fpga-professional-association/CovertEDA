<p align="center">
  <img src="docs/assets/logo-placeholder.png" alt="CovertEDA Logo" width="120" />
</p>

<h1 align="center">CovertEDA</h1>

<p align="center">
  <strong>A unified FPGA development frontend for every toolchain.</strong>
</p>

<p align="center">
  <a href="#features">Features</a> &middot;
  <a href="#supported-backends">Backends</a> &middot;
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="#development">Development</a> &middot;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-2.0-blue?logo=tauri" alt="Tauri 2" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react" alt="React 18" />
  <img src="https://img.shields.io/badge/Rust-stable-orange?logo=rust" alt="Rust" />
  <img src="https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" />
</p>

---

## Why CovertEDA?

FPGA engineers shouldn't need four different GUIs to do the same job. Vendor tools (Radiant, Quartus, Vivado) each ship their own IDE -- built on aging Java or Qt frameworks, with inconsistent UIs, random crashes, and workflows that assume you never switch vendors.

**CovertEDA replaces all of them with a single, modern frontend.**

| Problem | CovertEDA Solution |
|---|---|
| **Four separate GUIs** for four vendors | One unified interface wrapping all vendor CLIs |
| **Slow, unresponsive** vendor GUIs (Java/Qt) | Native webview via Tauri -- instant startup, smooth scrolling, 60fps UI |
| **No git integration** in vendor tools | Built-in git status bar, commit-before-build, build-to-commit linking |
| **Cryptic vendor reports** in different formats | Unified report viewer parsing all vendor formats into one layout |
| **Buggy, crash-prone** vendor IDEs | Unified error handling, no vendor-specific UI bugs |
| **No keyboard shortcuts** worth mentioning | Command palette (Ctrl+K), build shortcut (Ctrl+B), full keyboard navigation |
| **Overwhelming UI** with thousands of options | Progressive disclosure -- essentials first, advanced options behind an expander |
| **No AI assistance** | Built-in Claude AI assistant that understands FPGA design and your project context |

## Features

### Build Pipeline
Run synthesis, map, place & route, and bitstream generation through a visual pipeline. Select individual stages, configure per-stage options, and watch live build output stream in real time.

### Unified Reports
Timing analysis (Fmax, WNS, TNS, slack, critical paths), utilization (LUT, FF, BRAM, DSP), power estimation, DRC, and I/O bank reports -- all parsed from vendor-specific formats into a consistent, readable layout.

### Constraint Editor
Edit pin assignments and timing constraints in a table view. Supports PDC, LPF, QSF, SDC, XDC, and PCF formats. Changes sync automatically with external file edits.

### IP Catalog
Browse, configure, and generate vendor IP cores. Set parameters via a form UI, preview the generated TCL, and add instantiation templates to your design with one click.

### Build History & Fmax Trends
Every build is recorded with its timestamp, status, Fmax, utilization, and linked git commit. A bar chart tracks Fmax across builds so you can see if your design is improving.

### Git Integration
Status bar showing branch, commit, dirty state, and ahead/behind counts. Commit-before-build workflow links each build to a specific source state. Uses libgit2 for fast, reliable git operations (no shelling out to the git CLI).

### AI Assistant
Built-in chat interface powered by Claude. Ask about timing violations, HDL patterns, vendor tool errors, or constraint syntax. The assistant automatically knows your project context (backend, device, top module).

### Command Palette
Press Ctrl+K to search and execute any action: build, navigate to reports, switch backends, adjust zoom, open settings. Fuzzy matching finds commands as you type.

### File Tree with Context Menu
Browse project files with type-based icons and git status indicators. Right-click for actions: open, copy path, toggle synthesis inclusion, delete. Drag to resize.

### License Management
Auto-detects FlexLM license files for Radiant and Quartus. Parses and displays license features with expiration status.

### Themes & Accessibility
Dark (default), Light, and Colorblind (deuteranopia-safe) themes. Zoom from 50% to 300% via keyboard shortcuts or settings.

## Screenshots

> *Screenshots coming soon. Run `npm run dev` to see the UI.*

## Supported Backends

| Backend | CLI Tool(s) | Constraint Format | Bitstream | License |
|---|---|---|---|---|
| **Lattice Radiant** | `radiantc` | `.pdc` / `.sdc` | `.bit` | FlexLM |
| **Intel Quartus** | `quartus_sh`, `quartus_syn`, `quartus_fit`, `quartus_sta` | `.qsf` / `.sdc` | `.sof` | FlexLM |
| **AMD Vivado** | `vivado` (batch/TCL mode) | `.xdc` | `.bit` | FlexLM |
| **OSS CAD Suite** | `yosys`, `nextpnr-ecp5`, `ecppack` | `.pcf` / `.lpf` | `.bin` | None |

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
git clone https://github.com/your-org/CovertEDA.git
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
Frontend (React 18 + TypeScript + Tailwind CSS)
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

### Commands

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

## Design Philosophy

- **Progressive Disclosure:** Max 2 levels of nesting. Level 1 = essentials, Level 2 = "Advanced" expander. No Level 3.
- **Smart Defaults:** New users hit "Build" without configuration. Every parameter has an intelligent default.
- **Three Personas:** Legacy (experienced with vendor tools), Legend (power user wanting keyboard shortcuts), Learner (junior engineer wanting tooltips and AI help).
- **Performance:** No mock data in production paths. Batched state updates for streaming data. Lazy loading for file contents and reports.

## License

MIT License. See [LICENSE](LICENSE) for details.

CovertEDA does **not** include or redistribute any vendor tools, IP, libraries, or binaries. Users must have their own licensed installations of Lattice Radiant, Intel Quartus, AMD Vivado, or the open-source Yosys/nextpnr toolchain.

---

<p align="center">
  Built with <a href="https://tauri.app">Tauri</a>, <a href="https://react.dev">React</a>, and <a href="https://www.rust-lang.org">Rust</a>.
</p>
