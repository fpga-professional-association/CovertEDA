import { useState, useCallback, useRef, useEffect, memo } from "react";
import { RuntimeBackend, PipelineStage, LogEntry } from "../types";
import { useTheme } from "../context/ThemeContext";
import { Badge, Btn, Select } from "./shared";
import { Zap, Check } from "./Icons";

type StageOption = {
  key: string;
  label: string;
  type: "text" | "select" | "boolean";
  choices?: string[];
  tier: "primary" | "advanced";
  /** Tooltip shown on hover over the option label */
  tooltip?: string;
  /** Default value — used for color-coding (non-default = accent color) */
  defaultValue?: string;
};

const RADIANT_STAGE_OPTIONS: Record<string, StageOption[]> = {
  synth: [
    { key: "synth_engine", label: "Synth Engine", type: "select", choices: ["LSE", "Synplify Pro"], tier: "primary" },
    { key: "syn_frequency", label: "Frequency (MHz)", type: "text", tier: "primary" },
    { key: "syn_optimization", label: "Optimization Goal", type: "select", choices: ["Timing", "Balanced", "Area"], tier: "primary" },
    { key: "syn_fsm_encoding", label: "FSM Encoding", type: "select", choices: ["Auto", "One-Hot", "Binary", "Gray", "Sequential"], tier: "advanced" },
    { key: "syn_resource_sharing", label: "Resource Sharing", type: "boolean", tier: "advanced" },
    { key: "syn_max_fanout", label: "Max Fanout", type: "text", tier: "advanced" },
    { key: "syn_retiming", label: "Retiming", type: "boolean", tier: "advanced" },
    { key: "syn_infer_dsp", label: "Infer DSP", type: "boolean", tier: "advanced" },
    { key: "syn_infer_ram", label: "Infer RAM", type: "boolean", tier: "advanced" },
    { key: "syn_keep_hierarchy", label: "Keep Hierarchy", type: "select", choices: ["Auto", "Yes", "No"], tier: "advanced" },
    { key: "syn_top_module", label: "Top Module", type: "text", tier: "advanced" },
    { key: "syn_vhdl_std", label: "VHDL Standard", type: "select", choices: ["VHDL-93", "VHDL-2008"], tier: "advanced" },
    { key: "syn_vlog_std", label: "Verilog Standard", type: "select", choices: ["Verilog-2001", "SystemVerilog-2005", "SystemVerilog-2012"], tier: "advanced" },
  ],
  map: [
    { key: "map_effort", label: "Map Effort", type: "select", choices: ["Standard", "High"], tier: "primary" },
    { key: "map_io_insertion", label: "I/O Insertion", type: "boolean", tier: "primary" },
    { key: "map_pack_logic", label: "Pack Logic", type: "boolean", tier: "advanced" },
    { key: "map_area_opt", label: "Optimize for Area", type: "boolean", tier: "advanced" },
    { key: "map_freq_lock", label: "Frequency Constraint Lock", type: "boolean", tier: "advanced" },
    { key: "map_logic_opt", label: "Logic Optimization", type: "boolean", tier: "advanced" },
    { key: "map_infer_gsr", label: "Infer GSR", type: "select", choices: ["Auto", "Yes", "No"], tier: "advanced" },
  ],
  par: [
    { key: "par_effort", label: "PAR Effort", type: "select", choices: ["Standard", "High"], tier: "primary" },
    { key: "par_path_based", label: "Path-Based Routing", type: "select", choices: ["OFF", "ON"], tier: "primary" },
    { key: "par_timing_driven", label: "Timing-Driven", type: "boolean", tier: "primary" },
    { key: "par_seed", label: "Placement Seed", type: "text", tier: "advanced" },
    { key: "par_iterations", label: "Max Iterations", type: "text", tier: "advanced" },
    { key: "par_start_temp", label: "Start Temperature", type: "text", tier: "advanced" },
    { key: "par_stop_temp", label: "Stop Temperature", type: "text", tier: "advanced" },
    { key: "par_multipass", label: "Multi-Pass", type: "boolean", tier: "advanced" },
    { key: "par_run_time", label: "Run Time Limit (min)", type: "text", tier: "advanced" },
    { key: "par_exp_routing", label: "Explore Best Routing", type: "boolean", tier: "advanced" },
  ],
  bitgen: [
    { key: "bit_compress", label: "Compress Bitstream", type: "boolean", tier: "primary" },
    { key: "bit_spi_mode", label: "SPI Mode", type: "select", choices: ["Disabled", "1x", "2x", "4x"], tier: "primary" },
    { key: "bit_jtag", label: "JTAG Config", type: "boolean", tier: "advanced" },
    { key: "bit_security", label: "Security Bit", type: "boolean", tier: "advanced" },
    { key: "bit_done_pin", label: "DONE Pin", type: "select", choices: ["Default", "Enable", "Disable"], tier: "advanced" },
    { key: "bit_readback", label: "Readback", type: "boolean", tier: "advanced" },
    { key: "bit_bg_prog", label: "Background Programming", type: "boolean", tier: "advanced" },
    { key: "bit_sed_check", label: "SED Check", type: "boolean", tier: "advanced" },
  ],
};

