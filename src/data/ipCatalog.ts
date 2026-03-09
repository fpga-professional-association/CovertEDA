export interface IpParam {
  key: string;
  label: string;
  type: "number" | "select" | "text" | "boolean";
  default: string;
  choices?: string[];
  min?: number;
  max?: number;
  unit?: string;
}

export interface IpCore {
  name: string;
  category: "Memory" | "DSP" | "Interface" | "Clock" | "I/O" | "Misc";
  description: string;
  families: string[];
  /** Configurable parameters for in-app IP generation */
  params?: IpParam[];
  /** Verilog instantiation template (with {PARAM} placeholders) */
  template?: string;
  /** Where this IP comes from — "Built-in" or filesystem path */
  source?: string;
  /** Whether this is a user-added custom IP */
  isCustom?: boolean;
}

/** Static lookup table of common Lattice Radiant IP cores with configuration parameters. */
export const RADIANT_IP_CATALOG: IpCore[] = [
  // Memory
  {
    name: "FIFO_DC",
    category: "Memory",
    description: "Dual-clock FIFO with configurable depth and width",
    families: ["LIFCL", "CrossLink-NX", "CertusPro-NX", "Avant"],
    params: [
      { key: "DATA_WIDTH", label: "Data Width", type: "number", default: "8", min: 1, max: 256, unit: "bits" },
      { key: "DEPTH", label: "Depth", type: "select", default: "256", choices: ["16", "32", "64", "128", "256", "512", "1024", "2048", "4096"] },
      { key: "ALMOST_FULL", label: "Almost Full Threshold", type: "number", default: "240", min: 1, max: 4096 },
      { key: "ALMOST_EMPTY", label: "Almost Empty Threshold", type: "number", default: "16", min: 1, max: 4096 },
      { key: "OUTPUT_REG", label: "Output Register", type: "boolean", default: "true" },
    ],
    template: `FIFO_DC #(
  .DATA_WIDTH({DATA_WIDTH}),
  .DEPTH({DEPTH}),
  .ALMOST_FULL_THRESH({ALMOST_FULL}),
  .ALMOST_EMPTY_THRESH({ALMOST_EMPTY})
) {INSTANCE_NAME} (
  .wr_clk(wr_clk),
  .rd_clk(rd_clk),
  .rst(rst),
  .wr_en(wr_en),
  .wr_data(wr_data),
  .rd_en(rd_en),
  .rd_data(rd_data),
  .full(full),
  .empty(empty),
  .almost_full(almost_full),
  .almost_empty(almost_empty)
);`,
  },
  {
    name: "FIFO",
    category: "Memory",
    description: "Single-clock FIFO with configurable depth and width",
    families: ["LIFCL", "CrossLink-NX", "CertusPro-NX", "Avant"],
    params: [
      { key: "DATA_WIDTH", label: "Data Width", type: "number", default: "8", min: 1, max: 256, unit: "bits" },
      { key: "DEPTH", label: "Depth", type: "select", default: "256", choices: ["16", "32", "64", "128", "256", "512", "1024", "2048", "4096"] },
      { key: "OUTPUT_REG", label: "Output Register", type: "boolean", default: "true" },
    ],
    template: `FIFO #(
  .DATA_WIDTH({DATA_WIDTH}),
  .DEPTH({DEPTH})
) {INSTANCE_NAME} (
  .clk(clk),
  .rst(rst),
  .wr_en(wr_en),
  .wr_data(wr_data),
  .rd_en(rd_en),
  .rd_data(rd_data),
  .full(full),
  .empty(empty)
);`,
  },
  {
    name: "RAM_DQ",
    category: "Memory",
    description: "Single-port RAM using EBR primitives",
    families: ["LIFCL", "CrossLink-NX", "CertusPro-NX", "Avant"],
    params: [
      { key: "DATA_WIDTH", label: "Data Width", type: "number", default: "8", min: 1, max: 256, unit: "bits" },
      { key: "ADDR_WIDTH", label: "Address Width", type: "number", default: "10", min: 2, max: 20, unit: "bits" },
      { key: "INIT_FILE", label: "Init File (.mem)", type: "text", default: "" },
    ],
    template: `RAM_DQ #(
  .DATA_WIDTH({DATA_WIDTH}),
  .ADDR_WIDTH({ADDR_WIDTH})
) {INSTANCE_NAME} (
  .clk(clk),
  .we(we),
  .addr(addr),
  .din(din),
  .dout(dout)
);`,
  },
  {
    name: "RAM_DP",
    category: "Memory",
    description: "True dual-port RAM with independent read/write clocks",
    families: ["LIFCL", "CrossLink-NX", "CertusPro-NX", "Avant"],
    params: [
      { key: "DATA_WIDTH", label: "Data Width", type: "number", default: "8", min: 1, max: 256, unit: "bits" },
      { key: "ADDR_WIDTH", label: "Address Width", type: "number", default: "10", min: 2, max: 20, unit: "bits" },
    ],
  },
  { name: "RAM_PDP", category: "Memory", description: "Pseudo dual-port RAM (one read, one write port)", families: ["LIFCL", "CrossLink-NX", "CertusPro-NX", "Avant"] },
  { name: "ROM", category: "Memory", description: "Read-only memory with initialization file (.mem)", families: ["LIFCL", "CrossLink-NX", "CertusPro-NX", "Avant"],
    params: [
      { key: "DATA_WIDTH", label: "Data Width", type: "number", default: "8", min: 1, max: 256, unit: "bits" },
      { key: "ADDR_WIDTH", label: "Address Width", type: "number", default: "10", min: 2, max: 20, unit: "bits" },
      { key: "INIT_FILE", label: "Init File (.mem)", type: "text", default: "" },
    ],
  },
  { name: "Large RAM", category: "Memory", description: "Large SRAM using LRAM blocks (up to 64Kb per block)", families: ["LIFCL", "CertusPro-NX", "Avant"] },

  // DSP
  {
    name: "Multiplier",
    category: "DSP",
    description: "Parameterized multiply using DSP hard blocks",
    families: ["LIFCL", "CertusPro-NX", "Avant"],
    params: [
      { key: "A_WIDTH", label: "A Width", type: "number", default: "18", min: 1, max: 36, unit: "bits" },
      { key: "B_WIDTH", label: "B Width", type: "number", default: "18", min: 1, max: 36, unit: "bits" },
      { key: "SIGNED", label: "Signed", type: "boolean", default: "true" },
      { key: "PIPELINE", label: "Pipeline Stages", type: "select", default: "1", choices: ["0", "1", "2"] },
    ],
    template: `Multiplier #(
  .A_WIDTH({A_WIDTH}),
  .B_WIDTH({B_WIDTH}),
  .SIGNED({SIGNED}),
  .PIPELINE({PIPELINE})
) {INSTANCE_NAME} (
  .clk(clk),
  .a(a),
  .b(b),
  .product(product)
);`,
  },
  { name: "MAC", category: "DSP", description: "Multiply-accumulate unit using DSP slices", families: ["LIFCL", "CertusPro-NX", "Avant"],
    params: [
      { key: "A_WIDTH", label: "A Width", type: "number", default: "18", min: 1, max: 36, unit: "bits" },
      { key: "B_WIDTH", label: "B Width", type: "number", default: "18", min: 1, max: 36, unit: "bits" },
      { key: "ACC_WIDTH", label: "Accumulator Width", type: "number", default: "48", min: 18, max: 96, unit: "bits" },
    ],
  },
  { name: "DSP Core", category: "DSP", description: "Configurable DSP with pre-adder, multiply, post-add/acc", families: ["LIFCL", "CertusPro-NX", "Avant"] },

  // Interface
  { name: "SPI Controller", category: "Interface", description: "SPI master/slave with configurable CPOL/CPHA", families: ["LIFCL", "CrossLink-NX", "CertusPro-NX", "Avant"],
    params: [
      { key: "MODE", label: "Mode", type: "select", default: "Master", choices: ["Master", "Slave"] },
      { key: "CPOL", label: "CPOL", type: "select", default: "0", choices: ["0", "1"] },
      { key: "CPHA", label: "CPHA", type: "select", default: "0", choices: ["0", "1"] },
      { key: "DATA_WIDTH", label: "Data Width", type: "select", default: "8", choices: ["8", "16", "32"] },
      { key: "CLK_DIV", label: "Clock Divider", type: "number", default: "8", min: 2, max: 256 },
    ],
  },
  { name: "I2C Controller", category: "Interface", description: "I2C master/slave (100/400 kHz, optional 1 MHz fast+)", families: ["LIFCL", "CrossLink-NX", "CertusPro-NX", "Avant"],
    params: [
      { key: "MODE", label: "Mode", type: "select", default: "Master", choices: ["Master", "Slave"] },
      { key: "SPEED", label: "Speed", type: "select", default: "400kHz", choices: ["100kHz", "400kHz", "1MHz"] },
      { key: "ADDR_WIDTH", label: "Address Width", type: "select", default: "7", choices: ["7", "10"] },
    ],
  },
  { name: "UART", category: "Interface", description: "Configurable UART with baud rate generator and FIFO", families: ["LIFCL", "CrossLink-NX", "CertusPro-NX", "Avant"],
    params: [
      { key: "BAUD_RATE", label: "Baud Rate", type: "select", default: "115200", choices: ["9600", "19200", "38400", "57600", "115200", "230400", "460800", "921600"] },
      { key: "DATA_BITS", label: "Data Bits", type: "select", default: "8", choices: ["7", "8"] },
      { key: "PARITY", label: "Parity", type: "select", default: "None", choices: ["None", "Even", "Odd"] },
      { key: "STOP_BITS", label: "Stop Bits", type: "select", default: "1", choices: ["1", "2"] },
      { key: "FIFO_DEPTH", label: "FIFO Depth", type: "select", default: "16", choices: ["0", "16", "32", "64"] },
    ],
    template: `UART #(
  .BAUD_RATE({BAUD_RATE}),
  .DATA_BITS({DATA_BITS}),
  .PARITY("{PARITY}"),
  .STOP_BITS({STOP_BITS}),
  .FIFO_DEPTH({FIFO_DEPTH})
) {INSTANCE_NAME} (
  .clk(clk),
  .rst(rst),
  .tx(tx),
  .rx(rx),
  .tx_data(tx_data),
  .tx_valid(tx_valid),
  .tx_ready(tx_ready),
  .rx_data(rx_data),
  .rx_valid(rx_valid)
);`,
  },
  { name: "MIPI D-PHY", category: "Interface", description: "MIPI D-PHY transmitter/receiver for camera and display", families: ["CrossLink-NX"] },
  { name: "PCIe", category: "Interface", description: "PCIe Gen2/Gen3 endpoint controller", families: ["CertusPro-NX", "Avant"] },
  { name: "DDR Memory Controller", category: "Interface", description: "DDR3/DDR4/LPDDR4 memory interface controller", families: ["CertusPro-NX", "Avant"] },

  // Clock
  {
    name: "PLL",
    category: "Clock",
    description: "Phase-locked loop for clock synthesis and jitter cleaning",
    families: ["LIFCL", "CrossLink-NX", "CertusPro-NX", "Avant"],
    params: [
      { key: "CLKI_FREQ", label: "Input Frequency", type: "number", default: "100", min: 1, max: 800, unit: "MHz" },
      { key: "CLKO_FREQ", label: "Output Frequency", type: "number", default: "200", min: 1, max: 800, unit: "MHz" },
      { key: "CLKO2_FREQ", label: "Output 2 Frequency", type: "number", default: "0", min: 0, max: 800, unit: "MHz" },
      { key: "FEEDBACK", label: "Feedback", type: "select", default: "Internal", choices: ["Internal", "External"] },
    ],
    template: `PLL #(
  .CLKI_FREQ({CLKI_FREQ}),
  .CLKO_FREQ({CLKO_FREQ})
) {INSTANCE_NAME} (
  .clki(clki),
  .rst(rst),
  .clko(clko),
  .lock(lock)
);`,
  },
  { name: "Clock Divider", category: "Clock", description: "Programmable clock divider (DCC/ECLKDIV)", families: ["LIFCL", "CrossLink-NX", "CertusPro-NX", "Avant"],
    params: [
      { key: "DIV", label: "Divide By", type: "select", default: "2", choices: ["2", "3.5", "4", "5"] },
    ],
  },
  { name: "OSCI", category: "Clock", description: "Internal oscillator configuration (HFOSC/LFOSC)", families: ["LIFCL", "CrossLink-NX"],
    params: [
      { key: "OSC_TYPE", label: "Oscillator", type: "select", default: "HFOSC", choices: ["HFOSC", "LFOSC"] },
      { key: "HF_DIV", label: "HF Divider", type: "select", default: "1", choices: ["1", "2", "4", "8", "16", "32", "64", "128"] },
    ],
  },

  // I/O
  { name: "GPIO", category: "I/O", description: "General-purpose I/O with configurable drive and pull", families: ["LIFCL", "CrossLink-NX", "CertusPro-NX", "Avant"] },
  { name: "SGMII", category: "I/O", description: "Serial GMII for Gigabit Ethernet PHY interface", families: ["CertusPro-NX", "Avant"] },
  { name: "LVDS", category: "I/O", description: "Low-voltage differential signaling I/O", families: ["LIFCL", "CrossLink-NX", "CertusPro-NX", "Avant"] },

  // Misc
  { name: "EFB", category: "Misc", description: "Embedded Function Block (timer, SPI, I2C, flash access)", families: ["LIFCL"] },
  { name: "JTAG", category: "Misc", description: "JTAG TAP controller for debug and programming", families: ["LIFCL", "CrossLink-NX", "CertusPro-NX", "Avant"] },
];

