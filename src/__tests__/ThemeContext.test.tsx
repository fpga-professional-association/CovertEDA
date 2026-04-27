import { screen, fireEvent, act } from "@testing-library/react";
import { render } from "@testing-library/react";
import { ThemeProvider, useTheme } from "../context/ThemeContext";
import { DARK, LIGHT } from "../theme";

function ThemeConsumer() {
  const { C, MONO, SANS, themeId, setThemeId, scaleFactor, setScaleFactor } = useTheme();
  return (
    <div>
      <span data-testid="theme-id">{themeId}</span>
      <span data-testid="bg-color">{C.bg}</span>
      <span data-testid="mono-font">{MONO}</span>
      <span data-testid="sans-font">{SANS}</span>
      <span data-testid="scale">{scaleFactor}</span>
      <button data-testid="set-light" onClick={() => setThemeId("light")}>Light</button>
      <button data-testid="set-scale" onClick={() => setScaleFactor(1.5)}>Scale</button>
    </div>
  );
}

describe("ThemeContext", () => {
  it("provides dark theme by default", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId("theme-id").textContent).toBe("dark");
    expect(screen.getByTestId("bg-color").textContent).toBe(DARK.bg);
  });

  it("provides correct font constants", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId("mono-font").textContent).toContain("IBM Plex Mono");
    expect(screen.getByTestId("sans-font").textContent).toContain("Outfit");
  });

  it("switches to light theme when setThemeId called", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    act(() => {
      fireEvent.click(screen.getByTestId("set-light"));
    });
    expect(screen.getByTestId("theme-id").textContent).toBe("light");
    expect(screen.getByTestId("bg-color").textContent).toBe(LIGHT.bg);
  });

  it("updates scaleFactor when setScaleFactor called", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId("scale").textContent).toBe("1.2");
    act(() => {
      fireEvent.click(screen.getByTestId("set-scale"));
    });
    expect(screen.getByTestId("scale").textContent).toBe("1.5");
  });
});