const QUARTUS_STAGE_OPTIONS: Record<string, StageOption[]> = {
  synth: [
    { key: "syn_optimization_mode", label: "Optimization Mode", type: "select", choices: ["Balanced", "High Performance", "High Power Effort", "Aggressive Area", "Aggressive Performance"], tier: "primary" },
    { key: "syn_timing_driven", label: "Timing-Driven Synth", type: "boolean", tier: "primary" },
    { key: "syn_auto_ram", label: "Auto RAM Inference", type: "boolean", tier: "advanced" },
    { key: "syn_auto_dsp", label: "Auto DSP Inference", type: "boolean", tier: "advanced" },
    { key: "syn_auto_rom", label: "Auto ROM Inference", type: "boolean", tier: "advanced" },
    { key: "syn_auto_shift_reg", label: "Auto Shift Register", type: "boolean", tier: "advanced" },
    { key: "syn_retiming", label: "Retiming", type: "boolean", tier: "advanced" },
    { key: "syn_reg_duplication", label: "Register Duplication", type: "boolean", tier: "advanced" },
    { key: "syn_safe_fsm", label: "Safe State Machine", type: "boolean", tier: "advanced" },
    { key: "syn_max_fanout", label: "Max Fan-Out", type: "text", tier: "advanced" },
    { key: "syn_mux_restructure", label: "Restructure Multiplexers", type: "select", choices: ["Auto", "On", "Off"], tier: "advanced" },
    { key: "syn_opt_technique", label: "Optimization Technique", type: "select", choices: ["Speed", "Area", "Balanced"], tier: "advanced" },
    { key: "syn_allow_shift_merge", label: "Allow Shift Register Merging", type: "boolean", tier: "advanced" },
  ],
  fit: [
    { key: "fit_effort", label: "Fitter Effort", type: "select", choices: ["Standard Fit", "Auto Fit"], tier: "primary" },
    { key: "fit_seed", label: "Fitter Seed", type: "text", tier: "primary" },
    { key: "fit_early_timing", label: "Early Timing Estimate", type: "boolean", tier: "advanced" },
    { key: "fit_io_reg_pack", label: "I/O Register Packing", type: "select", choices: ["Auto", "On", "Off"], tier: "advanced" },
    { key: "fit_auto_gclk", label: "Auto Global Clock", type: "boolean", tier: "advanced" },
    { key: "fit_auto_merge_pll", label: "Auto Merge PLLs", type: "boolean", tier: "advanced" },
    { key: "fit_router_timing", label: "Router Timing Level", type: "select", choices: ["Normal", "Maximum", "Minimum"], tier: "advanced" },
    { key: "fit_packed_regs", label: "Auto Packed Registers", type: "select", choices: ["Auto", "Off", "Normal", "Sparse Auto"], tier: "advanced" },
    { key: "fit_phys_synth", label: "Physical Synthesis", type: "boolean", tier: "advanced" },
    { key: "fit_power_opt", label: "Power Optimization", type: "select", choices: ["Normal", "Extra Effort", "Off"], tier: "advanced" },
    { key: "fit_dsp_balance", label: "Auto DSP Balancing", type: "boolean", tier: "advanced" },
  ],
  sta: [
    { key: "sta_multicorner", label: "Multi-Corner Analysis", type: "boolean", tier: "primary" },
    { key: "sta_report_paths", label: "Report Paths Count", type: "text", tier: "primary" },
    { key: "sta_min_max", label: "Report Min/Max", type: "boolean", tier: "advanced" },
    { key: "sta_setup_slack", label: "Setup Slack Threshold", type: "text", tier: "advanced" },
    { key: "sta_hold_slack", label: "Hold Slack Threshold", type: "text", tier: "advanced" },
    { key: "sta_sdc_file", label: "SDC File", type: "text", tier: "advanced" },
    { key: "sta_report_unconstrained", label: "Report Unconstrained", type: "boolean", tier: "advanced" },
  ],
  asm: [
    { key: "asm_compression", label: "Compression", type: "boolean", tier: "primary" },
    { key: "asm_config_mode", label: "Config Mode", type: "select", choices: ["Default", "Active Serial", "Passive Serial", "JTAG"], tier: "advanced" },
    { key: "asm_gen_rbf", label: "Generate RBF", type: "boolean", tier: "advanced" },
    { key: "asm_gen_hex", label: "Generate HEX", type: "boolean", tier: "advanced" },
    { key: "asm_gen_jic", label: "Generate JIC", type: "boolean", tier: "advanced" },
  ],
};

