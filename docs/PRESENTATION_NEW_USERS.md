# CovertEDA — New User Guide Presentation

> Slide deck for onboarding new CovertEDA users. Covers installation, first project, and key features.

---

## Slide 1: Title

**Getting Started with CovertEDA**
Your Unified FPGA Development Frontend

---

## Slide 2: What Is CovertEDA?

CovertEDA is a **single desktop app** that works with all your FPGA vendor tools.

Instead of using:
- Lattice Diamond GUI
- Lattice Radiant GUI
- Intel Quartus GUI
- AMD Vivado GUI

You use **one app** with the same interface, same keyboard shortcuts, and same workflow — regardless of which vendor's silicon you're targeting.

**CovertEDA doesn't replace your vendor tools.** It provides a better frontend for them.

---

## Slide 3: Why Use CovertEDA?

| Pain Point | Vendor GUIs | CovertEDA |
|---|---|---|
| Startup time | 15-45 seconds | < 2 seconds |
| Learning curve | Different for each vendor | One interface for all |
| Git integration | None | Built-in (branch, status, commit linking) |
| AI help | None | Built-in Claude assistant |
| Report format | Different for each vendor | Unified viewer |
| Memory usage | 1-4 GB | ~150 MB |
| Crashes | Frequent, lose work | Isolated subprocess model |

---

## Slide 4: Installation

### Windows
```
1. Install Rust (rustup.rs) and Node.js
2. git clone https://github.com/fpga-professional-association/CovertEDA.git
3. cd CovertEDA && npm install
4. npx tauri dev
```

### Linux (Ubuntu 22.04+)
```
1. sudo apt install libwebkit2gtk-4.1-dev libsoup-3.0-dev ...
2. Install Rust and Node.js
3. git clone, npm install, npx tauri dev
```

### Try Without Installing
```
npm run dev    # Opens in your browser with demo data
```

See `docs/INSTALL.md` for detailed instructions.

---

## Slide 5: The Start Screen

When you launch CovertEDA, you see:

**Left panel:**
- **Create New Project** — Start a new FPGA project
- **Open Existing Directory** — Open a folder with a `.coverteda` file
- **Detected Tools** — Shows which vendor tools are installed
- **License Status** — FlexLM license feature display

**Right panel:**
- **Recent Projects** — Quick access to your last projects

CovertEDA auto-detects your installed vendor tools. No manual configuration needed for standard install paths.

---

## Slide 6: Creating Your First Project

1. Click **Create New Project**
2. Choose your **backend** (Diamond, Radiant, Quartus, Vivado, etc.)
3. Select your **target device** (searchable dropdown with all device families)
4. Enter your **top module name**
5. Pick your **project directory**
6. Click **Create**

CovertEDA generates a `.coverteda` project file and opens the IDE view.

**Tip:** If you already have a vendor project (`.qpf`, `.xpr`, `.rdf`, `.ldf`), use **Open Existing Directory** — CovertEDA will detect and import it automatically.

---

## Slide 7: The IDE Layout

```
┌──────┬──────────────┬────────────────────────┐
│      │              │                        │
│ Side │  File Tree   │    Main Panel          │
│ bar  │  (project    │    (Build, Reports,    │
│      │   files)     │     Console, etc.)     │
│      │              │                        │
│      │              │                        │
│      │              │                        │
│      │              ├────────────────────────┤
│      │              │    Status Bar          │
│      │              │    (git branch, etc.)  │
└──────┴──────────────┴────────────────────────┘
```

- **Sidebar**: Navigate between sections (Build, Reports, Console, IP, AI, Constraints, etc.)
- **File Tree**: Your project files with git status indicators
- **Main Panel**: The active section's content
- **Status Bar**: Git branch, commit, and modified file count

---

## Slide 8: Building Your Design

1. Click **Build** in the sidebar (or press **Ctrl+B**)
2. The build pipeline shows each stage: Synthesis → Map → Place & Route → Bitstream
3. Live build output streams in the Console
4. When complete, reports auto-load with timing, utilization, and power data

**Stage selection:** Click individual stages to run only what you need (e.g., just Synthesis for a quick check).

---

## Slide 9: Reading Reports

CovertEDA parses vendor-specific reports into a unified format:

- **Timing**: Fmax, worst negative slack (WNS), total negative slack (TNS), critical path details
- **Utilization**: LUT, FF, BRAM, DSP usage with bar charts and percentages
- **Power**: Static, dynamic, and per-domain power breakdown with donut chart
- **DRC**: Design rule check results with severity indicators
- **I/O**: Pin assignments, I/O standards, bank utilization

The same report layout works for every vendor backend.

---

## Slide 10: Constraint Editor

Edit pin assignments in a table:

| Net | Pin | I/O Standard | Bank |
|---|---|---|---|
| clk | P3 | LVCMOS33 | 0 |
| led[0] | H11 | LVCMOS33 | 2 |
| led[1] | J13 | LVCMOS33 | 2 |

- Supports all vendor constraint formats (`.lpf`, `.pdc`, `.xdc`, `.sdc`, `.qsf`, `.pcf`)
- Add, remove, and modify pins visually
- Save to file with one click

---

## Slide 11: Key Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| **Ctrl+B** | Start build |
| **Ctrl+K** | Command palette (search any action) |
| **Ctrl+S** | Save constraints |
| **Ctrl+/** | Toggle file tree |
| **Ctrl++** / **Ctrl+-** | Zoom in/out |
| **Ctrl+Shift+P** | Keyboard shortcuts reference |

Press **Ctrl+K** to access the command palette — fuzzy search for any action.

---

## Slide 12: AI Assistant

Built-in Claude AI that understands FPGA design:

- Ask about timing violations and get actionable suggestions
- Explain vendor-specific error messages
- HDL code review and patterns
- Constraint syntax help

The AI automatically knows your project context: backend, device, top module, and current build status.

---

## Slide 13: Git Integration

- **Status bar** shows current branch, commit hash, and dirty file count
- **File tree** shows git status icons (modified, added, untracked)
- **Build history** links each build to the git commit that produced it
- Track **Fmax trends** across builds to detect regressions

Uses libgit2 for fast, reliable git operations — no shelling out to the git CLI.

---

## Slide 14: Settings

Access settings via the **gear icon** on the Start Screen or **Cfg** in the sidebar:

- **Tool Paths**: Override auto-detected vendor tool locations
- **Theme**: Dark (default), Light, or Colorblind
- **Zoom**: 50% to 300%
- **License File**: Set FlexLM license file path

---

## Slide 15: Getting Help

- **In-app docs**: Click **Docs** in the sidebar for the full user guide
- **AI assistant**: Ask the built-in Claude AI
- **GitHub**: [github.com/fpga-professional-association/CovertEDA](https://github.com/fpga-professional-association/CovertEDA) — issues, discussions, and source code
- **LinkedIn**: [FPGA Professional Association](https://www.linkedin.com/company/fpga-professional-association/)
