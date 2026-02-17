import { useState } from "react";
import { C, MONO, SANS } from "../types";
import { HoverRow } from "./shared";
import { Search } from "./Icons";

interface Command {
  label: string;
  category: string;
  desc?: string;
  action?: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}

export default function CommandPalette({
  open,
  onClose,
  commands,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");

  if (!open) return null;

  const filtered = commands.filter(
    (c) =>
      !query ||
      (c.label + c.category).toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = (cmd: Command) => {
    onClose();
    setQuery("");
    cmd.action?.();
  };

  return (
    <div
      onClick={() => {
        onClose();
        setQuery("");
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.6)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: 80,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480,
          background: C.s1,
          border: `1px solid ${C.b2}`,
          borderRadius: 10,
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,.5)",
          animation: "slideDown .12s ease",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 12px",
            borderBottom: `1px solid ${C.b1}`,
          }}
        >
          <Search />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Commands: build, switch, reports, git..."
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              color: C.t1,
              fontSize: 12,
              fontFamily: SANS,
              outline: "none",
            }}
          />
          <span
            style={{
              fontSize: 8,
              fontFamily: MONO,
              color: C.t3,
              padding: "1px 4px",
              border: `1px solid ${C.b1}`,
              borderRadius: 2,
            }}
          >
            ESC
          </span>
        </div>
        <div style={{ maxHeight: 280, overflowY: "auto" }}>
          {filtered.map((cmd, i) => (
            <HoverRow
              key={i}
              onClick={() => handleSelect(cmd)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
              }}
            >
              <span
                style={{
                  fontSize: 8,
                  fontFamily: MONO,
                  color: C.t3,
                  width: 48,
                  letterSpacing: 0.5,
                }}
              >
                {cmd.category}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: C.t1 }}>{cmd.label}</div>
                {cmd.desc && (
                  <div style={{ fontSize: 9, fontFamily: MONO, color: C.t3 }}>
                    {cmd.desc}
                  </div>
                )}
              </div>
            </HoverRow>
          ))}
        </div>
      </div>
    </div>
  );
}