const VIVADO_STAGE_OPTIONS: Record<string, StageOption[]> = {
  synth: [
    { key: "syn_strategy", label: "Strategy", type: "select", choices: ["Default", "Flow_AreaOptimized_high", "Flow_AreaOptimized_medium", "Flow_AreaMultThresholdDSP", "Flow_AlternateRoutability", "Flow_PerfOptimized_high", "Flow_PerfThresholdCarry", "Flow_RuntimeOptimized"], tier: "primary" },
    { key: "syn_flatten_hierarchy", label: "Flatten Hierarchy", type: "select", choices: ["rebuilt", "full", "none"], tier: "primary" },
    { key: "syn_retiming", label: "Retiming", type: "boolean", tier: "advanced" },
    { key: "syn_fsm_encoding", label: "FSM Encoding", type: "select", choices: ["auto", "one_hot", "sequential", "johnson", "gray", "none"], tier: "advanced" },
    { key: "syn_keep_equivalent_regs", label: "Keep Equivalent Registers", type: "boolean", tier: "advanced" },
    { key: "syn_resource_sharing", label: "Resource Sharing", type: "boolean", tier: "advanced" },
    { key: "syn_control_set_opt", label: "Control Set Optimization", type: "select", choices: ["Auto", "Off"], tier: "advanced" },
    { key: "syn_no_lc", label: "No LC", type: "boolean", tier: "advanced" },
    { key: "syn_shreg_min_size", label: "SRL Min Size", type: "text", tier: "advanced" },
    { key: "syn_max_dsp", label: "Max DSP Inference", type: "text", tier: "advanced" },
    { key: "syn_max_bram", label: "Max BRAM Inference", type: "text", tier: "advanced" },
    { key: "syn_max_uram", label: "Max URAM Inference", type: "text", tier: "advanced" },
  ],
  impl: [
    { key: "impl_strategy", label: "Strategy", type: "select", choices: ["Default", "Performance_Explore", "Performance_ExplorePostRoutePhysOpt", "Performance_WLBlockPlacement", "Performance_NetDelay_high", "Performance_NetDelay_low", "Performance_Retiming", "Area_Explore", "Power_DefaultOpt", "Flow_RunPhysOpt", "Flow_RunPostRoutePhysOpt", "Flow_RuntimeOptimized", "Flow_Quick"], tier: "primary" },
    { key: "impl_opt_directive", label: "Opt Directive", type: "select", choices: ["Default", "Explore", "ExploreArea", "ExploreSequentialArea", "AddRemap", "NoBramPowerOpt", "RuntimeOptimized"], tier: "advanced" },
    { key: "impl_place_directive", label: "Place Directive", type: "select", choices: ["Default", "Explore", "WLDrivenBlockPlacement", "ExtraNetDelay_high", "ExtraNetDelay_low", "SSI_SpreadLogic_high", "SSI_SpreadLogic_low", "AltSpreadLogic_high", "AltSpreadLogic_low", "ExtraPostPlacementOpt", "EarlyBlockPlacement", "RuntimeOptimized", "Quick"], tier: "advanced" },
    { key: "impl_route_directive", label: "Route Directive", type: "select", choices: ["Default", "Explore", "AggressiveExplore", "NoTimingRelaxation", "MoreGlobalIterations", "HigherDelayCost", "AdvancedSkewModeling", "AlternateCLBRouting", "RuntimeOptimized", "Quick"], tier: "advanced" },
    { key: "impl_phys_opt", label: "Post-Place PhysOpt", type: "select", choices: ["None", "Default", "Explore", "AggressiveExplore", "AggressiveFanoutOpt", "AlternateReplication", "AlternateFlowWithRetiming"], tier: "advanced" },
    { key: "impl_post_route_phys", label: "Post-Route PhysOpt", type: "select", choices: ["None", "Default", "Explore", "AggressiveExplore"], tier: "advanced" },
    { key: "impl_incremental", label: "Incremental Compile", type: "boolean", tier: "advanced" },
  ],
  bitgen: [
    { key: "bit_compress", label: "Compress Bitstream", type: "boolean", tier: "primary" },
    { key: "bit_readback", label: "Readback/Capture", type: "boolean", tier: "advanced" },
    { key: "bit_config_rate", label: "Config Rate (MHz)", type: "select", choices: ["3", "6", "9", "12", "16", "22", "26", "33", "40", "50", "66"], tier: "advanced" },
    { key: "bit_config_voltage", label: "Config Voltage", type: "select", choices: ["Default", "1.8", "2.5", "3.3"], tier: "advanced" },
    { key: "bit_spi_buswidth", label: "SPI Bus Width", type: "select", choices: ["1", "2", "4"], tier: "advanced" },
    { key: "bit_gen_bin", label: "Generate BIN", type: "boolean", tier: "advanced" },
    { key: "bit_gen_mcs", label: "Generate MCS", type: "boolean", tier: "advanced" },
  ],
};

// ── Shared PnR options (used across all nextpnr variants) ──
const SHARED_PNR_PRIMARY: StageOption[] = [
  { key: "pnr_freq", label: "Target Frequency (MHz)", type: "text", tier: "primary", defaultValue: "12.0",
    tooltip: "Target clock frequency in MHz. Applied as default constraint to all clocks." },
  { key: "pnr_seed", label: "Placement Seed", type: "text", tier: "primary", defaultValue: "1",
    tooltip: "Seed value for the random number generator. Different seeds produce different placements — useful for timing exploration." },
  { key: "pnr_placer", label: "Placer Algorithm", type: "select", choices: ["heap", "sa"], tier: "primary", defaultValue: "heap",
    tooltip: "Placement algorithm. HeAP (analytical) is faster and generally better. SA (simulated annealing) is the legacy algorithm." },
  { key: "pnr_router", label: "Router Algorithm", type: "select", choices: ["router1", "router2"], tier: "primary", defaultValue: "router1",
    tooltip: "Routing algorithm. router1 is the original maze-based router. router2 is newer and generally faster for larger designs." },
  { key: "pnr_verbosity", label: "Verbosity", type: "select", choices: ["quiet", "normal", "verbose"], tier: "primary", defaultValue: "normal",
    tooltip: "nextpnr output verbosity. Quiet shows only errors/warnings. Verbose enables detailed debug output." },
];

