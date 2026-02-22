import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTheme } from "../context/ThemeContext";
import { Btn, Badge, Select } from "./shared";
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
    fontSize: 9, fontFamily: MONO, color: C.t3, fontWeight: 600,
    textTransform: "uppercase" as const, marginBottom: 6, letterSpacing: 0.5,
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

  const cableOptions = useMemo(() =>
    cables.length === 0
      ? [{ value: "", label: "No cables detected" }]
      : cables.map((c) => ({ value: c.port, label: `${c.name} (${c.port})` })),
    [cables]);

  const bitstreamOptions = useMemo(() =>
    bitstreams.length === 0
      ? [{ value: "", label: "No bitstreams found" }]
      : bitstreams.map((bs) => ({ value: bs, label: fileName(bs) })),
    [bitstreams]);

  const operationOptions = [
    { value: "PROGRAM", label: "Program SRAM" },
    { value: "PROGRAM_FLASH", label: "Program Flash" },
    { value: "VERIFY", label: "Verify" },
    { value: "ERASE", label: "Erase" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Download />
        <span style={{ fontSize: 12, fontWeight: 700, color: C.t1 }}>Device Programmer</span>
        <Badge color={C.accent}>{device}</Badge>
        {programming && <Badge color={C.warn}>Programming...</Badge>}
      </div>

      {/* Configuration Panel */}
      <div style={panelP}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Left: Cable */}
          <div>
            <div style={labelStyle}>Programmer Cable</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <Select
                value={selectedCable}
                onChange={setSelectedCable}
                options={cableOptions}
                placeholder="No cables detected"
                style={{ flex: 1 }}
              />
              <Btn small onClick={handleScan} disabled={scanning}>
                <Refresh /> {scanning ? "Scanning..." : "Scan"}
              </Btn>
            </div>
            {cables.length === 0 && (
              <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, marginTop: 6 }}>
                Click "Scan" to detect connected programmer cables.
              </div>
            )}
          </div>

          {/* Right: Bitstream */}
          <div>
            <div style={labelStyle}>Bitstream File</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <Select
                value={selectedBitstream}
                onChange={setSelectedBitstream}
                options={bitstreamOptions}
                placeholder="No bitstreams found"
                style={{ flex: 1 }}
              />
              <Btn small onClick={handleRefreshBitstreams}>
                <Refresh />
              </Btn>
            </div>
            {bitstreams.length > 0 && selectedBitstream && (
              <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, marginTop: 6, wordBreak: "break-all" }}>
                {selectedBitstream}
              </div>
            )}
          </div>
        </div>

        {/* Operation + Program Button */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginTop: 14 }}>
          <div>
            <div style={labelStyle}>Operation</div>
            <Select
              value={operation}
              onChange={setOperation}
              options={operationOptions}
            />
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
      <div style={{ ...panelP, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.t1 }}>Output</span>
          <Badge color={C.t3}>{logs.length} lines</Badge>
          <div style={{ flex: 1 }} />
          <Btn small onClick={() => setLogs([])}>Clear</Btn>
        </div>
        <div style={{
          background: C.bg, borderRadius: 4, border: `1px solid ${C.b1}`,
          padding: "8px 10px", flex: 1, overflowY: "auto",
          minHeight: 120,
        }}>
          {logs.length === 0 && (
            <div style={{ fontSize: 9, fontFamily: MONO, color: C.t3, padding: "20px 0", textAlign: "center" }}>
              No output yet. Scan for cables and program a device to see output here.
            </div>
          )}
          {logs.map((entry, i) => (
            <div key={i} style={{
              fontSize: 9, fontFamily: MONO, lineHeight: 1.7,
              color: logColor(entry.t), whiteSpace: "pre-wrap", wordBreak: "break-all",
            }}>
              {entry.t === "cmd" ? `> ${entry.m}` : entry.m}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* Hints */}
      <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, lineHeight: 1.6, flexShrink: 0 }}>
        Supports Lattice Radiant pgrcmd for Nexus/CertusPro-NX devices.
        Connect a USB programmer cable, scan for cables, select a bitstream from the last build, and click "Program Device".
      </div>
    </div>
  );
}
