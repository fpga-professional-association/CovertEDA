import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { ThemeColors, ThemeId, THEMES, DARK } from "../theme";

const MONO = "'IBM Plex Mono', monospace";
const SANS = "'Outfit', sans-serif";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Apply zoom via the native webview API (works correctly on all platforms). */
async function applyNativeZoom(factor: number) {
  if (!isTauri) return;
  try {
    const { getCurrentWebview } = await import("@tauri-apps/api/webview");
    await getCurrentWebview().setZoom(factor);
  } catch {
    // Fallback: no-op in browser dev mode
  }
}

/** Transient overlay shown for ~1.2s whenever the zoom level changes. */
function ZoomIndicator({ scaleFactor }: { scaleFactor: number }) {
  const [visible, setVisible] = useState(false);
  const skipFirst = useRef(true);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    setVisible(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setVisible(false), 1200);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [scaleFactor]);

  if (!visible) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        padding: "8px 14px",
        background: "rgba(20, 22, 28, 0.92)",
        color: "#e6edf3",
        fontFamily: MONO,
        fontSize: 13,
        fontWeight: 700,
        borderRadius: 6,
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
        zIndex: 9999,
        pointerEvents: "none",
        letterSpacing: 0.5,
      }}
    >
      {Math.round(scaleFactor * 100)}%
    </div>
  );
}

interface ThemeContextValue {
  C: ThemeColors;
  MONO: string;
  SANS: string;
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
  scaleFactor: number;
  setScaleFactor: (s: number) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  C: DARK,
  MONO,
  SANS,
  themeId: "dark",
  setThemeId: () => {},
  scaleFactor: 1.0,
  setScaleFactor: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>("dark");
  const [scaleFactor, setScaleFactorState] = useState(1.2);

  const setThemeId = useCallback((id: ThemeId) => {
    setThemeIdState(id);
    document.documentElement.style.setProperty("--app-bg", THEMES[id].bg);
  }, []);

  const setScaleFactor = useCallback((s: number) => {
    setScaleFactorState(s);
  }, []);

  // Apply native webview zoom whenever scaleFactor changes
  useEffect(() => {
    applyNativeZoom(scaleFactor);
  }, [scaleFactor]);

  const C = THEMES[themeId];

  return (
    <ThemeContext.Provider value={{ C, MONO, SANS, themeId, setThemeId, scaleFactor, setScaleFactor }}>
      {children}
      <ZoomIndicator scaleFactor={scaleFactor} />
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