const SHARED_PNR_ADVANCED: StageOption[] = [
  { key: "pnr_timing_allow_fail", label: "Allow Timing Failure", type: "boolean", tier: "advanced", defaultValue: "false",
    tooltip: "Continue and produce output even when timing constraints are not met." },
  { key: "pnr_no_tmdriv", label: "Disable Timing-Driven", type: "boolean", tier: "advanced", defaultValue: "false",
    tooltip: "Disable timing-driven placement. Placement will only optimize wirelength, ignoring timing paths." },
  { key: "pnr_randomize_seed", label: "Randomize Seed", type: "boolean", tier: "advanced", defaultValue: "false",
    tooltip: "Use a random seed instead of the specified seed. Good for exploring the solution space." },
  { key: "pnr_parallel_refine", label: "Parallel Refinement", type: "boolean", tier: "advanced", defaultValue: "false",
    tooltip: "Enable experimental parallelized engine for placement refinement." },
  { key: "pnr_tmg_ripup", label: "Timing-Driven Ripup", type: "boolean", tier: "advanced", defaultValue: "false",
    tooltip: "Enable experimental timing-driven ripup in the router. Improves timing at cost of runtime." },
  { key: "pnr_detailed_timing", label: "Detailed Timing Report", type: "boolean", tier: "advanced", defaultValue: "false",
    tooltip: "Append detailed per-net timing data to the JSON report." },
  { key: "pnr_threads", label: "Threads", type: "text", tier: "advanced", defaultValue: "",
    tooltip: "Number of threads for parallel operations. Leave empty for auto-detection." },
  { key: "pnr_heap_alpha", label: "HeAP Alpha", type: "text", tier: "advanced", defaultValue: "0.1",
    tooltip: "HeAP placer alpha: trade-off between wirelength (0) and spreading (1). Default 0.1." },
  { key: "pnr_heap_beta", label: "HeAP Beta (Density)", type: "text", tier: "advanced", defaultValue: "0.9",
    tooltip: "HeAP placer max density. 1.0 = pack tight. Lower values spread logic more. Default 0.9." },
  { key: "pnr_heap_critexp", label: "HeAP Crit Exponent", type: "text", tier: "advanced", defaultValue: "2",
    tooltip: "HeAP criticality exponent for timing-driven weighting. Higher = more aggressive timing focus." },
  { key: "pnr_heap_timingweight", label: "HeAP Timing Weight", type: "text", tier: "advanced", defaultValue: "10",
    tooltip: "HeAP timing weight factor. Higher = more aggressive timing optimization vs wirelength." },
];

// ── Shared yosys synth options (work across all architectures) ──
const SHARED_SYNTH_PRIMARY: StageOption[] = [
  { key: "syn_noflatten", label: "Preserve Hierarchy", type: "boolean", tier: "primary", defaultValue: "false",
    tooltip: "Don't flatten the design hierarchy. Useful to see per-module utilization stats." },
  { key: "syn_abc9_timing", label: "ABC9 Target (ps)", type: "text", tier: "primary", defaultValue: "",
    tooltip: "Target clock period in picoseconds for ABC9 optimization. E.g. 8000 = 125 MHz." },
  { key: "syn_verbosity", label: "Verbosity", type: "select", choices: ["quiet", "normal", "verbose"], tier: "primary", defaultValue: "normal",
    tooltip: "Yosys output verbosity. Quiet suppresses all but errors; verbose adds detailed log headers." },
];

const SHARED_SYNTH_ADVANCED: StageOption[] = [
  { key: "syn_noabc9", label: "Disable ABC9", type: "boolean", tier: "advanced", defaultValue: "false",
    tooltip: "Fall back to legacy ABC mapping instead of ABC9." },
  { key: "syn_abc2", label: "ABC2 Double Pass", type: "boolean", tier: "advanced", defaultValue: "false",
    tooltip: "Run an additional ABC optimization pass before LUT mapping." },
  { key: "syn_dff", label: "ABC DFF Mode", type: "boolean", tier: "advanced", defaultValue: "false",
    tooltip: "Run ABC/ABC9 in DFF-aware mode. Can sometimes remove unnecessary flip-flops." },
  { key: "syn_retime", label: "Retiming", type: "boolean", tier: "advanced", defaultValue: "false",
    tooltip: "Run ABC with retiming to balance combinational stages." },
  { key: "syn_nobram", label: "Disable Block RAM", type: "boolean", tier: "advanced", defaultValue: "false",
    tooltip: "Don't infer block RAM. Memories implemented with LUT RAM or flip-flops." },
  { key: "syn_nolutram", label: "Disable LUT RAM", type: "boolean", tier: "advanced", defaultValue: "false",
    tooltip: "Don't infer distributed LUT RAM." },
  { key: "syn_nodsp", label: "Disable DSP", type: "boolean", tier: "advanced", defaultValue: "false",
    tooltip: "Don't map multipliers to DSP blocks." },
  { key: "syn_no_rw_check", label: "No R/W Collision Check", type: "boolean", tier: "advanced", defaultValue: "false",
    tooltip: "Mark memory read ports as don't-care on simultaneous read/write." },
  { key: "syn_defines", label: "Verilog Defines", type: "text", tier: "advanced", defaultValue: "",
    tooltip: "Space-separated Verilog preprocessor defines passed to yosys with -D." },
];