/** Static lookup table of Intel Quartus IP cores. */
export const QUARTUS_IP_CATALOG: IpCore[] = [
  // Memory
  {
    name: "RAM: 1-PORT",
    category: "Memory",
    description: "Single-port on-chip RAM (M20K/MLAB)",
    families: ["Cyclone V", "Cyclone 10", "Arria 10", "Stratix 10", "Agilex"],
    params: [
      { key: "DATA_WIDTH", label: "Data Width", type: "number", default: "8", min: 1, max: 256, unit: "bits" },
      { key: "ADDR_WIDTH", label: "Address Width", type: "number", default: "10", min: 2, max: 20, unit: "bits" },
      { key: "RAM_TYPE", label: "RAM Block Type", type: "select", default: "Auto", choices: ["Auto", "M20K", "MLAB"] },
      { key: "INIT_FILE", label: "Init File (.mif)", type: "text", default: "" },
    ],
    template: `altsyncram #(
  .width_a({DATA_WIDTH}),
  .widthad_a({ADDR_WIDTH}),
  .ram_block_type("{RAM_TYPE}"),
  .operation_mode("SINGLE_PORT")
) {INSTANCE_NAME} (
  .clock0(clk),
  .address_a(addr),
  .data_a(din),
  .wren_a(we),
  .q_a(dout)
);`,
  },
  {
    name: "RAM: 2-PORT",
    category: "Memory",
    description: "Simple dual-port RAM with separate read/write ports",
    families: ["Cyclone V", "Cyclone 10", "Arria 10", "Stratix 10", "Agilex"],
    params: [
      { key: "DATA_WIDTH", label: "Data Width", type: "number", default: "8", min: 1, max: 256, unit: "bits" },
      { key: "ADDR_WIDTH", label: "Address Width", type: "number", default: "10", min: 2, max: 20, unit: "bits" },
    ],
  },
  {
    name: "FIFO",
    category: "Memory",
    description: "Single-clock FIFO buffer using on-chip memory",
    families: ["Cyclone V", "Cyclone 10", "Arria 10", "Stratix 10", "Agilex"],
    params: [
      { key: "DATA_WIDTH", label: "Data Width", type: "number", default: "8", min: 1, max: 256, unit: "bits" },
      { key: "DEPTH", label: "Depth (words)", type: "select", default: "256", choices: ["16", "32", "64", "128", "256", "512", "1024", "2048", "4096"] },
      { key: "SHOW_AHEAD", label: "Show-Ahead Mode", type: "boolean", default: "false" },
    ],
    template: `scfifo #(
  .lpm_width({DATA_WIDTH}),
  .lpm_numwords({DEPTH}),
  .lpm_showahead("{SHOW_AHEAD}")
) {INSTANCE_NAME} (
  .clock(clk),
  .sclr(rst),
  .wrreq(wr_en),
  .data(wr_data),
  .rdreq(rd_en),
  .q(rd_data),
  .full(full),
  .empty(empty),
  .usedw(usedw)
);`,
  },
  {
    name: "DCFIFO",
    category: "Memory",
    description: "Dual-clock FIFO for clock domain crossing",
    families: ["Cyclone V", "Cyclone 10", "Arria 10", "Stratix 10", "Agilex"],
    params: [
      { key: "DATA_WIDTH", label: "Data Width", type: "number", default: "8", min: 1, max: 256, unit: "bits" },
      { key: "DEPTH", label: "Depth (words)", type: "select", default: "256", choices: ["16", "32", "64", "128", "256", "512", "1024", "2048", "4096"] },
    ],
  },
  { name: "ROM: 1-PORT", category: "Memory", description: "Single-port ROM with .mif initialization", families: ["Cyclone V", "Cyclone 10", "Arria 10", "Stratix 10", "Agilex"] },

  // DSP
  {
    name: "LPM_MULT",
    category: "DSP",
    description: "Parameterized multiplier using DSP blocks",
    families: ["Cyclone V", "Cyclone 10", "Arria 10", "Stratix 10", "Agilex"],
    params: [
      { key: "A_WIDTH", label: "A Width", type: "number", default: "18", min: 1, max: 64, unit: "bits" },
      { key: "B_WIDTH", label: "B Width", type: "number", default: "18", min: 1, max: 64, unit: "bits" },
      { key: "PIPELINE", label: "Pipeline Stages", type: "select", default: "1", choices: ["0", "1", "2", "3"] },
      { key: "REPRESENTATION", label: "Representation", type: "select", default: "SIGNED", choices: ["SIGNED", "UNSIGNED"] },
    ],
    template: `lpm_mult #(
  .lpm_widtha({A_WIDTH}),
  .lpm_widthb({B_WIDTH}),
  .lpm_pipeline({PIPELINE}),
  .lpm_representation("{REPRESENTATION}")
) {INSTANCE_NAME} (
  .clock(clk),
  .dataa(a),
  .datab(b),
  .result(product)
);`,
  },
  { name: "LPM_DIVIDE", category: "DSP", description: "Parameterized divider", families: ["Cyclone V", "Cyclone 10", "Arria 10", "Stratix 10", "Agilex"] },
  { name: "ALTMULT_ADD", category: "DSP", description: "Multiply-add/accumulate megafunction", families: ["Cyclone V", "Arria 10", "Stratix 10", "Agilex"] },
  { name: "FP_MULT", category: "DSP", description: "IEEE 754 floating-point multiplier", families: ["Arria 10", "Stratix 10", "Agilex"] },

  // Interface
  { name: "JTAG UART", category: "Interface", description: "JTAG-to-UART bridge for debug communication", families: ["Cyclone V", "Cyclone 10", "Arria 10", "Stratix 10", "Agilex"] },
  { name: "SPI Slave/Master", category: "Interface", description: "SPI controller for serial peripherals", families: ["Cyclone V", "Cyclone 10", "Arria 10", "Stratix 10", "Agilex"] },
  { name: "I2C Master", category: "Interface", description: "I2C master controller (standard/fast mode)", families: ["Cyclone V", "Cyclone 10", "Arria 10", "Stratix 10", "Agilex"] },
  { name: "Avalon-ST UART", category: "Interface", description: "UART with Avalon Streaming interface", families: ["Cyclone V", "Cyclone 10", "Arria 10", "Stratix 10", "Agilex"],
    params: [
      { key: "BAUD_RATE", label: "Baud Rate", type: "select", default: "115200", choices: ["9600", "19200", "38400", "57600", "115200", "230400", "460800", "921600"] },
      { key: "DATA_BITS", label: "Data Bits", type: "select", default: "8", choices: ["7", "8"] },
      { key: "PARITY", label: "Parity", type: "select", default: "NONE", choices: ["NONE", "EVEN", "ODD"] },
    ],
  },
  { name: "PCIe", category: "Interface", description: "PCI Express hard IP endpoint (Gen1/2/3)", families: ["Cyclone V", "Arria 10", "Stratix 10", "Agilex"] },
  { name: "DDR3 SDRAM Controller", category: "Interface", description: "DDR3 external memory interface", families: ["Cyclone V", "Arria 10"] },
  { name: "DDR4 SDRAM Controller", category: "Interface", description: "DDR4 external memory interface with EMIF", families: ["Stratix 10", "Agilex"] },

  // Clock
  {
    name: "ALTPLL",
    category: "Clock",
    description: "Phase-locked loop for clock synthesis (Cyclone/Arria)",
    families: ["Cyclone V", "Cyclone 10", "Arria 10"],
    params: [
      { key: "CLKI_FREQ", label: "Input Frequency", type: "number", default: "50", min: 1, max: 800, unit: "MHz" },
      { key: "CLK0_FREQ", label: "Output 0 Frequency", type: "number", default: "100", min: 1, max: 800, unit: "MHz" },
      { key: "CLK1_FREQ", label: "Output 1 Frequency", type: "number", default: "0", min: 0, max: 800, unit: "MHz" },
      { key: "CLK2_FREQ", label: "Output 2 Frequency", type: "number", default: "0", min: 0, max: 800, unit: "MHz" },
    ],
    template: `altpll #(
  .inclk0_input_frequency({CLKI_FREQ}),
  .clk0_multiply_by(2),
  .clk0_divide_by(1)
) {INSTANCE_NAME} (
  .inclk({clk_in, 1'b0}),
  .clk(clk_out),
  .locked(locked)
);`,
  },
  { name: "IOPLL", category: "Clock", description: "I/O PLL for Stratix 10/Agilex devices", families: ["Stratix 10", "Agilex"] },
  { name: "Clock Bridge", category: "Clock", description: "Avalon clock bridge for clock domain interface", families: ["Cyclone V", "Cyclone 10", "Arria 10", "Stratix 10", "Agilex"] },

  // I/O
  { name: "ALTDDIO_IN", category: "I/O", description: "DDR input register for double-data-rate I/O", families: ["Cyclone V", "Cyclone 10", "Arria 10", "Stratix 10", "Agilex"] },
  { name: "ALTDDIO_OUT", category: "I/O", description: "DDR output register for double-data-rate I/O", families: ["Cyclone V", "Cyclone 10", "Arria 10", "Stratix 10", "Agilex"] },
  { name: "LVDS", category: "I/O", description: "LVDS transmitter/receiver I/O", families: ["Cyclone V", "Arria 10", "Stratix 10", "Agilex"] },

  // Misc
  { name: "Nios V/m", category: "Misc", description: "RISC-V soft processor (microcontroller class)", families: ["Cyclone V", "Cyclone 10", "Arria 10", "Stratix 10", "Agilex"] },
  { name: "Signal Tap", category: "Misc", description: "In-system logic analyzer for debug", families: ["Cyclone V", "Cyclone 10", "Arria 10", "Stratix 10", "Agilex"] },
  { name: "In-System Sources and Probes", category: "Misc", description: "Runtime signal injection/monitoring via JTAG", families: ["Cyclone V", "Cyclone 10", "Arria 10", "Stratix 10", "Agilex"] },
  { name: "Virtual JTAG", category: "Misc", description: "Custom JTAG interface for on-chip debug", families: ["Cyclone V", "Cyclone 10", "Arria 10", "Stratix 10", "Agilex"] },
];

