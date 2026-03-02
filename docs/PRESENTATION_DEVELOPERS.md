# CovertEDA — Developer Contributor Presentation

> Slide deck for developers who want to contribute to CovertEDA.

---

## Slide 1: Title

**Contributing to CovertEDA**
How to Add Features, Fix Bugs, and Implement New Backends

*FPGA Professional Association — Open Source*

---

## Slide 2: Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 18 + TypeScript | UI components, state management |
| Styling | Inline styles + CSS vars | Theming (Dark, Light, Colorblind) |
| IPC | Tauri 2 invoke/listen | Frontend ↔ Backend communication |
| Backend | Rust + Tokio | Async I/O, subprocess management |
| Git | libgit2 (git2 crate) | Git operations without CLI |
| File watching | notify crate | Real-time file change detection |
| Parsing | regex crate | Vendor report parsing |
| Build | Vite (frontend) + Cargo (backend) | Fast dev cycle |

---

## Slide 3: Project Structure

```
CovertEDA/
├── src/                          # React frontend
│   ├── components/               # UI components (inline styles)
│   │   ├── App.tsx               # Main IDE layout + routing
│   │   ├── StartScreen.tsx       # Start screen (tool detection, recents)
│   │   ├── BuildPipeline.tsx     # Build stage UI
│   │   ├── ReportViewer.tsx      # Unified report viewer
│   │   ├── FileTree.tsx          # Project file browser
│   │   ├── ConstraintEditor.tsx  # Pin assignment table
│   │   ├── DevicePicker.tsx      # Device part dropdown
│   │   ├── shared.tsx            # Reusable micro-components
│   │   └── Icons.tsx             # SVG icon components
│   ├── hooks/useTauri.ts         # Tauri IPC wrappers + browser fallback
│   ├── data/                     # Device lists, IP catalog, mock data
│   ├── types/index.ts            # TypeScript interfaces + theme constants
│   └── context/ThemeContext.tsx   # Theme provider
│
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── backend/              # FpgaBackend trait + implementations
│   │   │   ├── mod.rs            # Trait + BackendRegistry + to_tcl_path()
│   │   │   ├── diamond.rs        # Lattice Diamond
│   │   │   ├── radiant.rs        # Lattice Radiant
│   │   │   ├── quartus.rs        # Intel Quartus (Standard + Pro)
│   │   │   ├── vivado.rs         # AMD Vivado
│   │   │   ├── ace.rs            # Achronix ACE
│   │   │   ├── libero.rs         # Microchip Libero SoC
│   │   │   └── oss.rs            # OSS CAD Suite (Yosys/nextpnr)
│   │   ├── parser/               # Report parsers
│   │   │   ├── timing.rs         # Timing report parsing
│   │   │   ├── utilization.rs    # Utilization report parsing
│   │   │   └── constraints.rs    # Constraint file I/O
│   │   ├── commands.rs           # Tauri IPC command handlers
│   │   ├── config.rs             # App configuration (TOML)
│   │   ├── project.rs            # Project file management
│   │   └── lib.rs                # Tauri app setup
│   └── tests/fixtures/           # Real vendor report files for testing
│
├── docs/                         # Documentation
├── Containerfile                 # Podman/Docker build container
└── CLAUDE.md                     # AI coding assistant instructions
```

---

## Slide 4: Development Setup

```bash
# Clone
git clone https://github.com/fpga-professional-association/CovertEDA.git
cd CovertEDA

# Install dependencies
npm install

# Frontend only (browser, mock data — no Rust or system deps needed)
npm run dev

# Full Tauri app (requires Rust + system WebKitGTK)
npx tauri dev

# Type check
npx tsc --noEmit

# Tests
npx vitest                                          # Frontend (154 tests)
cargo test --manifest-path src-tauri/Cargo.toml     # Backend (234 tests)
```

**Browser dev mode** (`npm run dev`) is the fastest way to iterate on UI. Mock data simulates all backends, reports, and build output.

---

## Slide 5: Adding a New Backend

Implementing a new vendor backend is the highest-impact contribution. Here's the process:

### Step 1: Create the backend file

```rust
// src-tauri/src/backend/newvendor.rs
pub struct NewVendorBackend {
    version: String,
    install_dir: Option<PathBuf>,
    deferred: bool,
}
```

### Step 2: Implement the `FpgaBackend` trait