// ── ECP5-specific options ──
const OSS_ECP5_STAGE_OPTIONS: Record<string, StageOption[]> = {
  synth: [
    { key: "syn_nowidelut", label: "Area Optimize (-nowidelut)", type: "boolean", tier: "primary", defaultValue: "false",
      tooltip: "Prevent PFU muxes from implementing wide (>4-input) LUTs." },
    ...SHARED_SYNTH_PRIMARY,
    ...SHARED_SYNTH_ADVANCED,
    { key: "syn_noccu2", label: "Disable Carry Chains", type: "boolean", tier: "advanced", defaultValue: "false",
      tooltip: "Don't use CCU2C carry-chain cells. For debugging carry-chain routing issues." },
    { key: "syn_nodffe", label: "Disable Clock-Enable FFs", type: "boolean", tier: "advanced", defaultValue: "false",
      tooltip: "Don't use flip-flops with clock enable (DFFE)." },
  ],
  pnr: [
    ...SHARED_PNR_PRIMARY,
    ...SHARED_PNR_ADVANCED,
    { key: "pnr_no_promote_globals", label: "No Global Promotion", type: "boolean", tier: "advanced", defaultValue: "false",
      tooltip: "Disable automatic promotion of high-fanout clocks/resets to the global routing network." },
    { key: "pnr_lpf_allow_unconstrained", label: "Allow Unconstrained I/O", type: "boolean", tier: "advanced", defaultValue: "false",
      tooltip: "Don't error when I/O pins are not constrained in the LPF file." },
  ],
  pack: [
    { key: "bit_compress", label: "Compress Bitstream", type: "boolean", tier: "primary", defaultValue: "true",
      tooltip: "Enable ECP5 built-in bitstream compression." },
    { key: "bit_spimode", label: "SPI Mode", type: "select", choices: ["fast-read", "dual-spi", "qspi"], tier: "primary", defaultValue: "",
      tooltip: "SPI flash read mode for configuration." },
    { key: "bit_freq", label: "Config Clock (MHz)", type: "select", choices: ["2.4", "4.8", "9.7", "19.4", "38.8", "62.0"], tier: "primary", defaultValue: "",
      tooltip: "MCCLK configuration clock frequency." },
    { key: "bit_svf", label: "Generate SVF (JTAG)", type: "boolean", tier: "primary", defaultValue: "false",
      tooltip: "Generate SVF file for JTAG programming." },
    { key: "bit_background", label: "Background Reconfig", type: "boolean", tier: "advanced", defaultValue: "false",
      tooltip: "Enable background reconfiguration." },
    { key: "bit_usercode", label: "User Code", type: "text", tier: "advanced", defaultValue: "",
      tooltip: "32-bit USERCODE value embedded in the bitstream." },
    { key: "bit_bootaddr", label: "Boot Address", type: "text", tier: "advanced", defaultValue: "",
      tooltip: "Next boot address for multi-boot (64K-aligned)." },
    { key: "bit_svf_rowsize", label: "SVF Row Size (bits)", type: "text", tier: "advanced", defaultValue: "8000",
      tooltip: "SVF row size in bits for JTAG programming." },
  ],
};

// ── iCE40-specific options ──
const OSS_ICE40_STAGE_OPTIONS: Record<string, StageOption[]> = {
  synth: [
    { key: "syn_nowidelut", label: "No Wide LUT", type: "boolean", tier: "primary", defaultValue: "false",
      tooltip: "Don't use SB_LUT4 cascading for wide LUTs." },
    ...SHARED_SYNTH_PRIMARY,
    ...SHARED_SYNTH_ADVANCED,
    { key: "syn_nocarry", label: "Disable Carry Logic", type: "boolean", tier: "advanced", defaultValue: "false",
      tooltip: "Don't use SB_CARRY cells. Arithmetic implemented with LUTs only." },
  ],
  pnr: [
    ...SHARED_PNR_PRIMARY,
    ...SHARED_PNR_ADVANCED,
    { key: "pnr_promote_logic", label: "Promote Logic", type: "boolean", tier: "advanced", defaultValue: "false",
      tooltip: "Enable promotion of logic to global buffers for high-fanout signals." },
    { key: "pnr_pcf_allow_unconstrained", label: "Allow Unconstrained I/O", type: "boolean", tier: "advanced", defaultValue: "false",
      tooltip: "Don't error when I/O pins are not constrained in the PCF file." },
  ],
  pack: [
    // icepack has minimal options — mostly just input/output files
    { key: "bit_header", label: "Include File Header", type: "boolean", tier: "advanced", defaultValue: "false",
      tooltip: "Include a file header comment in the output .bin file." },
  ],
};

// ── Gowin-specific options ──
const OSS_GOWIN_STAGE_OPTIONS: Record<string, StageOption[]> = {
  synth: [
    { key: "syn_nowidelut", label: "No Wide LUT", type: "boolean", tier: "primary", defaultValue: "false",
      tooltip: "Don't cascade LUTs for wide functions." },
    ...SHARED_SYNTH_PRIMARY,
    ...SHARED_SYNTH_ADVANCED,
    { key: "syn_noalu", label: "Disable ALU Mapping", type: "boolean", tier: "advanced", defaultValue: "false",
      tooltip: "Don't use Gowin ALU primitives for arithmetic." },
  ],
  pnr: [
    ...SHARED_PNR_PRIMARY,
    ...SHARED_PNR_ADVANCED,
  ],
  pack: [
    // gowin_pack options are minimal
    { key: "bit_compress", label: "Compress Bitstream", type: "boolean", tier: "primary", defaultValue: "false",
      tooltip: "Enable bitstream compression if supported by the device." },
  ],
};

// ── Nexus-specific options ──
const OSS_NEXUS_STAGE_OPTIONS: Record<string, StageOption[]> = {
  synth: [
    { key: "syn_nowidelut", label: "No Wide LUT", type: "boolean", tier: "primary", defaultValue: "false",
      tooltip: "Don't cascade LUTs for wide functions." },
    ...SHARED_SYNTH_PRIMARY,
    ...SHARED_SYNTH_ADVANCED,
    { key: "syn_nodffe", label: "Disable Clock-Enable FFs", type: "boolean", tier: "advanced", defaultValue: "false",
      tooltip: "Don't use flip-flops with clock enable." },
  ],
  pnr: [
    ...SHARED_PNR_PRIMARY,
    ...SHARED_PNR_ADVANCED,
  ],
  pack: [
    // prjoxide bitstream options
    { key: "bit_compress", label: "Compress Bitstream", type: "boolean", tier: "primary", defaultValue: "false",
      tooltip: "Enable bitstream compression." },
  ],
};