/** OSS CAD Suite — soft-core primitives and Yosys-synthesizable modules for ECP5 and iCE40. */
export const OSS_IP_CATALOG: IpCore[] = [
  // Memory
  {
    name: "Sync FIFO",
    category: "Memory",
    description: "Single-clock synchronous FIFO (synthesizable Verilog)",
    families: ["ECP5", "iCE40"],
    params: [
      { key: "DATA_WIDTH", label: "Data Width", type: "number", default: "8", min: 1, max: 256, unit: "bits" },
      { key: "DEPTH", label: "Depth", type: "number", default: "16", min: 4, max: 65536 },
    ],
    template: `// Sync FIFO — {DATA_WIDTH}×{DEPTH}\nmodule sync_fifo #(\n  parameter DATA_WIDTH = {DATA_WIDTH},\n  parameter DEPTH = {DEPTH}\n) (\n  input  wire clk, rst,\n  input  wire wr_en, rd_en,\n  input  wire [DATA_WIDTH-1:0] din,\n  output reg  [DATA_WIDTH-1:0] dout,\n  output wire full, empty\n);`,
  },
  {
    name: "DP16KD",
    category: "Memory",
    description: "ECP5 dual-port 16Kbit block RAM primitive",
    families: ["ECP5"],
    params: [
      { key: "DATA_WIDTH_A", label: "Port A Width", type: "select", default: "18", choices: ["1", "2", "4", "9", "18", "36"] },
      { key: "DATA_WIDTH_B", label: "Port B Width", type: "select", default: "18", choices: ["1", "2", "4", "9", "18", "36"] },
    ],
    template: `DP16KD #(\n  .DATA_WIDTH_A({DATA_WIDTH_A}),\n  .DATA_WIDTH_B({DATA_WIDTH_B})\n) bram_inst (\n  .DIA(dia), .ADA(ada), .CEA(cea), .CLKA(clka),\n  .DIB(dib), .ADB(adb), .CEB(ceb), .CLKB(clkb),\n  .DOA(doa), .DOB(dob)\n);`,
  },
  {
    name: "PDPW16KD",
    category: "Memory",
    description: "ECP5 pseudo dual-port wide 16Kbit block RAM",
    families: ["ECP5"],
  },

  // DSP
  {
    name: "MULT18X18D",
    category: "DSP",
    description: "ECP5 18×18 signed multiplier with pipeline registers",
    families: ["ECP5"],
    params: [
      { key: "REG_INPUTA_CLK", label: "Input A Reg", type: "select", default: "NONE", choices: ["NONE", "CLK0", "CLK1", "CLK2", "CLK3"] },
      { key: "REG_INPUTB_CLK", label: "Input B Reg", type: "select", default: "NONE", choices: ["NONE", "CLK0", "CLK1", "CLK2", "CLK3"] },
    ],
    template: `MULT18X18D #(\n  .REG_INPUTA_CLK("{REG_INPUTA_CLK}"),\n  .REG_INPUTB_CLK("{REG_INPUTB_CLK}")\n) mult_inst (\n  .A(a), .B(b), .P(p)\n);`,
  },
  {
    name: "ALU54B",
    category: "DSP",
    description: "ECP5 54-bit ALU for wide arithmetic",
    families: ["ECP5"],
  },

  // Interface
  {
    name: "UART TX/RX",
    category: "Interface",
    description: "Simple UART transmitter and receiver (soft core)",
    families: ["ECP5", "iCE40"],
    params: [
      { key: "CLK_FREQ", label: "Clock Frequency", type: "number", default: "25000000", unit: "Hz" },
      { key: "BAUD_RATE", label: "Baud Rate", type: "select", default: "115200", choices: ["9600", "19200", "38400", "57600", "115200", "230400", "460800", "921600"] },
    ],
  },
  {
    name: "SPI Master",
    category: "Interface",
    description: "SPI master controller (soft core)",
    families: ["ECP5", "iCE40"],
    params: [
      { key: "DATA_WIDTH", label: "Data Width", type: "number", default: "8", min: 1, max: 32, unit: "bits" },
      { key: "CPOL", label: "Clock Polarity", type: "select", default: "0", choices: ["0", "1"] },
      { key: "CPHA", label: "Clock Phase", type: "select", default: "0", choices: ["0", "1"] },
    ],
  },
  {
    name: "I2C Master",
    category: "Interface",
    description: "I2C master controller (soft core)",
    families: ["ECP5", "iCE40"],
  },

  // Clock
  {
    name: "EHXPLLL",
    category: "Clock",
    description: "ECP5 PLL primitive for clock generation and frequency synthesis",
    families: ["ECP5"],
    params: [
      { key: "CLKI_DIV", label: "Input Divider", type: "number", default: "1", min: 1, max: 128 },
      { key: "CLKFB_DIV", label: "Feedback Divider", type: "number", default: "1", min: 1, max: 128 },
      { key: "CLKOP_DIV", label: "Output Divider", type: "number", default: "1", min: 1, max: 128 },
    ],
    template: `EHXPLLL #(\n  .CLKI_DIV({CLKI_DIV}),\n  .CLKFB_DIV({CLKFB_DIV}),\n  .CLKOP_DIV({CLKOP_DIV})\n) pll_inst (\n  .CLKI(clk_in),\n  .CLKOP(clk_out),\n  .LOCK(pll_lock)\n);`,
  },
  {
    name: "DCCA",
    category: "Clock",
    description: "ECP5 dedicated clock network access buffer",
    families: ["ECP5"],
    template: `DCCA dcc_inst (\n  .CLKI(clk_in),\n  .CLKO(clk_buffered),\n  .CE(1'b1)\n);`,
  },
  {
    name: "Clock Divider",
    category: "Clock",
    description: "Parameterizable clock divider (soft logic)",
    families: ["ECP5", "iCE40"],
    params: [
      { key: "DIV_FACTOR", label: "Division Factor", type: "number", default: "2", min: 2, max: 65536 },
    ],
  },

  // I/O
  {
    name: "TRELLIS_IO",
    category: "I/O",
    description: "ECP5 I/O buffer primitive with configurable direction and standards",
    families: ["ECP5"],
    params: [
      { key: "DIR", label: "Direction", type: "select", default: "INPUT", choices: ["INPUT", "OUTPUT", "BIDIR"] },
    ],
    template: `TRELLIS_IO #(\n  .DIR("{DIR}")\n) io_inst (\n  .B(pad),\n  .I(data_out),\n  .O(data_in),\n  .T(tristate)\n);`,
  },
  { name: "LVDS", category: "I/O", description: "ECP5 LVDS differential I/O buffer", families: ["ECP5"] },
  { name: "ODDRX1F", category: "I/O", description: "ECP5 DDR output register", families: ["ECP5"] },
  { name: "IDDRX1F", category: "I/O", description: "ECP5 DDR input register", families: ["ECP5"] },

  // Misc
  { name: "CCU2C", category: "Misc", description: "ECP5 carry-chain unit for efficient arithmetic", families: ["ECP5"] },
  { name: "GSR", category: "Misc", description: "ECP5 global set/reset network", families: ["ECP5"] },
  {
    name: "CDC Synchronizer",
    category: "Misc",
    description: "Clock domain crossing synchronizer (2-FF, soft core)",
    families: ["ECP5", "iCE40"],
    params: [
      { key: "STAGES", label: "Sync Stages", type: "number", default: "2", min: 2, max: 4 },
      { key: "DATA_WIDTH", label: "Data Width", type: "number", default: "1", min: 1, max: 64, unit: "bits" },
    ],
  },
];

