import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { ThemeColors, ThemeId, THEMES, DARK } from "../theme";

const MONO = "'IBM Plex Mono', monospace";
const SANS = "'Outfit', sans-serif";

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
