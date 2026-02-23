import { useState, useEffect, useRef } from "react";
import { useTheme } from "../context/ThemeContext";

interface PerfStats {
  fps: number;
  memUsedMB: number;
  memTotalMB: number;
  memPct: number;
  jsHeapMB: number;
  jsHeapLimitMB: number;
  jsHeapPct: number;
  domNodes: number;
  renderCount: number;
  uptimeSec: number;
  startupMs: number | null;
}

export default function PerfOverlay({ visible }: { visible: boolean }) {
  const { C, MONO } = useTheme();
  const [stats, setStats] = useState<PerfStats | null>(null);
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());
  const renderCount = useRef(0);
  const appStart = useRef(performance.timeOrigin);

  useEffect(() => {
    if (!visible) return;

    let rafId: number;
    let intervalId: ReturnType<typeof setInterval>;

    // FPS counter via requestAnimationFrame
    const countFrame = () => {
      frameCount.current++;
      rafId = requestAnimationFrame(countFrame);
    };
    rafId = requestAnimationFrame(countFrame);

    // Sample stats every 500ms
    intervalId = setInterval(() => {
      const now = performance.now();
      const elapsed = (now - lastTime.current) / 1000;
      const fps = elapsed > 0 ? Math.round(frameCount.current / elapsed) : 0;
      frameCount.current = 0;
      lastTime.current = now;
      renderCount.current++;

      // JS heap (Chrome/Edge only)
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      const jsHeapMB = mem ? Math.round(mem.usedJSHeapSize / 1048576) : 0;
      const jsHeapLimitMB = mem ? Math.round(mem.jsHeapSizeLimit / 1048576) : 0;
      const jsHeapPct = jsHeapLimitMB > 0 ? Math.round((jsHeapMB / jsHeapLimitMB) * 100) : 0;

      // DOM node count
      const domNodes = document.querySelectorAll("*").length;

      // System memory via navigator (if available)
      const devMem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
      const memTotalMB = devMem ? Math.round(devMem * 1024) : 0;
      const memUsedMB = jsHeapMB; // best approximation in browser
      const memPct = memTotalMB > 0 ? Math.round((memUsedMB / memTotalMB) * 100) : 0;

      // Uptime
      const uptimeSec = Math.round((Date.now() - appStart.current) / 1000);

      // Startup time from perf marks
      const marks = performance.getEntriesByType("mark").filter((m) => m.name.startsWith("app:"));
      let startupMs: number | null = null;
      if (marks.length >= 2) {
        const first = marks[0].startTime;
        const last = marks[marks.length - 1].startTime;
        startupMs = Math.round(last - first);
      }

      setStats({
        fps,
        memUsedMB,
        memTotalMB,
        memPct,
        jsHeapMB,
        jsHeapLimitMB,
        jsHeapPct,
        domNodes,
        renderCount: renderCount.current,
        uptimeSec,
        startupMs,
      });
    }, 500);

    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(intervalId);
    };
  }, [visible]);

  if (!visible || !stats) return null;

  const upMin = Math.floor(stats.uptimeSec / 60);
  const upSec = stats.uptimeSec % 60;

  const fpsColor = stats.fps >= 50 ? C.ok : stats.fps >= 30 ? C.warn : C.err;

  const rows: [string, string, string?][] = [
    ["FPS", `${stats.fps}`, fpsColor],
    ["DOM Nodes", `${stats.domNodes}`],
    ["JS Heap", `${stats.jsHeapMB} / ${stats.jsHeapLimitMB} MB (${stats.jsHeapPct}%)`],
    ["Uptime", `${upMin}m ${upSec}s`],
    ["Samples", `${stats.renderCount}`],
  ];
  if (stats.startupMs !== null) {
    rows.splice(1, 0, ["Startup", `${stats.startupMs}ms`]);
  }
  if (stats.memTotalMB > 0) {
    rows.splice(3, 0, ["Device RAM", `~${stats.memTotalMB} MB`]);
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 8,
        right: 8,
        zIndex: 9999,
        background: "rgba(0,0,0,0.75)",
        borderRadius: 6,
        padding: "8px 12px",
        fontFamily: MONO,
        fontSize: 9,
        lineHeight: 1.6,
        color: C.t2,
        pointerEvents: "none",
        backdropFilter: "blur(4px)",
        border: `1px solid ${C.b1}`,
        minWidth: 180,
      }}
    >
      <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: 1, color: C.t3, marginBottom: 4 }}>
        STATS FOR NERDS
      </div>
      {rows.map(([label, value, color]) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <span style={{ color: C.t3 }}>{label}</span>
          <span style={{ color: color ?? C.t1, fontWeight: 600 }}>{value}</span>
        </div>
      ))}
    </div>
  );
}
