import { useState, useEffect, useCallback, useRef } from "react";
import { useTheme } from "../context/ThemeContext";
import { Btn, Badge } from "./shared";
import { Download, Refresh, Play, Stop } from "./Icons";
import {
  detectProgrammerCables,
  findBitstreams,
  programDevice,
  listen,
  ProgrammerCable,
} from "../hooks/useTauri";
import { LogEntry } from "../types";

interface ProgrammerProps {
  device: string;
  backendId: string;
}

export default function Programmer({ device }: ProgrammerProps) {
  const { C, MONO } = useTheme();

  const [cables, setCables] = useState<ProgrammerCable[]>([]);
  const [scanning, setScanning] = useState(false);
  const [selectedCable, setSelectedCable] = useState<string>("");

  const [bitstreams, setBitstreams] = useState<string[]>([]);
  const [selectedBitstream, setSelectedBitstream] = useState<string>("");

  const [programming, setProgramming] = useState(false);
  const [_progId, setProgId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [operation, setOperation] = useState<string>("PROGRAM");

  const logEndRef = useRef<HTMLDivElement>(null);
  const logBuf = useRef<LogEntry[]>([]);
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [logs]);

  // Batch log updates for performance
  useEffect(() => {
    flushTimer.current = setInterval(() => {
      if (logBuf.current.length > 0) {
        const batch = logBuf.current.splice(0);
        setLogs((prev) => [...prev, ...batch]);
      }
    }, 100);
    return () => {
      if (flushTimer.current) clearInterval(flushTimer.current);
    };
  }, []);

  // Listen for programmer events
  useEffect(() => {
    let unlistenStdout: (() => void) | null = null;
    let unlistenFinished: (() => void) | null = null;

    listen<{ progId: string; line: string }>("program:stdout", (payload) => {
      logBuf.current.push({ t: "out", m: payload.line });
    }).then((fn) => { unlistenStdout = fn; });

    listen<{ progId: string; success: boolean; message: string }>("program:finished", (payload) => {
      logBuf.current.push({
        t: payload.success ? "ok" : "err",
        m: payload.message,
      });
      setProgramming(false);
      setProgId(null);
    }).then((fn) => { unlistenFinished = fn; });

    return () => {
      unlistenStdout?.();
      unlistenFinished?.();
    };
  }, []);

  // Load bitstreams on mount
  useEffect(() => {
    findBitstreams().then((bs) => {
      setBitstreams(bs);
      if (bs.length > 0) setSelectedBitstream(bs[0]);
    }).catch(() => {});
  }, []);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setLogs((prev) => [...prev, { t: "cmd", m: "Scanning for programmer cables..." }]);
    try {
      const found = await detectProgrammerCables();
      setCables(found);
      if (found.length > 0) {
        setSelectedCable(found[0].port);
        setLogs((prev) => [...prev, { t: "ok", m: `Found ${found.length} cable(s)` }]);
      } else {
        setLogs((prev) => [...prev, { t: "warn", m: "No programmer cables found. Ensure cable is connected." }]);
      }
    } catch (err) {
      setLogs((prev) => [...prev, { t: "err", m: `Cable scan failed: ${err}` }]);
    } finally {
      setScanning(false);
    }
  }, []);

  const handleProgram = useCallback(async () => {
    if (!selectedBitstream || !selectedCable) return;
    setProgramming(true);
    setLogs((prev) => [...prev, { t: "cmd", m: `Programming ${device} via ${selectedCable}...` }]);
    try {
      const id = await programDevice(selectedBitstream, device, selectedCable, operation);
      setProgId(id);
    } catch (err) {
      setLogs((prev) => [...prev, { t: "err", m: `Failed to start programming: ${err}` }]);
      setProgramming(false);
    }
  }, [selectedBitstream, selectedCable, device, operation]);

  const handleRefreshBitstreams = useCallback(async () => {
    try {
      const bs = await findBitstreams();
      setBitstreams(bs);
      if (bs.length > 0 && !selectedBitstream) setSelectedBitstream(bs[0]);
    } catch {
      // ignore
    }
  }, [selectedBitstream]);

  const panelP: React.CSSProperties = {
    background: C.s1, borderRadius: 7, border: `1px solid ${C.b1}`,
    overflow: "hidden", padding: 14,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 7, fontFamily: MONO, color: C.t3, fontWeight: 600,
    textTransform: "uppercase" as const, marginBottom: 4,
  };

  const selectStyle: React.CSSProperties = {
    fontSize: 8, fontFamily: MONO, background: C.bg, color: C.t1,
    border: `1px solid ${C.b1}`, borderRadius: 3, padding: "4px 8px",
    outline: "none", width: "100%", boxSizing: "border-box" as const,
  };

  const logColor = (t: LogEntry["t"]) => {
    switch (t) {
      case "cmd": return C.accent;
      case "ok": return C.ok;
      case "warn": return C.warn;
      case "err": return C.err;
      case "info": return C.cyan;
      default: return C.t2;
    }
  };

  const fileName = (path: string) => path.split("/").pop()?.split("\\").pop() ?? path;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Download />
        <span style={{ fontSize: 11, fontWeight: 700, color: C.t1 }}>Device Programmer</span>
        <Badge color={C.accent}>{device}</Badge>
        {programming && <Badge color={C.warn}>Programming...</Badge>}
      </div>

      {/* Configuration Panel */}
      <div style={panelP}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {/* Left: Cable */}
          <div>
            <div style={labelStyle}>Programmer Cable</div>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <select
                value={selectedCable}
                onChange={(e) => setSelectedCable(e.target.value)}
                style={{ ...selectStyle, flex: 1 }}
              >
                {cables.length === 0 && <option value="">No cables detected</option>}
                {cables.map((c) => (
                  <option key={c.port} value={c.port}>{c.name} ({c.port})</option>
                ))}
              </select>
              <Btn small onClick={handleScan} disabled={scanning}>
                <Refresh /> {scanning ? "Scanning..." : "Scan"}
              </Btn>
            </div>
            {cables.length === 0 && (
              <div style={{ fontSize: 7, fontFamily: MONO, color: C.t3, marginTop: 4 }}>
                Click "Scan" to detect connected programmer cables.
              </div>
            )}
          </div>

          {/* Right: Bitstream */}
          <div>
            <div style={labelStyle}>Bitstream File</div>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <select
                value={selectedBitstream}
                onChange={(e) => setSelectedBitstream(e.target.value)}
                style={{ ...selectStyle, flex: 1 }}
              >
                {bitstreams.length === 0 && <option value="">No bitstreams found</option>}
                {bitstreams.map((bs) => (
                  <option key={bs} value={bs}>{fileName(bs)}</option>
                ))}
              </select>
              <Btn small onClick={handleRefreshBitstreams}>
                <Refresh />
              </Btn>
            </div>
            {bitstreams.length > 0 && selectedBitstream && (
              <div style={{ fontSize: 7, fontFamily: MONO, color: C.t3, marginTop: 4, wordBreak: "break-all" }}>
                {selectedBitstream}
              </div>
            )}
          </div>
        </div>

        {/* Operation + Program Button */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <div>
            <div style={labelStyle}>Operation</div>
            <select
              value={operation}
              onChange={(e) => setOperation(e.target.value)}
              style={selectStyle}
            >
              <option value="PROGRAM">Program SRAM</option>
              <option value="PROGRAM_FLASH">Program Flash</option>
              <option value="VERIFY">Verify</option>
              <option value="ERASE">Erase</option>
            </select>
          </div>
          <div style={{ flex: 1 }} />
          <Btn
            primary
            onClick={handleProgram}
            disabled={programming || !selectedBitstream || !selectedCable}
            style={{ padding: "8px 20px" }}
          >
            {programming ? <><Stop /> Programming...</> : <><Play /> Program Device</>}
          </Btn>
        </div>
      </div>

      {/* Output Log */}
      <div style={panelP}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.t1 }}>Output</span>
          <Badge color={C.t3}>{logs.length} lines</Badge>
          <div style={{ flex: 1 }} />
          <Btn small onClick={() => setLogs([])}>Clear</Btn>
        </div>
        <div style={{
          background: C.bg, borderRadius: 4, border: `1px solid ${C.b1}`,
          padding: "8px 10px", maxHeight: "calc(100vh - 480px)", overflowY: "auto",
          minHeight: 120,
        }}>
          {logs.length === 0 && (
            <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, padding: "20px 0", textAlign: "center" }}>
              No output yet. Scan for cables and program a device to see output here.
            </div>
          )}
          {logs.map((entry, i) => (
            <div key={i} style={{
              fontSize: 8, fontFamily: MONO, lineHeight: 1.6,
              color: logColor(entry.t), whiteSpace: "pre-wrap", wordBreak: "break-all",
            }}>
              {entry.t === "cmd" ? `> ${entry.m}` : entry.m}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* Hints */}
      <div style={{ fontSize: 7, fontFamily: MONO, color: C.t3, lineHeight: 1.5 }}>
        Supports Lattice Radiant pgrcmd for Nexus/CertusPro-NX devices.
        Connect a USB programmer cable, scan for cables, select a bitstream from the last build, and click "Program Device".
      </div>
    </div>
  );
}
