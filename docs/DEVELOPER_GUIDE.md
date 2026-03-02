# CovertEDA Developer Guide

A comprehensive guide for developers working on the CovertEDA codebase.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Development Environment](#development-environment)
3. [Frontend Architecture](#frontend-architecture)
4. [Backend Architecture](#backend-architecture)
5. [Tauri IPC Contract](#tauri-ipc-contract)
6. [Adding a New Backend](#adding-a-new-backend)
7. [Report Parser Development](#report-parser-development)
8. [UI Component Patterns](#ui-component-patterns)
9. [Testing](#testing)
10. [Cross-Platform Considerations](#cross-platform-considerations)
11. [Performance Guidelines](#performance-guidelines)
12. [Common Pitfalls](#common-pitfalls)

---

## Architecture Overview

CovertEDA is a three-layer application:

```
Frontend (React 18 + TypeScript)
    │  Tauri IPC (invoke / listen)
Backend (Rust + Tokio)
    │  Subprocess spawning (TCL/shell scripts)
Vendor CLIs (user's own installation)
```

**Key principle:** The frontend has zero direct filesystem or process access. All I/O flows through the Rust backend via Tauri IPC commands and events.

---

## Development Environment

### Prerequisites
- Rust stable (`rustup`)
- Node.js 18+ (`nvm` recommended)
- Linux: `libwebkit2gtk-4.1-dev`, `libsoup-3.0-dev`, `libjavascriptcoregtk-4.1-dev`
- Windows: Visual Studio Build Tools with C++ workload

### Commands
```bash
npm run dev                                     # Frontend only (browser, mock data)
npx tauri dev                                   # Full app with hot reload
npx tsc --noEmit                                # TypeScript type check
npx vitest                                      # Frontend tests
cargo test --manifest-path src-tauri/Cargo.toml # Backend tests
npx tauri build                                 # Production build
```

### Browser Dev Mode
`npm run dev` runs the React frontend standalone at `http://localhost:1420`. In this mode:
- Tauri IPC calls fall back to mock data (defined in `src/hooks/useTauri.ts`)
- All backends, reports, build pipelines, and git integration are simulated
- No Rust compilation, no system dependencies, no vendor tools needed
- Fastest iteration cycle for UI development

---

## Frontend Architecture

### Component Organization

All UI components live in `src/components/`. The main entry point is `App.tsx`, which manages:
- View routing (StartScreen vs IDE)
- Active section state (Build, Reports, Console, etc.)
- Project state (directory, config, files)
- Build state (running, logs, results)

Components are lazy-loaded with `React.lazy()` to minimize initial bundle size.

### Styling

**Inline styles only.** The codebase uses inline styles with theme constants, not Tailwind CSS or CSS modules.

```tsx
const { C, MONO, SANS } = useTheme();

<div style={{
  background: C.s1,
  color: C.t1,
  fontFamily: MONO,
  fontSize: 11,
  padding: "8px 12px",
  borderRadius: 6,
  border: `1px solid ${C.b1}`,
}}>
```

Theme constants are defined in `src/theme.ts` with three palettes: Dark, Light, Colorblind.

### Color Constants (`C` object)
| Key | Meaning |
|-----|---------|
| `bg` | Page background |
| `s1`, `s2` | Surface colors (panels, cards) |
| `t1`, `t2`, `t3` | Text colors (primary, secondary, tertiary) |
| `b1`, `b2` | Border colors |
| `accent` | Primary accent (blue) |
| `ok`, `err`, `warn` | Status colors |
| `cyan`, `orange`, `purple`, `pink` | Section accent colors |

### Shared Components (`src/components/shared.tsx`)
- `Btn` — Button with `primary`, `small`, `danger` variants
- `Badge` — Small colored label
- `HoverRow` — Row with hover background
- `NavBtn` — Sidebar navigation button with icon, label, tooltip
- `ResourceBar` — Utilization bar chart
- `Input` — Styled text input

### Icons (`src/components/Icons.tsx`)
SVG icon components with optional `size` prop. Pattern:
```tsx
export const MyIcon = ({ size }: { size?: number }) => (
  <svg width={size || 14} height={size || 14} viewBox="0 0 16 16" ...>
    <path d="..." />
  </svg>
);
```

### CSS Hover Injection
For performance, hover effects use injected CSS instead of React state:
```tsx
if (!document.getElementById("ceda-hover-id")) {
  const s = document.createElement("style");
  s.id = "ceda-hover-id";
  s.textContent = `.my-class:hover { background: var(--hover-bg) !important; }`;
  document.head.appendChild(s);
}
```
This avoids per-element `onMouseEnter`/`onMouseLeave` handlers and React re-renders.

---

## Backend Architecture

### FpgaBackend Trait

The core abstraction (`src-tauri/src/backend/mod.rs`):

```rust
pub trait FpgaBackend: Send + Sync {
    fn id(&self) -> &str;
    fn name(&self) -> &str;
    fn short_name(&self) -> &str;
    fn version(&self) -> &str;
    fn cli_tool(&self) -> &str;
    fn default_device(&self) -> &str;
    fn constraint_ext(&self) -> &str;
    fn pipeline_stages(&self) -> Vec<PipelineStage>;
    fn generate_build_script(
        &self, project_dir: &Path, device: &str,
        top_module: &str, stages: &[String],
        options: &HashMap<String, String>,
    ) -> BackendResult<String>;
    fn detect_tool(&self) -> bool;
    fn parse_timing_report(&self, impl_dir: &Path) -> BackendResult<TimingReport>;
    fn parse_utilization_report(&self, impl_dir: &Path) -> BackendResult<ResourceReport>;
    fn parse_power_report(&self, impl_dir: &Path) -> BackendResult<Option<PowerReport>>;
    fn parse_drc_report(&self, impl_dir: &Path) -> BackendResult<Option<DrcReport>>;
    fn read_constraints(&self, path: &Path) -> BackendResult<Vec<PinConstraint>>;
    fn write_constraints(&self, constraints: &[PinConstraint], path: &Path) -> BackendResult<()>;
}
```

### BackendRegistry

Manages all backend instances and tracks the active backend:
```rust
pub struct BackendRegistry {
    backends: Vec<Box<dyn FpgaBackend>>,
    active_idx: usize,
}
```

Two constructors:
- `new()` — Full detection (scans filesystem). Used for `detect_tools` / `refresh_tools`.
- `new_deferred()` — Zero I/O, instant. Used at app startup. Backends report version="" and available=false until detection runs.

### AppState (commands.rs)

The Tauri managed state:
```rust
pub struct AppState {
    pub registry: Mutex<BackendRegistry>,
    pub build_handle: Mutex<Option<BuildHandle>>,
    pub current_project: Mutex<Option<(PathBuf, ProjectConfig)>>,
}
```

All state access goes through `Mutex` locks. Hold locks briefly — never across `.await` points.

### Path Handling

**Critical rule:** All paths in TCL scripts must go through `to_tcl_path()`:
```rust
pub fn to_tcl_path(path: &Path) -> String {
    // Converts /mnt/c/... → C:/...  (WSL)
    // Converts \ → /                (Windows)
    // Converts /home/... → //wsl.localhost/<distro>/...  (WSL native)
}
```

Never use `path.display()` in TCL scripts — backslashes are TCL escape characters (`\t` = tab).

---

## Tauri IPC Contract

### Commands (Frontend → Backend)

Commands are defined in `src-tauri/src/commands.rs` and registered in `lib.rs`. Each command has a typed wrapper in `src/hooks/useTauri.ts`.

Pattern:
```rust
// Backend (commands.rs)
#[tauri::command]
pub async fn my_command(arg: String, state: State<'_, AppState>) -> Result<MyResult, String> {
    // ...
}

// Register in lib.rs
.invoke_handler(tauri::generate_handler![my_command, ...])
```

```typescript
// Frontend (useTauri.ts)
export async function myCommand(arg: string): Promise<MyResult> {
  if (!isTauri) return mockResult;  // Browser fallback
  return invoke<MyResult>("my_command", { arg });
}
```

### Events (Backend → Frontend)

Used for streaming data (build output):
```rust
// Backend
app_handle.emit("build:stdout", &log_line)?;

// Frontend
import { listen } from "@tauri-apps/api/event";
const unlisten = await listen<string>("build:stdout", (event) => {
  // Handle log line
});
```

---

## Adding a New Backend

### 1. Create the module

Create `src-tauri/src/backend/newvendor.rs` with:
- `struct NewVendorBackend` with `version`, `install_dir`, `deferred` fields
- `new()` — Full detection constructor
- `new_deferred()` — Zero-I/O constructor
- `detect_installation()` — Scan known paths for the vendor tool
- `FpgaBackend` trait implementation

### 2. Register the module

In `src-tauri/src/backend/mod.rs`:
```rust
pub mod newvendor;

// In BackendRegistry::new():
Box::new(newvendor::NewVendorBackend::new()),

// In BackendRegistry::new_deferred():
Box::new(newvendor::NewVendorBackend::new_deferred()),
```

Update the test `test_registry_new_has_N_backends` count.

### 3. Add frontend metadata

In `src/data/mockData.ts`, add to `BACKEND_META`:
```typescript
{ id: "newvendor", name: "New Vendor Tool", short: "NV", color: "#FF6600", icon: "🔧" }
```

### 4. Add device parts

In `src/data/deviceParts.ts`, add device families and update `DEVICE_MAP`.

### 5. Add report parser tests

Place real vendor report files in `src-tauri/tests/fixtures/newvendor/` and write parser tests in the parser modules.

### 6. Update the backend count in tests

Update `test_registry_new_has_eight_backends` and `test_registry_list_contains_all_ids` in `mod.rs`.

---

## Report Parser Development

Report parsers live in `src-tauri/src/parser/`. They use regex to extract data from vendor-specific text files.

### Pattern
```rust
pub fn parse_vendor_timing(content: &str) -> BackendResult<TimingReport> {
    let mut report = TimingReport { ... };

    // Extract Fmax
    let fmax_re = Regex::new(r"Maximum Frequency:\s+([\d.]+)\s*MHz")?;
    if let Some(caps) = fmax_re.captures(content) {
        report.fmax = caps[1].parse().ok();
    }

    // Extract slack
    // ...

    Ok(report)
}
```

### Testing
```rust
#[test]
fn test_parse_vendor_timing() {
    let content = include_str!("../../tests/fixtures/vendor/timing.rpt");
    let report = parse_vendor_timing(content).unwrap();
    assert!(report.fmax.unwrap() > 0.0);
}
```

### Key Principle
Parsers should be **lenient** — extract what they can and leave missing fields as `None`. A partially parsed report is better than an error.

---

## Testing

### Backend Tests
```bash
cargo test --manifest-path src-tauri/Cargo.toml
# 234 tests covering:
# - Report parsers (with real fixture files)
# - Backend unit tests (pipeline stages, build scripts, path handling)
# - Registry tests (switching, listing)
# - TCL path conversion regression tests
```

### Frontend Tests
```bash
npx vitest
# 154 tests covering:
# - Component rendering (every major component)
# - Mock data completeness
# - Theme application
```

### Type Checking
```bash
npx tsc --noEmit
# Must pass with zero errors — TypeScript strict mode
```

---

## Cross-Platform Considerations

### Paths
- Use `PathBuf` / `Path::join()`, never string concatenation
- TCL scripts: always use `to_tcl_path()` (converts backslashes to forward slashes)
- CLI arguments: use native path separators (`path.display()`)
- JSON serialization: native separators are fine (conversion happens at use time)

### Windows
- Hide console windows with `CREATE_NO_WINDOW` when spawning vendor tools
- WebView2 is the system webview (included in Windows 10 1803+)

### Linux
- Set `LD_LIBRARY_PATH` for vendor tool environments
- WebKitGTK 4.1 required (Ubuntu 22.04+, Fedora 37+)

### WSL
- Auto-detect via `WSL_DISTRO_NAME` env var
- `/mnt/c/...` → `C:/...` path translation for Windows tools
- Native Linux paths → `//wsl.localhost/<distro>/...` UNC paths

---

## Performance Guidelines

- **No blocking I/O in command handlers.** Use `spawn_blocking` for filesystem operations.
- **Batch React state updates.** Never create O(n) state updates for streaming data.
- **Use refs for high-frequency data.** Build log streaming uses refs + periodic flush.
- **Lazy load components.** Use `React.lazy()` for sections not visible at startup.
- **CSS-only hover effects.** Inject CSS once, use CSS variables for hover colors.
- **Deferred backend detection.** Don't scan the filesystem at startup — do it async.
- **Minimize allocations in parsers.** Report parsing is a hot path for large designs.

---

## Common Pitfalls

### TCL Backslash Escapes
**Wrong:** `format!("open_project \"{}\"", path.display())`
**Right:** `format!("open_project \"{}\"", super::to_tcl_path(path))`

Windows paths contain backslashes which TCL interprets as escape characters. `C:\top.ldf` becomes `C:<tab>op.ldf`.

### Holding Mutex Across Await
**Wrong:**
```rust
let lock = state.registry.lock().unwrap();
some_async_fn().await;  // Mutex held across await!
```
**Right:**
```rust
let data = {
    let lock = state.registry.lock().unwrap();
    lock.some_data().clone()
};
some_async_fn().await;
```

### Missing Browser Fallback
Every IPC function in `useTauri.ts` must have a browser fallback:
```typescript
if (!isTauri) return mockData;  // Browser dev mode
```

### Path Separator in Frontend
The backend sends paths with forward slashes via JSON. Use `.split("/")` for path operations, with `\` fallback for edge cases:
```typescript
const fileName = path.split("/").pop() ?? path.split("\\").pop() ?? path;
```

### React Re-renders
Avoid unnecessary state updates in hot paths. Use `useCallback` for event handlers passed as props. Use `useMemo` for expensive computations. Use refs for data that doesn't need to trigger re-renders.
