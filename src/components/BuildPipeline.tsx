import { useState, useCallback, memo } from "react";
import { RuntimeBackend, PipelineStage, LogEntry } from "../types";
import { useTheme } from "../context/ThemeContext";
import { Badge } from "./shared";
import { Zap, Check } from "./Icons";

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
}) {
  const { C, MONO } = useTheme();
  let st: "done" | "run" | "pending" = "pending";
  if (building) {
    if (i < buildStep) st = "done";
    else if (i === buildStep) st = "run";
  } else if (buildStep >= total && buildStep >= 0) {
    st = "done";
  }

  const col = { done: C.ok, run: C.accent, pending: C.t3 }[st];

  // Stage-specific option fields
  const stageOptions: Record<string, { key: string; label: string; type: "text" | "select"; choices?: string[] }[]> = {
    synth: [
      { key: "synth_engine", label: "Synth Engine", type: "select", choices: ["LSE", "Synplify Pro"] },
      { key: "syn_frequency", label: "Frequency (MHz)", type: "text" },
      { key: "syn_optimization", label: "Optimization", type: "select", choices: ["Timing", "Balanced", "Area"] },
    ],
    par: [
      { key: "par_path_based", label: "Path-based routing", type: "select", choices: ["OFF", "ON"] },
    ],
  };

  const myOpts = stageOptions[s.id] ?? [];

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
      {/* Expanded options */}
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
          {myOpts.map((opt) => (
            <div key={opt.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3, width: 90, flexShrink: 0 }}>
                {opt.label}
              </span>
              {opt.type === "select" ? (
                <select
                  value={options[opt.key] ?? ""}
                  onChange={(e) => onOptionChange(opt.key, e.target.value)}
                  style={{
                    fontSize: 9,
                    fontFamily: MONO,
                    background: C.s1,
                    color: C.t1,
                    border: `1px solid ${C.b1}`,
                    borderRadius: 3,
                    padding: "2px 4px",
                  }}
                >
                  <option value="">Default</option>
                  {opt.choices?.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={options[opt.key] ?? ""}
                  onChange={(e) => onOptionChange(opt.key, e.target.value)}
                  placeholder="Default"
                  style={{
                    fontSize: 9,
                    fontFamily: MONO,
                    background: C.s1,
                    color: C.t1,
                    border: `1px solid ${C.b1}`,
                    borderRadius: 3,
                    padding: "2px 6px",
                    width: 80,
                  }}
                />
              )}
            </div>
          ))}
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
        </div>
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
            background: "#030508",
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
