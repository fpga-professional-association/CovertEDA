import { useState, useMemo, useEffect, useRef } from "react";
import { useTheme } from "../context/ThemeContext";
import { RADIANT_DEVICES, DeviceInfo } from "../data/devices";

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
}

export default function DevicePicker({ value, onChange, backendId }: DevicePickerProps) {
  const { C, MONO } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // For now, only Radiant has a device database
  const devices = backendId === "radiant" ? RADIANT_DEVICES : [];

  const filtered = useMemo(() => {
    if (!query) return devices;
    const q = query.toLowerCase();
    return devices.filter(
      (d) =>
        d.partNumber.toLowerCase().includes(q) ||
        d.family.toLowerCase().includes(q),
    );
  }, [devices, query]);

  // Group by family
  const grouped = useMemo(() => {
    const groups: { family: string; items: DeviceInfo[] }[] = [];
    const familyMap = new Map<string, DeviceInfo[]>();
    for (const d of filtered) {
      const arr = familyMap.get(d.family);
      if (arr) arr.push(d);
      else familyMap.set(d.family, [d]);
    }
    for (const [family, items] of familyMap) {
      groups.push({ family, items });
    }
    return groups;
  }, [filtered]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  if (devices.length === 0) {
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
          padding: "5px 8px",
          fontSize: 10,
          fontFamily: MONO,
          color: C.t1,
          outline: "none",
        }}
      />
    );
  }

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      {/* Input field */}
      <input
        ref={inputRef}
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
          padding: "5px 8px",
          fontSize: 10,
          fontFamily: MONO,
          color: C.t1,
          outline: "none",
          boxSizing: "border-box",
        }}
      />

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            minWidth: 460,
            zIndex: 100,
            background: C.s1,
            border: `1px solid ${C.b1}`,
            borderRadius: 6,
            marginTop: 2,
            maxHeight: 320,
            overflowY: "auto",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          {grouped.length === 0 && (
            <div style={{ padding: "8px 12px", fontSize: 9, fontFamily: MONO, color: C.t3 }}>
              No matching devices
            </div>
          )}
          {grouped.map((g) => (
            <div key={g.family}>
              {/* Family header */}
              <div
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
                }}
              >
                {g.family.toUpperCase()}
              </div>
              {/* Device rows */}
              {g.items.map((d) => {
                const selected = d.partNumber === value;
                return (
                  <div
                    key={d.partNumber}
                    onClick={() => {
                      onChange(d.partNumber);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="ceda-dp-row"
                    style={{
                      ["--ceda-hover-bg" as string]: `${C.s3}88`,
                      display: "grid",
                      gridTemplateColumns: "1fr 60px 50px 80px",
                      gap: 8,
                      padding: "5px 12px",
                      fontSize: 10,
                      fontFamily: MONO,
                      cursor: "pointer",
                      background: selected ? `${C.accent}10` : "transparent",
                    }}
                  >
                    <span style={{ color: selected ? C.accent : C.t1, fontWeight: selected ? 600 : 400, whiteSpace: "nowrap" }}>
                      {d.partNumber}
                    </span>
                    <span style={{ color: C.t3, textAlign: "right" }}>
                      {d.luts >= 1000 ? `${Math.round(d.luts / 1000)}K` : d.luts} LUT
                    </span>
                    <span style={{ color: C.t3, textAlign: "right" }}>
                      {d.io} I/O
                    </span>
                    <span style={{ color: C.t3, textAlign: "right", whiteSpace: "nowrap" }}>
                      {d.package}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
