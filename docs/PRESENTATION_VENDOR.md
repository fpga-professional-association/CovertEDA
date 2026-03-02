# CovertEDA — Vendor Representative Presentation

> Slide deck outline for presenting CovertEDA to FPGA vendor representatives (Intel, AMD/Xilinx, Lattice, Microchip, Achronix).

---

## Slide 1: Title

**CovertEDA**
A Unified FPGA Development Frontend

*FPGA Professional Association*
*[github.com/fpga-professional-association/CovertEDA](https://github.com/fpga-professional-association/CovertEDA)*

---

## Slide 2: The Industry Problem

**FPGA engineers use 4-6 different GUIs daily.**

- Lattice Diamond, Radiant, Intel Quartus, AMD Vivado, Microchip Libero, Achronix ACE
- Each has its own UI paradigm, keyboard shortcuts, report format, constraint syntax
- Engineers waste hours relearning workflows when switching vendors
- No git integration, no AI assistance, no modern UX in any vendor GUI
- Vendor GUIs are slow to start (15-45 seconds) and consume excessive memory (1-4 GB)

**This hurts vendor adoption.** Engineers avoid evaluating new vendors because the switching cost is too high.

---

## Slide 3: What CovertEDA Does

CovertEDA is an **open-source unified frontend** that wraps vendor CLIs.

- One interface for all vendors — same workflow, same report viewer, same constraint editor
- Does NOT replace vendor tools — it **orchestrates** them via their existing CLI/TCL interfaces
- Generates TCL scripts and spawns vendor CLIs as subprocesses
- Parses vendor reports into a unified format
- Built with Tauri 2 (Rust backend + React frontend) — starts in < 2 seconds, uses ~150 MB RAM

**CovertEDA makes it easier for engineers to adopt and evaluate your tools.**

---

## Slide 4: How It Benefits Vendors

### Lowers Evaluation Barriers
- Engineers can try your silicon with zero GUI learning curve
- Same build button, same report format, same constraint editor
- Reduces "I don't want to learn another IDE" resistance

### Increases Tool Usage
- Engineers who currently avoid your GUI can now access your CLI tools through a modern interface
- Power users who script everything get a visual pipeline on top of their existing workflows
- Junior engineers get AI-assisted explanations of vendor-specific errors

### No Risk to Your Business
- CovertEDA does NOT bundle, redistribute, or modify any vendor IP, libraries, or binaries
- Still requires your licensed installation — CovertEDA just provides a better frontend
- Open source (no commercial threat to vendor tool licensing)
- Vendor tool paths and license files are respected as-is

---

## Slide 5: Technical Integration

**For each vendor, CovertEDA implements an `FpgaBackend` trait:**

| Integration Point | What CovertEDA Does | What the Vendor CLI Does |
|---|---|---|
| Build script | Generates TCL (e.g., `prj_run Synthesis`) | Executes synthesis, PnR, bitgen |
| Process management | Spawns CLI subprocess, streams stdout | Runs as normal |
| Report parsing | Regex-parses `.twr`, `.mrp`, `.rpt` files | Generates reports (unchanged) |
| Constraints | Reads/writes `.lpf`, `.pdc`, `.xdc`, `.sdc`, `.qsf` | Uses constraint files as normal |
| IP generation | Generates TCL for IP configuration | Creates IP (unchanged) |
| License | Reads `LM_LICENSE_FILE`, displays features | FlexLM runs as normal |

**Zero modification to vendor tool behavior. CovertEDA is purely a frontend wrapper.**

---

## Slide 6: Currently Supported Backends

| Vendor | Tool | CLI | Status |
|---|---|---|---|
| Lattice | Diamond 3.x | `pnmainc` | Implemented + tested |
| Lattice | Radiant 2024-2025 | `radiantc` | Implemented + tested with real builds |
| Intel | Quartus Standard 20-23 | `quartus_sh`, `quartus_syn`, etc. | Implemented |
| Intel | Quartus Pro | `quartus_sh` | Implemented |
| AMD | Vivado 2022-2024 | `vivado -mode batch` | Implemented |
| Microchip | Libero SoC | `libero` | Implemented |
| Achronix | ACE | `ace -batch` | Implemented |
| Open Source | Yosys + nextpnr | `yosys`, `nextpnr-ecp5` | Implemented |

---

## Slide 7: Feature Highlights

- **Build Pipeline**: Visual stage-by-stage build with live log streaming
- **Unified Reports**: Timing (Fmax, WNS, TNS), utilization (LUT, FF, BRAM, DSP), power, DRC, I/O — all in one consistent format
- **Constraint Editor**: Table-based pin assignment editor supporting all vendor formats
- **IP Catalog**: Browse, configure, and generate IP cores with TCL preview
- **Build History**: Track Fmax trends, link builds to git commits
- **Git Integration**: Branch display, status bar, commit-before-build workflow (via libgit2)
- **AI Assistant**: Claude-powered design help that understands vendor-specific errors
- **Command Palette**: Ctrl+K to search and execute any action
- **Themes**: Dark, Light, Colorblind-safe

---

## Slide 8: What We Need From Vendors

### Documentation Access
- Publicly documented TCL command references for CLI tools
- Report file format specifications (or at least stability commitments)
- Known issues lists for CLI tools

### Testing Support
- Evaluation licenses for CI testing (build verification)
- Access to device support packages for testing against new silicon
- Beta access to upcoming CLI tool versions

### Community Engagement
- Acknowledge CovertEDA as a community tool (not a competitor)
- Link to CovertEDA from vendor community forums
- Consider contributing backend implementations or report parser improvements

---

## Slide 9: Open Source Model

**License:** Open source (license TBD)
**Organization:** FPGA Professional Association
**Repository:** [github.com/fpga-professional-association/CovertEDA](https://github.com/fpga-professional-association/CovertEDA)
**LinkedIn:** [FPGA Professional Association](https://www.linkedin.com/company/fpga-professional-association/)

### Why Open Source?
- Vendor-neutral — no single vendor controls the project
- Community contributions from practicing FPGA engineers
- Transparency — engineers can see exactly what commands are sent to their tools
- No vendor lock-in for the frontend

### Community
- Bug reports and feature requests via GitHub Issues
- Pull requests welcome (especially new backend implementations)
- Real vendor report fixtures help improve parsing accuracy

---

## Slide 10: Demo / Screenshots

*[Include screenshots of: Start Screen with tool detection, Build Pipeline, Unified Report Viewer (timing + utilization + power), Constraint Editor, File Tree with git status]*

---

## Slide 11: Q&A

**Contact:**
- GitHub: [github.com/fpga-professional-association/CovertEDA](https://github.com/fpga-professional-association/CovertEDA)
- LinkedIn: [FPGA Professional Association](https://www.linkedin.com/company/fpga-professional-association/)
