import { memo } from "react";
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
}

function PStep({
  s,
  i,
  total,
  building,
  buildStep,
  active,
  onClick,
}: {
  s: PipelineStage;
  i: number;
  total: number;
  building: boolean;
  buildStep: number;
  active: boolean;
  onClick: () => void;
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

  return (
    <div
      onClick={st !== "pending" ? onClick : undefined}
      style={{
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
        cursor: st !== "pending" ? "pointer" : "default",
        background: active ? `${C.accent}10` : undefined,
        borderRadius: 4,
        padding: "2px 4px",
        margin: "0 -4px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          minWidth: 18,
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
              height: 22,
              background: st === "done" ? col : C.b1,
            }}
          />
        )}
      </div>
      <div style={{ paddingBottom: i < total - 1 ? 2 : 0 }}>
        <div
          style={{
            fontSize: 10,
            fontFamily: MONO,
            fontWeight: 600,
            color: st === "pending" ? C.t3 : C.t1,
          }}
        >
          {s.label}
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
  );
}

export default memo(function BuildPipeline({
  backend,
  building,
  buildStep,
  logs,
  activeStage,
  onStageClick,
}: BuildPipelineProps) {
  const { C, MONO } = useTheme();
  const B = backend;
  const allDone = !building && buildStep >= B.pipeline.length && buildStep >= 0;

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
            onClick={() => onStageClick(i)}
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
