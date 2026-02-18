export interface IpCore {
  name: string;
  category: "Memory" | "DSP" | "Interface" | "Clock" | "I/O" | "Misc";
  description: string;
  families: string[];
}

/** Static lookup table of common Lattice Radiant IP cores. */
export const RADIANT_IP_CATALOG: IpCore[] = [
  // Memory
  { name: "FIFO_DC", category: "Memory", description: "Dual-clock FIFO with configurable depth and width", families: ["LIFCL", "CrossLink-NX", "CertusPro-NX", "Avant"] },
  { name: "FIFO", category: "Memory", description: "Single-clock FIFO with configurable depth and width", families: ["LIFCL", "CrossLink-NX", "CertusPro-NX", "Avant"] },
  { name: "RAM_DQ", category: "Memory", description: "Single-port RAM using EBR primitives", families: ["LIFCL", "CrossLink-NX", "CertusPro-NX", "Avant"] },
  { name: "RAM_DP", category: "Memory", description: "True dual-port RAM with independent read/write clocks", families: ["LIFCL", "CrossLink-NX", "CertusPro-NX", "Avant"] },
  { name: "RAM_PDP", category: "Memory", description: "Pseudo dual-port RAM (one read, one write port)", families: ["LIFCL", "CrossLink-NX", "CertusPro-NX", "Avant"] },
  { name: "ROM", category: "Memory", description: "Read-only memory with initialization file (.mem)", families: ["LIFCL", "CrossLink-NX", "CertusPro-NX", "Avant"] },
  { name: "Large RAM", category: "Memory", description: "Large SRAM using LRAM blocks (up to 64Kb per block)", families: ["LIFCL", "CertusPro-NX", "Avant"] },

  // DSP
  { name: "Multiplier", category: "DSP", description: "Parameterized multiply using DSP hard blocks", families: ["LIFCL", "CertusPro-NX", "Avant"] },
  { name: "MAC", category: "DSP", description: "Multiply-accumulate unit using DSP slices", families: ["LIFCL", "CertusPro-NX", "Avant"] },
  { name: "DSP Core", category: "DSP", description: "Configurable DSP with pre-adder, multiply, post-add/acc", families: ["LIFCL", "CertusPro-NX", "Avant"] },

  // Interface
  { name: "SPI Controller", category: "Interface", description: "SPI master/slave with configurable CPOL/CPHA", families: ["LIFCL", "CrossLink-NX", "CertusPro-NX", "Avant"] },
  { name: "I2C Controller", category: "Interface", description: "I2C master/slave (100/400 kHz, optional 1 MHz fast+)", families: ["LIFCL", "CrossLink-NX", "CertusPro-NX", "Avant"] },
  { name: "UART", category: "Interface", description: "Configurable UART with baud rate generator and FIFO", families: ["LIFCL", "CrossLink-NX", "CertusPro-NX", "Avant"] },
  { name: "MIPI D-PHY", category: "Interface", description: "MIPI D-PHY transmitter/receiver for camera and display", families: ["CrossLink-NX"] },
  { name: "PCIe", category: "Interface", description: "PCIe Gen2/Gen3 endpoint controller", families: ["CertusPro-NX", "Avant"] },
  { name: "DDR Memory Controller", category: "Interface", description: "DDR3/DDR4/LPDDR4 memory interface controller", families: ["CertusPro-NX", "Avant"] },

  // Clock
  { name: "PLL", category: "Clock", description: "Phase-locked loop for clock synthesis and jitter cleaning", families: ["LIFCL", "CrossLink-NX", "CertusPro-NX", "Avant"] },
  { name: "Clock Divider", category: "Clock", description: "Programmable clock divider (DCC/ECLKDIV)", families: ["LIFCL", "CrossLink-NX", "CertusPro-NX", "Avant"] },
  { name: "OSCI", category: "Clock", description: "Internal oscillator configuration (HFOSC/LFOSC)", families: ["LIFCL", "CrossLink-NX"] },

  // I/O
  { name: "GPIO", category: "I/O", description: "General-purpose I/O with configurable drive and pull", families: ["LIFCL", "CrossLink-NX", "CertusPro-NX", "Avant"] },
  { name: "SGMII", category: "I/O", description: "Serial GMII for Gigabit Ethernet PHY interface", families: ["CertusPro-NX", "Avant"] },
  { name: "LVDS", category: "I/O", description: "Low-voltage differential signaling I/O", families: ["LIFCL", "CrossLink-NX", "CertusPro-NX", "Avant"] },

  // Misc
  { name: "EFB", category: "Misc", description: "Embedded Function Block (timer, SPI, I2C, flash access)", families: ["LIFCL"] },
  { name: "JTAG", category: "Misc", description: "JTAG TAP controller for debug and programming", families: ["LIFCL", "CrossLink-NX", "CertusPro-NX", "Avant"] },
];

export const IP_CATEGORIES = ["Memory", "DSP", "Interface", "Clock", "I/O", "Misc"] as const;
