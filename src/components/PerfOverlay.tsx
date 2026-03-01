import { useState, useEffect, useRef } from "react";
import { useTheme } from "../context/ThemeContext";
import { getSystemStats, SystemStats } from "../hooks/useTauri";

interface PerfStats {
  fps: number;
  jsHeapMB: number;
  jsHeapLimitMB: number;
  jsHeapPct: number;
  domNodes: number;
  uptimeSec: number;
  startupMs: number | null;
  // System stats from Rust backend
  cpuPct: number;
  memUsedMb: number;
  memTotalMb: number;
  memPct: number;
  diskWritePct: number;
}

export default function PerfOverlay({ visible }: { visible: boolean }) {
  const { C, MONO } = useTheme();
  const [stats, setStats] = useState<PerfStats | null>(null);
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());
  const appStart = useRef(performance.timeOrigin);
  const sysStats = useRef<SystemStats | null>(null);
  const domNodeCount = useRef(0);

  useEffect(() => {
    if (!visible) return;

    let rafId: number;
    let intervalId: ReturnType<typeof setInterval>;
    let sysIntervalId: ReturnType<typeof setInterval>;

    // FPS counter via requestAnimationFrame
    const countFrame = () => {
      frameCount.current++;
      rafId = requestAnimationFrame(countFrame);
    };
    rafId = requestAnimationFrame(countFrame);

    // Track DOM node count via MutationObserver (fires only on actual changes)
    domNodeCount.current = document.getElementsByTagName("*").length;
    const observer = new MutationObserver(() => {
      domNodeCount.current = document.getElementsByTagName("*").length;
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Poll system stats from Rust backend every 1s
    const fetchSysStats = () => {
      getSystemStats().then((s) => { if (s) sysStats.current = s; }).catch(() => {});
    };
    fetchSysStats();
    sysIntervalId = setInterval(fetchSysStats, 1000);

    // Sample stats every 1000ms
    intervalId = setInterval(() => {
      const now = performance.now();
      const elapsed = (now - lastTime.current) / 1000;
      const fps = elapsed > 0 ? Math.round(frameCount.current / elapsed) : 0;
      frameCount.current = 0;
      lastTime.current = now;

      // JS heap (Chrome/Edge only)
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      const jsHeapMB = mem ? Math.round(mem.usedJSHeapSize / 1048576) : 0;
      const jsHeapLimitMB = mem ? Math.round(mem.jsHeapSizeLimit / 1048576) : 0;
      const jsHeapPct = jsHeapLimitMB > 0 ? Math.round((jsHeapMB / jsHeapLimitMB) * 100) : 0;

      // DOM node count (cached by MutationObserver)
      const domNodes = domNodeCount.current;

      // Uptime
      const uptimeSec = Math.round((Date.now() - appStart.current) / 1000);

      // Startup time: bundle_eval → backends_loaded (start screen ready)
      const marks = performance.getEntriesByType("mark").filter((m) => m.name.startsWith("app:"));
      let startupMs: number | null = null;
      const bundleMark = marks.find((m) => m.name === "app:bundle_eval");
      const readyMark = marks.find((m) => m.name === "app:backends_loaded") ?? marks.find((m) => m.name === "app:config_loaded");
      if (bundleMark && readyMark) {
        startupMs = Math.round(readyMark.startTime - bundleMark.startTime);
      }

      const sys = sysStats.current;

      setStats({
        fps,
        jsHeapMB,
        jsHeapLimitMB,
        jsHeapPct,
        domNodes,
        uptimeSec,
        startupMs,
        cpuPct: sys?.cpuPct ?? 0,
        memUsedMb: sys?.memUsedMb ?? 0,
        memTotalMb: sys?.memTotalMb ?? 0,
        memPct: sys?.memPct ?? 0,
        diskWritePct: sys?.diskWritePct ?? 0,
      });
    }, 1000);

    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(intervalId);
      clearInterval(sysIntervalId);
      observer.disconnect();
    };
  }, [visible]);

  if (!visible || !stats) return null;

  const upMin = Math.floor(stats.uptimeSec / 60);
  const upSec = stats.uptimeSec % 60;

  const fpsColor = stats.fps >= 50 ? C.ok : stats.fps >= 30 ? C.warn : C.err;
  const cpuColor = stats.cpuPct <= 50 ? C.ok : stats.cpuPct <= 80 ? C.warn : C.err;
  const memColor = stats.memPct <= 60 ? C.ok : stats.memPct <= 85 ? C.warn : C.err;
  const diskColor = stats.diskWritePct <= 50 ? C.ok : stats.diskWritePct <= 80 ? C.warn : C.err;

  const rows: [string, string, string?][] = [
    ["FPS", `${stats.fps}`, fpsColor],
    ["CPU", `${stats.cpuPct}%`, cpuColor],
    ["Memory", `${stats.memUsedMb} / ${stats.memTotalMb} MB (${stats.memPct}%)`, memColor],
    ["Disk I/O", `${stats.diskWritePct}%`, diskColor],
    ["App Memory", `${stats.jsHeapMB} / ${stats.jsHeapLimitMB} MB (${stats.jsHeapPct}%)`],
    ["UI Elements", `${stats.domNodes}`],
    ["Uptime", `${upMin}m ${upSec}s`],
  ];
  if (stats.startupMs !== null) {
    rows.splice(1, 0, ["Startup", `${(stats.startupMs / 1000).toFixed(3)} s`]);
  }

  // Mini bar helper for CPU / Memory / Disk
  const miniBar = (pct: number, color: string) => (
    <div style={{ width: "100%", height: 3, background: `${C.t3}30`, borderRadius: 2, marginTop: 1 }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.3s" }} />
    </div>
  );

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
        minWidth: 200,
      }}
    >
      <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: 1, color: C.t3, marginBottom: 4 }}>
        STATS FOR NERDS
      </div>
      {rows.map(([label, value, color]) => {
        const showBar = label === "CPU" || label === "Memory" || label === "Disk I/O";
        const barPct = label === "CPU" ? stats.cpuPct : label === "Memory" ? stats.memPct : stats.diskWritePct;
        const barColor = color ?? C.t1;
        return (
          <div key={label} style={{ marginBottom: showBar ? 3 : 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
              <span style={{ color: C.t3 }}>{label}</span>
              <span style={{ color: color ?? C.t1, fontWeight: 600 }}>{value}</span>
            </div>
            {showBar && miniBar(barPct, barColor)}
          </div>
        );
      })}
    </div>
  );
}
