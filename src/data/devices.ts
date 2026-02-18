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
