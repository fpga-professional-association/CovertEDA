import { useTheme } from "../context/ThemeContext";

interface ShortcutGroup {
  category: string;
  shortcuts: { keys: string; desc: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    category: "General",
    shortcuts: [
      { keys: "Ctrl+K", desc: "Open command palette" },
      { keys: "Ctrl+B", desc: "Build project" },
      { keys: "Escape", desc: "Close dialogs/palettes" },
      { keys: "Ctrl+?", desc: "Toggle keyboard shortcuts" },
    ],
  },
  {
    category: "Zoom",
    shortcuts: [
      { keys: "Ctrl+=", desc: "Zoom in" },
      { keys: "Ctrl+-", desc: "Zoom out" },
      { keys: "Ctrl+0", desc: "Reset zoom (120%)" },
    ],
  },
  {
    category: "Navigation",
    shortcuts: [
      { keys: "Command palette", desc: "Type section names to navigate" },
    ],
  },
];

export default function KeyboardShortcuts({ onClose }: { onClose: () => void }) {
  const { C, MONO, SANS } = useTheme();

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, fontFamily: SANS,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.s1, border: `1px solid ${C.b1}`, borderRadius: 10,
          width: 400, maxHeight: "70vh", overflow: "auto", padding: "20px 24px",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: C.t1, marginBottom: 16 }}>
          Keyboard Shortcuts
        </div>

        {SHORTCUT_GROUPS.map((g) => (
          <div key={g.category} style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 9, fontFamily: MONO, fontWeight: 700, color: C.t3,
              letterSpacing: 1, marginBottom: 6,
            }}>
              {g.category.toUpperCase()}
            </div>
            {g.shortcuts.map((s) => (
              <div
                key={s.keys}
                style={{
                  display: "flex", alignItems: "center", padding: "5px 0",
                  borderBottom: `1px solid ${C.b1}20`,
                }}
              >
                <span style={{ fontSize: 10, color: C.t2, flex: 1 }}>{s.desc}</span>
                <kbd style={{
                  fontSize: 8, fontFamily: MONO, fontWeight: 600,
                  padding: "2px 8px", borderRadius: 3,
                  background: C.bg, border: `1px solid ${C.b1}`,
                  color: C.accent,
                }}>
                  {s.keys}
                </kbd>
              </div>
            ))}
          </div>
        ))}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <span
            onClick={onClose}
            style={{
              fontSize: 9, fontFamily: MONO, color: C.t3, cursor: "pointer",
              padding: "4px 12px", borderRadius: 4, border: `1px solid ${C.b1}`,
            }}
          >
            Close
          </span>
        </div>
      </div>
    </div>
  );
}
