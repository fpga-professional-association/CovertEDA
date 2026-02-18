import { useEffect, useRef } from "react";
import { useTheme } from "../context/ThemeContext";

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  icon?: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const { C, MONO } = useTheme();
  const ref = useRef<HTMLDivElement>(null);

  // Edge detection: adjust position if menu would overflow viewport
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right > vw) {
      ref.current.style.left = `${vw - rect.width - 4}px`;
    }
    if (rect.bottom > vh) {
      ref.current.style.top = `${vh - rect.height - 4}px`;
    }
  }, [x, y]);

  // Close on click outside or Escape
  useEffect(() => {
    const handleClick = () => onClose();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Delay adding click listener to avoid immediate close from the contextmenu event
    const timer = setTimeout(() => {
      window.addEventListener("click", handleClick);
    }, 0);
    window.addEventListener("keydown", handleKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        left: x,
        top: y,
        zIndex: 2000,
        background: C.s1,
        border: `1px solid ${C.b1}`,
        borderRadius: 6,
        padding: "4px 0",
        minWidth: 160,
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      }}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return (
            <div
              key={i}
              style={{
                height: 1,
                background: C.b1,
                margin: "4px 8px",
              }}
            />
          );
        }
        return (
          <div
            key={i}
            onClick={() => {
              if (item.disabled) return;
              item.onClick();
              onClose();
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) {
                (e.currentTarget as HTMLElement).style.background = `${C.s3}88`;
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 12px",
              fontSize: 10,
              fontFamily: MONO,
              color: item.disabled ? C.t3 : item.danger ? C.err : C.t2,
              cursor: item.disabled ? "default" : "pointer",
              opacity: item.disabled ? 0.5 : 1,
              transition: "background .08s",
            }}
          >
            {item.icon && (
              <span style={{ fontSize: 10, width: 14, textAlign: "center" }}>
                {item.icon}
              </span>
            )}
            {item.label}
          </div>
        );
      })}
    </div>
  );
}
