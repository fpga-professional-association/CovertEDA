export interface DeviceInfo {
  partNumber: string;
  family: string;
  luts: number;
  ffs: number;
  ebr: number;
  dsp: number;
  io: number;
  package: string;
  speedGrade: string;
}

export const RADIANT_DEVICES: DeviceInfo[] = [
  // Certus-NX (LIFCL)
  { partNumber: "LIFCL-17-7CSFBGA121I", family: "Certus-NX", luts: 17000, ffs: 17000, ebr: 32, dsp: 10, io: 56, package: "CSFBGA121", speedGrade: "7" },
  { partNumber: "LIFCL-17-8WLCSP72I", family: "Certus-NX", luts: 17000, ffs: 17000, ebr: 32, dsp: 10, io: 26, package: "WLCSP72", speedGrade: "8" },
  { partNumber: "LIFCL-17-7CABGA256I", family: "Certus-NX", luts: 17000, ffs: 17000, ebr: 32, dsp: 10, io: 120, package: "CABGA256", speedGrade: "7" },
  { partNumber: "LIFCL-40-7CABGA400I", family: "Certus-NX", luts: 39600, ffs: 39744, ebr: 104, dsp: 28, io: 220, package: "CABGA400", speedGrade: "7" },
  { partNumber: "LIFCL-40-7CABGA400C", family: "Certus-NX", luts: 39600, ffs: 39744, ebr: 104, dsp: 28, io: 220, package: "CABGA400", speedGrade: "7" },
  { partNumber: "LIFCL-40-8CABGA400C", family: "Certus-NX", luts: 39600, ffs: 39744, ebr: 104, dsp: 28, io: 220, package: "CABGA400", speedGrade: "8" },
  { partNumber: "LIFCL-40-9CABGA256C", family: "Certus-NX", luts: 39600, ffs: 39744, ebr: 104, dsp: 28, io: 120, package: "CABGA256", speedGrade: "9" },

  // CrossLink-NX (LIFCL-33U)
  { partNumber: "LIFCL-33U-9FCCSP104I", family: "CrossLink-NX", luts: 33000, ffs: 33000, ebr: 64, dsp: 56, io: 56, package: "FCCSP104", speedGrade: "9" },
  { partNumber: "LIFCL-33U-9WLCSP84I", family: "CrossLink-NX", luts: 33000, ffs: 33000, ebr: 64, dsp: 56, io: 42, package: "WLCSP84", speedGrade: "9" },

  // CertusPro-NX (LFCPNX)
  { partNumber: "LFCPNX-100-9ASG256C", family: "CertusPro-NX", luts: 96600, ffs: 96600, ebr: 208, dsp: 80, io: 128, package: "ASG256", speedGrade: "9" },
  { partNumber: "LFCPNX-100-9LFG672C", family: "CertusPro-NX", luts: 96600, ffs: 96600, ebr: 208, dsp: 80, io: 360, package: "LFG672", speedGrade: "9" },

  // MachXO5-NX (LFMXO5)
  { partNumber: "LFMXO5-25-7BBG256I", family: "MachXO5-NX", luts: 25000, ffs: 25000, ebr: 40, dsp: 0, io: 120, package: "BBG256", speedGrade: "7" },
  { partNumber: "LFMXO5-35-7BBG256I", family: "MachXO5-NX", luts: 35000, ffs: 35000, ebr: 56, dsp: 0, io: 120, package: "BBG256", speedGrade: "7" },
  { partNumber: "LFMXO5-65-7BBG484I", family: "MachXO5-NX", luts: 65000, ffs: 65000, ebr: 112, dsp: 28, io: 252, package: "BBG484", speedGrade: "7" },

  // Avant (LAV-AT)
  { partNumber: "LAV-AT-E30-9ASG410C", family: "Avant-E", luts: 30000, ffs: 30000, ebr: 48, dsp: 20, io: 220, package: "ASG410", speedGrade: "9" },
  { partNumber: "LAV-AT-E70-9LFG676C", family: "Avant-E", luts: 70000, ffs: 70000, ebr: 128, dsp: 56, io: 360, package: "LFG676", speedGrade: "9" },
  { partNumber: "LAV-AT-E70-9LFG1156C", family: "Avant-E", luts: 70000, ffs: 70000, ebr: 128, dsp: 56, io: 620, package: "LFG1156", speedGrade: "9" },
];

// Group devices by family
export function getDeviceFamilies(): string[] {
  const families = new Set(RADIANT_DEVICES.map((d) => d.family));
  return Array.from(families);
}

