# CovertEDA — FPGA Developer User Guide

A practical guide for FPGA engineers using CovertEDA for their development workflow.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Project Setup](#project-setup)
3. [Building Your Design](#building-your-design)
4. [Reading Reports](#reading-reports)
5. [Pin Constraints](#pin-constraints)
6. [IP Core Generation](#ip-core-generation)
7. [Git Workflow](#git-workflow)
8. [Build History & Fmax Tracking](#build-history--fmax-tracking)
9. [Working with Multiple Backends](#working-with-multiple-backends)
10. [AI Assistant](#ai-assistant)
11. [Device Programming](#device-programming)
12. [Tips & Tricks](#tips--tricks)

---

## Getting Started

### What You Need

1. **CovertEDA** installed (see `docs/INSTALL.md`)
2. **At least one FPGA vendor toolchain** installed on your system:
   - Lattice Diamond or Radiant
   - Intel Quartus Prime (Standard or Pro)
   - AMD Vivado
   - Achronix ACE
   - Microchip Libero SoC
   - OSS CAD Suite (Yosys + nextpnr)

### First Launch

When you launch CovertEDA, the Start Screen shows:
- **Detected Tools**: Which vendor tools CovertEDA found on your system
- **License Status**: Your FlexLM license features and expiration dates

If a tool shows "NOT FOUND", click it to see the detected path. You can set custom paths in Settings.

---

## Project Setup

### Creating a New Project

1. Click **Create New Project** on the Start Screen
2. Select your **backend** (matches your vendor tool)
3. Choose your **target device** from the dropdown
   - Type to search (e.g., "LFE5U" for ECP5 parts, "EP4CE" for Cyclone IV)
   - Devices are organized by family
4. Enter your **top module name** (must match your HDL top entity)
5. Browse to your **project directory**
6. Optionally select **source files** to include
7. Click **Create**

CovertEDA creates a `.coverteda` JSON file in your project directory. This file stores:
- Backend ID and target device
- Top module name
- Source and constraint file lists
- Build history

### Opening an Existing Project

If you already have a `.coverteda` file:
1. Click **Open Existing Directory**
2. Navigate to the project folder
3. CovertEDA opens immediately

### Importing a Vendor Project

If you have an existing vendor project (`.qpf`, `.xpr`, `.rdf`, `.ldf`, `.acepro`):
1. Click **Open Existing Directory**
2. Navigate to the vendor project folder
3. CovertEDA detects the vendor project file and offers to import it
4. Click **Import Project** — CovertEDA extracts the device, top module, and file lists

---

## Building Your Design

### Starting a Build

**Method 1:** Click the **Build** button in the sidebar
**Method 2:** Press **Ctrl+B**
**Method 3:** Press **Ctrl+K** and type "build"

### Build Pipeline

The build pipeline shows each stage visually:

| Stage | What It Does |
|-------|-------------|
| Synthesis | Converts RTL to gate-level netlist |
| Map / Translate | Maps to device-specific resources |
| Place & Route | Physical placement and routing |
| Bitstream | Generates programming file |
| Timing Analysis | Static timing analysis |

Stages are backend-specific. For example:
- **Diamond**: Synthesis (Synplify) → Translate → Map → PAR → Bitstream → Timing
- **Quartus**: Analysis & Elaboration → Synthesis → Fitter → Assembler → Timing (STA)
- **Vivado**: Synthesis → Implementation → Bitstream → Timing

### Selective Stage Execution

Click individual stages to select which ones to run. Useful for:
- Running just Synthesis to check for errors
- Re-running Place & Route with different constraints
- Generating only the bitstream after a successful build

### Live Build Output

The **Console** tab streams build output in real time. Color-coded log entries:
- **Blue (cmd)**: Commands being executed
- **White (out)**: Standard output
- **Green (ok)**: Success messages
- **Yellow (warn)**: Warnings
- **Red (err)**: Errors

### Stopping a Build

Click the **Stop** button or press **Ctrl+K** → "stop build".

---

## Reading Reports

After a build completes, CovertEDA parses vendor reports into a unified format.

### Timing Report

| Metric | What It Means |
|--------|---------------|
| **Fmax** | Maximum clock frequency your design can run at |
| **WNS** | Worst Negative Slack — the tightest timing path |
| **TNS** | Total Negative Slack — sum of all failing paths |
| **WHS** | Worst Hold Slack — hold timing margin |

**Critical paths** are listed with source, destination, slack value, and delay breakdown. Use these to identify timing bottlenecks.

**Timing met?** If WNS > 0, all setup timing constraints are met. If WNS < 0, you have timing violations that need to be fixed.

### Utilization Report

Shows resource usage as bar charts:

| Resource | Description |
|----------|-------------|
| **LUT** | Look-Up Tables (combinational logic) |
| **FF** | Flip-Flops (registers) |
| **BRAM** | Block RAM |
| **DSP** | DSP blocks (multipliers) |
| **I/O** | I/O pins used |

**Rule of thumb:** Keep utilization under 80% for most resources. High utilization (>90%) makes place & route harder and can hurt timing.

### Power Report

Breakdown of estimated power consumption:
- **Static power**: Leakage (always-on)
- **Dynamic power**: Switching activity
- **Per-domain**: Clock domain power distribution

Power estimates are based on vendor tool analysis and may require switching activity data for accuracy.

### DRC Report

Design Rule Check results:
- **Errors** (red): Must be fixed before programming
- **Warnings** (yellow): Should review but may be acceptable
- **Info** (blue): Informational messages

### I/O Report

Pin-by-pin analysis:
- Pin assignments and I/O standards
- Bank utilization and voltage requirements
- Unassigned pins

---

## Pin Constraints

### Opening the Constraint Editor

Click **Constr** in the sidebar to open the constraint editor.

### Editing Constraints

The constraint editor shows a table:

| Net Name | Pin | I/O Standard | Bank | Locked |
|----------|-----|-------------|------|--------|
| clk | P3 | LVCMOS33 | 0 | Yes |
| rst_n | T2 | LVCMOS33 | 0 | Yes |
| led[0] | H11 | LVCMOS33 | 2 | No |

- Click a cell to edit
- Use the **+** button to add new constraints
- Use the **trash** icon to remove constraints
- Click **Save** (Ctrl+S) to write to the constraint file

### Supported Formats

| Backend | Format | File Extension |
|---------|--------|---------------|
| Diamond | LPF | `.lpf` |
| Radiant | PDC + SDC | `.pdc`, `.sdc` |
| Quartus | QSF + SDC | `.qsf`, `.sdc` |
| Vivado | XDC | `.xdc` |
| ACE | PDC | `.pdc` |
| Libero | PDC + SDC | `.pdc`, `.sdc` |
| OSS | PCF / LPF | `.pcf`, `.lpf` |

CovertEDA reads and writes the correct format for your active backend.

---

## IP Core Generation

### Browsing the IP Catalog

Click **IP** in the sidebar to browse available IP cores for your backend.

### Configuring an IP Core

1. Select an IP core from the catalog
2. Set parameters in the configuration form (width, depth, clock mode, etc.)
3. Preview the generated TCL script
4. Click **Generate** — CovertEDA spawns the vendor CLI to create the IP

### Adding IP to Your Design

After generation, CovertEDA provides an instantiation template you can copy into your HDL.

---

## Git Workflow

### Status Bar

The bottom status bar shows:
- **Branch name** (e.g., `main`, `feature/timing-fix`)
- **Commit hash** (short)
- **Dirty file count** (modified files)
- **Ahead/behind** counts relative to remote

### File Tree Git Indicators

Files in the tree show git status:
- **M** (yellow): Modified
- **A** (green): Added
- **?** (gray): Untracked
- **D** (red): Deleted

### Build-to-Commit Linking

Every build is automatically linked to the current git commit. In Build History, you can see which source state produced each bitstream.

---

## Build History & Fmax Tracking

### Viewing History

Click **History** in the sidebar to see all past builds.

Each entry shows:
- Timestamp
- Backend and device
- Build status (success/failure)
- Fmax achieved
- LUT/FF utilization
- Git commit that was built

### Fmax Trends

A bar chart tracks Fmax across builds. Use this to:
- Detect timing regressions after code changes
- Track optimization progress
- Compare builds across different constraint strategies

---

## Working with Multiple Backends

### Switching Backends

1. Open Settings (gear icon or Cfg in sidebar)
2. Change the backend selection
3. All UI adapts: pipeline stages, constraint format, device list, report format

### Multi-Vendor Projects

For designs that target multiple FPGA families:
1. Create separate `.coverteda` project files (one per target)
2. Keep shared HDL source files
3. Use backend-specific constraint files
4. Compare timing results across vendors using Build History

### Backend-Specific Notes

**Lattice Diamond (MachXO3, ECP5):**
- TCL shell via `pnmainc`
- Reports: `.twr` (timing), `.mrp` (utilization)
- License: FlexLM (features LSC_DIAMOND)

**Lattice Radiant (CrossLink-NX, CertusPro-NX, Avant):**
- TCL shell via `radiantc`
- Reports: `.twr` (timing), `.mrp` (utilization), `.par` (PnR details)
- License: FlexLM (features LSC_RADIANT, LSC_SYNPLIFYPRO1)

**Intel Quartus (Cyclone, Arria, Stratix, MAX):**
- Multi-binary flow: `quartus_syn`, `quartus_fit`, `quartus_asm`, `quartus_sta`
- Reports: Timing analysis summary, resource usage summary
- License: FlexLM for Pro edition; free for Lite

**AMD Vivado (Artix, Kintex, Virtex, Zynq, Versal):**
- TCL batch mode via `vivado -mode batch`
- Reports: timing summary, utilization, power
- License: FlexLM for full editions; free for WebPACK devices

**Achronix ACE (Speedster7t):**
- Batch mode via `ace -batch`
- Reports: timing, utilization in `output/` directory
- License: FlexLM

**OSS CAD Suite (ECP5, iCE40):**
- Open-source flow: Yosys → nextpnr → ecppack
- No license required
- Supports ECP5 and iCE40 device families

---

## AI Assistant

### What It Can Help With

Click **AI** in the sidebar to access the Claude-powered assistant:

- **Timing violations**: "My WNS is -0.5ns on the clk→data path. How can I fix this?"
- **HDL patterns**: "Show me a parameterized FIFO in Verilog"
- **Vendor errors**: "What does Diamond error NGDBUILD:923 mean?"
- **Constraints**: "How do I set up a multi-clock constraint in XDC?"
- **Architecture**: "What's the difference between distributed and block RAM on ECP5?"

The assistant automatically knows your project context: backend, device, top module, and current build status.

---

## Device Programming

Click **Prog** in the sidebar to access the device programmer.

### Supported Programmers
- USB cables supported by vendor tools (USB Blaster, Platform Cable, HW-USBN-2B)
- Programming via vendor CLI subprocess

### Programming Flow
1. Select the bitstream file (auto-detected after build)
2. Select the programmer/cable
3. Click **Program**

---

## Tips & Tricks

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| **Ctrl+B** | Start build |
| **Ctrl+K** | Command palette |
| **Ctrl+S** | Save constraints |
| **Ctrl+/** | Toggle file tree |
| **Ctrl++** / **Ctrl+-** | Zoom in/out |
| **Ctrl+0** | Reset zoom |
| **Ctrl+,** | Open settings |
| **Ctrl+Shift+P** | Keyboard shortcuts |

### Command Palette
Press **Ctrl+K** to open the command palette. Type to fuzzy-search any action:
- "build" → Start Build
- "timing" → View Timing Report
- "dark" → Switch to Dark Theme
- "zoom" → Adjust Zoom Level

### File Tree
- Right-click files for context menu (open, copy path, toggle synthesis, delete)
- Drag the file tree edge to resize
- Git status indicators update in real time

### Browser Mode for Evaluation
Run `npm run dev` to try CovertEDA without installing Rust or system dependencies. All features are available with comprehensive mock data.

---

## Troubleshooting

### Build fails with "Tool not found"
Your vendor tool is not detected. Check:
1. Is the tool installed?
2. Is it in the expected path? (see Settings)
3. Click the tool in "Detected Tools" on the Start Screen to see the detected path

### Report shows "Report not found"
The vendor tool may not have generated reports. Check:
1. Did the build complete successfully?
2. Are report files present in the implementation directory?
3. Some reports (power, DRC) are optional and may not exist

### Constraint file not saving
Ensure the constraint file path is correct and writable. Check the Console for error messages.

### Fmax shows 0 or is missing
The timing report may not contain Fmax data. This can happen if:
- No clock constraints are defined
- The design is purely combinational
- The timing analysis stage was not run

### WSL: Vendor tool hangs
Some vendor tools don't work well with stdin piping under WSL. CovertEDA writes TCL scripts to files and passes them as arguments to avoid this issue.

---

## Getting Help

- **In-app documentation**: Docs section in the sidebar
- **AI assistant**: Built-in Claude-powered help
- **GitHub Issues**: [github.com/fpga-professional-association/CovertEDA/issues](https://github.com/fpga-professional-association/CovertEDA/issues)
- **LinkedIn**: [FPGA Professional Association](https://www.linkedin.com/company/fpga-professional-association/)
