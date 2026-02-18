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

export const IP_CATEGORIES = ["Memory", "DSP", "Interface", "Clock", "I/O", "Misc"] as const;
