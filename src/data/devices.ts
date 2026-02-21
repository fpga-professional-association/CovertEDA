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
  // CertusPro-NX (LIFCL)
  { partNumber: "LIFCL-17-7MG121I", family: "CertusPro-NX", luts: 17000, ffs: 17000, ebr: 32, dsp: 10, io: 56, package: "csfBGA121", speedGrade: "7" },
  { partNumber: "LIFCL-17-7UWG72I", family: "CertusPro-NX", luts: 17000, ffs: 17000, ebr: 32, dsp: 10, io: 26, package: "WLCSP72", speedGrade: "7" },
  { partNumber: "LIFCL-17-7BG256I", family: "CertusPro-NX", luts: 17000, ffs: 17000, ebr: 32, dsp: 10, io: 120, package: "caBGA256", speedGrade: "7" },
  { partNumber: "LIFCL-40-7BG400I", family: "CertusPro-NX", luts: 39600, ffs: 39744, ebr: 104, dsp: 28, io: 220, package: "caBGA400", speedGrade: "7" },
  { partNumber: "LIFCL-40-7BG400C", family: "CertusPro-NX", luts: 39600, ffs: 39744, ebr: 104, dsp: 28, io: 220, package: "caBGA400", speedGrade: "7" },
  { partNumber: "LIFCL-40-8BG400C", family: "CertusPro-NX", luts: 39600, ffs: 39744, ebr: 104, dsp: 28, io: 220, package: "caBGA400", speedGrade: "8" },
  { partNumber: "LIFCL-40-9BG256C", family: "CertusPro-NX", luts: 39600, ffs: 39744, ebr: 104, dsp: 28, io: 120, package: "caBGA256", speedGrade: "9" },

  // CrossLink-NX (LIFCL small)
  { partNumber: "LIFCL-33U-7MG121C", family: "CrossLink-NX", luts: 33000, ffs: 33000, ebr: 64, dsp: 56, io: 56, package: "csfBGA121", speedGrade: "7" },
  { partNumber: "LIFCL-33U-7BG256C", family: "CrossLink-NX", luts: 33000, ffs: 33000, ebr: 64, dsp: 56, io: 120, package: "caBGA256", speedGrade: "7" },

  // CertusNX (LFCPNX)
  { partNumber: "LFCPNX-100-7LFG256C", family: "CertusNX", luts: 96600, ffs: 96600, ebr: 208, dsp: 80, io: 128, package: "csfBGA256", speedGrade: "7" },
  { partNumber: "LFCPNX-100-9LFG672C", family: "CertusNX", luts: 96600, ffs: 96600, ebr: 208, dsp: 80, io: 360, package: "csfBGA672", speedGrade: "9" },

  // MachXO5-NX (LMXO5)
  { partNumber: "LMXO5-25-6MG121I", family: "MachXO5-NX", luts: 25000, ffs: 25000, ebr: 40, dsp: 0, io: 56, package: "csfBGA121", speedGrade: "6" },
  { partNumber: "LMXO5-50-7BG256I", family: "MachXO5-NX", luts: 50000, ffs: 50000, ebr: 80, dsp: 28, io: 120, package: "caBGA256", speedGrade: "7" },

  // Avant (LFAX)
  { partNumber: "LFAX-17-7BBG484I", family: "Avant", luts: 17000, ffs: 17000, ebr: 48, dsp: 20, io: 252, package: "fcBGA484", speedGrade: "7" },
  { partNumber: "LFAX-50-9BBG484C", family: "Avant", luts: 50000, ffs: 50000, ebr: 128, dsp: 56, io: 252, package: "fcBGA484", speedGrade: "9" },
  { partNumber: "LFAX-100-9BBG784C", family: "Avant", luts: 100000, ffs: 100000, ebr: 256, dsp: 100, io: 420, package: "fcBGA784", speedGrade: "9" },
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
