import { useState, useCallback, memo } from "react";
import { RuntimeBackend, PipelineStage, LogEntry } from "../types";
import { useTheme } from "../context/ThemeContext";
import { Badge, Select } from "./shared";
import { Zap, Check } from "./Icons";

type StageOption = {
  key: string;
  label: string;
  type: "text" | "select" | "boolean";
  choices?: string[];
  tier: "primary" | "advanced";
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

const OSS_STAGE_OPTIONS: Record<string, StageOption[]> = {
  synth: [
    { key: "syn_top", label: "Top Module", type: "text", tier: "primary" },
    { key: "syn_abc_opt", label: "ABC Optimization", type: "select", choices: ["Default", "Area", "Speed"], tier: "primary" },
    { key: "syn_flatten", label: "Flatten Design", type: "boolean", tier: "advanced" },
    { key: "syn_rw_passes", label: "Rewrite Passes", type: "text", tier: "advanced" },
    { key: "syn_auto_infer_bram", label: "Infer BRAM", type: "boolean", tier: "advanced" },
    { key: "syn_auto_infer_dsp", label: "Infer DSP", type: "boolean", tier: "advanced" },
    { key: "syn_no_alu", label: "Disable ALU Mapping", type: "boolean", tier: "advanced" },
  ],
  pnr: [
    { key: "pnr_seed", label: "Seed", type: "text", tier: "primary" },
    { key: "pnr_freq", label: "Target Frequency (MHz)", type: "text", tier: "primary" },
    { key: "pnr_timing_driven", label: "Timing-Driven", type: "boolean", tier: "advanced" },
    { key: "pnr_slack_redist", label: "Slack Redistribution", type: "boolean", tier: "advanced" },
    { key: "pnr_placer", label: "Placer Algorithm", type: "select", choices: ["sa", "heap"], tier: "advanced" },
    { key: "pnr_router", label: "Router Algorithm", type: "select", choices: ["router1", "router2"], tier: "advanced" },
    { key: "pnr_placer_exp", label: "Placer Explore", type: "text", tier: "advanced" },
  ],
  bitgen: [
    { key: "bit_compress", label: "Compress Bitstream", type: "boolean", tier: "primary" },
    { key: "bit_spi_mode", label: "SPI Mode", type: "select", choices: ["Disabled", "1x", "2x", "4x"], tier: "advanced" },
    { key: "bit_svf", label: "Generate SVF", type: "boolean", tier: "advanced" },
  ],
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
}

function OptionRow({ opt, value, onChange }: { opt: StageOption; value: string; onChange: (v: string) => void }) {
  const { C, MONO } = useTheme();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3, width: 130, flexShrink: 0 }}>
        {opt.label}
      </span>
      {opt.type === "select" ? (
        <Select
          compact
          value={value}
          onChange={onChange}
          options={[
            { value: "", label: "Default" },
            ...(opt.choices ?? []).map((c) => ({ value: c, label: c })),
          ]}
          placeholder="Default"
        />
      ) : opt.type === "boolean" ? (
        <Select
          compact
          value={value || "true"}
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
          placeholder="Default"
          style={{
            fontSize: 8,
            fontFamily: MONO,
            background: C.s1,
            color: C.t1,
            border: `1px solid ${C.b1}`,
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

  const STAGE_OPTIONS_MAP: Record<string, Record<string, StageOption[]>> = {
    radiant: RADIANT_STAGE_OPTIONS,
    diamond: RADIANT_STAGE_OPTIONS,
    quartus: QUARTUS_STAGE_OPTIONS,
    vivado: VIVADO_STAGE_OPTIONS,
    oss: OSS_STAGE_OPTIONS,
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
}: BuildPipelineProps) {
  const { C, MONO } = useTheme();
  const B = backend;
  const allDone = !building && buildStep >= B.pipeline.length && buildStep >= 0;
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

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
        </div>
      </div>
    </div>
  );
})