// ── Microchip Libero SoC devices ──────────────────────────────────────────

export const LIBERO_DEVICES: DeviceInfo[] = [
  // PolarFire (MPF) — high-density, low-power FPGA
  { partNumber: "MPF100T", family: "PolarFire", luts: 99008,  ffs: 99008,  ebr: 756,  dsp: 336,  io: 254, package: "FCG484",  speedGrade: "STD" },
  { partNumber: "MPF200T", family: "PolarFire", luts: 198008, ffs: 198008, ebr: 1512, dsp: 672,  io: 254, package: "FCG484",  speedGrade: "STD" },
  { partNumber: "MPF300T", family: "PolarFire", luts: 299008, ffs: 299008, ebr: 2016, dsp: 1404, io: 484, package: "FCG1152", speedGrade: "STD" },
  { partNumber: "MPF500T", family: "PolarFire", luts: 481000, ffs: 481000, ebr: 3888, dsp: 1944, io: 624, package: "FCG1152", speedGrade: "STD" },

  // PolarFire SoC (MPFS) — FPGA + RISC-V Linux-capable SoC
  { partNumber: "MPFS025T", family: "PolarFire SoC", luts: 25000,  ffs: 25000,  ebr: 252,  dsp: 112,  io: 114, package: "FCVG484",  speedGrade: "STD" },
  { partNumber: "MPFS095T", family: "PolarFire SoC", luts: 95000,  ffs: 95000,  ebr: 756,  dsp: 336,  io: 254, package: "FCVG484",  speedGrade: "STD" },
  { partNumber: "MPFS160T", family: "PolarFire SoC", luts: 160000, ffs: 160000, ebr: 1512, dsp: 672,  io: 254, package: "FCVG784",  speedGrade: "STD" },
  { partNumber: "MPFS250T", family: "PolarFire SoC", luts: 254000, ffs: 254000, ebr: 2016, dsp: 1404, io: 484, package: "FCVG1152", speedGrade: "STD" },
  { partNumber: "MPFS460T", family: "PolarFire SoC", luts: 460000, ffs: 460000, ebr: 3888, dsp: 1944, io: 624, package: "FCVG1152", speedGrade: "STD" },

  // SmartFusion2 (M2S) — FPGA + ARM Cortex-M3 SoC
  { partNumber: "M2S010",  family: "SmartFusion2", luts: 12084,  ffs: 12084,  ebr: 64,  dsp: 8,   io: 73,  package: "VF256",  speedGrade: "STD" },
  { partNumber: "M2S025",  family: "SmartFusion2", luts: 27084,  ffs: 27084,  ebr: 64,  dsp: 22,  io: 73,  package: "VF256",  speedGrade: "STD" },
  { partNumber: "M2S050",  family: "SmartFusion2", luts: 56084,  ffs: 56084,  ebr: 128, dsp: 54,  io: 145, package: "FBGA672", speedGrade: "STD" },
  { partNumber: "M2S090",  family: "SmartFusion2", luts: 94084,  ffs: 94084,  ebr: 256, dsp: 66,  io: 350, package: "FBGA896", speedGrade: "STD" },

  // IGLOO2 (M2GL) — low-power FPGA
  { partNumber: "M2GL010", family: "IGLOO2", luts: 12084,  ffs: 12084,  ebr: 64,  dsp: 8,   io: 73,  package: "VF256",  speedGrade: "STD" },
  { partNumber: "M2GL025", family: "IGLOO2", luts: 27084,  ffs: 27084,  ebr: 64,  dsp: 22,  io: 73,  package: "VF256",  speedGrade: "STD" },
  { partNumber: "M2GL050", family: "IGLOO2", luts: 56084,  ffs: 56084,  ebr: 128, dsp: 54,  io: 145, package: "FBGA256", speedGrade: "STD" },
  { partNumber: "M2GL090", family: "IGLOO2", luts: 94084,  ffs: 94084,  ebr: 256, dsp: 66,  io: 350, package: "FBGA896", speedGrade: "STD" },

  // RTG4 — radiation-tolerant FPGA
  { partNumber: "RT4G150", family: "RTG4", luts: 149976, ffs: 149976, ebr: 648, dsp: 384, io: 340, package: "CG1657", speedGrade: "STD" },
];

export function getLiberoDeviceFamilies(): string[] {
  const families = new Set(LIBERO_DEVICES.map((d) => d.family));
  return Array.from(families);
}
