// Known FPGA devices per backend — used for part selection dropdown
// Organized by family within each backend

export interface DeviceFamily {
  family: string;
  parts: string[];
}

export const RADIANT_DEVICES: DeviceFamily[] = [
  {
    family: "CertusPro-NX",
    parts: [
      "LFCPNX-100-9LFG672I", "LFCPNX-100-9LFG672C", "LFCPNX-100-7LFG672I",
      "LFCPNX-50-9ASG400I", "LFCPNX-50-9BBG484I",
    ],
  },
  {
    family: "Certus-NX",
    parts: [
      "LIFCL-40-9BG400I", "LIFCL-40-9BG400C", "LIFCL-40-7BG400I", "LIFCL-40-7BG400C",
      "LIFCL-40-9SG72I", "LIFCL-40-7SG72I",
      "LIFCL-17-8SG72I", "LIFCL-17-8BG256I",
    ],
  },
  {
    family: "CrossLink-NX",
    parts: [
      "LIFCL-33U-8SG72I", "LIFCL-33U-8BG256I",
      "LIFCL-17U-8SG72I",
    ],
  },
  {
    family: "MachXO3D",
    parts: [
      "LCMXO3D-9400HC-5SG72I", "LCMXO3D-9400HC-5BG256I",
      "LCMXO3D-4300HC-5SG72I",
    ],
  },
  {
    family: "iCE40 UltraPlus",
    parts: [
      "iCE40UP5K-SG48I", "iCE40UP5K-UWG30I",
      "iCE40UP3K-SG48I",
    ],
  },
];

export const DIAMOND_DEVICES: DeviceFamily[] = [
  {
    family: "ECP5",
    parts: [
      "LFE5U-85F-6BG381I", "LFE5U-85F-6BG381C", "LFE5U-85F-7BG381I",
      "LFE5U-45F-6BG381I", "LFE5U-45F-6BG256I",
      "LFE5U-25F-6BG256I", "LFE5U-12F-6BG256I",
      "LFE5UM-85F-8BG381I", "LFE5UM-45F-8BG381I",
      "LFE5UM5G-85F-8BG381I", "LFE5UM5G-45F-8BG381I",
    ],
  },
  {
    family: "MachXO2",
    parts: [
      "LCMXO2-7000HE-4TG144I", "LCMXO2-7000HE-4TG144C",
      "LCMXO2-4000HE-4TG144I", "LCMXO2-2000HE-4TG100I",
      "LCMXO2-1200HE-4TG100I", "LCMXO2-640HE-4TG100I",
    ],
  },
  {
    family: "MachXO3LF",
    parts: [
      "LCMXO3LF-9400E-5BG256I", "LCMXO3LF-6900E-5BG256I",
      "LCMXO3LF-4300E-5BG256I", "LCMXO3LF-2100E-5SG72I",
    ],
  },
  {
    family: "LatticeXP2",
    parts: [
      "LFXP2-40E-7FN484I", "LFXP2-30E-7FN484I", "LFXP2-17E-7FN256I",
      "LFXP2-8E-5FN256I", "LFXP2-5E-5TN144I",
    ],
  },
];

export const QUARTUS_DEVICES: DeviceFamily[] = [
  {
    family: "Cyclone V",
    parts: [
      "5CSXFC6D6F31C6", "5CSEBA6U23I7", "5CEBA4F23C7",
      "5CEFA7F31I7", "5CEFA5F23C8", "5CEBA2F17C8",
      "5CSEMA5F31C6", "5CSXFC5D6F31C6",
    ],
  },
  {
    family: "Cyclone 10 LP",
    parts: [
      "10CL025YU256I7G", "10CL025YF256C8G", "10CL016YU256C8G",
      "10CL006YU256C8G", "10CL040YF484C8G",
    ],
  },
  {
    family: "Cyclone 10 GX",
    parts: [
      "10CX220YF780I5G", "10CX150YF672I5G", "10CX085YU484I5G",
    ],
  },
  {
    family: "MAX 10",
    parts: [
      "10M50DAF484C7G", "10M50SAE144I7G", "10M25SAE144C8G",
      "10M16SAU169C8G", "10M08SAE144C8G", "10M04SAE144C8G",
      "10M02SAE144C8G",
    ],
  },
  {
    family: "Arria 10",
    parts: [
      "10AX115S2F45I1SG", "10AX115N2F45I1SG",
      "10AS066N3F40I2SG", "10AS048H3F34I2SG",
    ],
  },
  {
    family: "Stratix 10",
    parts: [
      "1SG280LU3F50E2VG", "1SG280HU2F50E2VG",
      "1SX280LU3F50I2VG",
    ],
  },
  {
    family: "Agilex 7",
    parts: [
      "AGFB014R24B2E2V", "AGFB014R24A2E2V",
      "AGFB022R25A2E2VR0",
    ],
  },
];

