import { useState } from "react";
import { RuntimeBackend } from "../types";
import { useTheme } from "../context/ThemeContext";
import { Badge } from "./shared";

function BackendOption({
  b,
  active,
  onPick,
}: {
  b: RuntimeBackend;
  active: boolean;
  onPick: () => void;
}) {
  const { C, MONO, SANS } = useTheme();
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
        cursor: b.available ? "pointer" : "default",
        transition: "all .1s",
        opacity: b.available ? 1 : 0.5,
      }}
    >
      <span style={{ fontSize: 16, color: b.color }}>{b.icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.t1, fontFamily: SANS }}>
          {b.name}
        </div>
        <div style={{ fontSize: 9, fontFamily: MONO, color: C.t3 }}>
          {b.cli} {"\u2022"} {b.defaultDev}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
        <Badge color={b.color}>{b.version}</Badge>
        <span
          style={{
            fontSize: 7,
            fontFamily: MONO,
            fontWeight: 600,
            color: b.available ? C.ok : C.t3,
          }}
        >
          {b.available ? "AVAILABLE" : "NOT FOUND"}
        </span>
      </div>
    </div>
  );
}

interface BackendSwitcherProps {
  open: boolean;
  onClose: () => void;
  backends: RuntimeBackend[];
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
  const { C, MONO } = useTheme();
  if (!open) return null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 800 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top: 70,
          left: 56,
          width: 340,
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
        {backends.map((b) => (
          <BackendOption
            key={b.id}
            b={b}
            active={b.id === activeId}
            onPick={() => {
              if (b.available) {
                onSwitch(b.id);
                onClose();
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}
