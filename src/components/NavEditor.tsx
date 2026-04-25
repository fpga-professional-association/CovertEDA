// Modal that lets the user reorder the left-rail nav buttons. Pulled out
// of the rail itself so accidental drags don't move buttons mid-click —
// users now opt in by clicking "Edit menu", reorder in a dedicated screen,
// and Save to commit.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../context/ThemeContext";
import { Btn } from "./shared";

export interface NavEditorItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  tooltip?: string;
  accent?: string;
}

interface NavEditorProps {
  /** All known nav items keyed by their canonical order. Pass the SAME set
      shown in the rail (the editor never shows items not in this list). */
  items: NavEditorItem[];
  /** Current user-customised order (ids). Items in the registry but not
      here will be appended; ids here but missing from the registry are
      dropped. */
  currentOrder: string[];
  /** Default order to reset to. */
  defaultOrder: string[];
  /** Called with the new order when the user clicks Save. */
  onSave: (next: string[]) => void;
  /** Called when the user closes the modal without saving. */
  onClose: () => void;
}

export default function NavEditor({
  items, currentOrder, defaultOrder, onSave, onClose,
}: NavEditorProps) {
  const { C, MONO, SANS } = useTheme();

  // Local working copy so the rail doesn't change until Save.
  const itemsById = new Map(items.map((it) => [it.id, it]));
  const init = currentOrder
    .filter((id) => itemsById.has(id))
    .concat(items.map((it) => it.id).filter((id) => !currentOrder.includes(id)));
  const [order, setOrder] = useState<string[]>(init);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Reorder via the up/down arrow buttons on each row.
  const moveOne = (id: string, dir: -1 | 1) => {
    setOrder((cur) => {
      const idx = cur.indexOf(id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= cur.length) return cur;
      const next = [...cur];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const reset = () => setOrder(defaultOrder.filter((id) => itemsById.has(id)));

  const body = (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460,
          maxHeight: "85vh",
          background: C.bg,
          border: `1px solid ${C.b1}`,
          borderRadius: 8,
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "14px 18px",
          borderBottom: `1px solid ${C.b1}`,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.t1, fontFamily: SANS }}>
              Edit Menu
            </div>
            <div style={{ fontSize: 10, color: C.t3, fontFamily: MONO, marginTop: 2 }}>
              Use the up/down arrows on each row to reorder the left
              navigation. Changes apply when you click Save.
            </div>
          </div>
          <Btn small onClick={reset}>Reset to default</Btn>
        </div>

        {/* Reorderable list */}
        <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
          {order.map((id, idx) => {
            const it = itemsById.get(id);
            if (!it) return null;
            return (
              <div
                key={id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 12px",
                  margin: "4px 0",
                  background: C.s1,
                  border: `1px solid ${C.b1}`,
                  borderRadius: 6,
                }}
              >
                {/* Icon */}
                <span style={{
                  width: 22, height: 22,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: it.accent ?? C.accent, flexShrink: 0,
                }}>
                  {it.icon}
                </span>
                {/* Label + tooltip */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.t1, fontFamily: SANS }}>
                    {it.label}
                  </div>
                  {it.tooltip && (
                    <div style={{
                      fontSize: 9, color: C.t3, fontFamily: MONO,
                      marginTop: 2, lineHeight: 1.4,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {it.tooltip}
                    </div>
                  )}
                </div>
                {/* Position + arrow buttons */}
                <span style={{
                  fontSize: 8, fontFamily: MONO, color: C.t3,
                  width: 24, textAlign: "right", flexShrink: 0,
                }}>
                  {idx + 1}
                </span>
                <button
                  onClick={() => moveOne(id, -1)}
                  disabled={idx === 0}
                  title="Move up"
                  style={navArrowStyle(C, MONO, idx === 0)}
                >{"\u25B2"}</button>
                <button
                  onClick={() => moveOne(id, +1)}
                  disabled={idx === order.length - 1}
                  title="Move down"
                  style={navArrowStyle(C, MONO, idx === order.length - 1)}
                >{"\u25BC"}</button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 18px",
          borderTop: `1px solid ${C.b1}`,
          display: "flex", justifyContent: "flex-end", gap: 8,
        }}>
          <Btn small onClick={onClose}>Cancel</Btn>
          <Btn small primary onClick={() => { onSave(order); onClose(); }}>
            Save
          </Btn>
        </div>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}

function navArrowStyle(C: ReturnType<typeof useTheme>["C"], MONO: string, disabled: boolean): React.CSSProperties {
  return {
    width: 22, height: 22,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "transparent",
    color: disabled ? C.t3 : C.t2,
    border: `1px solid ${C.b1}`,
    borderRadius: 3,
    fontSize: 9, fontFamily: MONO,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    flexShrink: 0,
  };
}
