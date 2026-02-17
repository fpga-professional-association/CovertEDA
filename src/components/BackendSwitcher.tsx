import { useState } from "react";
import { C, MONO, SANS, Backend } from "../types";
import { Badge } from "./shared";

interface BackendOptionProps {
  b: Backend;
  active: boolean;
  onPick: () => void;
}

function BackendOption({ b, active, onPick }: BackendOptionProps) {
  const [h, setH] = useState(false);
  return (
    <div
      onClick={onPick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        background: active ? `${b.color}15` : h ? C.s3 : "transparent",
        borderLeft: `3px solid ${active ? b.color : "transparent"}`,
        cursor: "pointer",
        transition: "all .1s",
      }}
    >
      <span style={{ fontSize: 16, color: b.color }}>{b.icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.t1, fontFamily: SANS }}>
          {b.name}
        </div>
        <div style={{ fontSize: 9, fontFamily: MONO, color: C.t3 }}>
          {b.cli} \u2022 {b.defaultDev}
        </div>
      </div>
      <Badge color={b.color}>{b.version}</Badge>
    </div>
  );
}

interface BackendSwitcherProps {
  open: boolean;
  onClose: () => void;
  backends: Record<string, Backend>;
  activeId: string;
  onSwitch: (id: string) => void;
}

export default function BackendSwitcher({
  open,
  onClose,
  backends,
  activeId,
  onSwitch,
}: BackendSwitcherProps) {
  if (!open) return null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 800 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top: 70,
          left: 56,
          width: 320,
          background: C.s1,
          border: `1px solid ${C.b2}`,
          borderRadius: 8,
          overflow: "hidden",
          boxShadow: "0 12px 40px rgba(0,0,0,.5)",
          animation: "slideDown .1s ease",
        }}
      >
        <div
          style={{
            padding: "8px 12px",
            fontSize: 8,
            fontFamily: MONO,
            fontWeight: 700,
            letterSpacing: 1.5,
            color: C.t3,
            borderBottom: `1px solid ${C.b1}`,
          }}
        >
          SELECT BACKEND
        </div>
        {Object.values(backends).map((b) => (
          <BackendOption
            key={b.id}
            b={b}
            active={b.id === activeId}
            onPick={() => {
              onSwitch(b.id);
              onClose();
            }}
          />
        ))}
      </div>
    </div>
  );
}
