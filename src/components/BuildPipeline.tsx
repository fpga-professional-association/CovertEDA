import React from "react";
import { C, MONO, Backend, PipelineStage } from "../types";
import { Badge, Btn } from "./shared";
import { Zap, Check, Bolt } from "./Icons";

interface BuildPipelineProps {
  backend: Backend;
  building: boolean;
  buildStep: number;
}

const panel: React.CSSProperties = {
  background: C.s1,
  borderRadius: 7,
  border: `1px solid ${C.b1}`,
  overflow: "hidden",
  padding: 14,
};

function Hdr({ title, icon }: { title: React.ReactNode; icon: React.ReactNode }) {
  return (
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
      {icon}
      {title}
    </div>
  );
}

function PStep({
  s,
  i,
  total,
  building,
  buildStep,
}: {
  s: PipelineStage;
  i: number;
  total: number;
  building: boolean;
  buildStep: number;
}) {
  let st: "done" | "run" | "pending" = "pending";
  if (building) {
    if (i < buildStep) st = "done";
    else if (i === buildStep) st = "run";
  } else if (buildStep >= total && buildStep >= 0) {
    st = "done";
  }

  const col = { done: C.ok, run: C.accent, pending: C.t3 }[st];

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
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

function BuildPipeline({ backend, building, buildStep }: BuildPipelineProps) {
  const B = backend;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {/* Left column: Build Pipeline */}
      <div style={panel}>
        <Hdr
          title={
            <>
              Build Pipeline <Badge color={B.color}>{B.short}</Badge>
            </>
          }
          icon={<Zap />}
        />
        {B.pipeline.map((s, i) => (
          <PStep
            key={s.id}
            s={s}
            i={i}
            total={B.pipeline.length}
            building={building}
            buildStep={buildStep}
          />
        ))}
        {!building && buildStep >= B.pipeline.length && buildStep >= 0 && (
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
            <Check /> Fmax {B.timing.fmax} MHz — {B.timing.setup} ns slack
          </div>
        )}
      </div>

      {/* Right column */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Quick Actions */}
        <div style={panel}>
          <Hdr title="Quick Actions" icon={<Bolt />} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 4,
            }}
          >
            {B.pipeline.map((s, i) => (
              <Btn
                key={i}
                small
                style={{ justifyContent: "flex-start", fontSize: 8 }}
              >
                {s.label}
              </Btn>
            ))}
          </div>
        </div>

        {/* Build History */}
        <div style={panel}>
          <Hdr title="Build History" icon={null} />
          {B.history.map((h, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 0",
                borderBottom:
                  i < B.history.length - 1
                    ? `1px solid ${C.b1}`
                    : "none",
                fontSize: 9,
                fontFamily: MONO,
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  background: h.ok ? C.ok : C.err,
                }}
              />
              <span style={{ color: C.t3, width: 34 }}>{h.time}</span>
              <span style={{ color: C.t1, flex: 1 }}>Fmax: {h.fmax}</span>
              <span style={{ color: C.t3 }}>{h.util}</span>
              {h.w > 0 && <Badge color={C.warn}>{h.w}W</Badge>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default BuildPipeline;