/** iCE40-specific primitives (SB_* cells) */
export const ICE40_IP_CATALOG: IpCore[] = [
  // Memory
  {
    name: "SB_RAM256x16",
    category: "Memory",
    description: "iCE40 256x16 single-port block RAM primitive",
    families: ["iCE40"],
    template: `SB_RAM256x16 bram_inst (\n  .RDATA(rdata),\n  .RADDR(raddr),\n  .RCLK(rclk),\n  .RCLKE(1'b1),\n  .RE(re),\n  .WDATA(wdata),\n  .WADDR(waddr),\n  .WCLK(wclk),\n  .WCLKE(1'b1),\n  .WE(we)\n);`,
  },
  {
    name: "SB_RAM40_4K",
    category: "Memory",
    description: "iCE40 4Kbit block RAM with configurable aspect ratio",
    families: ["iCE40"],
    params: [
      { key: "READ_MODE", label: "Read Mode", type: "select", default: "0", choices: ["0", "1", "2", "3"] },
      { key: "WRITE_MODE", label: "Write Mode", type: "select", default: "0", choices: ["0", "1", "2", "3"] },
    ],
    template: `SB_RAM40_4K #(\n  .READ_MODE({READ_MODE}),\n  .WRITE_MODE({WRITE_MODE})\n) bram_inst (\n  .RDATA(rdata),\n  .RADDR(raddr),\n  .RCLK(rclk),\n  .RCLKE(1'b1),\n  .RE(re),\n  .WDATA(wdata),\n  .WADDR(waddr),\n  .MASK(16'hFFFF),\n  .WCLK(wclk),\n  .WCLKE(1'b1),\n  .WE(we)\n);`,
  },
  {
    name: "SB_SPRAM256KA",
    category: "Memory",
    description: "iCE40 UltraPlus 256Kbit single-port RAM (hard IP)",
    families: ["iCE40"],
    template: `SB_SPRAM256KA spram_inst (\n  .ADDRESS(addr),\n  .DATAIN(datain),\n  .MASKWREN(4'b1111),\n  .WREN(wren),\n  .CHIPSELECT(1'b1),\n  .CLOCK(clk),\n  .STANDBY(1'b0),\n  .SLEEP(1'b0),\n  .POWEROFF(1'b1),\n  .DATAOUT(dataout)\n);`,
  },

  // Clock
  {
    name: "SB_PLL40_CORE",
    category: "Clock",
    description: "iCE40 PLL core for frequency synthesis",
    families: ["iCE40"],
    params: [
      { key: "DIVR", label: "Reference Divider", type: "number", default: "0", min: 0, max: 15 },
      { key: "DIVF", label: "Feedback Divider", type: "number", default: "63", min: 0, max: 127 },
      { key: "DIVQ", label: "Output Divider", type: "number", default: "4", min: 0, max: 7 },
    ],
    template: `SB_PLL40_CORE #(\n  .DIVR({DIVR}),\n  .DIVF({DIVF}),\n  .DIVQ({DIVQ}),\n  .FILTER_RANGE(3'b001),\n  .FEEDBACK_PATH("SIMPLE")\n) pll_inst (\n  .REFERENCECLK(clk_in),\n  .PLLOUTCORE(clk_out),\n  .LOCK(pll_lock),\n  .RESETB(1'b1),\n  .BYPASS(1'b0)\n);`,
  },
  {
    name: "SB_HFOSC",
    category: "Clock",
    description: "iCE40 UltraPlus 48 MHz high-frequency oscillator",
    families: ["iCE40"],
    params: [
      { key: "CLKHF_DIV", label: "Clock Divider", type: "select", default: "0b00", choices: ["0b00", "0b01", "0b10", "0b11"] },
    ],
    template: `SB_HFOSC #(\n  .CLKHF_DIV("{CLKHF_DIV}")\n) hfosc_inst (\n  .CLKHFEN(1'b1),\n  .CLKHFPU(1'b1),\n  .CLKHF(clk_48mhz)\n);`,
  },
  {
    name: "SB_LFOSC",
    category: "Clock",
    description: "iCE40 UltraPlus 10 kHz low-frequency oscillator",
    families: ["iCE40"],
    template: `SB_LFOSC lfosc_inst (\n  .CLKLFEN(1'b1),\n  .CLKLFPU(1'b1),\n  .CLKLF(clk_10khz)\n);`,
  },

  // I/O
  {
    name: "SB_IO",
    category: "I/O",
    description: "iCE40 configurable I/O buffer",
    families: ["iCE40"],
    params: [
      { key: "PIN_TYPE", label: "Pin Type", type: "text", default: "6'b010100" },
    ],
    template: `SB_IO #(\n  .PIN_TYPE({PIN_TYPE})\n) io_inst (\n  .PACKAGE_PIN(pad),\n  .D_IN_0(data_in),\n  .D_OUT_0(data_out),\n  .OUTPUT_ENABLE(oe)\n);`,
  },
  {
    name: "SB_GB",
    category: "I/O",
    description: "iCE40 global buffer for clock distribution",
    families: ["iCE40"],
    template: `SB_GB gb_inst (\n  .USER_SIGNAL_TO_GLOBAL_BUFFER(clk_in),\n  .GLOBAL_BUFFER_OUTPUT(clk_global)\n);`,
  },

  // Misc
  {
    name: "SB_CARRY",
    category: "Misc",
    description: "iCE40 carry chain cell for efficient arithmetic",
    families: ["iCE40"],
  },
  {
    name: "SB_MAC16",
    category: "DSP",
    description: "iCE40 UltraPlus 16-bit multiply-accumulate DSP block",
    families: ["iCE40"],
    template: `SB_MAC16 #(\n  .A_SIGNED(1'b1),\n  .B_SIGNED(1'b1)\n) mac_inst (\n  .A(a),\n  .B(b),\n  .O(result),\n  .CLK(clk),\n  .CE(1'b1)\n);`,
  },

  // Interface (soft cores)
  {
    name: "UART TX/RX",
    category: "Interface",
    description: "Simple UART transmitter and receiver (soft core)",
    families: ["iCE40"],
    params: [
      { key: "CLK_FREQ", label: "Clock Frequency", type: "number", default: "12000000", unit: "Hz" },
      { key: "BAUD_RATE", label: "Baud Rate", type: "select", default: "115200", choices: ["9600", "19200", "38400", "57600", "115200", "230400"] },
    ],
  },
  {
    name: "SPI Master",
    category: "Interface",
    description: "SPI master controller (soft core)",
    families: ["iCE40"],
    params: [
      { key: "DATA_WIDTH", label: "Data Width", type: "number", default: "8", min: 1, max: 32, unit: "bits" },
    ],
  },
  {
    name: "SB_I2C",
    category: "Interface",
    description: "iCE40 UltraPlus hard I2C controller",
    families: ["iCE40"],
  },
  {
    name: "SB_SPI",
    category: "Interface",
    description: "iCE40 UltraPlus hard SPI controller",
    families: ["iCE40"],
  },
];

