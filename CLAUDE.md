# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CovertEDA is a unified FPGA development frontend that wraps vendor-specific CLIs (Lattice Diamond, Intel Quartus, AMD Vivado) and open-source toolchains (Yosys/nextpnr) behind a single interface. It is a **Tauri 2 desktop app** with a Rust backend and React/TypeScript frontend.

CovertEDA **orchestrates** vendor tools via their CLI/TCL interfaces — it does NOT contain vendor IP, libraries, or binaries, and does NOT perform synthesis/PnR itself.

The full specification lives in `coverteda_implementation_guide.md` (2,300+ lines, 24 sections). Read it before making architectural decisions.

## Build & Development Commands

```bash
# Prerequisites
rustup                          # Rust toolchain (~/.cargo/bin/)
npm install                     # Frontend dependencies
# System deps (Tauri): libwebkit2gtk-4.1-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev

# Frontend only (no Tauri — runs in browser with mock data)
npm run dev                     # Vite dev server on http://localhost:1420
npm run build                   # Production build to dist/

# Full Tauri app (requires system WebKitGTK deps)
npx tauri dev                   # Run dev version with hot reload
npx tauri build                 # Create distributable binary

# Type checking
npx tsc --noEmit                # TypeScript check (should be zero errors)

# Rust tests (uses fixture files in tests/fixtures/)
cargo test --manifest-path src-tauri/Cargo.toml

# Frontend tests
npx vitest                      # Vitest + Testing Library
```

## Architecture

```
Frontend (React 18 + TypeScript + Tailwind CSS)
    ↓ Tauri IPC (invoke / listen)
Backend (Rust + Tokio async)
    ↓ subprocess spawning
Vendor CLIs (not bundled)
```

### Backend: Trait-Based Multi-Vendor Abstraction

All 4 vendor backends implement `FpgaBackend` trait in `src-tauri/src/backend/`:

| Backend | File | CLI Tool | Constraint Format | Bitstream |
|---------|------|----------|-------------------|-----------|
| Lattice Diamond | `diamond.rs` | `pnmainc` (TCL shell) | `.lpf` | `.jed` |
| Intel Quartus | `quartus.rs` | `quartus_sh`, `quartus_syn`, `quartus_fit`, `quartus_sta` | `.sdc` | `.sof` |
| AMD Vivado | `vivado.rs` | `vivado` (batch/TCL mode) | `.xdc` | `.bit` |
| OSS CAD Suite | `oss.rs` | `yosys`, `nextpnr-ecp5`, `ecppack` | `.pcf`/`.lpf` | `.bin` |

The trait defines methods for: build pipeline stages, build script generation, async build execution, report parsing (timing/utilization/power), and constraint I/O.

### Tauri IPC Contract

**Commands (invoke):** `get_git_status`, `get_file_tree`, `start_build`, `get_timing_report`, `get_utilization_report`, `switch_backend`, `check_licenses`, `list_ip_catalog`, `send_ai_message`

**Events (listen):** `build:stdout`, `build:stage_complete`, `build:finished`, `files:changed`

### Report Parsers (`src-tauri/src/parser/`)

Custom regex-based parsers convert vendor-specific text reports into unified structures (`TimingReport`, `ResourceReport`, etc.). No third-party EDA parsing libraries. Test fixtures for each vendor live in `tests/fixtures/{diamond,quartus,vivado,oss}/`.

### Key Rust Dependencies

- `tauri 2` — app framework and IPC
- `tokio` — async runtime for process spawning
- `git2` — libgit2 bindings (no shelling out to git CLI)
- `notify` — filesystem watcher for real-time file changes
- `regex` — vendor report parsing
- `serde`/`serde_json` — serialization
- `thiserror` — error types

## Performance (CRITICAL)

**All code must be optimized to run as fast as possible.** This is a major requirement across both the Rust backend and React frontend:

- **No mock/fake data in production paths.** All data comes from Tauri IPC (real backend). Mock data is only for BACKEND_META visual constants (colors, icons).
- **Batch state updates.** Never create O(n) React state updates for streaming data (build logs). Use refs + periodic flush.
- **Avoid unnecessary re-renders.** Use `useCallback`, `useMemo`, and refs where appropriate.
- **Rust: minimize allocations in hot paths.** Build log streaming, file scanning, and report parsing must be efficient.
- **Lazy loading.** Only load data when needed (file content on click, reports after build).
- **No blocking IPC.** All Tauri commands that do I/O must be fast or async.

## Design Principles

**Progressive Disclosure UI:** Max 2 levels of nesting. Level 1 = essentials, Level 2 = "Advanced" expander. There is no Level 3. See spec Section 18 before building any UI.

**Smart Defaults:** New users should be able to hit "Build" without configuration. Every parameter has an intelligent default (e.g., I/O standard = LVCMOS33, frequency target scales with design size).

**Three User Personas:** Legacy (10+ years in vendor tools, needs familiar UI), Legend (power user wanting ⌘K command palette and keyboard shortcuts), Learner (junior engineer needing tooltips and AI explanations).

**TCL Generation Pattern:** Backends generate TCL/shell scripts which are spawned as subprocesses. CovertEDA never evaluates TCL directly.

## Documentation

When adding or modifying features, **update the in-app documentation** in `src/components/Documentation.tsx` to reflect the change. The documentation serves as the user guide and must stay in sync with the app. Also update `README.md` if the change affects high-level features or setup instructions.

## Platform Conventions

- Always use `PathBuf` / `Path::join()` for paths, never string concatenation
- Windows: hide console windows with `CREATE_NO_WINDOW` flag when spawning vendor tools
- Linux: set `LD_LIBRARY_PATH` for vendor tool environments
- Vendor tool paths are configurable in user settings (stored as TOML)
