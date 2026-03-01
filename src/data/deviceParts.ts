// Known FPGA devices per backend — used for part selection dropdown
// Organized by family within each backend

export interface DeviceFamily {
  family: string;
  parts: string[];
  editions?: string[];  // e.g., ["pro"] or ["standard"] or ["pro", "standard"]
}

export const RADIANT_DEVICES: DeviceFamily[] = [
  {
    family: "CertusPro-NX",
    parts: [
      "LFCPNX-100-9LFG672I", "LFCPNX-100-9LFG672C", "LFCPNX-100-7LFG672I",
      "LFCPNX-100-7LFG256C",
      "LFCPNX-50-9ASG400I", "LFCPNX-50-9BBG484I",
    ],
  },
  {
    family: "Certus-NX",
    parts: [
      "LIFCL-40-9BG400I", "LIFCL-40-9BG400C", "LIFCL-40-7BG400I", "LIFCL-40-7BG400C",
      "LIFCL-40-8BG400C", "LIFCL-40-9BG256C",
      "LIFCL-40-9SG72I", "LIFCL-40-7SG72I",
      "LIFCL-17-8SG72I", "LIFCL-17-8BG256I", "LIFCL-17-7MG121I", "LIFCL-17-7BG256I",
    ],
  },
  {
    family: "CrossLink-NX",
    parts: [
      "LIFCL-33U-8SG72I", "LIFCL-33U-8BG256I",
      "LIFCL-33U-7MG121C", "LIFCL-33U-7BG256C",
      "LIFCL-17U-8SG72I",
    ],
  },
  {
    family: "Avant",
    parts: [
      "LFAX-100-9BBG784C", "LFAX-50-9BBG484C", "LFAX-17-7BBG484I",
    ],
  },
  {
    family: "MachXO5-NX",
    parts: [
      "LMXO5-50-7BG256I", "LMXO5-25-6MG121I",
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
    family: "ECP3",
    parts: [
      "LFE3-150EA-8FN672C", "LFE3-95EA-8FN672C", "LFE3-70EA-8FN484C",
      "LFE3-35EA-8FN256C", "LFE3-17EA-8FN256C",
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
    family: "MachXO3L",
    parts: [
      "LCMXO3L-9400E-5BG256C", "LCMXO3L-6900E-5BG256C",
      "LCMXO3L-4300E-5BG256C", "LCMXO3L-2100E-5SG72C",
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

// Quartus Prime Standard/Lite — Cyclone, MAX, Arria families
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
    family: "Cyclone IV E",
    parts: [
      "EP4CE6E22C8", "EP4CE10E22C8", "EP4CE15F17C8",
      "EP4CE22F17C6", "EP4CE30F23C7", "EP4CE40F23C6",
      "EP4CE55F23C7", "EP4CE75F23C6", "EP4CE115F29C7",
    ],
  },
  {
    family: "Cyclone IV GX",
    parts: [
      "EP4CGX15BF14C6", "EP4CGX22CF19C6", "EP4CGX30CF23C6",
      "EP4CGX50CF23C6", "EP4CGX75DF27C6", "EP4CGX110DF27C6",
      "EP4CGX150DF31C7",
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
    family: "MAX V",
    parts: [
      "5M40ZE64C5", "5M80ZE64C5", "5M160ZE64C5",
      "5M240ZT100C5", "5M570ZT100C5",
      "5M1270ZT144C5", "5M2210ZF256C5",
    ],
  },
  {
    family: "MAX II",
    parts: [
      "EPM240T100C5", "EPM570T100C5", "EPM1270T144C5",
      "EPM2210F324C3",
    ],
  },
  {
    family: "Arria V",
    parts: [
      "5AGXFB3H4F35C5", "5AGTFD7K3F40I3", "5AGXMA3D4F27C5",
    ],
  },
  {
    family: "Arria V GZ",
    parts: [
      "5AGZME1H2F35I3L", "5AGZME3H2F35I3L", "5AGZME5K2F40I3L",
      "5AGZME7K3F40I3",
    ],
  },
  {
    family: "Arria 10",
    parts: [
      "10AX115S2F45I1SG", "10AX115N2F45I1SG",
      "10AS066N3F40I2SG", "10AS048H3F34I2SG",
    ],
  },
];

// Quartus Prime Pro — Stratix 10, Agilex, Arria 10, Cyclone 10 GX
export const QUARTUS_PRO_DEVICES: DeviceFamily[] = [
  {
    family: "Agilex 9",
    parts: [
      "A9PD120BF54I1VG",
    ],
  },
  {
    family: "Agilex 7",
    parts: [
      "AGFB014R24B2E2V", "AGFB014R24A2E2V",
      "AGFB022R25A2E2VR0",
      "AGIB027R31B1E1VR0", "AGIB027R29A2E2VR0",
    ],
  },
  {
    family: "Agilex 5",
    parts: [
      "A5ED065BB32AE5SR0", "A5ED065BB32AE4SR0",
      "A5EC030BB17AE5SR0", "A5EC020AB17AE4SR0",
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
    family: "Stratix 10 DX",
    parts: [
      "1SD280PT2F55E1VG", "1SD110PT2F55E1VG",
    ],
  },
  {
    family: "Stratix 10 MX",
    parts: [
      "1SM21BHU2F53E1VG", "1SM21CHU2F53E1VG",
    ],
  },
  {
    family: "Stratix 10 TX",
    parts: [
      "1ST280LH3F55E1VG", "1ST110EH3F55E1VG",
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
    family: "Cyclone 10 GX",
    parts: [
      "10CX220YF780I5G", "10CX150YF672I5G", "10CX085YU484I5G",
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
    family: "Artix UltraScale+",
    parts: [
      "xcau10p-ffvb676-1-e", "xcau15p-ffvb676-2-e",
      "xcau20p-ffvb676-2-e", "xcau25p-ffvb676-2-e",
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
    family: "Versal AI Core",
    parts: [
      "xcvc1502-vsva2197-2MP-e-S", "xcvc1702-vsva2197-2MP-e-S",
      "xcvc1902-vsva2197-2MP-e-S",
    ],
  },
  {
    family: "Versal Prime",
    parts: [
      "xcvm1802-vsva2197-2MP-e-S", "xcvm2302-vsva2197-2MP-e-S",
      "xcvm2502-vfvb1760-2MP-e-S",
    ],
  },
  {
    family: "Versal HBM",
    parts: [
      "xcvh1522-vsva3697-2MP-e-S", "xcvh1742-vsva3697-2MP-e-S",
    ],
  },
  {
    family: "Versal (General)",
    parts: [
      "xcve2802-vsvh1760-2MP-e-S",
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
  {
    family: "GateMate (experimental)",
    parts: [
      "CCGM1A1-QFN48", "CCGM1A2-QFN48", "CCGM1A4-BGA324", "CCGM1A8-BGA324", "CCGM1A16-BGA324",
    ],
  },
];

// Achronix ACE — Speedster7t FPGAs
export const ACE_DEVICES: DeviceFamily[] = [
  {
    family: "Speedster7t",
    parts: [
      "AC7t1500ES0HIIC80", "AC7t1500ES0HIIC120",
      "AC7t800ES0HIIC80", "AC7t850ES0HIIC80",
    ],
  },
];

// Microchip Libero SoC — PolarFire, SmartFusion2, IGLOO2, RTG4
export const LIBERO_DEVICE_FAMILIES: DeviceFamily[] = [
  {
    family: "PolarFire",
    parts: ["MPF100T", "MPF200T", "MPF300T", "MPF500T"],
  },
  {
    family: "PolarFire SoC",
    parts: ["MPFS025T", "MPFS095T", "MPFS160T", "MPFS250T", "MPFS460T"],
  },
  {
    family: "SmartFusion2",
    parts: ["M2S010", "M2S025", "M2S050", "M2S090"],
  },
  {
    family: "IGLOO2",
    parts: ["M2GL010", "M2GL025", "M2GL050", "M2GL090"],
  },
  {
    family: "RTG4",
    parts: ["RT4G150"],
  },
];

// Map backend ID to device families
export const DEVICE_MAP: Record<string, DeviceFamily[]> = {
  radiant: RADIANT_DEVICES,
  diamond: DIAMOND_DEVICES,
  quartus: QUARTUS_DEVICES,
  quartus_pro: QUARTUS_PRO_DEVICES,
  vivado: VIVADO_DEVICES,
  oss: OSS_DEVICES,
  opensource: OSS_DEVICES,
  ace: ACE_DEVICES,
  libero: LIBERO_DEVICE_FAMILIES,
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