/** Gowin-specific primitives (GW_* cells for Apicula-supported devices) */
export const GOWIN_IP_CATALOG: IpCore[] = [
  // Memory
  {
    name: "SP",
    category: "Memory",
    description: "Gowin single-port SRAM primitive",
    families: ["Gowin"],
    params: [
      { key: "READ_MODE", label: "Read Mode", type: "select", default: "0", choices: ["0", "1"] },
      { key: "WRITE_MODE", label: "Write Mode", type: "select", default: "0", choices: ["0", "1"] },
    ],
  },
  {
    name: "DPB",
    category: "Memory",
    description: "Gowin dual-port block RAM primitive",
    families: ["Gowin"],
  },
  {
    name: "SDPB",
    category: "Memory",
    description: "Gowin semi-dual-port block RAM",
    families: ["Gowin"],
  },

  // DSP
  {
    name: "MULT9X9",
    category: "DSP",
    description: "Gowin 9x9 multiplier",
    families: ["Gowin"],
  },
  {
    name: "MULT18X18",
    category: "DSP",
    description: "Gowin 18x18 signed multiplier",
    families: ["Gowin"],
  },
  {
    name: "ALU54D",
    category: "DSP",
    description: "Gowin 54-bit ALU block",
    families: ["Gowin"],
  },

  // Clock
  {
    name: "rPLL",
    category: "Clock",
    description: "Gowin reconfigurable PLL for clock synthesis",
    families: ["Gowin"],
    params: [
      { key: "IDIV_SEL", label: "Input Divider", type: "number", default: "0", min: 0, max: 63 },
      { key: "FBDIV_SEL", label: "Feedback Divider", type: "number", default: "0", min: 0, max: 63 },
      { key: "ODIV_SEL", label: "Output Divider", type: "select", default: "8", choices: ["2", "4", "8", "16", "32", "48", "64", "80", "96", "112", "128"] },
    ],
    template: `rPLL #(\n  .IDIV_SEL({IDIV_SEL}),\n  .FBDIV_SEL({FBDIV_SEL}),\n  .ODIV_SEL({ODIV_SEL}),\n  .FCLKIN("25")\n) pll_inst (\n  .CLKIN(clk_in),\n  .CLKOUT(clk_out),\n  .LOCK(pll_lock),\n  .RESET(1'b0),\n  .RESET_P(1'b0),\n  .CLKFB(1'b0),\n  .FBDSEL(6'b0),\n  .IDSEL(6'b0),\n  .ODSEL(6'b0)\n);`,
  },
  {
    name: "OSCH",
    category: "Clock",
    description: "Gowin internal oscillator",
    families: ["Gowin"],
    params: [
      { key: "FREQ_DIV", label: "Frequency Divider", type: "number", default: "100", min: 2, max: 128 },
    ],
  },

  // I/O
  {
    name: "IBUF/OBUF",
    category: "I/O",
    description: "Gowin I/O buffer primitives",
    families: ["Gowin"],
  },
  {
    name: "TLVDS_OBUF",
    category: "I/O",
    description: "Gowin true LVDS output buffer",
    families: ["Gowin"],
  },

  // Misc
  {
    name: "GSR",
    category: "Misc",
    description: "Gowin global set/reset network",
    families: ["Gowin"],
  },

  // Interface (soft cores)
  {
    name: "UART TX/RX",
    category: "Interface",
    description: "Simple UART transmitter and receiver (soft core)",
    families: ["Gowin"],
    params: [
      { key: "CLK_FREQ", label: "Clock Frequency", type: "number", default: "27000000", unit: "Hz" },
      { key: "BAUD_RATE", label: "Baud Rate", type: "select", default: "115200", choices: ["9600", "19200", "38400", "57600", "115200", "230400"] },
    ],
  },
  {
    name: "SPI Master",
    category: "Interface",
    description: "SPI master controller (soft core)",
    families: ["Gowin"],
  },
];

