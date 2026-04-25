import React, { useState, useRef, useEffect, useCallback, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../context/ThemeContext";

// ── Inject CSS hover rules once ──
if (typeof document !== "undefined" && !document.getElementById("ceda-shared-hover")) {
  const style = document.createElement("style");
  style.id = "ceda-shared-hover";
  style.textContent = `
    .ceda-btn:not(:disabled):hover { background: var(--ceda-hover-bg) !important; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
    .ceda-hover-row:hover { background: var(--ceda-hover-bg) !important; }
    .ceda-nav-btn:not(.ceda-nav-active):hover { background: var(--ceda-hover-bg) !important; color: var(--ceda-hover-color) !important; }
  `;
  document.head.appendChild(style);
}

// ── Badge ──
export function Badge({
  children,
  color,
  style,
  title,
}: {
  children: ReactNode;
  color?: string;
  style?: React.CSSProperties;
  title?: string;
}) {
  const { C, MONO } = useTheme();
  const c = color ?? C.accent;
  return (
    <span
      title={title}
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
        transition: "opacity 100ms ease-out",
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
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  primary?: boolean;
  small?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
  icon?: ReactNode;
  title?: string;
}) {
  const { C, MONO } = useTheme();
  return (
    <button
      className="ceda-btn"
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      title={title}
      style={{
        ["--ceda-hover-bg" as string]: primary ? "#4da6ff" : C.s3,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: small ? "3px 7px" : "5px 10px",
        borderRadius: 4,
        border: primary ? "none" : `1px solid ${C.b1}`,
        fontFamily: MONO,
        fontSize: small ? 9 : 9,
        fontWeight: 600,
        background: primary ? C.accent : "transparent",
        color: primary ? "#fff" : C.t2,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "background-color 100ms ease-out, border-color 100ms ease-out, color 100ms ease-out, opacity 100ms ease-out, box-shadow 100ms ease-out",
        minHeight: small ? 24 : undefined,
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
  title,
}: {
  children: ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
  title?: string;
}) {
  const { C } = useTheme();
  return (
    <div
      className="ceda-hover-row"
      onClick={onClick}
      title={title}
      style={{
        ["--ceda-hover-bg" as string]: C.s3,
        background: "transparent",
        cursor: onClick ? "pointer" : "default",
        transition: "background-color 100ms ease-out",
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
  return (
    <div
      className={`ceda-nav-btn${active ? " ceda-nav-active" : ""}`}
      onClick={onClick}
      title={tooltip ?? label}
      style={{
        ["--ceda-hover-bg" as string]: C.s3,
        ["--ceda-hover-color" as string]: C.t2,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        padding: "10px 6px",
        // Inherit cursor from parent (so drag wrappers can show "grab"
        // without this child overriding). Falls back to pointer when used
        // outside a draggable container.
        cursor: "inherit",
        borderRadius: 6,
        position: "relative",
        background: active ? C.accentDim : "transparent",
        color: active ? accent || C.accent : C.t3,
        borderLeft: active
          ? `3px solid ${accent || C.accent}`
          : "3px solid transparent",
        minWidth: 64,
        width: "100%",
        transition: "background-color 100ms ease-out, color 100ms ease-out, border-color 100ms ease-out",
      }}
    >
      <span style={{ display: "flex", transform: "scale(1.35)" }}>{icon}</span>
      <span
        style={{
          fontSize: 9,
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
  title,
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  readOnly?: boolean;
  title?: string;
}) {
  const { C, MONO } = useTheme();
  return (
    <input
      value={value}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      placeholder={placeholder}
      readOnly={readOnly}
      title={title}
      style={{
        width: "100%",
        padding: "5px 8px",
        borderRadius: 4,
        border: `1px solid ${C.b1}`,
        background: C.bg,
        color: C.t1,
        fontFamily: MONO,
        fontSize: 11,
        outline: "none",
        transition: "border-color 100ms ease-out",
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
  title,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  style?: React.CSSProperties;
  compact?: boolean;
  title?: string;
}) {
  const { C, MONO } = useTheme();
  const [open, setOpen] = useState(false);
  const [hIdx, setHIdx] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Portal positioning — recomputed every time the dropdown opens or the
  // page scrolls/resizes so the listbox stays anchored to the trigger.
  const [pos, setPos] = useState<{ left: number; top: number; width: number; openUp: boolean; maxH: number } | null>(null);

  const close = useCallback(() => { setOpen(false); setHIdx(-1); setPos(null); }, []);

  // Recalculate position based on trigger's viewport rect. Flip up when
  // there isn't enough room below.
  const recalc = useCallback(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const ROW = compact ? 22 : 26;
    const desired = Math.min(options.length * ROW + 8, 320);
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const spaceAbove = r.top - 8;
    const openUp = spaceBelow < desired && spaceAbove > spaceBelow;
    const maxH = Math.max(120, openUp ? Math.min(desired, spaceAbove) : Math.min(desired, spaceBelow));
    setPos({
      left: r.left,
      top: openUp ? r.top - maxH - 4 : r.bottom + 2,
      width: r.width,
      openUp,
      maxH,
    });
  }, [compact, options.length]);

  useEffect(() => {
    if (!open) return;
    recalc();
    const h = (e: MouseEvent) => {
      const insideTrigger = ref.current && ref.current.contains(e.target as Node);
      const insideList = listRef.current && listRef.current.contains(e.target as Node);
      if (!insideTrigger && !insideList) close();
    };
    const reposition = () => recalc();
    document.addEventListener("mousedown", h);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", h);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, close, recalc]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen((p) => !p);
    } else if (e.key === "Escape") {
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) { setOpen(true); setHIdx(0); return; }
      setHIdx((p) => Math.min(p + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { setOpen(true); setHIdx(options.length - 1); return; }
      setHIdx((p) => Math.max(p - 1, 0));
    } else if ((e.key === "Enter" || e.key === " ") && open && hIdx >= 0) {
      e.preventDefault();
      onChange(options[hIdx].value);
      close();
    }
  }, [open, hIdx, options, onChange, close]);

  // Select highlighted option on Enter when dropdown is open
  const handleKeyDownInner = useCallback((e: React.KeyboardEvent) => {
    if (open && hIdx >= 0 && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onChange(options[hIdx].value);
      close();
    }
  }, [open, hIdx, options, onChange, close]);

  const selected = options.find((o) => o.value === value);
  const fontSize = compact ? 8 : 9;
  const pad = compact ? "2px 6px" : "3px 7px";

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block", ...sx }}>
      <div
        tabIndex={0}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        title={title}
        onClick={(e) => { e.stopPropagation(); setOpen((p) => !p); }}
        onKeyDown={(e) => { handleKeyDown(e); handleKeyDownInner(e); }}
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
          whiteSpace: "nowrap",
          transition: "border-color 100ms ease-out",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {selected ? selected.label : (placeholder ?? "Select...")}
        </span>
        <span style={{ fontSize: 6, color: C.t3, flexShrink: 0 }}>{open ? "\u25B2" : "\u25BC"}</span>
      </div>
      {open && pos && createPortal(
        <div
          ref={listRef}
          role="listbox"
          style={{
            position: "fixed",
            left: pos.left,
            top: pos.top,
            minWidth: pos.width,
            width: "max-content",
            maxWidth: Math.min(window.innerWidth - 16, Math.max(pos.width, 280)),
            maxHeight: pos.maxH,
            overflowY: "auto",
            background: C.s1,
            border: `1px solid ${C.b1}`,
            borderRadius: 4,
            zIndex: 10000,
            boxShadow: "0 6px 18px rgba(0,0,0,0.5)",
          }}
        >
          {options.map((o, i) => (
            <div
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              onMouseEnter={() => setHIdx(i)}
              onMouseLeave={() => setHIdx(-1)}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onChange(o.value); close(); }}
              style={{
                padding: pad,
                fontSize,
                fontFamily: MONO,
                fontWeight: 600,
                color: o.value === value ? C.accent : C.t1,
                background: hIdx === i ? C.s3 : "transparent",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "background-color 100ms ease-out",
              }}
            >
              {o.label}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── Resource Bar ──
export function ResourceBar({
  label,
  used,
  total,
  title,
}: {
  label: string;
  used: number;
  total: number;
  title?: string;
}) {
  const { C, MONO } = useTheme();
  const p = Math.round((used / total) * 100);
  const col = p > 85 ? C.err : p > 65 ? C.warn : C.accent;
  return (
    <div style={{ marginBottom: 12 }} title={title}>
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
            transition: "width 300ms ease-out",
          }}
        />
      </div>
    </div>
  );
}

// ── Collapsible ──
export function Collapsible({
  title,
  children,
  defaultOpen,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const { C, MONO } = useTheme();

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          padding: "8px 0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "transparent",
          border: "none",
          borderBottom: `1px solid ${C.b1}`,
          fontSize: 9,
          fontFamily: MONO,
          fontWeight: 600,
          color: C.t2,
          cursor: "pointer",
          transition: "color 100ms ease-out",
        }}
      >
        <span>{title}</span>
        <span style={{ color: C.t3 }}>{open ? "−" : "+"}</span>
      </button>
      {open && <div style={{ paddingTop: 8 }}>{children}</div>}
    </div>
  );
}
