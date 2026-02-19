import React, { useState, useRef, useEffect, useCallback, ReactNode } from "react";
import { useTheme } from "../context/ThemeContext";

// ── Badge ──
export function Badge({
  children,
  color,
  style,
}: {
  children: ReactNode;
  color?: string;
  style?: React.CSSProperties;
}) {
  const { C, MONO } = useTheme();
  const c = color ?? C.accent;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 6px",
        borderRadius: 3,
        fontSize: 9,
        fontFamily: MONO,
        fontWeight: 600,
        color: c,
        background: `${c}18`,
        letterSpacing: 0.3,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ── Button ──
export function Btn({
  children,
  onClick,
  primary,
  small,
  disabled,
  style: sx,
  icon,
}: {
  children: ReactNode;
  onClick?: () => void;
  primary?: boolean;
  small?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
  icon?: ReactNode;
}) {
  const { C, MONO } = useTheme();
  const [h, setH] = useState(false);
  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: small ? "2px 8px" : "6px 12px",
        borderRadius: 4,
        border: primary ? "none" : `1px solid ${C.b1}`,
        fontFamily: MONO,
        fontSize: small ? 9 : 10,
        fontWeight: 600,
        background: primary
          ? h
            ? "#4da6ff"
            : C.accent
          : h
            ? C.s3
            : "transparent",
        color: primary ? "#fff" : C.t2,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "all .1s",
        ...sx,
      }}
    >
      {icon && <span style={{ display: "flex" }}>{icon}</span>}
      {children}
    </button>
  );
}

// ── Hoverable Row ──
export function HoverRow({
  children,
  style: sx,
  onClick,
}: {
  children: ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  const { C } = useTheme();
  const [h, setH] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        background: h ? C.s3 : "transparent",
        cursor: onClick ? "pointer" : "default",
        transition: "background .06s",
        ...sx,
      }}
    >
      {children}
    </div>
  );
}

// ── Navigation Button ──
export function NavBtn({
  icon,
  label,
  active,
  onClick,
  accent,
  badge,
  tooltip,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  accent?: string;
  badge?: boolean;
  tooltip?: string;
}) {
  const { C, MONO } = useTheme();
  const [h, setH] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      title={tooltip ?? label}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        padding: "8px 4px",
        cursor: "pointer",
        borderRadius: 5,
        position: "relative",
        background: active ? C.accentDim : h ? C.s3 : "transparent",
        color: active ? accent || C.accent : h ? C.t2 : C.t3,
        borderLeft: active
          ? `2px solid ${accent || C.accent}`
          : "2px solid transparent",
        transition: "all .1s",
        minWidth: 52,
      }}
    >
      <span style={{ display: "flex" }}>{icon}</span>
      <span
        style={{
          fontSize: 7,
          fontFamily: MONO,
          fontWeight: 600,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </span>
      {badge && (
        <span
          style={{
            position: "absolute",
            top: 4,
            right: 6,
            width: 6,
            height: 6,
            borderRadius: 3,
            background: accent || C.accent,
          }}
        />
      )}
    </div>
  );
}

// ── Input ──
export function Input({
  value,
  onChange,
  placeholder,
  style: sx,
  readOnly,
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  readOnly?: boolean;
}) {
  const { C, MONO } = useTheme();
  return (
    <input
      value={value}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      placeholder={placeholder}
      readOnly={readOnly}
      style={{
        width: "100%",
        padding: "6px 10px",
        borderRadius: 4,
        border: `1px solid ${C.b1}`,
        background: C.bg,
        color: C.t1,
        fontFamily: MONO,
        fontSize: 11,
        outline: "none",
        ...sx,
      }}
    />
  );
}

// ── Custom Select Dropdown ──
export function Select({
  value,
  onChange,
  options,
  placeholder,
  style: sx,
  compact,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  style?: React.CSSProperties;
  compact?: boolean;
}) {
  const { C, MONO } = useTheme();
  const [open, setOpen] = useState(false);
  const [hIdx, setHIdx] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);

  const close = useCallback(() => { setOpen(false); setHIdx(-1); }, []);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, close]);

  const selected = options.find((o) => o.value === value);
  const fontSize = compact ? 8 : 9;
  const pad = compact ? "2px 6px" : "3px 8px";

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block", ...sx }}>
      <div
        onClick={() => setOpen((p) => !p)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 4,
          padding: pad,
          borderRadius: 3,
          border: `1px solid ${open ? C.accent : C.b1}`,
          background: C.s1,
          color: selected ? C.t1 : C.t3,
          fontFamily: MONO,
          fontSize,
          fontWeight: 600,
          cursor: "pointer",
          minWidth: compact ? 80 : 100,
          transition: "border-color .1s",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {selected ? selected.label : (placeholder ?? "Select...")}
        </span>
        <span style={{ fontSize: 6, color: C.t3, flexShrink: 0 }}>{open ? "\u25B2" : "\u25BC"}</span>
      </div>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            minWidth: "100%",
            width: "max-content",
            maxHeight: 300,
            overflowY: "auto",
            background: C.s1,
            border: `1px solid ${C.b1}`,
            borderRadius: 4,
            marginTop: 2,
            zIndex: 999,
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          {options.map((o, i) => (
            <div
              key={o.value}
              onMouseEnter={() => setHIdx(i)}
              onMouseLeave={() => setHIdx(-1)}
              onClick={() => { onChange(o.value); close(); }}
              style={{
                padding: pad,
                fontSize,
                fontFamily: MONO,
                fontWeight: 600,
                color: o.value === value ? C.accent : C.t1,
                background: hIdx === i ? C.s3 : "transparent",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Resource Bar ──
export function ResourceBar({
  label,
  used,
  total,
}: {
  label: string;
  used: number;
  total: number;
}) {
  const { C, MONO } = useTheme();
  const p = Math.round((used / total) * 100);
  const col = p > 85 ? C.err : p > 65 ? C.warn : C.accent;
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 9,
          fontFamily: MONO,
          marginBottom: 2,
        }}
      >
        <span style={{ color: C.t2 }}>{label}</span>
        <span style={{ color: col }}>
          {used.toLocaleString()}/{total.toLocaleString()} ({p}%)
        </span>
      </div>
      <div
        style={{
          height: 4,
          borderRadius: 2,
          background: C.b1,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            borderRadius: 2,
            width: `${p}%`,
            background: `linear-gradient(90deg, ${col}88, ${col})`,
          }}
        />
      </div>
    </div>
  );
}