/** AMD Vivado — Xilinx IP cores for 7-series, UltraScale, UltraScale+, and Versal devices. */
export const VIVADO_IP_CATALOG: IpCore[] = [
  // Memory
  {
    name: "Block Memory Generator",
    category: "Memory",
    description: "Configurable block RAM (BRAM) using RAMB36E1/RAMB18E1 primitives",
    families: ["Artix-7", "Kintex-7", "Virtex-7", "Spartan-7", "Zynq-7000", "Kintex UltraScale", "Virtex UltraScale", "Zynq UltraScale+", "Versal"],
    params: [
      { key: "MEMORY_TYPE", label: "Memory Type", type: "select", default: "Simple_Dual_Port_RAM", choices: ["Single_Port_RAM", "Simple_Dual_Port_RAM", "True_Dual_Port_RAM", "Single_Port_ROM", "Dual_Port_ROM"] },
      { key: "DATA_WIDTH_A", label: "Port A Width", type: "number", default: "32", min: 1, max: 4608, unit: "bits" },
      { key: "DEPTH_A", label: "Port A Depth", type: "number", default: "1024", min: 2, max: 1048576 },
      { key: "INIT_FILE", label: "Init File (.coe)", type: "text", default: "" },
    ],
    template: `blk_mem_gen_0 {INSTANCE_NAME} (\n  .clka(clka),\n  .ena(ena),\n  .wea(wea),\n  .addra(addra),\n  .dina(dina),\n  .douta(douta)\n);`,
  },
  {
    name: "FIFO Generator",
    category: "Memory",
    description: "Synchronous or asynchronous FIFO with configurable depth and width",
    families: ["Artix-7", "Kintex-7", "Virtex-7", "Spartan-7", "Zynq-7000", "Kintex UltraScale", "Virtex UltraScale", "Zynq UltraScale+", "Versal"],
    params: [
      { key: "FIFO_TYPE", label: "FIFO Type", type: "select", default: "Common_Clock", choices: ["Common_Clock", "Independent_Clocks"] },
      { key: "DATA_WIDTH", label: "Data Width", type: "number", default: "32", min: 1, max: 4096, unit: "bits" },
      { key: "DEPTH", label: "Depth", type: "number", default: "512", min: 16, max: 131072 },
      { key: "PROG_FULL_THRESH", label: "Prog Full Threshold", type: "number", default: "480", min: 1, max: 131072 },
    ],
    template: `fifo_generator_0 {INSTANCE_NAME} (\n  .clk(clk),\n  .srst(rst),\n  .din(din),\n  .wr_en(wr_en),\n  .rd_en(rd_en),\n  .dout(dout),\n  .full(full),\n  .empty(empty),\n  .prog_full(prog_full)\n);`,
  },
  { name: "Distributed Memory Generator", category: "Memory", description: "LUT-based distributed RAM/ROM", families: ["Artix-7", "Kintex-7", "Virtex-7", "Spartan-7", "Zynq-7000", "Kintex UltraScale", "Virtex UltraScale", "Zynq UltraScale+"] },

  // DSP
  {
    name: "Multiplier",
    category: "DSP",
    description: "Parameterized multiplier using DSP48E1/DSP48E2 slices",
    families: ["Artix-7", "Kintex-7", "Virtex-7", "Spartan-7", "Zynq-7000", "Kintex UltraScale", "Virtex UltraScale", "Zynq UltraScale+", "Versal"],
    params: [
      { key: "PORT_A_WIDTH", label: "A Width", type: "number", default: "18", min: 2, max: 64, unit: "bits" },
      { key: "PORT_B_WIDTH", label: "B Width", type: "number", default: "18", min: 2, max: 64, unit: "bits" },
      { key: "PORT_A_TYPE", label: "A Type", type: "select", default: "Signed", choices: ["Signed", "Unsigned"] },
      { key: "PIPELINE_STAGES", label: "Pipeline Stages", type: "select", default: "3", choices: ["0", "1", "2", "3", "4", "5", "6"] },
    ],
  },
  { name: "DDS Compiler", category: "DSP", description: "Direct Digital Synthesis for sine/cosine wave generation", families: ["Artix-7", "Kintex-7", "Virtex-7", "Zynq-7000", "Kintex UltraScale", "Virtex UltraScale", "Zynq UltraScale+", "Versal"] },
  { name: "FIR Compiler", category: "DSP", description: "Finite Impulse Response digital filter", families: ["Artix-7", "Kintex-7", "Virtex-7", "Zynq-7000", "Kintex UltraScale", "Virtex UltraScale", "Zynq UltraScale+", "Versal"] },
  { name: "Floating-Point Operator", category: "DSP", description: "IEEE 754 floating-point arithmetic (add, multiply, divide, sqrt)", families: ["Artix-7", "Kintex-7", "Virtex-7", "Kintex UltraScale", "Virtex UltraScale", "Zynq UltraScale+", "Versal"] },
  { name: "CORDIC", category: "DSP", description: "CORDIC algorithm for trigonometric, hyperbolic, and sqrt functions", families: ["Artix-7", "Kintex-7", "Virtex-7", "Kintex UltraScale", "Virtex UltraScale", "Zynq UltraScale+", "Versal"] },

  // Interface
  { name: "AXI UART Lite", category: "Interface", description: "AXI4-Lite UART controller (fixed baud, no FIFO)", families: ["Artix-7", "Kintex-7", "Virtex-7", "Spartan-7", "Zynq-7000", "Kintex UltraScale", "Virtex UltraScale", "Zynq UltraScale+", "Versal"],
    params: [
      { key: "BAUD_RATE", label: "Baud Rate", type: "select", default: "115200", choices: ["9600", "19200", "38400", "57600", "115200", "230400", "460800", "921600"] },
    ],
  },
  { name: "AXI UART 16550", category: "Interface", description: "AXI4 UART with 16550-compatible register interface and FIFO", families: ["Artix-7", "Kintex-7", "Virtex-7", "Zynq-7000", "Kintex UltraScale", "Virtex UltraScale", "Zynq UltraScale+"] },
  { name: "AXI Quad SPI", category: "Interface", description: "AXI4-Lite SPI controller with dual/quad mode support", families: ["Artix-7", "Kintex-7", "Virtex-7", "Spartan-7", "Zynq-7000", "Kintex UltraScale", "Virtex UltraScale", "Zynq UltraScale+", "Versal"] },
  { name: "AXI IIC", category: "Interface", description: "AXI4-Lite I2C master/slave controller", families: ["Artix-7", "Kintex-7", "Virtex-7", "Spartan-7", "Zynq-7000", "Kintex UltraScale", "Virtex UltraScale", "Zynq UltraScale+", "Versal"] },
  { name: "MIG 7 Series", category: "Interface", description: "DDR3/DDR2 memory interface generator for 7-series", families: ["Artix-7", "Kintex-7", "Virtex-7"] },
  { name: "DDR4 SDRAM", category: "Interface", description: "DDR4 memory controller for UltraScale/UltraScale+", families: ["Kintex UltraScale", "Virtex UltraScale", "Zynq UltraScale+"] },
  { name: "AXI Ethernet", category: "Interface", description: "AXI 1G/2.5G Ethernet subsystem", families: ["Artix-7", "Kintex-7", "Virtex-7", "Kintex UltraScale", "Virtex UltraScale", "Zynq UltraScale+"] },
  { name: "PCIe", category: "Interface", description: "Xilinx PCI Express IP core (Gen2/Gen3/Gen4)", families: ["Kintex-7", "Virtex-7", "Kintex UltraScale", "Virtex UltraScale", "Zynq UltraScale+", "Versal"] },
  { name: "AXI Interconnect", category: "Interface", description: "AXI4 crossbar interconnect for multi-master/slave systems", families: ["Artix-7", "Kintex-7", "Virtex-7", "Spartan-7", "Zynq-7000", "Kintex UltraScale", "Virtex UltraScale", "Zynq UltraScale+", "Versal"] },

  // Clock
  {
    name: "Clocking Wizard",
    category: "Clock",
    description: "MMCM/PLL-based clock generation with multiple outputs",
    families: ["Artix-7", "Kintex-7", "Virtex-7", "Spartan-7", "Zynq-7000", "Kintex UltraScale", "Virtex UltraScale", "Zynq UltraScale+", "Versal"],
    params: [
      { key: "CLK_IN_FREQ", label: "Input Frequency", type: "number", default: "100", min: 1, max: 1066, unit: "MHz" },
      { key: "CLK_OUT1_FREQ", label: "Output 1 Frequency", type: "number", default: "200", min: 1, max: 1066, unit: "MHz" },
      { key: "CLK_OUT2_FREQ", label: "Output 2 Frequency", type: "number", default: "0", min: 0, max: 1066, unit: "MHz" },
      { key: "PRIMITIVE", label: "Primitive", type: "select", default: "MMCM", choices: ["MMCM", "PLL"] },
    ],
    template: `clk_wiz_0 {INSTANCE_NAME} (\n  .clk_in1(clk_in),\n  .clk_out1(clk_out1),\n  .reset(rst),\n  .locked(locked)\n);`,
  },
  { name: "Processor System Reset", category: "Clock", description: "Synchronized reset generator for processor systems", families: ["Artix-7", "Kintex-7", "Virtex-7", "Spartan-7", "Zynq-7000", "Kintex UltraScale", "Virtex UltraScale", "Zynq UltraScale+", "Versal"] },

  // I/O
  { name: "Utility Buffer", category: "I/O", description: "I/O buffer instantiation (IBUF, OBUF, IOBUF, IBUFDS, OBUFDS)", families: ["Artix-7", "Kintex-7", "Virtex-7", "Spartan-7", "Zynq-7000", "Kintex UltraScale", "Virtex UltraScale", "Zynq UltraScale+", "Versal"] },
  { name: "SelectIO Interface Wizard", category: "I/O", description: "High-speed SelectIO interface with ISERDES/OSERDES", families: ["Artix-7", "Kintex-7", "Virtex-7", "Kintex UltraScale", "Virtex UltraScale", "Zynq UltraScale+"] },
  { name: "AXI GPIO", category: "I/O", description: "AXI4-Lite general purpose I/O controller", families: ["Artix-7", "Kintex-7", "Virtex-7", "Spartan-7", "Zynq-7000", "Kintex UltraScale", "Virtex UltraScale", "Zynq UltraScale+", "Versal"] },

  // Misc
  { name: "MicroBlaze", category: "Misc", description: "32-bit RISC soft processor core", families: ["Artix-7", "Kintex-7", "Virtex-7", "Spartan-7", "Zynq-7000", "Kintex UltraScale", "Virtex UltraScale", "Zynq UltraScale+"] },
  { name: "ILA", category: "Misc", description: "Integrated Logic Analyzer for in-system hardware debug", families: ["Artix-7", "Kintex-7", "Virtex-7", "Spartan-7", "Zynq-7000", "Kintex UltraScale", "Virtex UltraScale", "Zynq UltraScale+", "Versal"] },
  { name: "VIO", category: "Misc", description: "Virtual I/O for runtime signal probing and driving", families: ["Artix-7", "Kintex-7", "Virtex-7", "Spartan-7", "Zynq-7000", "Kintex UltraScale", "Virtex UltraScale", "Zynq UltraScale+", "Versal"] },
  { name: "JTAG-to-AXI Master", category: "Misc", description: "JTAG-based AXI master for register access during debug", families: ["Artix-7", "Kintex-7", "Virtex-7", "Kintex UltraScale", "Virtex UltraScale", "Zynq UltraScale+", "Versal"] },
  { name: "XADC Wizard", category: "Misc", description: "7-series analog-to-digital converter configuration", families: ["Artix-7", "Kintex-7", "Virtex-7", "Spartan-7", "Zynq-7000"] },
  { name: "System Management Wizard", category: "Misc", description: "UltraScale+ SYSMONE4 analog monitoring", families: ["Kintex UltraScale", "Virtex UltraScale", "Zynq UltraScale+", "Versal"] },
];