// Default fallback (used when architecture not yet detected)
const OSS_STAGE_OPTIONS = OSS_ECP5_STAGE_OPTIONS;

/** Detect OSS architecture family from a device string */
function detectOssArch(device: string): "ecp5" | "ice40" | "gowin" | "nexus" | "gatemate" | "machxo2" {
  const d = device.toUpperCase();
  if (d.startsWith("LFE5U")) return "ecp5";
  if (d.startsWith("ICE40")) return "ice40";
  if (d.startsWith("GW")) return "gowin";
  if (d.startsWith("LIFCL")) return "nexus";
  if (d.startsWith("CCGM")) return "gatemate";
  if (d.startsWith("LCMXO2")) return "machxo2";
  return "ecp5";
}

const OSS_ARCH_OPTIONS: Record<string, Record<string, StageOption[]>> = {
  ecp5: OSS_ECP5_STAGE_OPTIONS,
  ice40: OSS_ICE40_STAGE_OPTIONS,
  gowin: OSS_GOWIN_STAGE_OPTIONS,
  nexus: OSS_NEXUS_STAGE_OPTIONS,
  gatemate: OSS_NEXUS_STAGE_OPTIONS, // reuse nexus options (similar tool flow)
  machxo2: OSS_ECP5_STAGE_OPTIONS,   // MachXO2 uses same ecppack flow
};

interface BuildPipelineProps {
  backend: RuntimeBackend;
  building: boolean;
  buildStep: number;
  logs: LogEntry[];
  activeStage: number | null;
  onStageClick: (idx: number) => void;
  selectedStages: string[];
  onStagesChange: (stages: string[]) => void;
  buildOptions: Record<string, string>;
  onOptionsChange: (options: Record<string, string>) => void;
  saveStatus?: "saved" | "saving" | "unsaved";
  changedFromCommit?: string[];
  /** Current device string — used to select arch-specific options for OSS backend */
  deviceString?: string;
}

function OptionRow({ opt, value, onChange }: { opt: StageOption; value: string; onChange: (v: string) => void }) {
  const { C, MONO } = useTheme();

  // Determine if value differs from default for color-coding
  const isDefault = !value || value === "" || value === opt.defaultValue;
  const labelColor = isDefault ? C.t3 : C.cyan;

  // For booleans, match against defaultValue (e.g. "true" or "false")
  const boolDefault = opt.defaultValue ?? "true";
  const boolIsDefault = !value || value === boolDefault;
  const boolLabelColor = boolIsDefault ? C.t3 : C.cyan;

  const effectiveLabelColor = opt.type === "boolean" ? boolLabelColor : labelColor;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span
        style={{ fontSize: 8, fontFamily: MONO, color: effectiveLabelColor, width: 150, flexShrink: 0, cursor: opt.tooltip ? "help" : "default" }}
        title={opt.tooltip}
      >
        {opt.label}
        {!isDefault && opt.type !== "boolean" && <span style={{ color: C.cyan, marginLeft: 2 }}>{"\u2022"}</span>}
        {opt.type === "boolean" && !boolIsDefault && <span style={{ color: C.cyan, marginLeft: 2 }}>{"\u2022"}</span>}
      </span>
      {opt.type === "select" ? (
        <Select
          compact
          value={value}
          onChange={onChange}
          options={[
            { value: "", label: opt.defaultValue ? `Default (${opt.defaultValue})` : "Default" },
            ...(opt.choices ?? []).map((c) => ({ value: c, label: c })),
          ]}
          placeholder={opt.defaultValue ? `Default (${opt.defaultValue})` : "Default"}
        />
      ) : opt.type === "boolean" ? (
        <Select
          compact
          value={value || boolDefault}
          onChange={onChange}
          options={[
            { value: "true", label: "On" },
            { value: "false", label: "Off" },
          ]}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={opt.defaultValue || "Default"}
          style={{
            fontSize: 8,
            fontFamily: MONO,
            background: C.s1,
            color: isDefault ? C.t2 : C.cyan,
            border: `1px solid ${isDefault ? C.b1 : `${C.cyan}40`}`,
            borderRadius: 3,
            padding: "2px 6px",
            width: 80,
            outline: "none",
          }}
        />
      )}
    </div>
  );
}

