import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../context/ThemeContext";
import { DEVICE_MAP, DeviceFamily, parsePartInfo, DeviceInfo } from "../data/deviceParts";

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
  edition?: string | null;
  compact?: boolean;
}

// Cache parsed device info to avoid re-parsing
const infoCache = new Map<string, DeviceInfo>();
function getInfo(part: string): DeviceInfo {
  let info = infoCache.get(part);
  if (!info) {
    info = parsePartInfo(part);
    infoCache.set(part, info);
  }
  return info;
}

export default function DevicePicker({ value, onChange, backendId, edition, compact }: DevicePickerProps) {
  const { C, MONO, SANS } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Start with all families collapsed — users expand the one they want
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());
  const [customPart, setCustomPart] = useState("");
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [detailPart, setDetailPart] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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

  const totalParts = useMemo(() => families.reduce((sum, f) => sum + f.parts.length, 0), [families]);

  const toggleFamily = useCallback((family: string) => {
    setExpandedFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(family)) next.delete(family);
      else next.add(family);
      return next;
    });
  }, []);

  // When searching, auto-expand families that have matches
  useEffect(() => {
    if (query) {
      const matching = new Set(filtered.map((f) => f.family));
      setExpandedFamilies(matching);
    }
  }, [query, filtered]);

  const handleConfirm = useCallback(() => {
    if (selectedPart) {
      onChange(selectedPart);
      setOpen(false);
      setQuery("");
      setCustomPart("");
      setSelectedPart(null);
      setDetailPart(null);
    }
  }, [selectedPart, onChange]);

  const handleCustomSubmit = useCallback(() => {
    const trimmed = customPart.trim();
    if (trimmed) {
      onChange(trimmed);
      setOpen(false);
      setQuery("");
      setCustomPart("");
      setSelectedPart(null);
      setDetailPart(null);
    }
  }, [customPart, onChange]);

  // Reset state when modal opens
  const handleOpen = useCallback(() => {
    setOpen(true);
    setQuery("");
    setSelectedPart(value || null);
    setDetailPart(null);
    setExpandedFamilies(new Set());
  }, [value]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (detailPart) setDetailPart(null);
        else setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, detailPart]);

  // Auto-focus search when modal opens
  useEffect(() => {
    if (open && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  const fontSize = compact ? 8 : 10;

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

  // ── Compact trigger button ──
  const trigger = (
    <div
      onClick={handleOpen}
      title="Click to browse device families and select a target part"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        background: C.bg,
        border: `1px solid ${C.b1}`,
        borderRadius: 4,
        padding: compact ? "1px 6px" : "5px 8px",
        fontSize,
        fontFamily: MONO,
        color: C.t1,
        cursor: "pointer",
        boxSizing: "border-box",
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value || "Select device..."}
      </span>
      <span style={{ fontSize: 7, color: C.t3, marginLeft: 6, flexShrink: 0 }}>{"\u25BC"}</span>
    </div>
  );

  // ── Detail panel for a specific part ──
  const detailInfo = detailPart ? getInfo(detailPart) : null;
  const detailFamily = detailPart
    ? families.find((f) => f.parts.includes(detailPart))?.family ?? "—"
    : "—";

  const detailPanel = detailPart && detailInfo && (
    <div style={{
      padding: "12px 16px",
      borderBottom: `1px solid ${C.b1}`,
      background: `${C.accent}06`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span
          onClick={() => setDetailPart(null)}
          style={{ fontSize: 8, fontFamily: MONO, color: C.t3, cursor: "pointer" }}
          title="Back to device list"
        >
          {"\u2190"} Back
        </span>
        <span style={{ fontSize: 11, fontFamily: MONO, fontWeight: 700, color: C.accent }}>
          {detailPart}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {[
          { label: "Family", value: detailFamily },
          { label: "Logic", value: detailInfo.logic },
          { label: "Pins", value: detailInfo.pins },
          { label: "Package", value: detailInfo.package },
          { label: "Speed Grade", value: detailInfo.speed },
          { label: "Temp Grade", value: detailInfo.grade },
        ].map((item) => (
          <div key={item.label} style={{
            padding: "6px 8px",
            background: C.bg,
            borderRadius: 4,
            border: `1px solid ${C.b1}`,
          }}>
            <div style={{ fontSize: 7, fontFamily: MONO, fontWeight: 600, color: C.t3, letterSpacing: 0.3, marginBottom: 2 }}>
              {item.label.toUpperCase()}
            </div>
            <div style={{ fontSize: 10, fontFamily: MONO, fontWeight: 600, color: C.t1 }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          onClick={() => setSelectedPart(detailPart)}
          style={{
            padding: "5px 14px", borderRadius: 4, fontSize: 9, fontFamily: SANS, fontWeight: 600,
            border: `1px solid ${selectedPart === detailPart ? C.ok : C.accent}`,
            background: selectedPart === detailPart ? `${C.ok}18` : `${C.accent}18`,
            color: selectedPart === detailPart ? C.ok : C.accent,
            cursor: "pointer",
          }}
          title="Select this part"
        >
          {selectedPart === detailPart ? "\u2713 Selected" : "Select This Part"}
        </button>
      </div>
    </div>
  );

  // ── Modal (portal to document.body) ──
  const modal = open && createPortal(
    <div
      onClick={() => setOpen(false)}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 680,
          maxHeight: "80vh",
          background: C.s1,
          borderRadius: 10,
          border: `1px solid ${C.b1}`,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: `1px solid ${C.b1}`,
        }}>
          <span style={{ fontSize: 12, fontFamily: SANS, fontWeight: 700, color: C.t1 }}>
            Select Target Device
          </span>
          <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>
            {totalParts} parts in {families.length} families
          </span>
          <button
            onClick={() => setOpen(false)}
            title="Close device picker"
            style={{
              background: "transparent",
              border: "none",
              color: C.t3,
              fontSize: 16,
              cursor: "pointer",
              padding: "0 4px",
              lineHeight: 1,
            }}
          >
            {"\u2715"}
          </button>
        </div>

        {/* Search input */}
        <div style={{ padding: "8px 16px", borderBottom: `1px solid ${C.b1}` }}>
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by part number or family name..."
            style={{
              width: "100%",
              background: C.bg,
              border: `1px solid ${C.b1}`,
              borderRadius: 4,
              padding: "6px 10px",
              fontSize: 10,
              fontFamily: MONO,
              color: C.t1,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Detail panel (shown when user clicks a part's info button) */}
        {detailPanel}

        {/* Scrollable family list */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {filtered.length === 0 && (
            <div style={{ padding: "16px", fontSize: 10, fontFamily: MONO, color: C.t3, textAlign: "center" }}>
              No matching devices for &quot;{query}&quot;
            </div>
          )}
          {filtered.map((g) => {
            const expanded = expandedFamilies.has(g.family);
            return (
              <div key={g.family}>
                {/* Family header — clickable to collapse/expand */}
                <div
                  onClick={() => toggleFamily(g.family)}
                  style={{
                    padding: "6px 16px",
                    fontSize: 9,
                    fontFamily: MONO,
                    fontWeight: 700,
                    color: C.t2,
                    letterSpacing: 0.5,
                    background: C.s2,
                    borderBottom: `1px solid ${C.b1}`,
                    position: "sticky",
                    top: 0,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    zIndex: 1,
                  }}
                >
                  <span style={{ fontSize: 7 }}>{expanded ? "\u25BC" : "\u25B6"}</span>
                  {g.family.toUpperCase()}
                  <span style={{ fontWeight: 400, color: C.t3, fontSize: 8 }}>
                    ({g.parts.length} part{g.parts.length !== 1 ? "s" : ""})
                  </span>
                </div>
                {/* Device rows */}
                {expanded && g.parts.map((p) => {
                  const isSelected = p === selectedPart;
                  const info = getInfo(p);
                  return (
                    <div
                      key={p}
                      className="ceda-dp-row"
                      style={{
                        ["--ceda-hover-bg" as string]: `${C.accent}15`,
                        padding: "4px 16px 4px 24px",
                        fontSize: 10,
                        fontFamily: MONO,
                        cursor: "pointer",
                        background: isSelected ? `${C.accent}18` : "transparent",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {/* Radio-style select indicator */}
                      <span
                        onClick={(e) => { e.stopPropagation(); setSelectedPart(p); if (detailPart) setDetailPart(p); }}
                        style={{
                          width: 12, height: 12, borderRadius: 6, flexShrink: 0,
                          border: `1.5px solid ${isSelected ? C.accent : C.b1}`,
                          background: isSelected ? C.accent : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer",
                        }}
                        title="Select this part"
                      >
                        {isSelected && <span style={{ fontSize: 7, color: C.bg, fontWeight: 700 }}>{"\u2713"}</span>}
                      </span>
                      {/* Part name */}
                      <span
                        onClick={() => { setSelectedPart(p); if (detailPart) setDetailPart(p); }}
                        style={{
                          color: isSelected ? C.accent : C.t1,
                          fontWeight: isSelected ? 600 : 400,
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p}
                      </span>
                      {/* Pin count badge */}
                      {info.pins !== "—" && (
                        <span style={{
                          fontSize: 7, fontFamily: MONO, color: C.t3, fontWeight: 600,
                          padding: "1px 4px", borderRadius: 3, background: `${C.cyan}12`,
                          whiteSpace: "nowrap",
                        }} title={`${info.pins} pins (${info.package})`}>
                          {info.pins}p
                        </span>
                      )}
                      {/* Logic badge */}
                      {info.logic !== "—" && (
                        <span style={{
                          fontSize: 7, fontFamily: MONO, color: C.t3, fontWeight: 600,
                          padding: "1px 4px", borderRadius: 3, background: `${C.ok}12`,
                          whiteSpace: "nowrap",
                        }} title={`Logic: ${info.logic}`}>
                          {info.logic}
                        </span>
                      )}
                      {/* Info button — click to see full details */}
                      <span
                        onClick={(e) => { e.stopPropagation(); setDetailPart(p); }}
                        style={{
                          fontSize: 8, fontFamily: MONO, color: C.t3, cursor: "pointer",
                          padding: "1px 5px", borderRadius: 3, border: `1px solid ${C.b1}`,
                          whiteSpace: "nowrap",
                        }}
                        title="View device details"
                      >
                        Info
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
              padding: "8px 16px",
              fontSize: 8,
              fontFamily: MONO,
              color: C.t3,
              borderTop: `1px solid ${C.b1}`,
            }}>
              {hiddenCount} part{hiddenCount !== 1 ? "s" : ""} hidden (requires Quartus {hiddenEdition.charAt(0).toUpperCase() + hiddenEdition.slice(1)})
            </div>
          )}
        </div>

        {/* Footer: Custom Part + OK/Cancel */}
        <div style={{
          padding: "10px 16px",
          borderTop: `1px solid ${C.b1}`,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}>
          {/* Custom part row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 8, fontFamily: SANS, color: C.t3, whiteSpace: "nowrap" }}>
              Custom:
            </span>
            <input
              value={customPart}
              onChange={(e) => setCustomPart(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCustomSubmit(); }}
              placeholder="Enter custom part number"
              style={{
                flex: 1,
                background: C.bg,
                border: `1px solid ${C.b1}`,
                borderRadius: 4,
                padding: "4px 8px",
                fontSize: 9,
                fontFamily: MONO,
                color: C.t1,
                outline: "none",
              }}
            />
            <button
              onClick={handleCustomSubmit}
              disabled={!customPart.trim()}
              title="Use this custom part number"
              style={{
                padding: "4px 10px",
                borderRadius: 4,
                fontSize: 8,
                fontFamily: SANS,
                fontWeight: 600,
                border: `1px solid ${customPart.trim() ? C.accent : C.b1}`,
                background: customPart.trim() ? `${C.accent}18` : "transparent",
                color: customPart.trim() ? C.accent : C.t3,
                cursor: customPart.trim() ? "pointer" : "default",
              }}
            >
              Use Custom
            </button>
          </div>
          {/* OK / Cancel buttons */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            {selectedPart && (
              <span style={{ fontSize: 9, fontFamily: MONO, color: C.t2, alignSelf: "center", marginRight: "auto" }}>
                Selected: <span style={{ color: C.accent, fontWeight: 600 }}>{selectedPart}</span>
              </span>
            )}
            <button
              onClick={() => setOpen(false)}
              style={{
                padding: "5px 14px", borderRadius: 4, fontSize: 9, fontFamily: SANS, fontWeight: 600,
                border: `1px solid ${C.b1}`, background: "transparent", color: C.t2,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedPart}
              title={selectedPart ? `Confirm selection: ${selectedPart}` : "Select a device first"}
              style={{
                padding: "5px 18px", borderRadius: 4, fontSize: 9, fontFamily: SANS, fontWeight: 600,
                border: `1px solid ${selectedPart ? C.accent : C.b1}`,
                background: selectedPart ? `${C.accent}18` : "transparent",
                color: selectedPart ? C.accent : C.t3,
                cursor: selectedPart ? "pointer" : "default",
              }}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {trigger}
      {modal}
    </div>
  );
}
