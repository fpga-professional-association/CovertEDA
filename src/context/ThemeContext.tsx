import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
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
  scaleFactor: 1.2,
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
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
