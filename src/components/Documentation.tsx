import { useState, useCallback, memo } from "react";
import { useTheme } from "../context/ThemeContext";
import { Badge } from "./shared";
import { openUrl } from "../hooks/useTauri";

// ── Section definitions ──

interface DocSection {
  id: string;
  title: string;
  icon: string;
  color: string;
}

const DOC_SECTIONS: DocSection[] = [
  { id: "getting-started", title: "Getting Started", icon: "\u25B6", color: "accent" },
  { id: "build-pipeline", title: "Build Pipeline", icon: "\u26A1", color: "accent" },
  { id: "reports", title: "Reports", icon: "\u2637", color: "cyan" },
  { id: "constraint-editor", title: "Constraint Editor", icon: "\u25A4", color: "accent" },
  { id: "ip-catalog", title: "IP Catalog", icon: "\u25A3", color: "purple" },
  { id: "build-history", title: "Build History", icon: "\u29D7", color: "orange" },
  { id: "file-tree", title: "File Tree", icon: "\u2630", color: "accent" },
  { id: "ai-assistant", title: "AI Assistant", icon: "\u2605", color: "pink" },
  { id: "git-integration", title: "Git Integration", icon: "\u2387", color: "cyan" },
  { id: "license-management", title: "License Management", icon: "\u26BF", color: "warn" },
  { id: "command-palette", title: "Command Palette", icon: "\u2318", color: "accent" },
  { id: "keyboard-shortcuts", title: "Keyboard Shortcuts", icon: "\u2328", color: "accent" },
  { id: "backend-support", title: "Backend Support", icon: "\u2756", color: "purple" },
  { id: "settings", title: "Settings", icon: "\u2699", color: "accent" },
  { id: "project-config", title: "Project Configuration", icon: "\u2692", color: "orange" },
  { id: "about", title: "About", icon: "\u2139", color: "cyan" },
];

// ── Reusable sub-components ──

function SectionHeader({ title, icon, color }: { title: string; icon: string; color: string }) {
  const { C } = useTheme();
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, marginBottom: 14,
      paddingBottom: 8, borderBottom: `1px solid ${C.b1}`,
    }}>
      <span style={{ fontSize: 16, color }}>{icon}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color: C.t1 }}>{title}</span>
    </div>
  );
}

function SubHeading({ children }: { children: string }) {
  const { C } = useTheme();
  return (
    <div style={{
      fontSize: 12, fontWeight: 700, color: C.t1, marginTop: 16, marginBottom: 6,
      display: "flex", alignItems: "center", gap: 6,
    }}>
      <span style={{ color: C.accent, fontSize: 8 }}>{"\u25CF"}</span>
      {children}
    </div>
  );
}

function Para({ children }: { children: React.ReactNode }) {
  const { C } = useTheme();
  return (
    <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.7, marginBottom: 10 }}>
      {children}
    </div>
  );
}

function Code({ children }: { children: string }) {
  const { C, MONO } = useTheme();
  return (
    <code style={{
      fontFamily: MONO, fontSize: 10, padding: "1px 5px", borderRadius: 3,
      background: C.bg, border: `1px solid ${C.b1}`, color: C.accent,
    }}>
      {children}
    </code>
  );
}

function CodeBlock({ children }: { children: string }) {
  const { C, MONO } = useTheme();
  return (
    <pre style={{
      fontFamily: MONO, fontSize: 9, padding: "10px 12px", borderRadius: 5,
      background: C.bg, border: `1px solid ${C.b1}`, color: C.t2,
      overflow: "auto", lineHeight: 1.6, margin: "8px 0 12px",
      whiteSpace: "pre-wrap",
    }}>
      {children}
    </pre>
  );
}

function KeyBadge({ children }: { children: string }) {
  const { C, MONO } = useTheme();
  return (
    <kbd style={{
      fontFamily: MONO, fontSize: 9, fontWeight: 600,
      padding: "2px 7px", borderRadius: 3,
      background: C.bg, border: `1px solid ${C.b1}`, color: C.accent,
    }}>
      {children}
    </kbd>
  );
}