export const VIVADO_DEVICES: DeviceFamily[] = [
  {
    family: "Artix-7",
    parts: [
      "xc7a35ticsg324-1L", "xc7a50tfgg484-1", "xc7a75tfgg484-1",
      "xc7a100tcsg324-1", "xc7a200tsbg484-1",
      "xc7a35tcpg236-1", "xc7a35tcsg324-1",
    ],
  },
  {
    family: "Kintex-7",
    parts: [
      "xc7k70tfbg484-1", "xc7k160tfbg484-1", "xc7k325tffg900-2",
      "xc7k410tffg900-2", "xc7k480tffg901-2",
    ],
  },
  {
    family: "Virtex-7",
    parts: [
      "xc7v585tffg1761-2", "xc7v2000tflg1925-1",
      "xc7vx330tffg1157-1", "xc7vx485tffg1761-2",
    ],
  },
  {
    family: "Spartan-7",
    parts: [
      "xc7s6cpga196-2", "xc7s15ftgb196-1", "xc7s25csga225-1",
      "xc7s50csga324-1", "xc7s75fgga484-2", "xc7s100fgga484-2",
    ],
  },
  {
    family: "Zynq-7000",
    parts: [
      "xc7z010clg400-1", "xc7z020clg400-1", "xc7z030sbg485-1",
      "xc7z045ffg900-2", "xc7z100ffg900-2",
    ],
  },
  {
    family: "Kintex UltraScale+",
    parts: [
      "xcku3p-ffva676-1-e", "xcku5p-ffvb676-2-e",
      "xcku9p-flga2104-2L-e", "xcku15p-ffve1517-2-e",
    ],
  },
  {
    family: "Virtex UltraScale+",
    parts: [
      "xcvu3p-ffvc1517-2-e", "xcvu5p-flvb2104-2-e",
      "xcvu9p-flga2104-2L-e", "xcvu13p-fhga2104-2-e",
    ],
  },
  {
    family: "Zynq UltraScale+",
    parts: [
      "xczu3eg-sbva484-1-e", "xczu7ev-ffvc1156-2-e",
      "xczu9eg-ffvb1156-2-e", "xczu15eg-ffvb1156-2-i",
    ],
  },
  {
    family: "Versal",
    parts: [
      "xcvm1802-vsva2197-2MP-e-S", "xcve2802-vsvh1760-2MP-e-S",
      "xcvp1202-vsva2785-2MHP-e-S",
    ],
  },
];