/** Lattice Diamond — IP cores for ECP5, MachXO2/3, and LatticeXP2 devices. */
export const DIAMOND_IP_CATALOG: IpCore[] = [
  // Memory
  {
    name: "EBR (Embedded Block RAM)",
    category: "Memory",
    description: "Sysmem EBR-based single/dual-port RAM primitive",
    families: ["ECP5", "ECP3", "MachXO2", "MachXO3LF", "MachXO3D", "LatticeXP2"],
    params: [
      { key: "DATA_WIDTH", label: "Data Width", type: "number", default: "8", min: 1, max: 36, unit: "bits" },
      { key: "ADDR_WIDTH", label: "Address Width", type: "number", default: "10", min: 2, max: 14, unit: "bits" },
      { key: "MODE", label: "Port Mode", type: "select", default: "DP", choices: ["SP", "DP", "PDP"] },
    ],
  },
  {
    name: "Distributed RAM",
    category: "Memory",
    description: "LUT-based distributed RAM for small memories",
    families: ["ECP5", "ECP3", "MachXO2", "MachXO3LF", "MachXO3D"],
  },
  {
    name: "FIFO_DC",
    category: "Memory",
    description: "Dual-clock FIFO with configurable depth",
    families: ["ECP5", "ECP3", "MachXO2", "MachXO3LF", "MachXO3D"],
    params: [
      { key: "DATA_WIDTH", label: "Data Width", type: "number", default: "8", min: 1, max: 36, unit: "bits" },
      { key: "DEPTH", label: "Depth", type: "select", default: "256", choices: ["16", "32", "64", "128", "256", "512", "1024", "2048"] },
    ],
  },
  { name: "FIFO", category: "Memory", description: "Single-clock FIFO buffer", families: ["ECP5", "ECP3", "MachXO2", "MachXO3LF", "MachXO3D"] },

  // DSP
  {
    name: "DSP Multiply",
    category: "DSP",
    description: "MULT18X18D hard multiplier block (18x18 signed)",
    families: ["ECP5", "ECP3"],
    params: [
      { key: "A_WIDTH", label: "A Width", type: "number", default: "18", min: 1, max: 36, unit: "bits" },
      { key: "B_WIDTH", label: "B Width", type: "number", default: "18", min: 1, max: 36, unit: "bits" },
      { key: "PIPELINE", label: "Pipeline Stages", type: "select", default: "1", choices: ["0", "1", "2"] },
    ],
  },
  { name: "ALU54B", category: "DSP", description: "54-bit ALU for wide arithmetic operations", families: ["ECP5"] },

  // Interface
  { name: "SPI Controller", category: "Interface", description: "SPI master/slave via EFB or soft core", families: ["ECP5", "MachXO2", "MachXO3LF", "MachXO3D"],
    params: [
      { key: "MODE", label: "Mode", type: "select", default: "Master", choices: ["Master", "Slave"] },
      { key: "CPOL", label: "CPOL", type: "select", default: "0", choices: ["0", "1"] },
      { key: "CPHA", label: "CPHA", type: "select", default: "0", choices: ["0", "1"] },
    ],
  },
  { name: "I2C Controller", category: "Interface", description: "I2C master/slave via EFB hard block", families: ["ECP5", "MachXO2", "MachXO3LF", "MachXO3D"] },
  { name: "UART", category: "Interface", description: "Soft UART with baud rate generator", families: ["ECP5", "ECP3", "MachXO2", "MachXO3LF", "MachXO3D"],
    params: [
      { key: "BAUD_RATE", label: "Baud Rate", type: "select", default: "115200", choices: ["9600", "19200", "38400", "57600", "115200", "230400"] },
      { key: "DATA_BITS", label: "Data Bits", type: "select", default: "8", choices: ["7", "8"] },
    ],
  },
  { name: "PCIe Endpoint", category: "Interface", description: "PCI Express Gen1/Gen2 hard IP endpoint", families: ["ECP5"] },
  { name: "SERDES", category: "Interface", description: "High-speed serializer/deserializer (up to 5 Gbps)", families: ["ECP5"] },

  // Clock
  {
    name: "PLL",
    category: "Clock",
    description: "Phase-locked loop for clock synthesis (EHXPLLL primitive)",
    families: ["ECP5", "ECP3", "MachXO2", "MachXO3LF", "MachXO3D"],
    params: [
      { key: "CLKI_FREQ", label: "Input Frequency", type: "number", default: "25", min: 1, max: 400, unit: "MHz" },
      { key: "CLKOP_FREQ", label: "Primary Output Frequency", type: "number", default: "100", min: 1, max: 400, unit: "MHz" },
    ],
  },
  { name: "DCC", category: "Clock", description: "Dynamic clock control mux for clock gating", families: ["ECP5", "MachXO2", "MachXO3LF", "MachXO3D"] },
  { name: "OSCH", category: "Clock", description: "Internal oscillator (MachXO2/3 devices)", families: ["MachXO2", "MachXO3LF", "MachXO3D"] },

  // I/O
  { name: "GPIO", category: "I/O", description: "General-purpose I/O with configurable drive and standards", families: ["ECP5", "ECP3", "MachXO2", "MachXO3LF", "MachXO3D", "LatticeXP2"] },
  { name: "LVDS", category: "I/O", description: "Low-voltage differential signaling I/O", families: ["ECP5", "ECP3"] },
  { name: "DDR I/O", category: "I/O", description: "Double-data-rate I/O registers (IDDRX1F/ODDRX1F)", families: ["ECP5"] },

  // Misc
  { name: "EFB", category: "Misc", description: "Embedded Function Block (timer, SPI, I2C, flash access)", families: ["MachXO2", "MachXO3LF", "MachXO3D"] },
  { name: "LatticeMico32", category: "Misc", description: "32-bit RISC soft processor core", families: ["ECP5", "ECP3"] },
  { name: "Reveal Inserter", category: "Misc", description: "In-system logic analyzer for debug", families: ["ECP5", "ECP3", "MachXO2", "MachXO3LF", "MachXO3D"] },
];

/** Achronix ACE — IP cores for Speedster7t devices. */
export const ACE_IP_CATALOG: IpCore[] = [
  // Memory
  {
    name: "BRAM72K",
    category: "Memory",
    description: "72Kbit block RAM with configurable aspect ratio",
    families: ["Speedster7t"],
    params: [
      { key: "DATA_WIDTH", label: "Data Width", type: "number", default: "32", min: 1, max: 72, unit: "bits" },
      { key: "ADDR_WIDTH", label: "Address Width", type: "number", default: "10", min: 5, max: 16, unit: "bits" },
      { key: "MODE", label: "Mode", type: "select", default: "SDP", choices: ["SP", "SDP", "TDP"] },
    ],
  },
  {
    name: "LRAM",
    category: "Memory",
    description: "Distributed LRAM (logic RAM) for small memories",
    families: ["Speedster7t"],
  },
  {
    name: "FIFO",
    category: "Memory",
    description: "Synchronous/asynchronous FIFO with ECC support",
    families: ["Speedster7t"],
    params: [
      { key: "DATA_WIDTH", label: "Data Width", type: "number", default: "32", min: 1, max: 72, unit: "bits" },
      { key: "DEPTH", label: "Depth", type: "number", default: "512", min: 16, max: 65536 },
      { key: "ASYNC", label: "Asynchronous", type: "boolean", default: "false" },
      { key: "ECC", label: "ECC Enable", type: "boolean", default: "false" },
    ],
  },

  // DSP
  {
    name: "MLP (Machine Learning Processor)",
    category: "DSP",
    description: "Speedster7t machine learning processor block for INT8/FP16/BF16",
    families: ["Speedster7t"],
    params: [
      { key: "DATA_TYPE", label: "Data Type", type: "select", default: "INT8", choices: ["INT8", "INT16", "FP16", "BF16"] },
      { key: "BATCH_SIZE", label: "Batch Size", type: "number", default: "1", min: 1, max: 32 },
    ],
  },
  {
    name: "DSP64",
    category: "DSP",
    description: "64-bit DSP block for multiply-accumulate operations",
    families: ["Speedster7t"],
    params: [
      { key: "A_WIDTH", label: "A Width", type: "number", default: "27", min: 1, max: 27, unit: "bits" },
      { key: "B_WIDTH", label: "B Width", type: "number", default: "24", min: 1, max: 24, unit: "bits" },
    ],
  },

  // Interface
  {
    name: "Ethernet MAC",
    category: "Interface",
    description: "10G/25G/100G/400G Ethernet MAC hard IP",
    families: ["Speedster7t"],
    params: [
      { key: "RATE", label: "Rate", type: "select", default: "100G", choices: ["10G", "25G", "100G", "400G"] },
    ],
  },
  {
    name: "PCIe Gen5",
    category: "Interface",
    description: "PCI Express Gen5 x16 hard IP controller",
    families: ["Speedster7t"],
  },
  {
    name: "GDDR6",
    category: "Interface",
    description: "GDDR6 memory controller hard IP",
    families: ["Speedster7t"],
  },
  {
    name: "SerDes",
    category: "Interface",
    description: "High-speed SerDes transceiver (up to 112 Gbps PAM4)",
    families: ["Speedster7t"],
    params: [
      { key: "RATE", label: "Line Rate", type: "select", default: "28G", choices: ["10G", "25G", "28G", "56G", "112G"] },
    ],
  },
  { name: "NoC (Network on Chip)", category: "Interface", description: "2D mesh NoC for high-bandwidth on-chip data movement", families: ["Speedster7t"] },

  // Clock
  {
    name: "PLL",
    category: "Clock",
    description: "Phase-locked loop for clock synthesis",
    families: ["Speedster7t"],
    params: [
      { key: "REF_FREQ", label: "Reference Frequency", type: "number", default: "100", min: 1, max: 1200, unit: "MHz" },
      { key: "OUT_FREQ", label: "Output Frequency", type: "number", default: "500", min: 1, max: 1200, unit: "MHz" },
    ],
  },
  { name: "Clock Mux", category: "Clock", description: "Glitch-free clock multiplexer", families: ["Speedster7t"] },

  // I/O
  { name: "GPIO", category: "I/O", description: "General-purpose I/O with configurable drive and voltage", families: ["Speedster7t"] },
  { name: "LVDS", category: "I/O", description: "Low-voltage differential signaling I/O", families: ["Speedster7t"] },

  // Misc
  { name: "SnapShot Debugger", category: "Misc", description: "In-system signal capture and debug tool", families: ["Speedster7t"] },
  { name: "JTAG", category: "Misc", description: "JTAG boundary scan and debug interface", families: ["Speedster7t"] },
];

