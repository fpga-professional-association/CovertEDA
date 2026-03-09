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
      "LFCPNX-100-9LFG672I", "LFCPNX-100-9LFG672C",
      "LFCPNX-100-8LFG672I", "LFCPNX-100-7LFG672I",
      "LFCPNX-100-9ASG256I", "LFCPNX-100-9BBG484I", "LFCPNX-100-9BFG484I",
      "LFCPNX-100-9CBG256I",
      "LFCPNX-50-9ASG256I", "LFCPNX-50-9BBG484I", "LFCPNX-50-9BFG484I",
      "LFCPNX-50-9CBG256I",
    ],
  },
  {
    family: "Certus-NX",
    parts: [
      "LIFCL-40-9CABGA400I", "LIFCL-40-9CABGA400C", "LIFCL-40-8CABGA400I",
      "LIFCL-40-7CABGA400I", "LIFCL-40-7CABGA400C",
      "LIFCL-40-9CABGA256I", "LIFCL-40-7CABGA256I",
      "LIFCL-40-9CSBGA289I", "LIFCL-40-7CSBGA289I",
      "LIFCL-40-9CSFBGA121I", "LIFCL-40-7CSFBGA121I",
      "LIFCL-40-9QFN72I", "LIFCL-40-7QFN72I",
      "LIFCL-17-9CABGA256I", "LIFCL-17-8CABGA256I", "LIFCL-17-7CABGA256I",
      "LIFCL-17-9CSFBGA121I", "LIFCL-17-7CSFBGA121I",
      "LIFCL-17-9QFN72I", "LIFCL-17-8QFN72I", "LIFCL-17-7QFN72I",
      "LIFCL-17-8WLCSP72I",
    ],
  },
  {
    family: "CrossLink-NX",
    parts: [
      "LIFCL-33U-9WLCSP84I", "LIFCL-33U-8WLCSP84I",
      "LIFCL-33U-9FCCSP104I", "LIFCL-33U-7FCCSP104I",
      "LIFCL-33-8WLCSP84I",
    ],
  },
  {
    family: "Avant-E",
    parts: [
      "LAV-AT-E30-9ASG410C", "LAV-AT-E30-9ASGA410C", "LAV-AT-E30-9CBG484C",
      "LAV-AT-E30B-9ASG410C", "LAV-AT-E30B-9ASGA410C", "LAV-AT-E30B-9CBG484C",
      "LAV-AT-E70-9CSG841C", "LAV-AT-E70-9LFG1156C", "LAV-AT-E70-9LFG676C",
      "LAV-AT-E70B-9LFG1156C", "LAV-AT-E70B-9LFG676C",
      "LAV-AT-E70ES1-9CSG841C", "LAV-AT-E70ES1-9LFG1156C", "LAV-AT-E70ES1-9LFG676C",
    ],
  },
  {
    family: "Avant-G",
    parts: [
      "LAV-AT-G70-9LFG1156C", "LAV-AT-G70-9LFG676C",
      "LAV-AT-G70ES-9LFG1156C", "LAV-AT-G70ES-9LFG676C",
    ],
  },
  {
    family: "Avant-X",
    parts: [
      "LAV-AT-X70-9LFG1156C", "LAV-AT-X70-9LFG676C",
      "LAV-AT-X70ES-9LFG1156C", "LAV-AT-X70ES-9LFG676C",
    ],
  },
  {
    family: "MachXO5-NX",
    parts: [
      "LFMXO5-25-7BBG256I", "LFMXO5-25-7BBG400I",
      "LFMXO5-35-7BBG256I", "LFMXO5-35-7BBG484I",
      "LFMXO5-35T-7BBG256I", "LFMXO5-35T-7BBG484I",
      "LFMXO5-55T-7BBG400I",
      "LFMXO5-55TD-7BBG400I", "LFMXO5-55TDQ-7BBG400I",
      "LFMXO5-65-7BBG256I", "LFMXO5-65-7BBG484I",
      "LFMXO5-65T-7BBG256I", "LFMXO5-65T-7BBG484I",
      "LFMXO5-100T-7BBG400I",
      "LFMXO5-15D-7BBG256I", "LFMXO5-15D-7BBG400I",
    ],
  },
  {
    family: "MachXO4",
    parts: [
      "LFMXO4-010HC-5TSG100I", "LFMXO4-010HC-5TSG144I", "LFMXO4-010HC-5BSG132I",
      "LFMXO4-010HE-5TSG100I", "LFMXO4-010HE-5TSG144I", "LFMXO4-010HE-5BSG132I",
      "LFMXO4-015HC-5BBG256I", "LFMXO4-015HC-5BFG256I", "LFMXO4-015HC-5BSG132I",
      "LFMXO4-015HC-5TSG100I", "LFMXO4-015HC-5TSG144I",
      "LFMXO4-015HE-5BBG256I", "LFMXO4-015HE-5UUG36I",
      "LFMXO4-025HC-5BBG256I", "LFMXO4-025HC-5BFG256I", "LFMXO4-025HC-5BSG132I",
      "LFMXO4-025HE-5BBG256I", "LFMXO4-025HE-5UUG49I",
      "LFMXO4-050HC-5BBG256I", "LFMXO4-050HC-5BBG400I", "LFMXO4-050HC-5BSG132I",
      "LFMXO4-050HE-5BBG256I", "LFMXO4-050HE-5BBG400I", "LFMXO4-050HE-5UUG81I",
      "LFMXO4-080HC-5BBG256I", "LFMXO4-080HC-5BBG400I",
      "LFMXO4-080HE-5BBG256I", "LFMXO4-080HE-5BBG400I",
      "LFMXO4-110HC-5BBG256I", "LFMXO4-110HC-5BBG400I", "LFMXO4-110HC-5BBG484I",
      "LFMXO4-110HE-5BBG256I", "LFMXO4-110HE-5BBG400I", "LFMXO4-110HE-5BBG484I",
    ],
  },
  {
    family: "Certus-N2",
    parts: [
      "LFD2NX-9-7CABGA196I", "LFD2NX-9-7CSFBGA121I",
      "LFD2NX-17-7CABGA196I", "LFD2NX-17-7CSFBGA121I",
      "LFD2NX-15-7BBG400I", "LFD2NX-25-7BBG400I",
      "LFD2NX-28-7CABGA196I", "LFD2NX-28-7CABGA256I", "LFD2NX-28-7CSFBGA121I",
      "LFD2NX-35-7BBG484I",
      "LFD2NX-40-7CABGA196I", "LFD2NX-40-7CABGA256I", "LFD2NX-40-7CSFBGA121I",
      "LFD2NX-65-7BBG484I",
    ],
  },
  {
    family: "Nexus2",
    parts: [
      "LN2-CT-16-7ASGA410I", "LN2-CT-16-7CBG484I",
      "LN2-CT-20-7ASGA410I", "LN2-CT-20-7CBG484I",
      "LN2-MH-16-7CBG484I", "LN2-MH-20-7CBG484I",
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
    family: "MachXO3D",
    parts: [
      "LCMXO3D-9400HC-5SG72I", "LCMXO3D-9400HC-5BG256I",
      "LCMXO3D-4300HC-5SG72I", "LCMXO3D-4300HC-5BG256I",
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
// ── Device Info Parser ──
// Extracts pin count, logic size, speed grade, package, etc. from FPGA part numbers.

export interface DeviceInfo {
  pins: string;       // e.g. "400" or "—"
  logic: string;      // e.g. "40K LUTs" or "—"
  speed: string;      // e.g. "-9" or "C7"
  package: string;    // e.g. "CABGA400" or "F23"
  grade: string;      // e.g. "Industrial" or "Commercial"
}

// Package pin counts — common BGA/QFP package suffixes
const PKG_PINS: Record<string, string> = {
  // ── Lattice Radiant / Diamond ──
  "QFN72": "72", "WLCSP72": "72", "WLCSP84": "84", "FCCSP104": "104",
  "ASG256": "256", "BSG256": "256", "BBG256": "256", "BFG256": "256", "CBG256": "256",
  "CSG256": "256", "TSG100": "100", "TSG144": "144", "BSG132": "132",
  "UUG36": "36", "UUG49": "49", "UUG81": "81", "SFBGA121": "121", "CSFBGA121": "121",
  "MG121": "121",
  "SBGA289": "289", "CSBGA289": "289",
  "ASG410": "410", "ASGA410": "410",
  "BBG400": "400", "BFG400": "400", "CABGA400": "400", "CBG484": "484",
  "BBG484": "484", "BFG484": "484",
  "LFG672": "672", "LFG676": "676", "CSG841": "841", "LFG1156": "1156",
  "CABGA196": "196", "QFN48": "48",
  // Diamond ECP5 / ECP3 / MachXO / XP2
  "BG381": "381", "BG554": "554", "BG756": "756", "BG285": "285",
  "FN672": "672", "FN484": "484", "FN256": "256",
  "TG144": "144", "TG100": "100", "SG72": "72",
  "TQFP144": "144",
  // ── Quartus (Intel / Altera) ──
  "F17": "256", "F23": "484", "F27": "672", "F29": "780", "F31": "896",
  "F34": "1152", "F35": "1152", "M15": "484", "U15": "324", "U19": "484",
  "U23": "672", "F40": "1517",
  // Cyclone IV / 10 LP / MAX
  "E22": "144", "BF14": "169", "CF19": "324", "CF23": "484", "DF27": "672", "DF31": "896",
  "YU256": "256", "YF256": "256", "YU484": "484", "YF484": "484", "YF672": "672", "YF780": "780",
  "YU169": "169",
  "DAF484": "484", "SAE144": "144", "SAU169": "169",
  "ZE64": "64", "ZT100": "100", "ZT144": "144", "ZF256": "256",
  "T100": "100", "F324": "324",
  // Agilex / Stratix 10
  "BF54": "2304", "R24": "924", "R29": "1290", "R31": "1517", "BB32": "739",
  "AB17": "420",
  "F50": "2397", "F53": "2397", "F55": "2397", "F45": "1932",
  // ── Vivado (AMD / Xilinx) ──
  "CLG225": "225", "CLG400": "400", "CLG484": "484",
  "CSG324": "324", "CSG225": "225", "CSGA225": "225", "CSGA324": "324",
  "CPG236": "236", "CPGA196": "196",
  "FGG484": "484", "FBG484": "484", "FBG676": "676", "FBG900": "900",
  "FFG676": "676", "FFG900": "900", "FFG901": "901",
  "FFG1156": "1156", "FFG1157": "1157", "FFG1761": "1761",
  "FLG1155": "1155", "FLG1925": "1925", "FLG1926": "1926",
  "FFVB676": "676", "FFVA676": "676", "FFVE1517": "1517",
  "FFVC1517": "1517", "FLVB2104": "2104", "FLGA2104": "2104", "FHGA2104": "2104",
  "SBVA484": "484", "FFVC1156": "1156", "FFVB1156": "1156",
  "SBG484": "484", "SBG485": "485",
  "FTG196": "196", "FTGB196": "196", "FGGA484": "484",
  // Versal
  "VSVA2197": "2197", "VSVA2785": "2785", "VSVA3697": "3697",
  "VFVB1760": "1760", "VSVH1760": "1760",
  // ── OSS (iCE40 / Gowin / GateMate) ──
  "SG48": "48", "UWG30": "30",
  "CM81": "81", "CM121": "121", "CM225": "225", "CM36": "36", "CM49": "49",
  "CB132": "132", "VQ100": "100",
  "QFN88": "88", "PBGA484": "484",
  "BGA324": "324",
  // ── Achronix ACE ──
  "IC80": "80", "IC120": "120",
};

// Logic size keywords by family prefix
const LOGIC_SIZE: Record<string, Record<string, string>> = {
  // ── Lattice Radiant ──
  "LIFCL": { "40": "40K LUTs", "17": "17K LUTs", "33": "33K LUTs" },  // Certus-NX + CrossLink-NX
  "LFCPNX": { "100": "100K LUTs", "50": "50K LUTs" },  // CertusPro-NX
  "LFMXO5": { "15": "15K LUTs", "25": "25K LUTs", "35": "35K LUTs", "55": "55K LUTs", "65": "65K LUTs", "100": "100K LUTs" },
  "LFMXO4": { "010": "10K LUTs", "015": "15K LUTs", "025": "25K LUTs", "050": "50K LUTs", "080": "80K LUTs", "110": "110K LUTs" },
  "LAV-AT-E": { "30": "30K LUTs", "70": "70K LUTs" },  // Avant-E
  "LAV-AT-G": { "70": "70K LUTs" },  // Avant-G
  "LAV-AT-X": { "70": "70K LUTs" },  // Avant-X
  "LFD2NX": { "9": "9K LUTs", "17": "17K LUTs", "15": "15K LUTs", "25": "25K LUTs", "28": "28K LUTs", "35": "35K LUTs", "40": "40K LUTs", "65": "65K LUTs" },  // Certus-N2
  "LN2-CT": { "16": "16K LUTs", "20": "20K LUTs" },  // Nexus2 CT
  "LN2-MH": { "16": "16K LUTs", "20": "20K LUTs" },  // Nexus2 MH
  "ICE40UP": { "5K": "5K LUTs", "3K": "3K LUTs" },  // iCE40 UltraPlus (Radiant)
  // ── Lattice Diamond ──
  "LFE5U": { "85": "85K LUTs", "45": "45K LUTs", "25": "25K LUTs", "12": "12K LUTs" },  // ECP5
  "LFE5UM5G": { "85": "85K LUTs", "45": "45K LUTs", "25": "25K LUTs" },  // ECP5-5G (must be before LFE5UM)
  "LFE5UM": { "85": "85K LUTs", "45": "45K LUTs", "25": "25K LUTs" },  // ECP5-5G
  "LFE3": { "150": "150K LUTs", "95": "95K LUTs", "70": "70K LUTs", "35": "35K LUTs", "17": "17K LUTs" },  // ECP3
  "LCMXO3D": { "9400": "9.4K LUTs", "4300": "4.3K LUTs" },  // MachXO3D (must be before LCMXO3L)
  "LCMXO3LF": { "9400": "9.4K LUTs", "6900": "6.9K LUTs", "4300": "4.3K LUTs", "2100": "2.1K LUTs" },  // MachXO3LF
  "LCMXO3L": { "9400": "9.4K LUTs", "6900": "6.9K LUTs", "4300": "4.3K LUTs", "2100": "2.1K LUTs" },  // MachXO3L
  "LCMXO2": { "7000": "7K LUTs", "4000": "4K LUTs", "2000": "2K LUTs", "1200": "1.2K LUTs", "640": "640 LUTs" },  // MachXO2
  "LFXP2": { "40": "40K LUTs", "30": "30K LUTs", "17": "17K LUTs", "8": "8K LUTs", "5": "5K LUTs" },  // LatticeXP2
  // ── Intel Quartus (Standard/Lite) ──
  "5CE": { "A2": "25K LEs", "A4": "49K LEs", "A5": "77K LEs", "A7": "150K LEs", "A9": "301K LEs" },  // Cyclone V E
  "5CS": { "A2": "25K LEs", "A4": "49K LEs", "A5": "77K LEs", "A6": "110K LEs", "A7": "150K LEs", "A9": "301K LEs" },  // Cyclone V SX
  "5CG": { "A3": "36K LEs", "A5": "77K LEs", "A7": "150K LEs", "A9": "301K LEs" },  // Cyclone V GX
  "EP4CE": { "6": "6K LEs", "10": "10K LEs", "15": "15K LEs", "22": "22K LEs", "30": "30K LEs", "40": "40K LEs", "55": "55K LEs", "75": "75K LEs", "115": "115K LEs" },  // Cyclone IV E
  "EP4CGX": { "15": "15K LEs", "22": "22K LEs", "30": "30K LEs", "50": "50K LEs", "75": "75K LEs", "110": "110K LEs", "150": "150K LEs" },  // Cyclone IV GX
  "10CL": { "006": "6K LEs", "016": "16K LEs", "025": "25K LEs", "040": "40K LEs" },  // Cyclone 10 LP
  "10CX": { "085": "85K LEs", "150": "150K LEs", "220": "220K LEs" },  // Cyclone 10 GX
  "10M": { "02": "2K LEs", "04": "4K LEs", "08": "8K LEs", "16": "16K LEs", "25": "25K LEs", "50": "50K LEs" },  // MAX 10
  "5M": { "40": "40 LEs", "80": "80 LEs", "160": "160 LEs", "240": "240 LEs", "570": "570 LEs", "1270": "1.3K LEs", "2210": "2.2K LEs" },  // MAX V
  "EPM": { "240": "240 LEs", "570": "570 LEs", "1270": "1.3K LEs", "2210": "2.2K LEs" },  // MAX II
  "5AG": { "FB": "—", "TF": "—", "XM": "—", "ZM": "—" },  // Arria V (complex numbering)
  "10A": { "X115": "1.15M LEs", "X090": "900K LEs", "X066": "660K LEs", "X048": "480K LEs", "S066": "660K LEs", "S048": "480K LEs" },  // Arria 10
  // ── Intel Quartus Pro ──
  "A9PD": { "120": "120K LEs" },  // Agilex 9
  "AGF": { "B014": "1.4M LEs", "B022": "2.2M LEs" },  // Agilex 7 F-series
  "AGI": { "B027": "2.7M LEs" },  // Agilex 7 I-series
  "A5ED": { "065": "650K LEs" },  // Agilex 5 D-series
  "A5EC": { "030": "300K LEs", "020": "200K LEs" },  // Agilex 5 C-series
  "1SG": { "280": "2.8M LEs" },  // Stratix 10 GX
  "1SX": { "280": "2.8M LEs" },  // Stratix 10 SX
  "1SD": { "280": "2.8M LEs", "110": "1.1M LEs" },  // Stratix 10 DX
  "1SM": { "21": "2.1M LEs" },  // Stratix 10 MX
  "1ST": { "280": "2.8M LEs", "110": "1.1M LEs" },  // Stratix 10 TX
  // ── AMD Vivado (Xilinx) ──
  "XC7A": { "35": "33K LCs", "50": "52K LCs", "75": "76K LCs", "100": "101K LCs", "200": "215K LCs" },  // Artix-7
  "XC7K": { "70": "65K LCs", "160": "162K LCs", "325": "326K LCs", "410": "407K LCs", "480": "478K LCs" },  // Kintex-7
  "XC7V": { "585": "585K LCs", "2000": "2M LCs", "X330": "330K LCs", "X485": "485K LCs" },  // Virtex-7
  "XC7S": { "6": "6K LCs", "15": "13K LCs", "25": "23K LCs", "50": "52K LCs", "75": "76K LCs", "100": "102K LCs" },  // Spartan-7
  "XC7Z": { "010": "28K LCs", "015": "46K LCs", "020": "85K LCs", "030": "125K LCs", "045": "218K LCs", "100": "444K LCs" },  // Zynq-7000
  "XCAU": { "10P": "10K LUTs", "15P": "15K LUTs", "20P": "20K LUTs", "25P": "25K LUTs" },  // Artix UltraScale+
  "XCKU": { "3P": "163K LUTs", "5P": "256K LUTs", "9P": "520K LUTs", "11P": "663K LUTs", "13P": "864K LUTs", "15P": "1.045M LUTs" },  // Kintex UltraScale+
  "XCVU": { "3P": "394K LUTs", "5P": "671K LUTs", "7P": "864K LUTs", "9P": "1.18M LUTs", "11P": "1.31M LUTs", "13P": "1.73M LUTs" },  // Virtex UltraScale+
  "XCZU": { "3EG": "71K LUTs", "7EV": "230K LUTs", "9EG": "600K LUTs", "11EG": "600K LUTs", "15EG": "747K LUTs" },  // Zynq UltraScale+ (with suffix variants)
  "XCVC": { "1502": "899K LUTs", "1702": "1.3M LUTs", "1902": "1.97M LUTs" },  // Versal AI Core
  "XCVM": { "1802": "1.97M LUTs", "2302": "2.49M LUTs", "2502": "2.97M LUTs" },  // Versal Prime
  "XCVH": { "1522": "899K LUTs", "1742": "1.3M LUTs" },  // Versal HBM
  "XCVE": { "2802": "2.97M LUTs" },  // Versal Engineering
  "XCVP": { "1202": "899K LUTs" },  // Versal Premium
  // ── OSS (iCE40 / Gowin / GateMate) ── (ICE40UP already in Radiant section)
  "ICE40LP": { "8K": "8K LUTs", "4K": "4K LUTs", "1K": "1K LUTs", "384": "384 LUTs" },  // iCE40 LP
  "ICE40HX": { "8K": "8K LUTs", "4K": "4K LUTs", "1K": "1K LUTs" },  // iCE40 HX
  "GW1N": { "1": "1K LUTs", "4": "4K LUTs", "9": "9K LUTs" },  // Gowin GW1N
  "GW1NR": { "9": "9K LUTs" },  // Gowin GW1NR (must be before GW1N in matching)
  "GW2A": { "18": "18K LUTs", "55": "55K LUTs" },  // Gowin GW2A
  "CCGM1A": { "1": "20K LUTs", "2": "40K LUTs", "4": "80K LUTs", "8": "160K LUTs", "16": "320K LUTs" },  // GateMate
  // ── Achronix ACE ──
  "AC7T": { "1500": "1.5M LUTs", "800": "800K LUTs", "850": "850K LUTs" },  // Speedster7t
  // ── Microchip Libero ──
  "MPF": { "100": "100K LEs", "200": "200K LEs", "300": "300K LEs", "500": "500K LEs" },  // PolarFire
  "MPFS": { "025": "25K LEs", "095": "95K LEs", "160": "160K LEs", "250": "250K LEs", "460": "460K LEs" },  // PolarFire SoC
  "M2S": { "010": "12K LEs", "025": "27K LEs", "050": "56K LEs", "090": "92K LEs" },  // SmartFusion2
  "M2GL": { "010": "12K LEs", "025": "27K LEs", "050": "56K LEs", "090": "92K LEs" },  // IGLOO2
  "RT4G": { "150": "150K LEs" },  // RTG4
};

export function parsePartInfo(part: string): DeviceInfo {
  const result: DeviceInfo = { pins: "—", logic: "—", speed: "—", package: "—", grade: "—" };
  const upper = part.toUpperCase();

  // ── Grade ──
  // Lattice/Xilinx: last char I/C/A/M
  // Intel: trailing letter before G suffix (e.g., 5CEBA4F23C7 → C=commercial, I=industrial)
  // Some Intel parts end with ...I1SG, ...E2VG — parse deeper
  const lastChar = upper.charAt(upper.length - 1);
  if (lastChar === "I") result.grade = "Industrial";
  else if (lastChar === "C") result.grade = "Commercial";
  else if (lastChar === "A") result.grade = "Automotive";
  else if (lastChar === "M") result.grade = "Military";
  else if (lastChar === "L") result.grade = "Low-power";
  else if (lastChar === "G") {
    // Intel/Altera — look for I or C before the trailing speed+G
    const m = upper.match(/([ICE])[\dSL]+[VG]*$/);
    if (m) {
      if (m[1] === "I") result.grade = "Industrial";
      else if (m[1] === "C") result.grade = "Commercial";
      else if (m[1] === "E") result.grade = "Extended";
    }
  } else if (lastChar === "S") {
    // Versal parts end with -S
    result.grade = "Standard";
  } else if (lastChar === "V") {
    // Agilex/Stratix often end with V
    const m2 = upper.match(/([IE])\d+V[GR]*\d*$/);
    if (m2) {
      if (m2[1] === "I") result.grade = "Industrial";
      else if (m2[1] === "E") result.grade = "Extended";
    }
  }
  // Xilinx lowercase with -e suffix
  if (part.endsWith("-e") || part.endsWith("-i")) {
    result.grade = part.endsWith("-e") ? "Extended" : "Industrial";
  }

  // ── Package & Pin Count ──
  // Sort PKG_PINS keys longest-first for greedy matching
  const sortedPkgs = Object.entries(PKG_PINS).sort((a, b) => b[0].length - a[0].length);
  for (const [pkg, pins] of sortedPkgs) {
    if (upper.includes(pkg.toUpperCase())) {
      result.package = pkg;
      result.pins = pins;
      break;
    }
  }

  // ── Speed Grade ──
  // Lattice: -N{letter} pattern (e.g., -9CABGA400I → speed -9)
  const latticeSpeed = part.match(/-(\d+)[A-Z]/);
  if (latticeSpeed) {
    result.speed = `-${latticeSpeed[1]}`;
  } else {
    // Intel Cyclone V / MAX V: trailing C/I digit (e.g., ...C7, ...C5)
    const intelSpeed = upper.match(/([CI])(\d)$/);
    if (intelSpeed) {
      result.speed = `${intelSpeed[1]}${intelSpeed[2]}`;
    } else {
      // Intel with G suffix: ...C7G, ...I5G
      const intelSpeedG = upper.match(/([CI])(\d)[GL]$/);
      if (intelSpeedG) {
        result.speed = `${intelSpeedG[1]}${intelSpeedG[2]}`;
      } else {
        // Xilinx: trailing -1, -2, -1L, -2-e etc.
        const xilinxSpeed = part.match(/-(\d+[L]?)(?:-[eig])?$/);
        if (xilinxSpeed) {
          result.speed = `-${xilinxSpeed[1]}`;
        } else {
          // Xilinx Versal: -2MP
          const versalSpeed = part.match(/-(\d+MP)(?:-[eig])?/);
          if (versalSpeed) result.speed = `-${versalSpeed[1]}`;
        }
      }
    }
  }

  // ── Logic Size ──
  // Sort prefixes longest-first so e.g. LFE5UM5G matches before LFE5UM
  const sortedPrefixes = Object.entries(LOGIC_SIZE).sort((a, b) => b[0].length - a[0].length);
  for (const [prefix, sizes] of sortedPrefixes) {
    if (upper.startsWith(prefix.toUpperCase())) {
      const afterPrefix = upper.slice(prefix.length).replace(/^[-_]/, "");
      // Sort size keys longest-first
      const sortedSizes = Object.entries(sizes).sort((a, b) => b[0].length - a[0].length);
      for (const [sizeKey, sizeLabel] of sortedSizes) {
        if (afterPrefix.startsWith(sizeKey.toUpperCase())) {
          result.logic = sizeLabel;
          break;
        }
      }
      break;
    }
  }

  // ── Special: Microchip Libero (no package in name) ──
  if (upper.startsWith("MPF") || upper.startsWith("M2S") || upper.startsWith("M2GL") || upper.startsWith("RT4G")) {
    result.package = "—";
    result.pins = "—";
    result.speed = "—";
    // Grade from T suffix: T = standard, TS = secure
    if (upper.endsWith("T")) result.grade = "Standard";
    else if (upper.endsWith("TS")) result.grade = "Secure";
  }

  return result;
}

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