export const OSS_DEVICES: DeviceFamily[] = [
  {
    family: "ECP5 (LFE5U)",
    parts: [
      // 12k — speed 6,7,8 × packages
      "LFE5U-12F-6TQFP144", "LFE5U-12F-6BG256", "LFE5U-12F-6BG381",
      "LFE5U-12F-7TQFP144", "LFE5U-12F-7BG256", "LFE5U-12F-7BG381",
      "LFE5U-12F-8TQFP144", "LFE5U-12F-8BG256", "LFE5U-12F-8BG381",
      // 25k
      "LFE5U-25F-6TQFP144", "LFE5U-25F-6BG256", "LFE5U-25F-6BG381", "LFE5U-25F-6BG554",
      "LFE5U-25F-7TQFP144", "LFE5U-25F-7BG256", "LFE5U-25F-7BG381", "LFE5U-25F-7BG554",
      "LFE5U-25F-8TQFP144", "LFE5U-25F-8BG256", "LFE5U-25F-8BG381", "LFE5U-25F-8BG554",
      // 45k
      "LFE5U-45F-6TQFP144", "LFE5U-45F-6BG256", "LFE5U-45F-6BG381", "LFE5U-45F-6BG554",
      "LFE5U-45F-7TQFP144", "LFE5U-45F-7BG256", "LFE5U-45F-7BG381", "LFE5U-45F-7BG554",
      "LFE5U-45F-8TQFP144", "LFE5U-45F-8BG256", "LFE5U-45F-8BG381", "LFE5U-45F-8BG554",
      // 85k
      "LFE5U-85F-6BG285", "LFE5U-85F-6BG381", "LFE5U-85F-6BG554", "LFE5U-85F-6BG756",
      "LFE5U-85F-7BG285", "LFE5U-85F-7BG381", "LFE5U-85F-7BG554", "LFE5U-85F-7BG756",
      "LFE5U-85F-8BG285", "LFE5U-85F-8BG381", "LFE5U-85F-8BG554", "LFE5U-85F-8BG756",
    ],
  },
  {
    family: "ECP5-5G (LFE5UM)",
    parts: [
      // UM 25k
      "LFE5UM-25F-6BG256", "LFE5UM-25F-6BG381",
      "LFE5UM-25F-7BG256", "LFE5UM-25F-7BG381",
      "LFE5UM-25F-8BG256", "LFE5UM-25F-8BG381",
      // UM 45k
      "LFE5UM-45F-6BG256", "LFE5UM-45F-6BG381", "LFE5UM-45F-6BG554",
      "LFE5UM-45F-7BG256", "LFE5UM-45F-7BG381", "LFE5UM-45F-7BG554",
      "LFE5UM-45F-8BG256", "LFE5UM-45F-8BG381", "LFE5UM-45F-8BG554",
      // UM 85k
      "LFE5UM-85F-6BG285", "LFE5UM-85F-6BG381", "LFE5UM-85F-6BG554", "LFE5UM-85F-6BG756",
      "LFE5UM-85F-7BG285", "LFE5UM-85F-7BG381", "LFE5UM-85F-7BG554", "LFE5UM-85F-7BG756",
      "LFE5UM-85F-8BG285", "LFE5UM-85F-8BG381", "LFE5UM-85F-8BG554", "LFE5UM-85F-8BG756",
    ],
  },
  {
    family: "ECP5-5G (LFE5UM5G)",
    parts: [
      // UM5G 25k
      "LFE5UM5G-25F-6BG256", "LFE5UM5G-25F-6BG381",
      "LFE5UM5G-25F-7BG256", "LFE5UM5G-25F-7BG381",
      "LFE5UM5G-25F-8BG256", "LFE5UM5G-25F-8BG381",
      // UM5G 45k
      "LFE5UM5G-45F-6BG256", "LFE5UM5G-45F-6BG381", "LFE5UM5G-45F-6BG554",
      "LFE5UM5G-45F-7BG256", "LFE5UM5G-45F-7BG381", "LFE5UM5G-45F-7BG554",
      "LFE5UM5G-45F-8BG256", "LFE5UM5G-45F-8BG381", "LFE5UM5G-45F-8BG554",
      // UM5G 85k
      "LFE5UM5G-85F-6BG285", "LFE5UM5G-85F-6BG381", "LFE5UM5G-85F-6BG554", "LFE5UM5G-85F-6BG756",
      "LFE5UM5G-85F-7BG285", "LFE5UM5G-85F-7BG381", "LFE5UM5G-85F-7BG554", "LFE5UM5G-85F-7BG756",
      "LFE5UM5G-85F-8BG285", "LFE5UM5G-85F-8BG381", "LFE5UM5G-85F-8BG554", "LFE5UM5G-85F-8BG756",
    ],
  },
  {
    family: "iCE40 UltraPlus",
    parts: [
      "iCE40UP5K-SG48", "iCE40UP5K-UWG30",
      "iCE40UP3K-SG48", "iCE40UP3K-UWG30",
    ],
  },
  {
    family: "iCE40 LP",
    parts: [
      "iCE40LP8K-CM81", "iCE40LP8K-CM121", "iCE40LP8K-CM225",
      "iCE40LP4K-CM81", "iCE40LP4K-CM121",
      "iCE40LP1K-CM36", "iCE40LP1K-CM49", "iCE40LP1K-CM81", "iCE40LP1K-CM121",
      "iCE40LP384-CM36", "iCE40LP384-CM49",
    ],
  },
  {
    family: "iCE40 HX",
    parts: [
      "iCE40HX8K-BG121", "iCE40HX8K-CB132", "iCE40HX8K-CM225",
      "iCE40HX4K-BG121", "iCE40HX4K-CB132",
      "iCE40HX1K-VQ100", "iCE40HX1K-CB132", "iCE40HX1K-TQ144",
    ],
  },
  {
    family: "Gowin (apicula)",
    parts: [
      "GW1N-1-QFN48", "GW1N-4-QFN48", "GW1N-9-QFN88", "GW1N-9C-QFN88",
      "GW1NR-9-QFN88", "GW1NR-9C-QFN88",
      "GW2A-18-QFN88", "GW2A-55-PBGA484",
    ],
  },
  {
    family: "Nexus (experimental)",
    parts: [
      "LIFCL-17-BG256", "LIFCL-40-BG256", "LIFCL-40-BG400",
    ],
  },
];

// Map backend ID to device families
export const DEVICE_MAP: Record<string, DeviceFamily[]> = {
  radiant: RADIANT_DEVICES,
  diamond: DIAMOND_DEVICES,
  quartus: QUARTUS_DEVICES,
  vivado: VIVADO_DEVICES,
  oss: OSS_DEVICES,
};

// Flatten all parts for a backend into a searchable list
export function getAllParts(backendId: string): string[] {
  const families = DEVICE_MAP[backendId] ?? [];
  return families.flatMap((f) => f.parts);
}

// Validate a part number against known parts (case-insensitive partial match)
export function validatePart(backendId: string, part: string): { valid: boolean; match?: string; family?: string } {
  const families = DEVICE_MAP[backendId] ?? [];
  const lower = part.toLowerCase();
  for (const f of families) {
    for (const p of f.parts) {
      if (p.toLowerCase() === lower) return { valid: true, match: p, family: f.family };
    }
  }
  // Try partial match
  for (const f of families) {
    for (const p of f.parts) {
      if (p.toLowerCase().includes(lower) || lower.includes(p.toLowerCase())) {
        return { valid: true, match: p, family: f.family };
      }
    }
  }
  return { valid: false };
}