/** Microchip Libero SoC — IP cores for PolarFire, PolarFire SoC, SmartFusion2, IGLOO2, and RTG4 devices. */
export const LIBERO_IP_CATALOG: IpCore[] = [
  // Memory
  {
    name: "LSRAM",
    category: "Memory",
    description: "Large SRAM block (up to 20Kbit per instance) for data storage",
    families: ["PolarFire", "PolarFire SoC", "SmartFusion2", "IGLOO2", "RTG4"],
    params: [
      { key: "DATA_WIDTH", label: "Data Width", type: "number", default: "32", min: 1, max: 40, unit: "bits" },
      { key: "DEPTH", label: "Depth", type: "number", default: "512", min: 2, max: 20480 },
      { key: "MODE", label: "Port Mode", type: "select", default: "SDP", choices: ["SP", "SDP", "TDP"] },
    ],
  },
  {
    name: "uSRAM",
    category: "Memory",
    description: "Micro SRAM (64x12 distributed RAM) for small lookup tables",
    families: ["PolarFire", "PolarFire SoC"],
  },
  {
    name: "FIFO",
    category: "Memory",
    description: "Synchronous or asynchronous FIFO controller with ECC",
    families: ["PolarFire", "PolarFire SoC", "SmartFusion2", "IGLOO2", "RTG4"],
    params: [
      { key: "DATA_WIDTH", label: "Data Width", type: "number", default: "32", min: 1, max: 40, unit: "bits" },
      { key: "DEPTH", label: "Depth", type: "number", default: "512", min: 16, max: 65536 },
      { key: "ASYNC", label: "Dual-Clock", type: "boolean", default: "false" },
      { key: "ECC", label: "ECC Enable", type: "boolean", default: "false" },
    ],
  },

  // DSP
  {
    name: "MACC (Multiply-Accumulate)",
    category: "DSP",
    description: "18x18 signed multiply-accumulate hard block",
    families: ["PolarFire", "PolarFire SoC", "SmartFusion2", "IGLOO2", "RTG4"],
    params: [
      { key: "A_WIDTH", label: "A Width", type: "number", default: "18", min: 1, max: 18, unit: "bits" },
      { key: "B_WIDTH", label: "B Width", type: "number", default: "18", min: 1, max: 18, unit: "bits" },
      { key: "PIPELINE", label: "Pipeline Stages", type: "select", default: "1", choices: ["0", "1", "2"] },
    ],
  },
  { name: "Math Block", category: "DSP", description: "Configurable DSP block with pre-adder, multiplier, and accumulator", families: ["PolarFire", "PolarFire SoC"] },

  // Interface
  {
    name: "CoreUART",
    category: "Interface",
    description: "Soft UART controller with configurable baud rate and FIFO",
    families: ["PolarFire", "PolarFire SoC", "SmartFusion2", "IGLOO2", "RTG4"],
    params: [
      { key: "BAUD_RATE", label: "Baud Rate", type: "select", default: "115200", choices: ["9600", "19200", "38400", "57600", "115200", "230400", "460800", "921600"] },
      { key: "DATA_BITS", label: "Data Bits", type: "select", default: "8", choices: ["7", "8"] },
      { key: "PARITY", label: "Parity", type: "select", default: "None", choices: ["None", "Even", "Odd"] },
    ],
  },
  { name: "CoreSPI", category: "Interface", description: "SPI master/slave controller", families: ["PolarFire", "PolarFire SoC", "SmartFusion2", "IGLOO2", "RTG4"] },
  { name: "CoreI2C", category: "Interface", description: "I2C master/slave controller (100/400 kHz)", families: ["PolarFire", "PolarFire SoC", "SmartFusion2", "IGLOO2", "RTG4"] },
  { name: "DDR Controller", category: "Interface", description: "DDR3/DDR4/LPDDR3/LPDDR4 memory controller hard IP", families: ["PolarFire", "PolarFire SoC"] },
  { name: "PCIe", category: "Interface", description: "PCI Express Gen2 x1/x2/x4 endpoint controller", families: ["PolarFire", "PolarFire SoC"] },
  { name: "Transceiver", category: "Interface", description: "Multi-rate transceiver (up to 12.7 Gbps)", families: ["PolarFire", "PolarFire SoC"] },
  { name: "MSS (Microprocessor Subsystem)", category: "Interface", description: "PolarFire SoC RISC-V MSS with 4x U54 + 1x E51 cores", families: ["PolarFire SoC"] },

  // Clock
  {
    name: "PLL",
    category: "Clock",
    description: "CCC (Clock Conditioning Circuit) with PLL for clock generation",
    families: ["PolarFire", "PolarFire SoC", "SmartFusion2", "IGLOO2", "RTG4"],
    params: [
      { key: "REF_FREQ", label: "Reference Frequency", type: "number", default: "50", min: 1, max: 1600, unit: "MHz" },
      { key: "OUT_FREQ", label: "Output Frequency", type: "number", default: "100", min: 1, max: 1600, unit: "MHz" },
    ],
  },
  { name: "Clock Divider", category: "Clock", description: "Programmable clock divider via CCC", families: ["PolarFire", "PolarFire SoC", "SmartFusion2", "IGLOO2"] },
  { name: "RC Oscillator", category: "Clock", description: "On-chip RC oscillator (1/25/50 MHz)", families: ["PolarFire", "PolarFire SoC", "SmartFusion2", "IGLOO2"] },

  // I/O
  { name: "GPIO", category: "I/O", description: "General-purpose I/O with configurable drive, slew, and pull", families: ["PolarFire", "PolarFire SoC", "SmartFusion2", "IGLOO2", "RTG4"] },
  { name: "LVDS", category: "I/O", description: "Low-voltage differential signaling I/O", families: ["PolarFire", "PolarFire SoC"] },
  { name: "HSIO", category: "I/O", description: "High-speed I/O for DDR interfaces", families: ["PolarFire", "PolarFire SoC"] },

  // Misc
  { name: "uPROM", category: "Misc", description: "User PROM for non-volatile data storage", families: ["PolarFire", "PolarFire SoC", "SmartFusion2", "IGLOO2"] },
  { name: "SmartDebug", category: "Misc", description: "In-system debug and diagnostic tool", families: ["PolarFire", "PolarFire SoC", "SmartFusion2", "IGLOO2", "RTG4"] },
  { name: "SRAM-PUF", category: "Misc", description: "SRAM-based Physical Unclonable Function for device identity", families: ["PolarFire", "PolarFire SoC"] },
  { name: "Crypto Processor", category: "Misc", description: "Hardware AES-256, SHA-256, and ECC crypto engine", families: ["PolarFire", "PolarFire SoC"] },
];

export const IP_CATEGORIES = ["Memory", "DSP", "Interface", "Clock", "I/O", "Misc"] as const;
