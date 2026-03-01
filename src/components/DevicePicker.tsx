import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../context/ThemeContext";
import { DEVICE_MAP, DeviceFamily } from "../data/deviceParts";

// ── Inject CSS hover for device picker rows ──
if (typeof document !== "undefined" && !document.getElementById("ceda-dp-hover")) {
  const s = document.createElement("style");
  s.id = "ceda-dp-hover";
  s.textContent = `.ceda-dp-row:hover { background: var(--ceda-hover-bg) !important; }`;
  document.head.appendChild(s);
}

interface DevicePickerProps {
  value: string;
  onChange: (partNumber: string) => void;
  backendId: string;
  edition?: string | null;  // e.g., "pro", "standard", "lite"
  compact?: boolean;        // smaller sizing for inline use in FileTree
}

export default function DevicePicker({ value, onChange, backendId, edition, compact }: DevicePickerProps) {
  const { C, MONO } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const [collapsedFamilies, setCollapsedFamilies] = useState<Set<string>>(new Set());
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);

  const allFamilies = DEVICE_MAP[backendId] ?? [];

  // Filter by edition if provided
  const { families, hiddenCount, hiddenEdition } = useMemo(() => {
    if (!edition || allFamilies.length === 0) {
      return { families: allFamilies, hiddenCount: 0, hiddenEdition: "" };
    }
    const visible: DeviceFamily[] = [];
    let hidden = 0;
    let hidEdition = "";
    for (const f of allFamilies) {
      if (!f.editions || f.editions.includes(edition)) {
        visible.push(f);
      } else {
        hidden += f.parts.length;
        // Figure out which edition they require
        const required = f.editions.find((e) => e !== edition);
        if (required) hidEdition = required;
      }
    }
    return { families: visible, hiddenCount: hidden, hiddenEdition: hidEdition };
  }, [allFamilies, edition]);

  const filtered = useMemo(() => {
    if (!query) return families;
    const q = query.toLowerCase();
    return families
      .map((f) => ({
        ...f,
        parts: f.parts.filter(
          (p) => p.toLowerCase().includes(q) || f.family.toLowerCase().includes(q),
        ),
      }))
      .filter((f) => f.parts.length > 0);
  }, [families, query]);

  const toggleFamily = (family: string) => {
    setCollapsedFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(family)) next.delete(family);
      else next.add(family);
      return next;
    });
  };

  // Recompute dropdown position from anchor element
  const updatePosition = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 2, left: rect.left });
  }, []);

  // When open, update position and listen for resize/scroll
  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  // Click outside to close — check both ref and portal dropdown
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      // Check if click is inside the anchor ref
      if (ref.current && ref.current.contains(target)) return;
      // Check if click is inside the portal dropdown
      const portal = document.getElementById("ceda-dp-portal");
      if (portal && portal.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const fontSize = compact ? 8 : 10;
  const minWidth = compact ? 320 : 460;

  if (families.length === 0 && !edition) {
    // Fallback: plain text input for backends without a device database
    return (
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Device part number"
        style={{
          width: "100%",
          background: C.bg,
          border: `1px solid ${C.b1}`,
          borderRadius: 4,
          padding: compact ? "1px 6px" : "5px 8px",
          fontSize,
          fontFamily: MONO,
          color: C.t1,
          outline: "none",
        }}
      />
    );
  }

  const dropdown = open && dropdownPos && (
    <div
      id="ceda-dp-portal"
      style={{
        position: "fixed",
        top: dropdownPos.top,
        left: dropdownPos.left,
        minWidth,
        zIndex: 10000,
        background: C.s1,
        border: `1px solid ${C.b1}`,
        borderRadius: 6,
        maxHeight: 320,
        overflowY: "auto",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      }}
    >
      {filtered.length === 0 && (
        <div style={{ padding: "8px 12px", fontSize: 9, fontFamily: MONO, color: C.t3 }}>
          No matching devices
        </div>
      )}
      {filtered.map((g) => {
        const collapsed = collapsedFamilies.has(g.family);
        return (
          <div key={g.family}>
            {/* Family header — clickable to collapse/expand */}
            <div
              onClick={() => toggleFamily(g.family)}
              style={{
                padding: "5px 10px",
                fontSize: 8,
                fontFamily: MONO,
                fontWeight: 700,
                color: C.t3,
                letterSpacing: 0.5,
                background: C.s2,
                borderBottom: `1px solid ${C.b1}`,
                position: "sticky",
                top: 0,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 6 }}>{collapsed ? "\u25B6" : "\u25BC"}</span>
              {g.family.toUpperCase()}
              <span style={{ fontWeight: 400, color: C.t3 }}>
                ({g.parts.length} part{g.parts.length !== 1 ? "s" : ""})
              </span>
            </div>
            {/* Device rows */}
            {!collapsed && g.parts.map((p) => {
              const selected = p === value;
              return (
                <div
                  key={p}
                  onClick={() => {
                    onChange(p);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="ceda-dp-row"
                  style={{
                    ["--ceda-hover-bg" as string]: `${C.s3}88`,
                    padding: "5px 12px",
                    fontSize,
                    fontFamily: MONO,
                    cursor: "pointer",
                    background: selected ? `${C.accent}10` : "transparent",
                  }}
                >
                  <span style={{ color: selected ? C.accent : C.t1, fontWeight: selected ? 600 : 400 }}>
                    {p}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
      {/* Edition filtering message */}
      {hiddenCount > 0 && (
        <div style={{
          padding: "6px 12px",
          fontSize: 8,
          fontFamily: MONO,
          color: C.t3,
          borderTop: `1px solid ${C.b1}`,
        }}>
          {hiddenCount} part{hiddenCount !== 1 ? "s" : ""} hidden (requires Quartus {hiddenEdition.charAt(0).toUpperCase() + hiddenEdition.slice(1)})
        </div>
      )}
    </div>
  );

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      {/* Input field */}
      <input
        value={open ? query : value}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        placeholder="Search devices..."
        style={{
          width: "100%",
          background: C.bg,
          border: `1px solid ${open ? C.accent : C.b1}`,
          borderRadius: 4,
          padding: compact ? "1px 6px" : "5px 8px",
          fontSize,
          fontFamily: MONO,
          color: C.t1,
          outline: "none",
          boxSizing: "border-box",
        }}
      />

      {/* Dropdown rendered via portal to escape overflow:hidden containers */}
      {dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}
