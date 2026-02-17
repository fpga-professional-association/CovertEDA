// ── Mock / Demo Data ──
// Extracted from coverteda_v3.html and fpgaforge_v2.html mockups.
// Used by the UI before real Tauri IPC is connected.

import {
  C,
  Backend,
  GitState,
  ProjectFile,
  TimingReportData,
  UtilizationReportData,
  PowerReportData,
  DrcReportData,
  IoBankData,
  LicenseEntry,
} from "../types";

// ═══════════════════════════════════════════════════════════════
// 1. BACKENDS — Record<string, Backend>
// ═══════════════════════════════════════════════════════════════

export const BACKENDS: Record<string, Backend> = {
  diamond: {
    id: "diamond",
    name: "Lattice Diamond",
    short: "Diamond",
    color: "#e74c3c",
    icon: "\u25C6", // ◆
    version: "3.13",
    cli: "pnmainc",
    defaultDev: "LCMXO3LF-6900C-5BG256C",
    constrExt: ".lpf",
    pipeline: [
      {
        id: "synth",
        label: "Synthesis (Synplify)",
        cmd: "prj_run Synthesis -impl impl1 -forceOne",
        detail: "RTL \u2192 technology",
      },
      {
        id: "translate",
        label: "Translate",
        cmd: "prj_run Translate -impl impl1",
        detail: "NGD generation",
      },
      {
        id: "map",
        label: "Map",
        cmd: "prj_run Map -impl impl1",
        detail: "Physical synthesis",
      },
      {
        id: "par",
        label: "Place & Route",
        cmd: "prj_run PAR -impl impl1",
        detail: "Placement + routing",
      },
      {
        id: "bitgen",
        label: "Bitstream",
        cmd: "prj_run Export -task Bitgen",
        detail: ".jed/.bit generation",
      },
      {
        id: "timing",
        label: "Timing",
        cmd: "prj_run Export -task TimingSimFileVer",
        detail: "STA check",
      },
    ],
    resources: [
      { label: "LUT4", used: 4217, total: 6864 },
      { label: "Registers", used: 1842, total: 6864 },
      { label: "I/O Pins", used: 47, total: 206 },
      { label: "EBR", used: 12, total: 26, unit: " blk" },
      { label: "PLL", used: 1, total: 2 },
    ],
    timing: { fmax: "148.3", target: "125.0", setup: "+1.87", hold: "+0.42" },
    constraints: [
      { pin: "A4", net: "clk_25mhz", dir: "IN", std: "LVCMOS33", bank: "0", lock: true },
      { pin: "B2", net: "rst_n", dir: "IN", std: "LVCMOS33", bank: "0", lock: true },
      { pin: "C3", net: "i2c_sda", dir: "BIDIR", std: "LVCMOS33", bank: "1", lock: true },
      { pin: "C4", net: "i2c_scl", dir: "OUT", std: "LVCMOS33", bank: "1", lock: true },
      { pin: "D5", net: "spi_mosi", dir: "OUT", std: "LVCMOS33", bank: "1", lock: false },
      { pin: "D6", net: "spi_miso", dir: "IN", std: "LVCMOS33", bank: "1", lock: false },
      { pin: "E9", net: "uart_tx", dir: "OUT", std: "LVCMOS25", bank: "2", lock: true },
      { pin: "E10", net: "uart_rx", dir: "IN", std: "LVCMOS25", bank: "2", lock: true },
      { pin: "G1", net: "led[0]", dir: "OUT", std: "LVCMOS33", bank: "3", lock: true },
      { pin: "H5", net: "bmc_alert_n", dir: "OUT", std: "LVCMOS25", bank: "2", lock: true },
    ],
    paths: [
      { from: "pqc_engine/round_reg[3]", to: "sha3_core/state_in[127]", slack: "+1.87 ns", lvl: 4 },
      { from: "i2c_master/bit_cnt[2]", to: "i2c_master/state_nxt[0]", slack: "+2.34 ns", lvl: 3 },
    ],
    history: [
      { time: "14:24", ok: true, fmax: "148.3", util: "61.4%", w: 2 },
      { time: "13:51", ok: true, fmax: "142.7", util: "63.1%", w: 3 },
      { time: "12:08", ok: false, fmax: "\u2014", util: "\u2014", w: 0 },
    ],
    log: [
      { t: "cmd", m: "pnmainc -t build.tcl" },
      { t: "info", m: "CovertEDA \u2192 Diamond 3.13" },
      { t: "cmd", m: "prj_run Synthesis -impl impl1" },
      { t: "out", m: "Synplify: reading sources..." },
      { t: "ok", m: "Synthesis: 0E 2W" },
      { t: "warn", m: "W: net 'debug_bus[7]' no load" },
      { t: "cmd", m: "prj_run PAR -impl impl1" },
      { t: "out", m: "LUT4: 4,217/6,864 (61.4%)" },
      { t: "ok", m: "PAR complete" },
      { t: "ok", m: "Fmax=148.3 MHz \u2713" },
      { t: "info", m: "\u2550\u2550\u2550 DONE \u2550\u2550\u2550 1m 6s" },
    ],
    ipCatalog: [
      {
        cat: "Memory",
        items: [
          {
            name: "pmi_ram_dp",
            desc: "Dual-Port Block RAM",
            params: ["Width: 8-256", "Depth: 2-65536", "Output Reg: on/off"],
          },
          {
            name: "pmi_ram_dp_true",
            desc: "True Dual-Port RAM",
            params: ["Width A/B: 8-256", "Depth: 2-65536"],
          },
          {
            name: "pmi_fifo",
            desc: "FIFO (First-In First-Out)",
            params: ["Width: 1-256", "Depth: 16-65536", "Almost Full/Empty"],
          },
        ],
      },
      {
        cat: "Math/DSP",
        items: [
          {
            name: "pmi_mult",
            desc: "Multiplier",
            params: ["Width A: 2-36", "Width B: 2-36", "Signed/Unsigned"],
          },
          {
            name: "pmi_add",
            desc: "Adder/Subtractor",
            params: ["Width: 2-256", "Carry In", "Pipeline stages"],
          },
        ],
      },
      {
        cat: "I/O",
        items: [
          {
            name: "pmi_iobuf",
            desc: "I/O Buffer",
            params: ["Standard: LVCMOS/LVDS", "Drive: 4/8/12/16mA"],
          },
          {
            name: "DCCA",
            desc: "Clock Divider/Buffer",
            params: ["Division: 1-128"],
          },
        ],
      },
      {
        cat: "Communication",
        items: [
          {
            name: "I2C Controller",
            desc: "Lattice I2C Hard IP",
            params: ["Speed: 100k/400k/1M", "Address: 7/10 bit", "Multi-master"],
          },
          {
            name: "SPI Controller",
            desc: "Lattice SPI Hard IP",
            params: ["Clock Div: 2-512", "CPOL/CPHA", "Width: 8-32"],
          },
        ],
      },
    ],
  },

  quartus: {
    id: "quartus",
    name: "Intel Quartus Prime",
    short: "Quartus",
    color: "#0091ff",
    icon: "\u25C7", // ◇
    version: "23.1",
    cli: "quartus_sh",
    defaultDev: "5CSEMA5F31C6",
    constrExt: ".sdc",
    pipeline: [
      {
        id: "analysis",
        label: "Analysis & Elaboration",
        cmd: "quartus_syn --analysis_and_elaboration",
        detail: "HDL parse",
      },
      {
        id: "synth",
        label: "Synthesis (quartus_syn)",
        cmd: "quartus_syn --read_settings_files=on",
        detail: "Map to ALMs",
      },
      {
        id: "fit",
        label: "Fitter (quartus_fit)",
        cmd: "quartus_fit --read_settings_files=on",
        detail: "Place & route",
      },
      {
        id: "asm",
        label: "Assembler (quartus_asm)",
        cmd: "quartus_asm",
        detail: "Generate .sof",
      },
      {
        id: "sta",
        label: "TimeQuest (quartus_sta)",
        cmd: "quartus_sta --sdc_file=timing.sdc",
        detail: "STA",
      },
    ],
    resources: [
      { label: "ALMs", used: 3412, total: 32070 },
      { label: "Registers", used: 4891, total: 128280 },
      { label: "M10K Blocks", used: 28, total: 397 },
      { label: "DSP 18x18", used: 2, total: 87 },
      { label: "I/O Pins", used: 89, total: 457 },
      { label: "PLLs", used: 1, total: 6 },
    ],
    timing: { fmax: "203.7", target: "100.0", setup: "+2.341", hold: "+0.187" },
    constraints: [
      { pin: "PIN_AF14", net: "clk_100mhz", dir: "IN", std: "3.3V LVTTL", bank: "3A", lock: true },
      { pin: "PIN_AA14", net: "rst_n", dir: "IN", std: "3.3V LVTTL", bank: "3A", lock: true },
      { pin: "PIN_AJ17", net: "i2c_sda", dir: "BIDIR", std: "3.3V LVTTL", bank: "4A", lock: true },
      { pin: "PIN_V16", net: "spi_mosi", dir: "OUT", std: "3.3V LVTTL", bank: "5B", lock: false },
      { pin: "PIN_AB12", net: "uart_tx", dir: "OUT", std: "3.3V LVTTL", bank: "3B", lock: true },
      { pin: "PIN_V15", net: "led[0]", dir: "OUT", std: "3.3V LVTTL", bank: "6A", lock: true },
    ],
    paths: [
      { from: "pqc_engine|round_reg[3]", to: "sha3_core|state_in[127]", slack: "+2.341 ns", lvl: 5 },
      { from: "i2c_master|bit_cnt[2]", to: "i2c_master|state_nxt[0]", slack: "+3.102 ns", lvl: 3 },
    ],
    history: [
      { time: "16:42", ok: true, fmax: "203.7", util: "10.6%", w: 3 },
      { time: "15:18", ok: true, fmax: "198.2", util: "11.2%", w: 4 },
      { time: "13:07", ok: false, fmax: "\u2014", util: "\u2014", w: 0 },
    ],
    log: [
      { t: "cmd", m: "quartus_sh --flow compile dc_scm_controller" },
      { t: "info", m: "CovertEDA \u2192 Quartus 23.1" },
      { t: "cmd", m: "quartus_syn --read_settings_files=on" },
      { t: "out", m: "Implemented 6,841 resources" },
      { t: "ok", m: "Synthesis: 0E 3W" },
      { t: "cmd", m: "quartus_fit" },
      { t: "out", m: "ALMs: 3,412/32,070 (10.6%)" },
      { t: "ok", m: "Fitter complete" },
      { t: "cmd", m: "quartus_sta" },
      { t: "ok", m: "Fmax=203.7 MHz \u2713" },
      { t: "info", m: "\u2550\u2550\u2550 DONE \u2550\u2550\u2550 2m 34s" },
    ],
    ipCatalog: [
      {
        cat: "Memory",
        items: [
          {
            name: "RAM: 1-PORT",
            desc: "Single-port RAM (M10K/MLAB)",
            params: ["Width: 1-256", "Depth: 1-65536", "Output Reg", "Byte Enable"],
          },
          {
            name: "RAM: 2-PORT",
            desc: "Simple Dual-Port RAM",
            params: ["Width R/W: 1-256", "Mixed Width", "ECC"],
          },
          {
            name: "FIFO",
            desc: "SCFIFO / DCFIFO",
            params: ["Width: 1-256", "Depth: 16-131072", "Show-ahead", "Async DCFIFO"],
          },
        ],
      },
      {
        cat: "DSP",
        items: [
          {
            name: "ALTMULT_ADD",
            desc: "Multiply-Accumulate",
            params: ["Width: 9/18/27/36", "Pipeline: 0-3", "Signed"],
          },
          {
            name: "ALTFP_MULT",
            desc: "Floating Point Multiplier",
            params: ["Single/Double precision"],
          },
        ],
      },
      {
        cat: "Interface",
        items: [
          {
            name: "Avalon-MM Master",
            desc: "Avalon Memory-Mapped Master Bridge",
            params: ["Data Width: 8-512", "Burst: 1-128"],
          },
          {
            name: "Avalon-ST",
            desc: "Avalon Streaming Interface",
            params: ["Symbols: 1-32", "Backpressure"],
          },
          {
            name: "JTAG UART",
            desc: "JTAG-to-UART Bridge",
            params: ["FIFO Depth: 8-32768"],
          },
        ],
      },
      {
        cat: "Protocol",
        items: [
          {
            name: "Nios II Processor",
            desc: "Soft-core processor",
            params: ["Economy/Standard/Fast", "JTAG Debug", "Custom Instr"],
          },
          {
            name: "PIO",
            desc: "Parallel I/O",
            params: ["Width: 1-32", "Direction", "Edge Capture", "IRQ"],
          },
        ],
      },
    ],
  },

  vivado: {
    id: "vivado",
    name: "AMD Vivado",
    short: "Vivado",
    color: "#8cc63f",
    icon: "\u25B2", // ▲
    version: "2024.1",
    cli: "vivado -mode tcl",
    defaultDev: "xc7a100tcsg324-1",
    constrExt: ".xdc",
    pipeline: [
      {
        id: "synth",
        label: "synth_design",
        cmd: "synth_design -top top_level",
        detail: "RTL synthesis",
      },
      {
        id: "opt",
        label: "opt_design",
        cmd: "opt_design -directive Explore",
        detail: "Logic opt",
      },
      {
        id: "place",
        label: "place_design",
        cmd: "place_design -directive ExtraPostPlacementOpt",
        detail: "Placement",
      },
      {
        id: "phys",
        label: "phys_opt_design",
        cmd: "phys_opt_design -directive AggressiveExplore",
        detail: "Post-place opt",
      },
      {
        id: "route",
        label: "route_design",
        cmd: "route_design -directive Explore",
        detail: "Routing",
      },
      {
        id: "bitgen",
        label: "write_bitstream",
        cmd: "write_bitstream -force output.bit",
        detail: ".bit generation",
      },
    ],
    resources: [
      { label: "Slice LUTs", used: 5841, total: 63400 },
      { label: "Slice Registers", used: 3217, total: 126800 },
      { label: "BRAM 36Kb", used: 17, total: 270, unit: " tiles" },
      { label: "DSP48E1", used: 4, total: 240 },
      { label: "I/O", used: 89, total: 210 },
      { label: "BUFG", used: 3, total: 32 },
    ],
    timing: { fmax: "178.4", target: "100.0", setup: "+1.923", hold: "+0.031" },
    constraints: [
      { pin: "E3", net: "clk_100mhz", dir: "IN", std: "LVCMOS33", bank: "35", lock: true },
      { pin: "C12", net: "rst_n", dir: "IN", std: "LVCMOS33", bank: "35", lock: true },
      { pin: "C14", net: "i2c_sda", dir: "BIDIR", std: "LVCMOS33", bank: "34", lock: true },
      { pin: "G13", net: "spi_mosi", dir: "OUT", std: "LVCMOS33", bank: "34", lock: false },
      { pin: "D4", net: "uart_tx", dir: "OUT", std: "LVCMOS33", bank: "35", lock: true },
      { pin: "H17", net: "led[0]", dir: "OUT", std: "LVCMOS33", bank: "34", lock: true },
    ],
    paths: [
      { from: "pqc_engine/round_reg[3]", to: "sha3_core/state_in[127]", slack: "+1.923 ns", lvl: 5 },
      { from: "i2c_master/bit_cnt[2]", to: "i2c_master/state_nxt[0]", slack: "+2.876 ns", lvl: 3 },
    ],
    history: [
      { time: "17:03", ok: true, fmax: "178.4", util: "9.2%", w: 1 },
      { time: "15:45", ok: true, fmax: "174.1", util: "9.5%", w: 2 },
      { time: "12:30", ok: false, fmax: "\u2014", util: "\u2014", w: 0 },
    ],
    log: [
      { t: "cmd", m: "vivado -mode tcl -source build.tcl" },
      { t: "info", m: "CovertEDA \u2192 Vivado 2024.1" },
      { t: "cmd", m: "synth_design -top top_level" },
      { t: "out", m: "Elaboration \u2192 Synthesis..." },
      { t: "ok", m: "Synth: 0E 1CW" },
      { t: "cmd", m: "place_design" },
      { t: "out", m: "LUTs: 5,841/63,400 (9.2%)" },
      { t: "ok", m: "Placement complete" },
      { t: "cmd", m: "route_design" },
      { t: "ok", m: "Routing: 0 unrouted" },
      { t: "ok", m: "Fmax=178.4 MHz \u2713" },
      { t: "info", m: "\u2550\u2550\u2550 DONE \u2550\u2550\u2550 3m 13s" },
    ],
    ipCatalog: [
      {
        cat: "Memory",
        items: [
          {
            name: "Block Memory Gen",
            desc: "BRAM/URAM IP Generator",
            params: [
              "Type: Single/TDP/SDP",
              "Width: 1-4096",
              "Depth: 2-1048576",
              "ECC",
              "Byte Write",
            ],
          },
          {
            name: "FIFO Generator",
            desc: "Sync/Async FIFO",
            params: [
              "Standard/FWFT",
              "Width: 1-1024",
              "Depth: 16-4M",
              "Async Clock Domains",
            ],
          },
        ],
      },
      {
        cat: "DSP/Math",
        items: [
          {
            name: "Floating Point",
            desc: "IEEE 754 Operators",
            params: [
              "Op: Add/Sub/Mul/Div/Sqrt/FMA",
              "Precision: Half/Single/Double/Custom",
            ],
          },
          {
            name: "CORDIC",
            desc: "Trig/Hyperbolic/Sqrt",
            params: [
              "Function: Rotate/Translate/Sin/Cos",
              "Pipeline: Optimal/Max",
            ],
          },
        ],
      },
      {
        cat: "AXI Infrastructure",
        items: [
          {
            name: "AXI Interconnect",
            desc: "NxM AXI Crossbar",
            params: [
              "Masters: 1-16",
              "Slaves: 1-16",
              "Data Width: 32/64/128/256/512",
              "Protocol: AXI4/AXI4-Lite",
            ],
          },
          {
            name: "AXI SmartConnect",
            desc: "Next-gen AXI fabric",
            params: ["Ports: 1-16", "Width Conversion", "Clock Conversion"],
          },
          {
            name: "AXI GPIO",
            desc: "General Purpose I/O via AXI",
            params: ["Width: 1-32", "Dual Channel", "Interrupt"],
          },
          {
            name: "AXI UART Lite",
            desc: "Simple UART over AXI4-Lite",
            params: ["Baud: 9600-921600", "Data Bits: 5-8"],
          },
        ],
      },
      {
        cat: "Processing",
        items: [
          {
            name: "MicroBlaze MCS",
            desc: "Soft-core (compact)",
            params: ["Memory: 4K-256K", "Debug", "FPU"],
          },
          {
            name: "Clocking Wizard",
            desc: "MMCM/PLL Configuration",
            params: ["Input: 10-800 MHz", "Outputs: 1-7", "Phase/Duty/Jitter"],
          },
        ],
      },
    ],
  },

  opensource: {
    id: "opensource",
    name: "OSS CAD Suite",
    short: "OSS CAD",
    color: "#fb923c",
    icon: "\u2726", // ✦
    version: "yosys 0.40",
    cli: "yosys / nextpnr",
    defaultDev: "LFE5U-85F-6BG381C",
    constrExt: ".lpf",
    pipeline: [
      {
        id: "synth",
        label: "Yosys Synthesis",
        cmd: "yosys -p 'synth_ecp5 -json out.json' *.v",
        detail: "Open source synth",
      },
      {
        id: "pnr",
        label: "nextpnr Place & Route",
        cmd: "nextpnr-ecp5 --85k --json out.json --lpf pins.lpf",
        detail: "Open PnR",
      },
      {
        id: "pack",
        label: "ecppack Bitstream",
        cmd: "ecppack --compress out.config --bit out.bit",
        detail: "Pack bitstream",
      },
    ],
    resources: [
      { label: "LUT4", used: 6123, total: 83640 },
      { label: "Flip-Flops", used: 2981, total: 83640 },
      { label: "I/O", used: 47, total: 197 },
      { label: "EBR 18Kb", used: 18, total: 208, unit: " blk" },
      { label: "PLL", used: 1, total: 4 },
    ],
    timing: { fmax: "131.2", target: "125.0", setup: "+0.62", hold: "+0.28" },
    constraints: [
      { pin: "P3", net: "clk_25mhz", dir: "IN", std: "LVCMOS33", bank: "0", lock: true },
      { pin: "T2", net: "rst_n", dir: "IN", std: "LVCMOS33", bank: "0", lock: true },
      { pin: "R1", net: "i2c_sda", dir: "BIDIR", std: "LVCMOS33", bank: "1", lock: true },
      { pin: "B9", net: "uart_tx", dir: "OUT", std: "LVCMOS25", bank: "6", lock: true },
      { pin: "T6", net: "led[0]", dir: "OUT", std: "LVCMOS33", bank: "3", lock: true },
    ],
    paths: [
      { from: "pqc_engine.round_reg[3]", to: "sha3_core.state_in[127]", slack: "+0.62 ns", lvl: 6 },
    ],
    history: [
      { time: "09:14", ok: true, fmax: "131.2", util: "7.3%", w: 0 },
      { time: "08:52", ok: true, fmax: "128.9", util: "7.5%", w: 1 },
    ],
    log: [
      { t: "cmd", m: "yosys -p 'synth_ecp5 -json out.json' src/*.v" },
      { t: "info", m: "CovertEDA \u2192 OSS CAD (yosys+nextpnr)" },
      { t: "out", m: "synth_ecp5: 6,123 LCs, 18 BRAMs" },
      { t: "ok", m: "Synthesis done" },
      { t: "cmd", m: "nextpnr-ecp5 --85k" },
      { t: "out", m: "Fmax clk_25mhz: 131.21 MHz" },
      { t: "ok", m: "PnR complete" },
      { t: "cmd", m: "ecppack --compress" },
      { t: "ok", m: "out.bit (2.1 MB)" },
      { t: "info", m: "\u2550\u2550\u2550 DONE \u2550\u2550\u2550 42s" },
    ],
    ipCatalog: [
      {
        cat: "Memory (FOSS)",
        items: [
          {
            name: "picosoc_mem",
            desc: "Simple RAM (inferred)",
            params: ["Width: any", "Depth: any"],
          },
          {
            name: "async_fifo",
            desc: "Open-source async FIFO",
            params: ["Width", "Depth", "Gray-code ptrs"],
          },
        ],
      },
      {
        cat: "Processing (FOSS)",
        items: [
          {
            name: "VexRiscv",
            desc: "RISC-V soft-core (SpinalHDL)",
            params: ["RV32IM[A][F][D]", "Pipeline stages", "Cache config"],
          },
          {
            name: "PicoRV32",
            desc: "Compact RISC-V core",
            params: ["RV32I/E/M", "IRQ support", "Dual-port"],
          },
        ],
      },
      {
        cat: "Communication (FOSS)",
        items: [
          {
            name: "wb_uart",
            desc: "Wishbone UART",
            params: ["Baud", "FIFO depth"],
          },
          {
            name: "wb_i2c",
            desc: "Wishbone I2C Master",
            params: ["Speed", "Multi-master"],
          },
          {
            name: "wb_spi",
            desc: "Wishbone SPI Master",
            params: ["CPOL/CPHA", "Width"],
          },
        ],
      },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════
// 2. GIT — GitState mock data
// ═══════════════════════════════════════════════════════════════

export const GIT: GitState = {
  branch: "feature/pqc-kyber-engine",
  commit: "a3f7c2e",
  commitMsg: "Add Kyber round function pipeline stage",
  author: "Travis",
  time: "14 min ago",
  ahead: 2,
  behind: 0,
  dirty: true,
  staged: 3,
  unstaged: 2,
  untracked: 1,
  stashes: 1,
  tags: ["v0.4.1-rc2"],
  recentCommits: [
    { hash: "a3f7c2e", msg: "Add Kyber round function pipeline stage", time: "14m", author: "Travis" },
    { hash: "b91d4f8", msg: "Fix I2C NACK handling in multi-master mode", time: "2h", author: "Travis" },
    { hash: "e5c0a12", msg: "Update .lpf constraints for bank 2 LVCMOS25", time: "5h", author: "Travis" },
    { hash: "7f3b901", msg: "Refactor SPI flash controller state machine", time: "1d", author: "Wei" },
    { hash: "c42e8d6", msg: "Add SHA3 Keccak-f[1600] permutation core", time: "2d", author: "Travis" },
    { hash: "1a9e7b3", msg: "Initial DC-SCM top-level integration", time: "4d", author: "Travis" },
  ],
};

// ═══════════════════════════════════════════════════════════════
// 3. FILES — ProjectFile[] mock data
// ═══════════════════════════════════════════════════════════════

export const FILES: ProjectFile[] = [
  { n: "src", d: 0, ty: "folder", open: true },
  { n: "top_level.sv", d: 1, ty: "rtl", saved: false, git: "M", synth: true, sim: true, lines: 342, lang: "SystemVerilog" },
  { n: "i2c_master.sv", d: 1, ty: "rtl", saved: true, git: "clean", synth: true, sim: true, lines: 287, lang: "SystemVerilog" },
  { n: "spi_flash_ctrl.sv", d: 1, ty: "rtl", saved: true, git: "clean", synth: true, sim: true, lines: 198, lang: "SystemVerilog" },
  { n: "pqc_engine.sv", d: 1, ty: "rtl", saved: false, git: "M", synth: true, sim: true, lines: 524, lang: "SystemVerilog" },
  { n: "sha3_core.v", d: 1, ty: "rtl", saved: true, git: "clean", synth: true, sim: true, lines: 412, lang: "Verilog" },
  { n: "keccak_round.v", d: 1, ty: "rtl", saved: true, git: "A", synth: true, sim: true, lines: 156, lang: "Verilog" },
  { n: "uart_tx.v", d: 1, ty: "rtl", saved: true, git: "clean", synth: true, sim: false, lines: 89, lang: "Verilog" },
  { n: "gpio_ctrl.v", d: 1, ty: "rtl", saved: true, git: "clean", synth: true, sim: false, lines: 67, lang: "Verilog" },
  { n: "debug_bus.sv", d: 1, ty: "rtl", saved: true, git: "clean", synth: false, sim: false, lines: 44, lang: "SystemVerilog" },
  { n: "testbench", d: 0, ty: "folder", open: true },
  { n: "tb_top.sv", d: 1, ty: "tb", saved: true, git: "A", synth: false, sim: true, lines: 256, lang: "SystemVerilog" },
  { n: "tb_i2c_model.sv", d: 1, ty: "tb", saved: true, git: "A", synth: false, sim: true, lines: 134, lang: "SystemVerilog" },
  { n: "tb_spi_flash.sv", d: 1, ty: "tb", saved: true, git: "clean", synth: false, sim: true, lines: 98, lang: "SystemVerilog" },
  { n: "wave_config.do", d: 1, ty: "config", saved: true, git: "U", synth: false, sim: false, lines: 32, lang: "TCL" },
  { n: "constraints", d: 0, ty: "folder", open: true },
  { n: "dc_scm.lpf", d: 1, ty: "constr", saved: true, git: "M", synth: true, sim: false, lines: 147, lang: "LPF" },
  { n: "timing.sdc", d: 1, ty: "constr", saved: true, git: "clean", synth: true, sim: false, lines: 23, lang: "SDC" },
  { n: "ip", d: 0, ty: "folder", open: false },
  { n: "pll_core.v", d: 1, ty: "ip", saved: true, git: "clean", synth: true, sim: true, lines: 45, lang: "Verilog" },
  { n: "i2c_hard_ip.v", d: 1, ty: "ip", saved: true, git: "clean", synth: true, sim: false, lines: 12, lang: "Verilog" },
  { n: "impl", d: 0, ty: "folder", open: false },
  { n: "output.jed", d: 1, ty: "output", saved: true, git: "clean", synth: false, sim: false, lines: 0, lang: "Binary" },
  { n: "output.bit", d: 1, ty: "output", saved: true, git: "clean", synth: false, sim: false, lines: 0, lang: "Binary" },
  { n: "timing_report.txt", d: 1, ty: "output", saved: true, git: "clean", synth: false, sim: false, lines: 890, lang: "Report" },
  { n: "docs", d: 0, ty: "folder", open: false },
  { n: "README.md", d: 1, ty: "doc", saved: true, git: "clean", synth: false, sim: false, lines: 78, lang: "Markdown" },
  { n: "CHANGELOG.md", d: 1, ty: "doc", saved: false, git: "M", synth: false, sim: false, lines: 145, lang: "Markdown" },
];

// ═══════════════════════════════════════════════════════════════
// 4. REPORTS — timing, utilization, power, drc, io
// ═══════════════════════════════════════════════════════════════

export const REPORTS: {
  timing: TimingReportData;
  utilization: UtilizationReportData;
  power: PowerReportData;
  drc: DrcReportData;
  io: { title: string; generated: string; banks: IoBankData[] };
} = {
  timing: {
    title: "Timing Analysis Report",
    generated: "2025-02-15 14:24:07",
    tool: "Lattice Diamond 3.13 / Synplify Pro",
    summary: {
      status: "PASS",
      fmax: "148.3 MHz",
      target: "125.0 MHz",
      margin: "+23.3 MHz (+18.6%)",
      wns: "+1.87 ns",
      tns: "0.000 ns",
      whs: "+0.42 ns",
      ths: "0.000 ns",
      failingPaths: 0,
      totalPaths: 847,
      clocks: 2,
    },
    clocks: [
      {
        name: "clk_25mhz",
        period: "40.000 ns",
        freq: "25.0 MHz",
        source: "Pin A4",
        type: "Primary",
        wns: "+5.21 ns",
        paths: 124,
      },
      {
        name: "pll_clk_125",
        period: "8.000 ns",
        freq: "125.0 MHz",
        source: "PLL output",
        type: "Generated",
        wns: "+1.87 ns",
        paths: 723,
      },
    ],
    criticalPaths: [
      {
        rank: 1,
        from: "pqc_engine/round_reg[3]",
        to: "sha3_core/state_in[127]",
        slack: "+1.87 ns",
        req: "8.000 ns",
        delay: "6.130 ns",
        levels: 4,
        clk: "pll_clk_125",
        type: "Setup",
      },
      {
        rank: 2,
        from: "pqc_engine/key_sched/rcon[7]",
        to: "pqc_engine/round_fn/mix_col[31]",
        slack: "+2.14 ns",
        req: "8.000 ns",
        delay: "5.860 ns",
        levels: 4,
        clk: "pll_clk_125",
        type: "Setup",
      },
      {
        rank: 3,
        from: "i2c_master/bit_cnt[2]",
        to: "i2c_master/state_nxt[0]",
        slack: "+2.34 ns",
        req: "8.000 ns",
        delay: "5.660 ns",
        levels: 3,
        clk: "pll_clk_125",
        type: "Setup",
      },
      {
        rank: 4,
        from: "spi_ctrl/addr_reg[23]",
        to: "spi_ctrl/data_out[7]",
        slack: "+3.12 ns",
        req: "8.000 ns",
        delay: "4.880 ns",
        levels: 2,
        clk: "pll_clk_125",
        type: "Setup",
      },
      {
        rank: 5,
        from: "sha3_core/theta/xor_plane[2]",
        to: "sha3_core/chi/out_state[63]",
        slack: "+3.41 ns",
        req: "8.000 ns",
        delay: "4.590 ns",
        levels: 3,
        clk: "pll_clk_125",
        type: "Setup",
      },
      {
        rank: 6,
        from: "uart_tx/baud_cnt[15]",
        to: "uart_tx/bit_idx[3]",
        slack: "+5.21 ns",
        req: "40.000 ns",
        delay: "34.790 ns",
        levels: 2,
        clk: "clk_25mhz",
        type: "Setup",
      },
    ],
    holdPaths: [
      { rank: 1, from: "i2c_master/sda_oe_reg", to: "i2c_master/sda_out", slack: "+0.42 ns", levels: 1, type: "Hold" },
      { rank: 2, from: "gpio_ctrl/out_reg[0]", to: "gpio_ctrl/out_pad[0]", slack: "+0.48 ns", levels: 1, type: "Hold" },
    ],
    unconstrained: [
      "debug_bus/probe[7:0] \u2014 no clock constraint (excluded from synthesis)",
    ],
  },

  utilization: {
    title: "Resource Utilization Report",
    generated: "2025-02-15 14:24:07",
    device: "LCMXO3LF-6900C-5BG256C",
    summary: [
      {
        cat: "Logic",
        items: [
          { r: "LUT4", used: 4217, total: 6864, detail: "61.4% \u2014 Consider optimization above 70%" },
          { r: "Registers (FF)", used: 1842, total: 6864, detail: "26.8%" },
          { r: "Carry Chain", used: 87, total: 3432, detail: "2.5%" },
        ],
      },
      {
        cat: "Memory",
        items: [
          { r: "EBR (18Kb blocks)", used: 12, total: 26, detail: "46.2% \u2014 PQC engine key storage + FIFO" },
          { r: "Distributed RAM", used: 840, total: 5120, detail: "16.4% \u2014 bits" },
        ],
      },
      {
        cat: "I/O",
        items: [
          { r: "User I/O Pins", used: 47, total: 206, detail: "22.8%" },
          { r: "Differential Pairs", used: 0, total: 72, detail: "0.0%" },
          { r: "I/O Banks Used", used: 4, total: 6, detail: "Banks 0,1,2,3" },
        ],
      },
      {
        cat: "Clock",
        items: [
          { r: "PLL/DLL", used: 1, total: 2, detail: "PLL0 \u2192 125 MHz from 25 MHz input" },
          { r: "Global Clock Nets", used: 2, total: 8, detail: "clk_25mhz, pll_clk_125" },
        ],
      },
    ],
    byModule: [
      { module: "pqc_engine", lut: 1847, ff: 812, ebr: 8, pct: "43.8%" },
      { module: "sha3_core", lut: 1234, ff: 456, ebr: 2, pct: "29.3%" },
      { module: "i2c_master", lut: 412, ff: 189, ebr: 1, pct: "9.8%" },
      { module: "spi_flash_ctrl", lut: 367, ff: 178, ebr: 1, pct: "8.7%" },
      { module: "uart_tx", lut: 89, ff: 67, ebr: 0, pct: "2.1%" },
      { module: "gpio_ctrl", lut: 67, ff: 34, ebr: 0, pct: "1.6%" },
      { module: "top_level (glue)", lut: 201, ff: 106, ebr: 0, pct: "4.8%" },
    ],
  },

  power: {
    title: "Power Estimation Report",
    generated: "2025-02-15 14:24:07",
    junction: "52.3 \u00B0C",
    ambient: "25 \u00B0C",
    theta_ja: "23.4 \u00B0C/W",
    total: "280 mW",
    confidence: "Medium (toggle rates estimated)",
    breakdown: [
      { cat: "Static (Quiescent)", mw: 42, pct: 15, color: C.t3 },
      { cat: "Dynamic \u2014 Clocks", mw: 118, pct: 42, color: C.accent },
      { cat: "Dynamic \u2014 Logic", mw: 67, pct: 24, color: C.purple },
      { cat: "Dynamic \u2014 I/O", mw: 31, pct: 11, color: C.cyan },
      { cat: "Dynamic \u2014 Block RAM", mw: 22, pct: 8, color: C.ok },
    ],
    byRail: [
      { rail: "VCCIO (3.3V)", mw: 38 },
      { rail: "VCCIO (2.5V)", mw: 12 },
      { rail: "VCC (1.2V core)", mw: 198 },
      { rail: "VCCAUX", mw: 32 },
    ],
  },

  drc: {
    title: "Design Rule Check Report",
    generated: "2025-02-15 14:24:07",
    summary: { errors: 0, critWarns: 1, warnings: 4, info: 12, waived: 2 },
    items: [
      {
        sev: "crit_warn",
        code: "DRC-LUTPZ",
        msg: "LUT4 at pqc_engine/round_fn has all constant inputs \u2014 may be optimized away",
        loc: "pqc_engine.sv:247",
        action: "Verify intent or add (* keep *) attribute",
      },
      {
        sev: "warning",
        code: "DRC-IOBUF",
        msg: "I/O pin D5 (spi_mosi) has no SLEWRATE constraint specified",
        loc: "dc_scm.lpf",
        action: "Add SLEWRATE=SLOW for signal integrity",
      },
      {
        sev: "warning",
        code: "DRC-IOBUF",
        msg: "I/O pin D6 (spi_miso) has no SLEWRATE constraint specified",
        loc: "dc_scm.lpf",
        action: "Add SLEWRATE=SLOW for signal integrity",
      },
      {
        sev: "warning",
        code: "DRC-CLKNET",
        msg: "Clock 'clk_25mhz' drives 124 FFs but could use secondary clock network",
        loc: "top_level.sv:18",
        action: "Consider using DCCA buffer",
      },
      {
        sev: "warning",
        code: "DRC-FLOAT",
        msg: "Net 'debug_bus[7]' has no load \u2014 will be trimmed",
        loc: "debug_bus.sv:12",
        action: "Connect or remove",
      },
      {
        sev: "info",
        code: "DRC-UTIL",
        msg: "LUT utilization at 61.4% \u2014 approaching density threshold",
        loc: "\u2014",
        action: "Monitor after next feature add",
      },
      {
        sev: "info",
        code: "DRC-HOLD",
        msg: "All hold violations fixed by router \u2014 minimum slack +0.42 ns",
        loc: "\u2014",
        action: "None",
      },
      {
        sev: "info",
        code: "DRC-EBR",
        msg: "EBR utilization 46.2% \u2014 adequate headroom",
        loc: "\u2014",
        action: "None",
      },
      {
        sev: "waived",
        code: "DRC-JTAG",
        msg: "JTAG pins not constrained (handled by programmer)",
        loc: "\u2014",
        action: "Waived per design spec",
      },
      {
        sev: "waived",
        code: "DRC-CONFIG",
        msg: "Configuration pins not in constraint file",
        loc: "\u2014",
        action: "Waived \u2014 handled by device defaults",
      },
    ],
  },

  io: {
    title: "I/O Pin Assignment & Banking Report",
    generated: "2025-02-15 14:24:07",
    banks: [
      {
        id: "0",
        vccio: "3.3V",
        used: 4,
        total: 42,
        pins: [
          "A4 clk_25mhz IN",
          "B2 rst_n IN",
          "A3 cfg_done OUT",
          "B3 cfg_initn IN",
        ],
      },
      {
        id: "1",
        vccio: "3.3V",
        used: 8,
        total: 48,
        pins: [
          "C3 i2c_sda BIDIR",
          "C4 i2c_scl OUT",
          "D5 spi_mosi OUT",
          "D6 spi_miso IN",
          "D7 spi_clk OUT",
          "D8 spi_cs_n OUT",
          "C5 gpio[0] OUT",
          "C6 gpio[1] OUT",
        ],
      },
      {
        id: "2",
        vccio: "2.5V",
        used: 6,
        total: 38,
        pins: [
          "E9 uart_tx OUT",
          "E10 uart_rx IN",
          "F8 bmc_alert_n OUT",
          "E8 bmc_ready IN",
          "F9 spare[0] OUT",
          "G8 spare[1] OUT",
        ],
      },
      {
        id: "3",
        vccio: "3.3V",
        used: 8,
        total: 44,
        pins: [
          "G1 led[0] OUT",
          "G2 led[1] OUT",
          "G3 led[2] OUT",
          "G4 led[3] OUT",
          "H1 sw[0] IN",
          "H2 sw[1] IN",
          "H3 sw[2] IN",
          "H4 sw[3] IN",
        ],
      },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════
// 5. INTERCONNECT — blocks and wires for the bus diagram
// ═══════════════════════════════════════════════════════════════

export interface InterconnectBlock {
  id: string;
  name: string;
  type: "master" | "slave" | "switch" | "bridge";
  bus: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

export interface InterconnectWire {
  from: string;
  to: string;
}

export const INTERCONNECT_BLOCKS: InterconnectBlock[] = [
  { id: "cpu", name: "BMC / Host CPU", type: "master", bus: "AXI4-Lite", x: 50, y: 30, w: 160, h: 60, color: C.purple },
  { id: "xbar", name: "AXI Interconnect", type: "switch", bus: "AXI4-Lite", x: 120, y: 140, w: 200, h: 50, color: C.accent },
  { id: "i2c", name: "I2C Controller", type: "slave", bus: "APB", x: 20, y: 250, w: 130, h: 50, color: C.cyan },
  { id: "spi", name: "SPI Flash Ctrl", type: "slave", bus: "APB", x: 170, y: 250, w: 130, h: 50, color: C.cyan },
  { id: "gpio", name: "GPIO / LED", type: "slave", bus: "APB", x: 320, y: 250, w: 110, h: 50, color: C.cyan },
  { id: "uart", name: "UART", type: "slave", bus: "APB", x: 20, y: 340, w: 110, h: 50, color: C.cyan },
  { id: "pqc", name: "PQC Engine", type: "slave", bus: "AXI4-Lite", x: 155, y: 340, w: 140, h: 50, color: C.pink },
  { id: "bram", name: "Block RAM", type: "slave", bus: "AXI4", x: 320, y: 340, w: 110, h: 50, color: C.ok },
  { id: "apb_br", name: "APB Bridge", type: "bridge", bus: "AXI\u2192APB", x: 50, y: 190, w: 120, h: 36, color: C.warn },
  { id: "timer", name: "Timer / WDT", type: "slave", bus: "APB", x: 320, y: 190, w: 110, h: 40, color: C.cyan },
];

export const INTERCONNECT_WIRES: InterconnectWire[] = [
  { from: "cpu", to: "xbar" },
  { from: "xbar", to: "apb_br" },
  { from: "xbar", to: "pqc" },
  { from: "xbar", to: "bram" },
  { from: "xbar", to: "timer" },
  { from: "apb_br", to: "i2c" },
  { from: "apb_br", to: "spi" },
  { from: "apb_br", to: "gpio" },
  { from: "apb_br", to: "uart" },
];

// ═══════════════════════════════════════════════════════════════
// 6. REG_MAP — register map for DC-SCM style design
// ═══════════════════════════════════════════════════════════════

export interface RegisterField {
  bits: string;
  name: string;
  desc?: string;
}

export interface RegisterEntry {
  offset: string;
  name: string;
  desc: string;
  fields: RegisterField[];
}

export const REG_MAP: RegisterEntry[] = [
  {
    offset: "0x0000",
    name: "CTRL",
    desc: "Main control register",
    fields: [
      { bits: "0", name: "EN", desc: "Global enable" },
      { bits: "1", name: "RST", desc: "Soft reset" },
      { bits: "7:2", name: "MODE", desc: "Operating mode" },
    ],
  },
  {
    offset: "0x0004",
    name: "STATUS",
    desc: "Status / flags (RO)",
    fields: [
      { bits: "0", name: "BUSY", desc: "Engine busy" },
      { bits: "1", name: "DONE", desc: "Op complete" },
      { bits: "2", name: "ERR", desc: "Error flag" },
      { bits: "15:8", name: "STATE", desc: "FSM state" },
    ],
  },
  {
    offset: "0x0008",
    name: "IRQ_EN",
    desc: "Interrupt enable mask",
    fields: [
      { bits: "0", name: "DONE_IE" },
      { bits: "1", name: "ERR_IE" },
      { bits: "2", name: "TIMER_IE" },
    ],
  },
  {
    offset: "0x000C",
    name: "IRQ_STATUS",
    desc: "Interrupt status (W1C)",
    fields: [
      { bits: "0", name: "DONE_IS" },
      { bits: "1", name: "ERR_IS" },
      { bits: "2", name: "TIMER_IS" },
    ],
  },
  {
    offset: "0x0010",
    name: "PQC_CMD",
    desc: "PQC command register",
    fields: [
      { bits: "3:0", name: "OP", desc: "Operation (keygen/sign/verify)" },
      { bits: "7:4", name: "ALG", desc: "Algorithm select" },
    ],
  },
  {
    offset: "0x0014",
    name: "PQC_STATUS",
    desc: "PQC engine status (RO)",
    fields: [
      { bits: "0", name: "BUSY" },
      { bits: "1", name: "VALID" },
      { bits: "15:8", name: "ROUNDS", desc: "Round counter" },
    ],
  },
  {
    offset: "0x0020",
    name: "I2C_ADDR",
    desc: "I2C target address",
    fields: [
      { bits: "6:0", name: "ADDR", desc: "7-bit address" },
      { bits: "7", name: "RW", desc: "Read/Write" },
    ],
  },
  {
    offset: "0x0100",
    name: "VERSION",
    desc: "IP version (RO)",
    fields: [
      { bits: "7:0", name: "PATCH" },
      { bits: "15:8", name: "MINOR" },
      { bits: "23:16", name: "MAJOR" },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
// 7. LICENSE_DATA — LicenseEntry[] data
// ═══════════════════════════════════════════════════════════════

export const LICENSE_DATA: LicenseEntry[] = [
  {
    tool: "Lattice Diamond",
    feature: "Diamond Base",
    status: "active",
    expires: "2025-12-31",
    seats: "5/5 available",
    server: "1710@license-srv",
    mac: "00:1A:2B:3C:4D:5E",
    vendor: "lattice",
  },
  {
    tool: "Lattice Diamond",
    feature: "Synplify Pro for Lattice",
    status: "active",
    expires: "2025-12-31",
    seats: "2/3 available",
    server: "1710@license-srv",
    mac: "00:1A:2B:3C:4D:5E",
    vendor: "synopsys",
  },
  {
    tool: "Lattice Diamond",
    feature: "Reveal Analyzer",
    status: "active",
    expires: "2025-12-31",
    seats: "5/5 available",
    server: "1710@license-srv",
    mac: "\u2014",
    vendor: "lattice",
  },
  {
    tool: "Intel Quartus",
    feature: "Quartus Prime Pro",
    status: "active",
    expires: "2026-03-15",
    seats: "3/4 available",
    server: "1800@lic-intel",
    mac: "00:2C:3D:4E:5F:6A",
    vendor: "intel",
  },
  {
    tool: "Intel Quartus",
    feature: "DSP Builder",
    status: "warning",
    expires: "2025-04-01",
    seats: "1/1 available",
    server: "1800@lic-intel",
    mac: "\u2014",
    vendor: "intel",
  },
  {
    tool: "Intel Quartus",
    feature: "Nios II Processor",
    status: "active",
    expires: "2026-03-15",
    seats: "4/4 available",
    server: "1800@lic-intel",
    mac: "\u2014",
    vendor: "intel",
  },
  {
    tool: "AMD Vivado",
    feature: "Vivado Design Suite",
    status: "active",
    expires: "2026-06-30",
    seats: "2/3 available",
    server: "2100@lic-xilinx",
    mac: "00:3E:4F:5A:6B:7C",
    vendor: "xilinx",
  },
  {
    tool: "AMD Vivado",
    feature: "Vivado HLS",
    status: "expired",
    expires: "2024-12-31",
    seats: "0/2 available",
    server: "2100@lic-xilinx",
    mac: "\u2014",
    vendor: "xilinx",
  },
  {
    tool: "AMD Vivado",
    feature: "System Generator",
    status: "active",
    expires: "2026-06-30",
    seats: "1/1 available",
    server: "2100@lic-xilinx",
    mac: "\u2014",
    vendor: "xilinx",
  },
  {
    tool: "OSS CAD Suite",
    feature: "Yosys / nextpnr / ecppack",
    status: "open",
    expires: "\u221E",
    seats: "\u221E (open source)",
    server: "N/A",
    mac: "\u2014",
    vendor: "foss",
  },
];

// ═══════════════════════════════════════════════════════════════
// 8. AI_SAMPLE_CHAT — sample AI conversation
// ═══════════════════════════════════════════════════════════════

export interface AIChatMessage {
  role: "user" | "ai";
  text: string;
}

export const AI_SAMPLE_CHAT: AIChatMessage[] = [
  {
    role: "user",
    text: "Analyze my latest timing report \u2014 I'm getting setup violations on the PQC engine paths.",
  },
  {
    role: "ai",
    text: `Looking at your PAR report for the LCMXO3LF-6900C build:

**Critical Path Analysis:**
The path from \`pqc_engine/round_reg[3]\` \u2192 \`sha3_core/state_in[127]\` shows +1.87ns slack at 125 MHz, which is actually meeting timing. However, if you're targeting 150 MHz, this path would fail with -0.87ns violation.

**Root Cause:** The Keccak round function has 4 logic levels between the round register and SHA3 state input. Each level adds ~1.6ns of combinational delay.

**Recommendations:**
1. **Pipeline the round function** \u2014 insert a register stage between round computation and state update. This halves the critical path at the cost of 1 cycle latency.
2. **Use \`prj_run PAR -impl impl1 -exp parPathBased=ON\`** to enable path-based placement which can reduce routing delay by 15-20%.
3. **Consider retiming** \u2014 Synplify's \`syn_allow_retiming\` attribute on the SHA3 module can automatically redistribute registers.

Want me to generate the modified TCL build script with these optimizations?`,
  },
  {
    role: "user",
    text: "What about the I2C timing? The BMC is complaining about bus errors.",
  },
  {
    role: "ai",
    text: `Checking your I2C controller timing and constraints:

**I2C Timing Analysis:**
Your \`i2c_scl\` output is constrained to bank 1, LVCMOS33. At 400kHz Fast Mode, the SCL spec requires:
- t_LOW \u2265 1.3\u00B5s, t_HIGH \u2265 0.6\u00B5s
- Rise time \u2264 300ns, Fall time \u2264 300ns

**Potential Issue:** Your .lpf shows no \`SLEWRATE\` constraint on the I2C pins. Default slew on MachXO3 is FAST, which can cause:
- Ringing on long I2C traces \u2192 false transitions
- EMI issues on the BMC bus

**Fix \u2014 add to your .lpf:**
\`\`\`
IOBUF PORT "i2c_sda" IO_TYPE=LVCMOS33 DRIVE=4 SLEWRATE=SLOW PULLMODE=UP;
IOBUF PORT "i2c_scl" IO_TYPE=LVCMOS33 DRIVE=4 SLEWRATE=SLOW PULLMODE=UP;
\`\`\`

Also verify your clock divider: at 25MHz input with a divide of 62, you get ~403kHz which is borderline. Use 64 for clean 390kHz with margin.

Should I update the constraint file?`,
  },
];
