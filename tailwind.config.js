/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        eda: {
          bg: "#06080c",
          s1: "#0c1018",
          s2: "#121a26",
          s3: "#1a2438",
          b1: "#1c2840",
          b2: "#2a4060",
          t1: "#e8f0fa",
          t2: "#9ab0cc",
          t3: "#546880",
          accent: "#3b9eff",
          "accent-dim": "#122a48",
          ok: "#2ecc71",
          "ok-dim": "#0a2816",
          warn: "#f0a030",
          "warn-dim": "#2a1c06",
          err: "#e74c3c",
          "err-dim": "#2a0c0c",
          cyan: "#22d3ee",
          purple: "#a78bfa",
          pink: "#f472b6",
          orange: "#fb923c",
        },
      },
      fontFamily: {
        mono: ["'IBM Plex Mono'", "monospace"],
        sans: ["'Outfit'", "sans-serif"],
      },
    },
  },
  plugins: [],
};