function PStep({
  s,
  i,
  total,
  building,
  buildStep,
  active,
  checked,
  expanded,
  onClick,
  onToggle,
  onExpand,
  options,
  onOptionChange,
  onRunTo,
  backendId,
  deviceString,
}: {
  s: PipelineStage;
  i: number;
  total: number;
  building: boolean;
  buildStep: number;
  active: boolean;
  checked: boolean;
  expanded: boolean;
  onClick: () => void;
  onToggle: () => void;
  onExpand: () => void;
  options: Record<string, string>;
  onOptionChange: (key: string, val: string) => void;
  onRunTo: () => void;
  backendId: string;
  deviceString?: string;
}) {
  const { C, MONO } = useTheme();
  const [showAdvanced, setShowAdvanced] = useState(false);
  let st: "done" | "run" | "pending" = "pending";
  if (building) {
    if (i < buildStep) st = "done";
    else if (i === buildStep) st = "run";
  } else if (buildStep >= total && buildStep >= 0) {
    st = "done";
  }

  const col = { done: C.ok, run: C.accent, pending: C.t3 }[st];

  // For OSS backend, select architecture-specific options based on device string
  const ossArch = deviceString ? detectOssArch(deviceString) : "ecp5";
  const ossOptions = OSS_ARCH_OPTIONS[ossArch] ?? OSS_STAGE_OPTIONS;

  const STAGE_OPTIONS_MAP: Record<string, Record<string, StageOption[]>> = {
    radiant: RADIANT_STAGE_OPTIONS,
    diamond: RADIANT_STAGE_OPTIONS,
    quartus: QUARTUS_STAGE_OPTIONS,
    vivado: VIVADO_STAGE_OPTIONS,
    oss: ossOptions,
    opensource: ossOptions,
  };
  const allStageOptions = STAGE_OPTIONS_MAP[backendId] ?? RADIANT_STAGE_OPTIONS;
  const myOpts = allStageOptions[s.id] ?? [];
  const primaryOpts = myOpts.filter((o) => o.tier === "primary");
  const advancedOpts = myOpts.filter((o) => o.tier === "advanced");

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "flex-start",
          borderRadius: 4,
          padding: "2px 4px",
          margin: "0 -4px",
          background: active ? `${C.accent}10` : undefined,
        }}
      >
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          disabled={building}
          style={{
            marginTop: 3,
            accentColor: C.accent,
            cursor: building ? "default" : "pointer",
          }}
        />
        {/* Stage indicator */}
        <div
          onClick={st !== "pending" ? onClick : undefined}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            minWidth: 18,
            cursor: st !== "pending" ? "pointer" : "default",
          }}
        >
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              border: `2px solid ${col}`,
              background: st !== "pending" ? `${col}15` : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {st === "done" && <Check />}
            {st === "run" && (
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  background: col,
                  animation: "pulse 1s infinite",
                }}
              />
            )}
          </div>
          {i < total - 1 && (
            <div
              style={{
                width: 1.5,
                height: expanded && myOpts.length > 0 ? 6 : 22,
                background: st === "done" ? col : C.b1,
              }}
            />
          )}
        </div>
        {/* Label + expand */}
        <div style={{ flex: 1, paddingBottom: i < total - 1 ? 2 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div
              style={{
                fontSize: 10,
                fontFamily: MONO,
                fontWeight: 600,
                color: st === "pending" ? C.t3 : C.t1,
                flex: 1,
                cursor: st !== "pending" ? "pointer" : "default",
              }}
              onClick={st !== "pending" ? onClick : undefined}
            >
              {s.label}
            </div>
            {myOpts.length > 0 && !building && (
              <span
                onClick={onExpand}
                style={{
                  fontSize: 8,
                  color: C.t3,
                  cursor: "pointer",
                  padding: "0 2px",
                  userSelect: "none",
                }}
                title="Configure stage options"
              >
                {expanded ? "\u25BC" : "\u25B6"}
              </span>
            )}
            {!building && (
              <span
                onClick={onRunTo}
                style={{
                  fontSize: 7,
                  color: C.t3,
                  cursor: "pointer",
                  fontFamily: MONO,
                  padding: "1px 4px",
                  borderRadius: 2,
                  border: `1px solid ${C.b1}`,
                }}
                title={`Run stages up to ${s.label}`}
              >
                Run to here
              </span>
            )}
          </div>
          {st !== "pending" && (
            <div
              style={{
                fontSize: 8,
                fontFamily: MONO,
                color: C.t3,
                marginTop: 1,
              }}
            >
              {s.cmd}
            </div>
          )}
        </div>
      </div>
      {/* Expanded options — primary always visible, advanced on toggle */}
      {expanded && myOpts.length > 0 && (
        <div
          style={{
            marginLeft: 44,
            marginBottom: 6,
            padding: "6px 8px",
            background: C.bg,
            borderRadius: 4,
            border: `1px solid ${C.b1}`,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {primaryOpts.map((opt) => (
            <OptionRow key={opt.key} opt={opt} value={options[opt.key] ?? ""} onChange={(v) => onOptionChange(opt.key, v)} />
          ))}
          {advancedOpts.length > 0 && (
            <>
              <div
                onClick={() => setShowAdvanced((p) => !p)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  cursor: "pointer",
                  fontSize: 7,
                  fontFamily: MONO,
                  fontWeight: 600,
                  color: C.t3,
                  userSelect: "none",
                  paddingTop: primaryOpts.length > 0 ? 2 : 0,
                  borderTop: primaryOpts.length > 0 ? `1px solid ${C.b1}` : undefined,
                }}
              >
                <span style={{ fontSize: 6 }}>{showAdvanced ? "\u25BC" : "\u25B6"}</span>
                Advanced
              </div>
              {showAdvanced && advancedOpts.map((opt) => (
                <OptionRow key={opt.key} opt={opt} value={options[opt.key] ?? ""} onChange={(v) => onOptionChange(opt.key, v)} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(function BuildPipeline({
  backend,
  building,
  buildStep,
  logs,
  activeStage,
  onStageClick,
  selectedStages,
  onStagesChange,
  buildOptions,
  onOptionsChange,
  saveStatus,
  changedFromCommit,
  deviceString,
}: BuildPipelineProps) {
  const { C, MONO } = useTheme();
  const B = backend;
  const allDone = !building && buildStep >= B.pipeline.length && buildStep >= 0;
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [logs.length]);

  const handleCopy = useCallback(() => {
    const text = logs.map((l) => l.m).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [logs]);

  const panel: React.CSSProperties = {
    background: C.s1,
    borderRadius: 7,
    border: `1px solid ${C.b1}`,
    overflow: "hidden",
    padding: 14,
  };

  const lineColors: Record<string, string> = {
    info: C.t3,
    cmd: C.cyan,
    ok: C.ok,
    warn: C.warn,
    err: C.err,
    out: C.t2,
  };

  const isStageSelected = (id: string) =>
    selectedStages.length === 0 || selectedStages.includes(id);

  const toggleStage = useCallback((id: string) => {
    const allIds = B.pipeline.map((s) => s.id);
    if (selectedStages.length === 0) {
      // All selected → deselect this one
      onStagesChange(allIds.filter((s) => s !== id));
    } else if (selectedStages.includes(id)) {
      const next = selectedStages.filter((s) => s !== id);
      // If nothing left, select all
      onStagesChange(next.length === 0 ? [] : next);
    } else {
      const next = [...selectedStages, id];
      // If all selected, use empty (= all)
      onStagesChange(next.length === allIds.length ? [] : next);
    }
  }, [selectedStages, onStagesChange, B.pipeline]);

  const runToStage = useCallback((idx: number) => {
    const ids = B.pipeline.slice(0, idx + 1).map((s) => s.id);
    onStagesChange(ids);
  }, [B.pipeline, onStagesChange]);

  const handleOptionChange = useCallback((key: string, val: string) => {
    onOptionsChange({ ...buildOptions, [key]: val });
  }, [buildOptions, onOptionsChange]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {/* Left column: Build Pipeline */}
      <div style={panel}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: C.t1,
            marginBottom: 10,
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <Zap />
          Build Pipeline <Badge color={B.color}>{B.short}</Badge>
          {selectedStages.length > 0 && selectedStages.length < B.pipeline.length && (
            <Badge color={C.warn}>{selectedStages.length}/{B.pipeline.length} stages</Badge>
          )}
          <div style={{ flex: 1 }} />
          {/* Save status indicator */}
          {saveStatus && (
            <span
              style={{
                fontSize: 7,
                fontFamily: MONO,
                fontWeight: 600,
                padding: "1px 6px",
                borderRadius: 3,
                display: "flex",
                alignItems: "center",
                gap: 3,
                color: saveStatus === "saved" ? C.ok : saveStatus === "saving" ? C.accent : C.warn,
                background: saveStatus === "saved" ? `${C.ok}10` : saveStatus === "saving" ? `${C.accent}10` : `${C.warn}10`,
              }}
            >
              {saveStatus === "unsaved" && (
                <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: C.warn }} />
              )}
              {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved" : "Unsaved"}
            </span>
          )}
        </div>
        {/* Changed from last commit */}
        {changedFromCommit && changedFromCommit.length > 0 && (
          <div style={{
            display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8,
            padding: "4px 6px", borderRadius: 4, background: `${C.cyan}08`,
            border: `1px solid ${C.cyan}20`,
          }}>
            <span style={{ fontSize: 7, fontFamily: MONO, color: C.cyan, fontWeight: 600 }}>
              Changed since commit:
            </span>
            {changedFromCommit.map((f) => (
              <span
                key={f}
                style={{
                  fontSize: 7, fontFamily: MONO, fontWeight: 600,
                  padding: "0 4px", borderRadius: 2,
                  background: `${C.cyan}15`, color: C.cyan,
                }}
              >
                {f}
              </span>
            ))}
          </div>
        )}
        {B.pipeline.map((s, i) => (
          <PStep
            key={s.id}
            s={s}
            i={i}
            total={B.pipeline.length}
            building={building}
            buildStep={buildStep}
            active={activeStage === i}
            checked={isStageSelected(s.id)}
            expanded={expandedStage === s.id}
            onClick={() => onStageClick(i)}
            onToggle={() => toggleStage(s.id)}
            onExpand={() => setExpandedStage(expandedStage === s.id ? null : s.id)}
            options={buildOptions}
            onOptionChange={handleOptionChange}
            onRunTo={() => runToStage(i)}
            backendId={B.id}
            deviceString={deviceString}
          />
        ))}
        {allDone && (
          <div
            style={{
              marginTop: 10,
              padding: "6px 8px",
              background: C.okDim,
              borderRadius: 4,
              fontSize: 9,
              fontFamily: MONO,
              color: C.ok,
              display: "flex",
              gap: 5,
              alignItems: "center",
            }}
          >
            <Check /> Build complete
          </div>
        )}
      </div>

      {/* Right column: Live output */}
      <div style={panel}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: C.t1,
            marginBottom: 10,
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          {"\u25B6"} {activeStage !== null && B.pipeline[activeStage]
            ? B.pipeline[activeStage].label
            : "Build Output"}
          <span style={{ flex: 1 }} />
          {logs.length > 0 && (
            <>
              <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3, fontWeight: 400 }}>
                {logs.length} lines
              </span>
              <Btn small onClick={handleCopy}>
                {copied ? "Copied!" : "Copy"}
              </Btn>
            </>
          )}
        </div>
        <div
          style={{
            background: C.bg,
            borderRadius: 4,
            padding: "6px 10px",
            height: 280,
            overflowY: "auto",
            fontSize: 9,
            fontFamily: MONO,
            lineHeight: 1.6,
          }}
        >
          {logs.length === 0 && !building ? (
            <div style={{ color: C.t3, padding: 8, textAlign: "center" }}>
              Click a stage to view its output, or hit Build to start.
            </div>
          ) : (
            logs.slice(-500).map((l, i) => (
              <div key={i} style={{ color: lineColors[l.t] || C.t2 }}>
                {l.m}
              </div>
            ))
          )}
          {building && (
            <div style={{ color: C.accent }}>
              <span style={{ animation: "pulse 1s infinite" }}>{"\u25CF"}</span>{" "}
              Running...
            </div>
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
})