```rust
impl FpgaBackend for NewVendorBackend {
    fn id(&self) -> &str { "newvendor" }
    fn name(&self) -> &str { "New Vendor Tool" }
    fn cli_tool(&self) -> &str { "newvendor_cli" }
    fn pipeline_stages(&self) -> Vec<PipelineStage> { ... }
    fn generate_build_script(...) -> BackendResult<String> { ... }
    fn detect_tool(&self) -> bool { ... }
    fn parse_timing_report(...) -> BackendResult<TimingReport> { ... }
    fn parse_utilization_report(...) -> BackendResult<ResourceReport> { ... }
    // ... remaining trait methods
}
```

### Step 3: Register in BackendRegistry

```rust
// src-tauri/src/backend/mod.rs
pub mod newvendor;

// In BackendRegistry::new() and new_deferred()
Box::new(newvendor::NewVendorBackend::new()),
```

### Step 4: Add frontend metadata

```typescript
// src/data/mockData.ts — BACKEND_META array
{ id: "newvendor", name: "New Vendor Tool", short: "NV", color: "#FF6600", icon: "..." }
```

### Step 5: Add test fixtures

Place real vendor report files in `src-tauri/tests/fixtures/newvendor/` and write parser tests.

---

## Slide 6: Key Patterns to Follow

### Inline Styles (Frontend)
```tsx
// DO: Inline styles using theme constants
<div style={{ background: C.s1, color: C.t1, fontFamily: MONO }}>

// DON'T: Tailwind classes or CSS modules
<div className="bg-gray-800 text-white">
```

### Theme Constants
```typescript
const { C, MONO, SANS } = useTheme();
// C.bg, C.s1, C.s2, C.t1, C.t2, C.t3, C.b1, C.b2
// C.accent, C.ok, C.err, C.warn, C.cyan, C.orange, C.purple, C.pink
```

### IPC Pattern
```typescript
// src/hooks/useTauri.ts — every Tauri command has a typed wrapper
export async function myNewCommand(arg: string): Promise<Result> {
  if (!isTauri) return mockResult;  // Browser fallback
  return invoke<Result>("my_new_command", { arg });
}
```

### TCL Path Safety
```rust
// ALWAYS use to_tcl_path() for paths in TCL scripts
let path_tcl = super::to_tcl_path(project_dir);
// NEVER use path.display() in TCL — backslashes cause escape issues
```

### Shared Components
```tsx
import { Btn, Badge, HoverRow, NavBtn, ResourceBar, Input } from "./shared";
```

---

## Slide 7: Testing

### Backend Tests (Rust)
- Report parser tests use real vendor output files from `tests/fixtures/`
- Backend unit tests verify pipeline stages, build script generation, path handling
- Run: `cargo test --manifest-path src-tauri/Cargo.toml`

### Frontend Tests (Vitest)
- Component rendering tests with Testing Library
- Run: `npx vitest`

### Type Checking
- TypeScript strict mode — zero errors required
- Run: `npx tsc --noEmit`

### Manual Testing
- Browser dev mode for UI iteration
- Full Tauri app with a real vendor tool for end-to-end verification

---

## Slide 8: Contribution Areas

### High Impact
- **New backends**: Gowin, Efinix, QuickLogic, FlexLogix
- **Report parser improvements**: Handle more vendor report variations
- **Test fixtures**: Real vendor report files from different versions and device families

### Medium Impact
- **UI features**: Waveform viewer, schematic viewer, package pin view
- **Constraint editor enhancements**: Graphical pin assignment
- **Build history**: Export, compare, and share build results

### Ongoing
- **Bug fixes**: Report parsing edge cases, cross-platform path handling
- **Performance**: Reduce React re-renders, optimize Rust hot paths
- **Documentation**: In-app docs, user guides, architecture docs

---

## Slide 9: Pull Request Guidelines

1. **Fork** the repository and create a feature branch
2. Ensure `npx tsc --noEmit` passes with zero errors
3. Ensure `cargo test` passes all backend tests
4. Add tests for new functionality (especially report parsers)
5. Update in-app documentation (`Documentation.tsx`) if adding user-facing features
6. Keep PRs focused — one feature or fix per PR
7. Include vendor report fixture files for new parser code

---

## Slide 10: Resources

- **Repository**: [github.com/fpga-professional-association/CovertEDA](https://github.com/fpga-professional-association/CovertEDA)
- **Architecture doc**: `docs/HOW_IT_WORKS.md`
- **Install guide**: `docs/INSTALL.md`
- **Container build**: `docs/CONTAINER.md`
- **Implementation spec**: `coverteda_implementation_guide.md` (2,300+ lines)
- **CLAUDE.md**: AI coding assistant instructions (also good developer reference)
- **LinkedIn**: [FPGA Professional Association](https://www.linkedin.com/company/fpga-professional-association/)