function InfoBox({ children, variant = "info" }: { children: React.ReactNode; variant?: "info" | "tip" | "warning" }) {
  const { C, MONO } = useTheme();
  const color = variant === "warning" ? C.warn : variant === "tip" ? C.ok : C.accent;
  const label = variant === "warning" ? "WARNING" : variant === "tip" ? "TIP" : "NOTE";
  return (
    <div style={{
      padding: "10px 12px", borderRadius: 5, margin: "8px 0 12px",
      background: `${color}08`, border: `1px solid ${color}30`,
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{
        fontSize: 8, fontFamily: MONO, fontWeight: 700, color,
        letterSpacing: 1, marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 10, color: C.t2, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

function TableRow({ cells, header }: { cells: string[]; header?: boolean }) {
  const { C, MONO } = useTheme();
  return (
    <tr style={{ borderBottom: `1px solid ${C.b1}20` }}>
      {cells.map((cell, i) => (
        <td key={i} style={{
          padding: "5px 10px", fontSize: 9, fontFamily: MONO,
          fontWeight: header ? 700 : 400,
          color: header ? C.t3 : i === 0 ? C.t1 : C.t2,
          whiteSpace: "nowrap",
        }}>
          {cell}
        </td>
      ))}
    </tr>
  );
}

// ── Collapsible section wrapper ──

function Collapsible({ title, children, defaultOpen = false }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const { C } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      borderRadius: 5, border: `1px solid ${C.b1}`, marginBottom: 8, overflow: "hidden",
    }}>
      <div
        onClick={() => setOpen((p) => !p)}
        style={{
          display: "flex", alignItems: "center", gap: 6, padding: "6px 10px",
          background: C.s2, cursor: "pointer", fontSize: 10, fontWeight: 600, color: C.t1,
        }}
      >
        <span style={{ fontSize: 8, color: C.t3, transition: "transform .15s", transform: open ? "rotate(90deg)" : "none" }}>
          {"\u25B6"}
        </span>
        {title}
      </div>
      {open && (
        <div style={{ padding: "8px 12px", background: C.s1 }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Section content components ──

function GettingStartedSection() {
  const { C } = useTheme();
  const color = C.accent;
  return (
    <div>
      <SectionHeader title="Getting Started" icon={"\u25B6"} color={color} />

      <SubHeading>Opening a Project</SubHeading>
      <Para>
        From the Start Screen, click <strong style={{ color: C.t1 }}>Open Project</strong> and navigate to a directory
        containing a <Code>.coverteda</Code> project file. CovertEDA will load the project configuration, detect the
        backend toolchain, scan the file tree, and check git status automatically.
      </Para>
      <Para>
        You can also open a project from the <strong style={{ color: C.t1 }}>Recent Projects</strong> list on the Start Screen.
        The five most recently opened projects are displayed with their backend, device, and last-opened timestamp.
      </Para>

      <SubHeading>Creating a New Project</SubHeading>
      <Para>
        Click <strong style={{ color: C.t1 }}>New Project</strong> on the Start Screen to launch the New Project Wizard.
        You will be asked to provide:
      </Para>
      <div style={{ paddingLeft: 16, marginBottom: 10 }}>
        <Para>
          <strong style={{ color: C.t1 }}>1. Project Name</strong> -- A human-readable name for your design (e.g., "uart_controller").<br />
          <strong style={{ color: C.t1 }}>2. Backend</strong> -- Select your FPGA vendor toolchain (Radiant, Quartus, Vivado, or OSS).<br />
          <strong style={{ color: C.t1 }}>3. Target Device</strong> -- Choose a specific FPGA part number from the device picker.<br />
          <strong style={{ color: C.t1 }}>4. Top Module</strong> -- The name of the top-level HDL module.<br />
          <strong style={{ color: C.t1 }}>5. Project Directory</strong> -- Where to create the project files.
        </Para>
      </div>
      <Para>
        You can also start from a <strong style={{ color: C.t1 }}>template</strong> (Basic Counter, UART, SPI, etc.) which
        pre-populates source files and constraints for your chosen device.
      </Para>

      <SubHeading>The .coverteda File</SubHeading>
      <Para>
        Every CovertEDA project has a <Code>.coverteda</Code> JSON file in the project root. This file stores the project
        configuration including the backend ID, target device, top module, source patterns, constraint files, and
        implementation directory. It is designed to be checked into version control so team members share the same
        project settings.
      </Para>
      <CodeBlock>{`{
  "name": "my_design",
  "backendId": "radiant",
  "device": "LIFCL-40-7BG400I",
  "topModule": "top",
  "sourcePatterns": ["source/*.v", "source/*.sv"],
  "constraintFiles": ["constraints/pins.pdc"],
  "implDir": "impl1",
  "backendConfig": {},
  "createdAt": "2026-02-15T10:00:00Z",
  "updatedAt": "2026-02-19T14:30:00Z"
}`}</CodeBlock>
    </div>
  );
}

function BuildPipelineSection() {
  const { C } = useTheme();
  return (
    <div>
      <SectionHeader title="Build Pipeline" icon={"\u26A1"} color={C.accent} />

      <SubHeading>Pipeline Overview</SubHeading>
      <Para>
        The build pipeline runs your design through a sequence of stages, each handled by the active vendor toolchain.
        The stages are:
      </Para>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
        {[
          { label: "Synthesis", desc: "Translates RTL (Verilog/VHDL) into a netlist of logic primitives.", color: C.accent },
          { label: "Map", desc: "Maps the netlist to device-specific resources (LUTs, FFs, BRAMs).", color: C.cyan },
          { label: "Place & Route", desc: "Places logic elements on the FPGA die and routes interconnects.", color: C.purple },
          { label: "Bitstream", desc: "Generates the binary programming file for the FPGA.", color: C.ok },
        ].map((s) => (
          <div key={s.label} style={{
            padding: "10px 12px", borderRadius: 5, background: C.s2,
            border: `1px solid ${C.b1}`, borderTop: `2px solid ${s.color}`,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: s.color, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 9, color: C.t3, lineHeight: 1.5 }}>{s.desc}</div>
          </div>
        ))}
      </div>

      <SubHeading>Running a Build</SubHeading>
      <Para>
        Click the <strong style={{ color: C.t1 }}>Build</strong> button in the top toolbar (or press <KeyBadge>Ctrl+B</KeyBadge>)
        to start the full pipeline. Each stage is executed sequentially by the vendor CLI. During the build, live output
        streams to the console panel and the pipeline visualization shows progress.
      </Para>

      <SubHeading>Stage Selection</SubHeading>
      <Para>
        You can selectively enable or disable individual stages using the checkboxes in the Build Pipeline panel.
        For example, if you only changed constraints, you might skip Synthesis and run Map through Bitstream.
      </Para>

      <SubHeading>Build Options</SubHeading>
      <Para>
        Advanced options are available per-stage under the "Options" expander. Common options include synthesis
        effort level, optimization goals (area vs. speed), and PAR placement seed. These are passed directly
        to the vendor CLI via TCL parameters.
      </Para>

      <SubHeading>Cancel and Clean</SubHeading>
      <Para>
        While a build is running, the Build button changes to <strong style={{ color: C.err }}>Cancel</strong>.
        Clicking it sends a termination signal to the vendor process. The <strong style={{ color: C.t1 }}>Clean</strong> button
        in the toolbar removes all build artifacts from the implementation directory, allowing a fresh build.
      </Para>

      <InfoBox variant="tip">
        If your project is a git repository and you have uncommitted changes, CovertEDA will prompt you to commit
        before building. This allows you to link each build to a specific source state via the Build History.
      </InfoBox>
    </div>
  );
}

function ReportsSection() {
  const { C } = useTheme();
  return (
    <div>
      <SectionHeader title="Reports" icon={"\u2637"} color={C.cyan} />

      <Para>
        After a successful build, CovertEDA parses vendor-specific report files and presents them in a unified format.
        Navigate to the Reports section using the left sidebar, then select a report tab along the top.
      </Para>

      <Collapsible title="Timing Report" defaultOpen>
        <Para>
          The Timing Report shows whether your design meets its frequency target. Key metrics include:
        </Para>
        <div style={{ paddingLeft: 12, marginBottom: 10 }}>
          <Para>
            <strong style={{ color: C.t1 }}>Fmax</strong> -- The maximum achievable clock frequency based on the longest combinational path.<br />
            <strong style={{ color: C.t1 }}>WNS (Worst Negative Slack)</strong> -- The slack on the most critical setup timing path. Negative means a violation.<br />
            <strong style={{ color: C.t1 }}>TNS (Total Negative Slack)</strong> -- Sum of all negative slack across all failing paths.<br />
            <strong style={{ color: C.t1 }}>WHS (Worst Hold Slack)</strong> -- Slack on the most critical hold timing path.<br />
            <strong style={{ color: C.t1 }}>Critical Paths</strong> -- The top timing-critical paths ranked by slack, showing source, destination, delay, and logic levels.
          </Para>
        </div>
        <Para>
          Clock domains are listed with their period, target frequency, and per-clock worst slack. Unconstrained paths
          (signals without timing constraints) are shown separately.
        </Para>
      </Collapsible>

      <Collapsible title="Utilization Report">
        <Para>
          Shows how much of the FPGA's resources your design consumes. Resources are grouped by category:
        </Para>
        <div style={{ paddingLeft: 12, marginBottom: 10 }}>
          <Para>
            <strong style={{ color: C.t1 }}>Logic</strong> -- LUT4s, registers (flip-flops), carry chains, wide-function MUXes.<br />
            <strong style={{ color: C.t1 }}>I/O</strong> -- User I/O pins consumed vs. available in the package.<br />
            <strong style={{ color: C.t1 }}>Memory</strong> -- Embedded Block RAM (EBR/BRAM) usage.<br />
            <strong style={{ color: C.t1 }}>DSP</strong> -- DSP slice / multiplier usage.
          </Para>
        </div>
        <Para>
          The "By Module" breakdown shows utilization per RTL module, helping you identify which parts of your design
          consume the most resources.
        </Para>
      </Collapsible>

      <Collapsible title="Power Report">
        <Para>
          Estimates total power consumption based on switching activity. Shows breakdown by category
          (static/dynamic, logic/routing/I/O/memory) and by power rail. Includes junction temperature estimate
          and thermal margin.
        </Para>
      </Collapsible>

      <Collapsible title="DRC Report">
        <Para>
          Design Rule Check results showing errors, critical warnings, warnings, and informational messages.
          Each entry includes a severity, rule code, description, affected location, and suggested corrective action.
        </Para>
      </Collapsible>

      <Collapsible title="I/O Report">
        <Para>
          Per-bank I/O usage showing VCCIO voltage, pin count, and individual pin assignments.
          Useful for verifying I/O standard compatibility across banks.
        </Para>
      </Collapsible>

      <Collapsible title="Stage Logs (Synth / Map / P&R / Bitstream)">
        <Para>
          Raw vendor tool output for each pipeline stage. These tabs show the complete log from the synthesis,
          mapping, place-and-route, and bitstream generation stages. You can search within the log text and
          filter by severity (errors, warnings, info).
        </Para>
      </Collapsible>
    </div>
  );
}

function ConstraintEditorSection() {
  const { C } = useTheme();
  return (
    <div>
      <SectionHeader title="Constraint Editor" icon={"\u25A4"} color={C.accent} />

      <SubHeading>Pin Assignments</SubHeading>
      <Para>
        The Constraint Editor provides a table view of all pin assignments in your design. Each row shows the
        signal net name, assigned pin location, direction (input/output/inout), I/O standard (e.g., LVCMOS33),
        I/O bank, and a lock indicator. You can edit values directly in the table.
      </Para>
      <Para>
        Click any cell to edit it inline. Changes are reflected in the constraint file immediately.
        The lock toggle prevents accidental changes to critical pin assignments.
      </Para>

      <SubHeading>Timing Constraints</SubHeading>
      <Para>
        In addition to pin assignments, the constraint editor supports timing constraints such as clock definitions,
        input/output delays, false paths, and multicycle paths. These are stored in the same constraint file
        and passed to the synthesis and P&R tools.
      </Para>

      <SubHeading>Supported Constraint Formats</SubHeading>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
        <tbody>
          <TableRow cells={["Format", "Extension", "Backend", "Description"]} header />
          <TableRow cells={["PDC", ".pdc", "Lattice Radiant", "Physical Design Constraints"]} />
          <TableRow cells={["LPF", ".lpf", "Lattice Diamond", "Logical Preference File"]} />
          <TableRow cells={["QSF", ".qsf", "Intel Quartus", "Quartus Settings File"]} />
          <TableRow cells={["SDC", ".sdc", "Multiple", "Synopsys Design Constraints"]} />
          <TableRow cells={["XDC", ".xdc", "AMD Vivado", "Xilinx Design Constraints"]} />
          <TableRow cells={["PCF", ".pcf", "OSS CAD Suite", "Physical Constraints File"]} />
        </tbody>
      </table>

      <SubHeading>Save, Load, and External Sync</SubHeading>
      <Para>
        The editor reads constraints from the file specified in your project configuration. When you save,
        it writes back in the same format. If you edit the constraint file externally (e.g., in a text editor),
        CovertEDA's file watcher detects the change and reloads the constraints automatically.
      </Para>
    </div>
  );
}

function IpCatalogSection() {
  const { C } = useTheme();
  return (
    <div>
      <SectionHeader title="IP Catalog" icon={"\u25A3"} color={C.purple} />

      <SubHeading>Browsing IP Cores</SubHeading>
      <Para>
        The IP Catalog lists vendor-provided IP cores organized by category (Clocking, Memory, Interface, DSP, etc.).
        Use the search bar to filter by name, description, or category. Each IP entry shows its name, description,
        and compatible device families.
      </Para>

      <SubHeading>Configuring IP Parameters</SubHeading>
      <Para>
        Click <strong style={{ color: C.t1 }}>Configure</strong> on any IP to open the parameter editor. Each IP exposes
        configurable parameters (bus width, depth, clock frequency, etc.) with validated inputs -- numeric ranges,
        dropdown selections, or boolean toggles. The instance name can be customized for your design hierarchy.
      </Para>

      <SubHeading>TCL Preview</SubHeading>
      <Para>
        Before generating, click <strong style={{ color: C.t1 }}>Preview TCL</strong> to see the exact TCL commands that
        will be sent to the vendor tool. This is useful for debugging or for copying into your own build scripts.
        The TCL is vendor-specific: Radiant uses <Code>sbp_design</Code> / <Code>sbp_configure</Code> commands,
        Quartus uses <Code>set_parameter</Code>, and Vivado uses <Code>create_ip</Code> / <Code>set_property</Code>.
      </Para>

      <SubHeading>Generating IP</SubHeading>
      <Para>
        Click <strong style={{ color: C.t1 }}>Generate IP</strong> to run the TCL commands via the vendor CLI.
        Output streams live to the generation log. On success, you can:
      </Para>
      <div style={{ paddingLeft: 16, marginBottom: 10 }}>
        <Para>
          <strong style={{ color: C.ok }}>Add to Synthesis</strong> -- Marks the generated IP files for inclusion in the synthesis flow.<br />
          <strong style={{ color: C.t1 }}>Add to Project Only</strong> -- Adds IP files to the file tree without including them in synthesis.<br />
          <strong style={{ color: C.err }}>Discard</strong> -- Removes the generated files.
        </Para>
      </div>
      <Para>
        An instantiation template is also provided -- click <strong style={{ color: C.t1 }}>Copy</strong> to copy the
        Verilog/VHDL instantiation code to your clipboard for pasting into your top-level module.
      </Para>
    </div>
  );
}

function BuildHistorySection() {
  const { C } = useTheme();
  return (
    <div>
      <SectionHeader title="Build History" icon={"\u29D7"} color={C.orange} />

      <SubHeading>Tracking Builds</SubHeading>
      <Para>
        Every build is recorded with its timestamp, duration, status (success/failed/cancelled), backend, device,
        stages run, and result metrics (Fmax, utilization, warning/error counts). The Build History panel shows
        summary cards at the top (total builds, success rate, best Fmax, Fmax trend) and a detailed table below.
      </Para>

      <SubHeading>Fmax Trends</SubHeading>
      <Para>
        A bar chart visualizes Fmax across successful builds, making it easy to see if your design is improving
        or regressing in timing. The trend indicator shows the delta between the first and most recent Fmax values.
      </Para>

      <SubHeading>Build-to-Commit Linking</SubHeading>
      <Para>
        When you use the "Commit & Build" workflow, each build record is linked to a specific git commit hash.
        This allows you to trace any build result back to the exact source code state. Commit hashes are displayed
        as clickable badges in the history table, and hovering shows the commit message.
      </Para>

      <InfoBox variant="info">
        Build history is stored as a JSON file within the project directory. It persists across sessions and
        is designed to be checked into version control alongside your design.
      </InfoBox>
    </div>
  );
}

function FileTreeSection() {
  const { C } = useTheme();
  return (
    <div>
      <SectionHeader title="File Tree" icon={"\u2630"} color={C.accent} />

      <SubHeading>Project File Browser</SubHeading>
      <Para>
        The file tree panel on the left side of the IDE shows all files in your project directory.
        Files are categorized by type: <Badge color={C.accent}>RTL</Badge> (Verilog/VHDL source),{" "}
        <Badge color={C.ok}>CONSTR</Badge> (constraints), <Badge color={C.purple}>IP</Badge> (generated IP),{" "}
        <Badge color={C.t3}>CONFIG</Badge> (project files), and <Badge color={C.orange}>OUTPUT</Badge> (build artifacts).
      </Para>
      <Para>
        Click any file to open it in the file viewer. The viewer shows syntax-highlighted content with line numbers,
        file size, and a "Copy Path" button. Folders can be expanded and collapsed.
      </Para>

      <SubHeading>Context Menu</SubHeading>
      <Para>
        Right-click any file or folder for a context menu with options including:
      </Para>
      <div style={{ paddingLeft: 16, marginBottom: 10 }}>
        <Para>
          <strong style={{ color: C.t1 }}>Open in Viewer</strong> -- View file contents.<br />
          <strong style={{ color: C.t1 }}>Copy Path / Copy Name</strong> -- Copy the full path or filename to clipboard.<br />
          <strong style={{ color: C.t1 }}>Add/Remove from Synthesis</strong> -- Toggle whether a source file is included in synthesis.<br />
          <strong style={{ color: C.err }}>Delete File/Folder</strong> -- Permanently remove the file (with confirmation).
        </Para>
      </div>

      <SubHeading>Synthesis Include/Exclude</SubHeading>
      <Para>
        Each source file has a "synth" toggle. Files marked for synthesis are passed to the synthesis tool; excluded
        files (such as testbenches or reference designs) are skipped. This replaces the "file groups" concept in
        vendor tools with a simple per-file toggle.
      </Para>

      <SubHeading>Resize and Toggle</SubHeading>
      <Para>
        The file tree width is adjustable by dragging the resize handle. Click the arrow in the top toolbar
        to collapse or expand the file tree entirely. The panel state persists within your session.
      </Para>
    </div>
  );
}

function AiAssistantSection() {
  const { C } = useTheme();
  return (
    <div>
      <SectionHeader title="AI Assistant" icon={"\u2605"} color={C.pink} />

      <SubHeading>FPGA Design Help</SubHeading>
      <Para>
        The AI Assistant is a built-in chat interface that understands FPGA design, HDL languages,
        vendor toolchains, and common design patterns. It supports multiple providers including Anthropic (Claude),
        OpenAI, Google Gemini, Mistral, xAI, DeepSeek, and local models via Ollama. It can help with:
      </Para>
      <div style={{ paddingLeft: 16, marginBottom: 10 }}>
        <Para>
          Explaining timing violations and suggesting fixes.<br />
          Reviewing HDL code for common issues (clock domain crossings, reset strategies).<br />
          Generating Verilog/VHDL snippets for common patterns (FIFOs, state machines, debounce circuits).<br />
          Interpreting build errors and warnings from vendor tools.<br />
          Suggesting constraint settings for your target device and I/O standards.
        </Para>
      </div>

      <SubHeading>Project Context</SubHeading>
      <Para>
        The AI assistant automatically receives rich context about your current project, including the project name,
        active backend, target device, top module, build status, timing/utilization/power/DRC reports, git state,
        and the full project file tree. Source file contents (RTL, constraints, and testbenches) are also loaded
        automatically -- up to 15 files, capped at 2000 characters per file. This allows the assistant to reference
        your actual code directly without you having to paste anything.
      </Para>

      <SubHeading>Project AI Notes (.coverteda_ai)</SubHeading>
      <Para>
        Click the <strong style={{ color: C.t1 }}>.coverteda_ai</strong> button in the AI Assistant header to create
        or open a project-level AI notes file. This file is automatically included in the AI context on every message.
        Use it to record design decisions, known issues, coding style preferences, or any persistent notes you want
        the AI to always be aware of. The file is created in your project root and can be edited like any other file.
        A green dot appears on the button when the file is actively loaded into context.
      </Para>

      <SubHeading>Prompt Library</SubHeading>
      <Para>
        Click <strong style={{ color: C.t1 }}>Prompts</strong> in the header to open the prompt library panel on the
        right side of the chat. The library includes 8 built-in FPGA-specific prompts covering common tasks like
        HDL review, timing analysis, constraint generation, power optimization, and testbench writing. Click any
        prompt to populate the input field.
      </Para>
      <Para>
        You can also save your own prompts. Type a prompt in the input field, click{" "}
        <strong style={{ color: C.t1 }}>Save Current</strong> in the panel, give it a title, and it will be stored
        in <Code>.coverteda_prompts.json</Code> in your project directory. Saved prompts persist across sessions
        and can be deleted with the (x) button on hover.
      </Para>

      <SubHeading>Skills</SubHeading>
      <Para>
        Skills are reusable prompt templates with <Code>{"{{placeholder}}"}</Code> substitution. Three built-in skills
        are included:
      </Para>
      <div style={{ paddingLeft: 16, marginBottom: 10 }}>
        <Para>
          <strong style={{ color: C.accent }}>Code Review</strong> -- Review a specific file for synthesis issues with
          a configurable focus area.<br />
          <strong style={{ color: C.accent }}>Constraint Generator</strong> -- Generate timing constraints for a clock
          at a specified frequency.<br />
          <strong style={{ color: C.accent }}>Module Generator</strong> -- Generate an HDL module from a name, language,
          and description.
        </Para>
      </div>
      <Para>
        Click a skill in the Prompts panel to open a parameter form. Fill in the placeholders and click{" "}
        <strong style={{ color: C.t1 }}>Apply</strong> to expand the template into the input field. You can create
        custom skills with the <strong style={{ color: C.t1 }}>New Skill</strong> button -- define a name, description,
        and template with <Code>{"{{placeholder}}"}</Code> markers.
      </Para>

      <SubHeading>Configuration</SubHeading>
      <Para>
        Click <strong style={{ color: C.t1 }}>Settings</strong> in the AI header to choose your provider and model.
        API keys are stored securely in the OS keyring (Tauri) or localStorage (browser). Your key is never sent
        anywhere except the selected provider's API endpoint. For local inference, select Ollama -- no API key needed.
      </Para>
    </div>
  );
}

function GitIntegrationSection() {
  const { C } = useTheme();
  return (
    <div>
      <SectionHeader title="Git Integration" icon={"\u2387"} color={C.cyan} />

      <SubHeading>Status Bar</SubHeading>
      <Para>
        The git status bar at the top of the IDE shows the current branch, latest commit hash and message,
        author, and time. It also displays counts for staged, unstaged, and untracked files. Click the bar
        to expand it and see additional details.
      </Para>

      <SubHeading>Commit Before Build</SubHeading>
      <Para>
        When you start a build with uncommitted changes, CovertEDA prompts you with three options:
      </Para>
      <div style={{ paddingLeft: 16, marginBottom: 10 }}>
        <Para>
          <strong style={{ color: C.ok }}>Commit & Build</strong> -- Automatically commits all changes with a timestamped
          message, then starts the build. This links the build to a specific source state.<br />
          <strong style={{ color: C.t1 }}>Build Without Committing</strong> -- Proceeds with the build without committing.
          The build will not be linked to a commit hash.<br />
          <strong style={{ color: C.t3 }}>Cancel</strong> -- Aborts the build.
        </Para>
      </div>

      <SubHeading>Dirty State Detection</SubHeading>
      <Para>
        CovertEDA uses <Code>libgit2</Code> (not the git CLI) for all git operations, ensuring fast and reliable
        status detection. Modified files are marked with a git status indicator in the file tree. The status bar
        shows ahead/behind counts relative to the upstream branch.
      </Para>

      <SubHeading>Manual Commits</SubHeading>
      <Para>
        You can commit at any time using the commit button in the expanded git status bar. A dialog prompts for
        a commit message with a pre-filled default based on the project name and current date.
      </Para>
    </div>
  );
}

function LicenseManagementSection() {
  const { C } = useTheme();
  return (
    <div>
      <SectionHeader title="License Management" icon={"\u26BF"} color={C.warn} />

      <SubHeading>FlexLM License Detection</SubHeading>
      <Para>
        CovertEDA automatically detects FlexLM license files for vendor tools (Lattice Radiant, Intel Quartus).
        It searches common locations including environment variables (<Code>LM_LICENSE_FILE</Code>), standard
        install paths, and the path configured in Settings. Detected license files are shown with their backend
        association and full file path.
      </Para>

      <SubHeading>Feature Listing</SubHeading>
      <Para>
        Each license file is parsed to extract individual features. The License Status panel shows a table
        with the feature name, vendor daemon, expiration date, and status (active/warning/expired). Features
        nearing expiration are highlighted with a warning color.
      </Para>

      <SubHeading>Open Source Tools</SubHeading>
      <Para>
        The OSS CAD Suite (Yosys/nextpnr) does not require any license. If you're using open-source tools,
        the license section will show "No license required" for that backend.
      </Para>

      <InfoBox variant="tip">
        You can manually set a license file path in Settings &gt; License. This is useful when your license
        server uses a non-standard port or location (e.g., <Code>27000@license-server.local</Code>).
      </InfoBox>
    </div>
  );
}

function CommandPaletteSection() {
  const { C } = useTheme();
  return (
    <div>
      <SectionHeader title="Command Palette" icon={"\u2318"} color={C.accent} />

      <SubHeading>Quick Access to Everything</SubHeading>
      <Para>
        Press <KeyBadge>Ctrl+K</KeyBadge> to open the command palette -- a searchable list of all available actions.
        Start typing to filter commands by name or description. Hit Enter to execute the selected command, or Escape to close.
      </Para>

      <SubHeading>Available Commands</SubHeading>
      <Para>Commands are organized by category:</Para>
      <div style={{ paddingLeft: 16, marginBottom: 10 }}>
        <Para>
          <strong style={{ color: C.t1 }}>Build</strong> -- Build All, Build Selected Stages, Clean.<br />
          <strong style={{ color: C.t1 }}>View</strong> -- Navigate to any section (Build Pipeline, Reports, IP Catalog, Console, etc.).<br />
          <strong style={{ color: C.t1 }}>Reports</strong> -- Jump directly to specific report tabs (Timing, Utilization, Synthesis Log, etc.).<br />
          <strong style={{ color: C.t1 }}>Zoom</strong> -- Zoom In, Zoom Out, Reset, and preset zoom levels (100%, 150%, 200%).<br />
          <strong style={{ color: C.t1 }}>Backend</strong> -- Switch between available vendor backends.<br />
          <strong style={{ color: C.t1 }}>Project</strong> -- Settings, Toggle File Tree, Keyboard Shortcuts, Close Project.
        </Para>
      </div>

      <InfoBox variant="tip">
        The command palette supports fuzzy matching. You can type partial words like "tim" to match "Timing Report"
        or "util" to match "Utilization Report".
      </InfoBox>
    </div>
  );
}

function KeyboardShortcutsSection() {
  const { C } = useTheme();
  return (
    <div>
      <SectionHeader title="Keyboard Shortcuts" icon={"\u2328"} color={C.accent} />

      <Para>
        CovertEDA is designed for keyboard-first workflows. All shortcuts use Ctrl (or Cmd on macOS) as the modifier key.
      </Para>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
        <tbody>
          <TableRow cells={["Shortcut", "Action", "Context"]} header />
          <TableRow cells={["Ctrl + B", "Build project", "IDE view, not during build"]} />
          <TableRow cells={["Ctrl + K", "Open command palette", "IDE view"]} />
          <TableRow cells={["Ctrl + =", "Zoom in", "Global"]} />
          <TableRow cells={["Ctrl + -", "Zoom out", "Global"]} />
          <TableRow cells={["Ctrl + 0", "Reset zoom to 120%", "Global"]} />
          <TableRow cells={["Ctrl + ?", "Toggle keyboard shortcuts", "Global"]} />
          <TableRow cells={["Escape", "Close dialogs and palettes", "When dialog is open"]} />
        </tbody>
      </table>

      <InfoBox variant="info">
        You can also open the keyboard shortcuts reference from within the app by pressing <KeyBadge>Ctrl+?</KeyBadge>,
        which displays a floating overlay with all shortcuts.
      </InfoBox>
    </div>
  );
}

function BackendSupportSection() {
  const { C } = useTheme();
  return (
    <div>
      <SectionHeader title="Backend Support" icon={"\u2756"} color={C.purple} />

      <SubHeading>Supported FPGA Toolchains</SubHeading>
      <Para>
        CovertEDA wraps four vendor toolchains behind a unified interface. Each backend implements the same
        trait ({" "}<Code>FpgaBackend</Code>), providing a consistent experience regardless of the vendor.
      </Para>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
        <tbody>
          <TableRow cells={["Backend", "CLI Tool", "Constraint Format", "Bitstream", "License"]} header />
          <TableRow cells={["Lattice Radiant", "radiantc", ".pdc / .sdc", ".bit", "FlexLM"]} />
          <TableRow cells={["Intel Quartus", "quartus_sh, quartus_syn, quartus_fit", ".qsf / .sdc", ".sof", "FlexLM"]} />
          <TableRow cells={["AMD Vivado", "vivado (batch/TCL mode)", ".xdc", ".bit", "FlexLM"]} />
          <TableRow cells={["OSS CAD Suite", "yosys, nextpnr, ecppack", ".pcf / .lpf", ".bin", "None (open source)"]} />
        </tbody>
      </table>

      <SubHeading>Switching Backends</SubHeading>
      <Para>
        Click the chip icon in the top-left of the sidebar, or use the command palette to switch between
        available backends. CovertEDA auto-detects installed tools on startup and shows which backends are available.
        Unavailable backends are greyed out but still visible.
      </Para>

      <SubHeading>Tool Detection</SubHeading>
      <Para>
        On startup, CovertEDA scans standard installation paths for each vendor tool. You can override these
        paths in <strong style={{ color: C.t1 }}>Settings &gt; Tool Paths</strong>. The detected version is shown
        in the backend switcher.
      </Para>

      <InfoBox variant="info">
        CovertEDA generates TCL or shell scripts and passes them to vendor CLIs as subprocesses. It never
        evaluates TCL directly or modifies vendor databases. This ensures compatibility with all tool versions.
      </InfoBox>
    </div>
  );
}

function SettingsSection() {
  const { C } = useTheme();
  return (
    <div>
      <SectionHeader title="Settings" icon={"\u2699"} color={C.accent} />

      <SubHeading>Tool Paths</SubHeading>
      <Para>
        Configure the installation directory for each vendor tool. If left blank, CovertEDA auto-detects tools
        from standard locations and PATH. You can use the Browse button to select a directory, or type the
        path manually. Supported tools: Lattice Diamond, Lattice Radiant, Intel Quartus, AMD Vivado, Yosys, nextpnr.
      </Para>

      <SubHeading>Theme</SubHeading>
      <Para>
        Three themes are available:
      </Para>
      <div style={{ paddingLeft: 16, marginBottom: 10 }}>
        <Para>
          <strong style={{ color: C.t1 }}>Dark</strong> -- Default dark palette optimized for long coding sessions.<br />
          <strong style={{ color: C.t1 }}>Light</strong> -- Light background for bright environments.<br />
          <strong style={{ color: C.t1 }}>Colorblind</strong> -- Deuteranopia-safe palette that replaces red/green with blue/pink.
        </Para>
      </div>

      <SubHeading>Zoom</SubHeading>
      <Para>
        Adjust the UI scale from 50% to 300%. The default is 120%. You can use the slider, preset buttons,
        or keyboard shortcuts (<KeyBadge>Ctrl+=</KeyBadge> / <KeyBadge>Ctrl+-</KeyBadge> / <KeyBadge>Ctrl+0</KeyBadge>).
        Zoom is applied via the native webview API for crisp rendering at any scale.
      </Para>

      <SubHeading>AI Assistant Configuration</SubHeading>
      <Para>
        Choose your AI provider (Anthropic, OpenAI, Google Gemini, Mistral, xAI, DeepSeek, or Ollama) and model.
        API keys are stored securely in the OS keyring and persist across sessions. For local inference with Ollama,
        no API key is required -- just set the URL if it differs from the default localhost:11434.
      </Para>

      <SubHeading>License File</SubHeading>
      <Para>
        Override the default license file detection by specifying a path to your FlexLM license file. This supports
        both file paths and server addresses (e.g., <Code>27000@license-server</Code>).
      </Para>
    </div>
  );
}

function ProjectConfigSection() {
  const { C } = useTheme();
  return (
    <div>
      <SectionHeader title="Project Configuration" icon={"\u2692"} color={C.orange} />

      <SubHeading>The .coverteda File Format</SubHeading>
      <Para>
        The project configuration file is a JSON document stored at the root of your project directory.
        It contains all settings needed to reproduce a build. Here is a complete reference of all fields:
      </Para>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
        <tbody>
          <TableRow cells={["Field", "Type", "Description"]} header />
          <TableRow cells={["name", "string", "Human-readable project name"]} />
          <TableRow cells={["backendId", "string", "Backend identifier (radiant, quartus, vivado, oss)"]} />
          <TableRow cells={["device", "string", "Target FPGA part number"]} />
          <TableRow cells={["topModule", "string", "Top-level HDL module name"]} />
          <TableRow cells={["sourcePatterns", "string[]", "Glob patterns for source files"]} />
          <TableRow cells={["constraintFiles", "string[]", "Paths to constraint files"]} />
          <TableRow cells={["implDir", "string", "Build output directory (default: impl1)"]} />
          <TableRow cells={["backendConfig", "object", "Backend-specific key-value options"]} />
          <TableRow cells={["createdAt", "string", "ISO 8601 creation timestamp"]} />
          <TableRow cells={["updatedAt", "string", "ISO 8601 last-modified timestamp"]} />
        </tbody>
      </table>

      <SubHeading>Backend-Specific Configuration</SubHeading>
      <Para>
        The <Code>backendConfig</Code> object allows you to pass additional parameters to the vendor toolchain.
        These are backend-specific and vary by vendor. Examples include synthesis effort, optimization goals,
        and placement seed values.
      </Para>

      <SubHeading>Source Patterns</SubHeading>
      <Para>
        Source patterns use standard glob syntax. For example, <Code>source/*.v</Code> matches all Verilog files
        in the source directory, and <Code>**/*.sv</Code> matches all SystemVerilog files recursively.
        Multiple patterns can be specified to include files from different directories.
      </Para>

      <SubHeading>Version Control</SubHeading>
      <Para>
        The <Code>.coverteda</Code> file is designed to be committed to your git repository. This ensures all
        team members share the same project configuration. Build artifacts in the implementation directory
        should generally be added to <Code>.gitignore</Code>.
      </Para>

      <CodeBlock>{`# .gitignore for CovertEDA projects
impl1/
*.bit
*.sof
*.bin
*.jed
.coverteda_build.tcl`}</CodeBlock>
    </div>
  );
}

function AboutSection() {
  const { C, MONO } = useTheme();
  return (
    <div>
      <SectionHeader title="About" icon={"\u2139"} color={C.cyan} />

      <SubHeading>FPGA Professional Association</SubHeading>
      <Para>
        CovertEDA is developed and maintained by the{" "}
        <strong style={{ color: C.accent }}>FPGA Professional Association</strong>, a community organization
        dedicated to advancing the FPGA engineering profession through open-source tooling, education, and
        professional development.
      </Para>
      <Para>
        We believe FPGA engineers deserve modern, open-source tools that match the quality and usability
        standards of the broader software development ecosystem. CovertEDA is our flagship project -- a direct
        response to the frustration that every FPGA engineer experiences with vendor toolchains.
      </Para>

      <SubHeading>Why We Built This</SubHeading>
      <Para>
        Vendor GUIs are slow, crash-prone, and stuck in the past. Quartus takes 30+ seconds to open. Vivado's
        GUI lags on basic operations. Radiant hangs during IP generation. These tools were built a decade ago
        on frameworks that show their age. Every FPGA engineer has lost work to an unrecoverable vendor GUI crash.
      </Para>
      <Para>
        Rather than waiting for vendors to modernize their GUIs (which they have little incentive to do), we're
        building the tool we want to use ourselves. CovertEDA wraps the vendor CLIs behind a fast, reliable,
        unified interface -- and it's open source so the community can shape its direction.
      </Para>

      <SubHeading>Our Goals</SubHeading>
      <div style={{ paddingLeft: 16, marginBottom: 10 }}>
        <Para>
          <strong style={{ color: C.t1 }}>Open-source FPGA tooling</strong> that rivals proprietary vendor GUIs in
          usability and exceeds them in reliability.<br />
          <strong style={{ color: C.t1 }}>Community-driven development</strong> where practicing FPGA engineers
          shape the tool's direction.<br />
          <strong style={{ color: C.t1 }}>Education and professional development</strong> resources for FPGA
          engineers at all levels.<br />
          <strong style={{ color: C.t1 }}>Vendor-neutral advocacy</strong> for better tool interoperability and
          open standards.
        </Para>
      </div>

      <SubHeading>Connect With Us</SubHeading>
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14,
      }}>
        <div style={{
          padding: "12px 14px", borderRadius: 5, background: C.s2,
          border: `1px solid ${C.b1}`, borderTop: `2px solid ${C.accent}`,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.accent, marginBottom: 4 }}>GitHub</div>
          <div
            onClick={() => openUrl("https://github.com/fpga-professional-association/CovertEDA")}
            style={{ fontSize: 9, fontFamily: MONO, color: C.t2, lineHeight: 1.5, wordBreak: "break-all", cursor: "pointer", textDecoration: "underline" }}
          >
            github.com/fpga-professional-association/CovertEDA
          </div>
        </div>
        <div style={{
          padding: "12px 14px", borderRadius: 5, background: C.s2,
          border: `1px solid ${C.b1}`, borderTop: `2px solid ${C.cyan}`,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.cyan, marginBottom: 4 }}>LinkedIn</div>
          <div
            onClick={() => openUrl("https://www.linkedin.com/company/fpga-professional-association/")}
            style={{ fontSize: 9, fontFamily: MONO, color: C.t2, lineHeight: 1.5, wordBreak: "break-all", cursor: "pointer", textDecoration: "underline" }}
          >
            linkedin.com/company/fpga-professional-association
          </div>
        </div>
      </div>

      <SubHeading>Contributing</SubHeading>
      <Para>
        We welcome contributions from the FPGA community. Whether it's bug reports, feature requests, pull
        requests, new backend implementations, or report parser fixtures -- there are many ways to get involved.
        Visit the GitHub repository for contribution guidelines.
      </Para>

      <SubHeading>Status</SubHeading>
      <Para>
        CovertEDA is currently in <Badge color={C.accent}>Beta</Badge> with core features implemented.
        Supported backends include Lattice Radiant, Lattice Diamond, Intel Quartus (Standard and Pro),
        AMD Vivado, Achronix ACE, Microchip Libero SoC, and the OSS CAD Suite (Yosys/nextpnr).
      </Para>

      <InfoBox variant="info">
        CovertEDA does not include or redistribute any vendor tools, IP, libraries, or binaries. Users must
        have their own licensed installations of the vendor toolchains they wish to use.
      </InfoBox>
    </div>
  );
}

// ── Section content map ──

const SECTION_COMPONENTS: Record<string, () => JSX.Element> = {
  "getting-started": GettingStartedSection,
  "build-pipeline": BuildPipelineSection,
  "reports": ReportsSection,
  "constraint-editor": ConstraintEditorSection,
  "ip-catalog": IpCatalogSection,
  "build-history": BuildHistorySection,
  "file-tree": FileTreeSection,
  "ai-assistant": AiAssistantSection,
  "git-integration": GitIntegrationSection,
  "license-management": LicenseManagementSection,
  "command-palette": CommandPaletteSection,
  "keyboard-shortcuts": KeyboardShortcutsSection,
  "backend-support": BackendSupportSection,
  "settings": SettingsSection,
  "project-config": ProjectConfigSection,
  "about": AboutSection,
};

// ── CSS injected once for hover effects (no JS state needed) ──

const SIDEBAR_STYLE_ID = "doc-sidebar-css";
function ensureSidebarCSS() {
  if (document.getElementById(SIDEBAR_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SIDEBAR_STYLE_ID;
  style.textContent = `
    .doc-sidebar-item { transition: background .08s, color .08s; }
    .doc-sidebar-item:hover:not(.doc-sidebar-active) { background: var(--doc-hover-bg) !important; }
    .doc-sidebar-item:hover:not(.doc-sidebar-active) .doc-sidebar-label { color: var(--doc-hover-text) !important; }
  `;
  document.head.appendChild(style);
}

// ── Sidebar extracted into its own component ──
// Hover state is local — never causes content area to re-render.

const DocSidebar = memo(function DocSidebar({
  activeSection,
  onSelect,
}: {
  activeSection: string;
  onSelect: (id: string) => void;
}) {
  const { C, MONO, SANS } = useTheme();

  // Inject CSS once (no-op after first call)
  ensureSidebarCSS();

  const colorMap: Record<string, string> = {
    accent: C.accent, cyan: C.cyan, purple: C.purple,
    pink: C.pink, orange: C.orange, warn: C.warn, ok: C.ok,
  };
  const resolve = (k: string) => colorMap[k] ?? C.accent;

  return (
    <div style={{
      width: 220, flexShrink: 0, background: C.s1, borderRight: `1px solid ${C.b1}`,
      display: "flex", flexDirection: "column", overflow: "hidden",
      // CSS custom properties for hover styles
      ["--doc-hover-bg" as string]: C.s3,
      ["--doc-hover-text" as string]: C.t2,
    }}>
      <div style={{
        padding: "14px 16px 10px", borderBottom: `1px solid ${C.b1}`,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.t1, fontFamily: SANS, marginBottom: 2 }}>
          Documentation
        </div>
        <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, letterSpacing: 0.5 }}>
          COVERTEDA USER GUIDE
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
        {DOC_SECTIONS.map((sec) => {
          const isActive = activeSection === sec.id;
          const color = resolve(sec.color);
          return (
            <div
              key={sec.id}
              className={`doc-sidebar-item${isActive ? " doc-sidebar-active" : ""}`}
              onClick={() => onSelect(sec.id)}
              title={sec.title}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 10px", borderRadius: 5, cursor: "pointer",
                marginBottom: 1,
                background: isActive ? C.accentDim : "transparent",
                borderLeft: isActive ? `2px solid ${color}` : "2px solid transparent",
              }}
            >
              <span style={{ fontSize: 11, color: isActive ? color : C.t3, width: 16, textAlign: "center" }}>
                {sec.icon}
              </span>
              <span
                className="doc-sidebar-label"
                style={{
                  fontSize: 10, fontWeight: isActive ? 700 : 500,
                  color: isActive ? C.t1 : C.t3,
                }}
              >
                {sec.title}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{
        padding: "8px 16px", borderTop: `1px solid ${C.b1}`,
        fontSize: 7, fontFamily: MONO, color: C.t3, lineHeight: 1.6,
      }}>
        CovertEDA v0.1.0 Beta<br />
        FPGA Professional Association<br />
        Last updated: 2026-02-19
      </div>
    </div>
  );
});

// ── Memoized content wrapper — only re-renders when activeSection changes ──

const DocContent = memo(function DocContent({ activeSection }: { activeSection: string }) {
  const SectionComponent = SECTION_COMPONENTS[activeSection];
  return (
    <div style={{
      flex: 1, overflowY: "auto", padding: "20px 32px 40px",
      maxWidth: 800,
    }}>
      {SectionComponent && <SectionComponent />}
    </div>
  );
});

// ── Main Documentation component ──

export default function Documentation() {
  const { SANS } = useTheme();
  const [activeSection, setActiveSection] = useState("getting-started");

  const onSelect = useCallback((id: string) => setActiveSection(id), []);

  return (
    <div style={{
      display: "flex", height: "100%", overflow: "hidden", fontFamily: SANS,
    }}>
      <DocSidebar activeSection={activeSection} onSelect={onSelect} />
      <DocContent activeSection={activeSection} />
    </div>
  );
}
