import { useState, useEffect, useCallback } from "react";
import { useTheme } from "../context/ThemeContext";
import { Btn, Badge, Input } from "./shared";
import type { SshConfig, SshToolKind, SshAuthMethod, RemoteToolInfo } from "../types";
import {
  sshTestConnection,
  sshSaveConfig,
  sshLoadConfig,
  sshDetectTools,
  sshSetPassword,
} from "../hooks/useTauri";

interface SshPanelProps {
  onLog: (msg: string, type?: "info" | "ok" | "err" | "warn") => void;
}

const TOOL_OPTIONS: { value: SshToolKind; label: string; desc: string }[] = [
  { value: "openssh", label: "OpenSSH", desc: "ssh / scp" },
  { value: "plink", label: "PuTTY", desc: "plink / pscp" },
  { value: "custom", label: "Custom", desc: "custom binary" },
];

const AUTH_OPTIONS: { value: SshAuthMethod; label: string }[] = [
  { value: "key", label: "Key File" },
  { value: "agent", label: "SSH Agent" },
  { value: "password", label: "Password" },
];

export default function SshPanel({ onLog }: SshPanelProps) {
  const { C, MONO, SANS } = useTheme();

  // ── Form State ──
  const [tool, setTool] = useState<SshToolKind>("openssh");
  const [customSsh, setCustomSsh] = useState("");
  const [customScp, setCustomScp] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [user, setUser] = useState("");
  const [auth, setAuth] = useState<SshAuthMethod>("agent");
  const [keyPath, setKeyPath] = useState("");
  const [password, setPassword] = useState("");
  const [remoteDir, setRemoteDir] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [remoteToolPaths, setRemoteToolPaths] = useState<Record<string, string>>({});

  // ── UI State ──
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; hostname?: string; os?: string; error?: string } | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectedTools, setDetectedTools] = useState<RemoteToolInfo[]>([]);
  const [saving, setSaving] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [connLog, setConnLog] = useState<{ time: string; msg: string; ok: boolean }[]>([]);
  const [loaded, setLoaded] = useState(false);

  // ── Load saved config ──
  useEffect(() => {
    sshLoadConfig().then((cfg) => {
      if (cfg) {
        setTool(cfg.tool);
        setCustomSsh(cfg.customSshPath ?? "");
        setCustomScp(cfg.customScpPath ?? "");
        setHost(cfg.host);
        setPort(String(cfg.port));
        setUser(cfg.user);
        setAuth(cfg.auth);
        setKeyPath(cfg.keyPath ?? "");
        setRemoteDir(cfg.remoteProjectDir);
        setEnabled(cfg.enabled);
        setRemoteToolPaths(cfg.remoteToolPaths ?? {});
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const buildConfig = useCallback((): SshConfig => ({
    enabled,
    tool,
    customSshPath: tool === "custom" ? customSsh : undefined,
    customScpPath: tool === "custom" ? customScp : undefined,
    host,
    port: parseInt(port) || 22,
    user,
    auth,
    keyPath: auth === "key" ? keyPath : undefined,
    remoteProjectDir: remoteDir,
    remoteToolPaths,
  }), [enabled, tool, customSsh, customScp, host, port, user, auth, keyPath, remoteDir, remoteToolPaths]);

  const addConnLog = useCallback((msg: string, ok: boolean) => {
    const time = new Date().toLocaleTimeString();
    setConnLog((prev) => [{ time, msg, ok }, ...prev].slice(0, 50));
  }, []);

  // ── Actions ──
  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await sshTestConnection(
        host,
        parseInt(port) || 22,
        user,
        tool,
        auth === "key" ? keyPath : undefined,
        tool === "custom" ? customSsh : undefined,
        tool === "custom" ? customScp : undefined,
      );
      setTestResult(res);
      if (res.ok) {
        onLog(`SSH connected to ${res.hostname} (${res.os})`, "ok");
        addConnLog(`Connected: ${res.hostname}`, true);
      } else {
        onLog(`SSH failed: ${res.error}`, "err");
        addConnLog(`Failed: ${res.error}`, false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestResult({ ok: false, error: msg });
      onLog(`SSH error: ${msg}`, "err");
      addConnLog(`Error: ${msg}`, false);
    }
    setTesting(false);
  }, [host, port, user, tool, auth, keyPath, customSsh, customScp, onLog, addConnLog]);

  const handleDetect = useCallback(async () => {
    setDetecting(true);
    try {
      const tools = await sshDetectTools();
      setDetectedTools(tools);
      setShowTools(true);
      const found = tools.filter((t) => t.available).length;
      onLog(`Detected ${found}/${tools.length} vendor tools on remote`, "info");
      addConnLog(`Tool scan: ${found} found`, true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      onLog(`Tool detection failed: ${msg}`, "err");
      addConnLog(`Tool scan failed: ${msg}`, false);
    }
    setDetecting(false);
  }, [onLog, addConnLog]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const cfg = buildConfig();
      await sshSaveConfig(cfg);
      if (auth === "password" && password) {
        await sshSetPassword(password);
      }
      onLog("SSH config saved", "ok");
    } catch (e) {
      onLog(`Save failed: ${e instanceof Error ? e.message : String(e)}`, "err");
    }
    setSaving(false);
  }, [buildConfig, auth, password, onLog]);

  // ── Styles ──
  const chipBase: React.CSSProperties = {
    padding: "4px 10px",
    borderRadius: 4,
    fontSize: 11,
    fontFamily: MONO,
    cursor: "pointer",
    border: `1px solid ${C.b1}`,
    transition: "all 0.15s",
  };

  const chipActive = (active: boolean): React.CSSProperties => ({
    ...chipBase,
    background: active ? C.accent + "22" : "transparent",
    borderColor: active ? C.accent : C.b1,
    color: active ? C.accent : C.t3,
    fontWeight: active ? 600 : 400,
  });

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    color: C.t3,
    fontFamily: SANS,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  };

  const sectionGap: React.CSSProperties = { marginBottom: 16 };

  if (!loaded) return null;

  return (
    <div style={{ padding: 4 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: SANS, color: C.t1 }}>SSH Build Server</span>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: testResult?.ok ? C.ok : C.t3,
            boxShadow: testResult?.ok ? `0 0 6px ${C.ok}` : undefined,
          }}
          title={testResult?.ok ? `Connected: ${testResult.hostname}` : "Not connected"}
        />
        {testResult?.ok && (
          <Badge color={C.ok}>{testResult.hostname}</Badge>
        )}
      </div>

      {/* SSH Tool Selector */}
      <div style={sectionGap}>
        <div style={labelStyle}>SSH Tool</div>
        <div style={{ display: "flex", gap: 6 }}>
          {TOOL_OPTIONS.map((opt) => (
            <div
              key={opt.value}
              style={chipActive(tool === opt.value)}
              onClick={() => setTool(opt.value)}
            >
              {opt.label} <span style={{ fontSize: 9, opacity: 0.6 }}>({opt.desc})</span>
            </div>
          ))}
        </div>

        {/* Custom binary paths */}
        {tool === "custom" && (
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ ...labelStyle, fontSize: 9 }}>SSH Binary Path</div>
              <Input value={customSsh} onChange={setCustomSsh} placeholder="/usr/bin/ssh" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ ...labelStyle, fontSize: 9 }}>SCP Binary Path</div>
              <Input value={customScp} onChange={setCustomScp} placeholder="/usr/bin/scp" />
            </div>
          </div>
        )}
      </div>

      {/* Connection Settings */}
      <div style={sectionGap}>
        <div style={labelStyle}>Connection</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          <div style={{ flex: 3 }}>
            <Input value={host} onChange={setHost} placeholder="hostname or IP" title="Host" />
          </div>
          <div style={{ flex: 1, maxWidth: 70 }}>
            <Input
              value={port}
              onChange={setPort}
              placeholder="22"
              title="Port"
            />
          </div>
        </div>
        <div style={{ marginBottom: 6 }}>
          <Input value={user} onChange={setUser} placeholder="username" title="Username" />
        </div>
      </div>

      {/* Auth Method */}
      <div style={sectionGap}>
        <div style={labelStyle}>Authentication</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          {AUTH_OPTIONS.map((opt) => (
            <div
              key={opt.value}
              style={chipActive(auth === opt.value)}
              onClick={() => setAuth(opt.value)}
            >
              {opt.label}
            </div>
          ))}
        </div>

        {auth === "key" && (
          <Input value={keyPath} onChange={setKeyPath} placeholder="~/.ssh/id_rsa" title="Key file path" />
        )}
        {auth === "password" && (
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (saved to OS keyring)"
            style={{
              width: "100%",
              padding: "5px 8px",
              borderRadius: 4,
              border: `1px solid ${C.b1}`,
              background: C.bg,
              color: C.t1,
              fontFamily: MONO,
              fontSize: 12,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        )}
      </div>

      {/* Remote Project Directory */}
      <div style={sectionGap}>
        <div style={labelStyle}>Remote Project Directory</div>
        <Input value={remoteDir} onChange={setRemoteDir} placeholder="/home/user/projects/my_fpga" />
      </div>

      {/* Action Buttons */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <Btn onClick={handleTest} disabled={testing || !host || !user}>
          {testing ? "Testing..." : "Test Connection"}
        </Btn>
        <Btn onClick={handleDetect} disabled={detecting || !testResult?.ok}>
          {detecting ? "Scanning..." : "Detect Tools"}
        </Btn>
        <Btn onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Btn>
        <div
          style={{
            ...chipBase,
            background: enabled ? C.ok + "22" : "transparent",
            borderColor: enabled ? C.ok : C.b1,
            color: enabled ? C.ok : C.t3,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
          onClick={() => setEnabled(!enabled)}
        >
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: enabled ? C.ok : C.t3,
          }} />
          {enabled ? "Enabled" : "Disabled"}
        </div>
      </div>

      {/* Test Result */}
      {testResult && (
        <div style={{
          padding: "6px 10px",
          borderRadius: 4,
          border: `1px solid ${testResult.ok ? C.ok : C.err}`,
          background: (testResult.ok ? C.ok : C.err) + "11",
          fontSize: 11,
          fontFamily: MONO,
          color: testResult.ok ? C.ok : C.err,
          marginBottom: 12,
        }}>
          {testResult.ok
            ? `Connected to ${testResult.hostname} — ${testResult.os}`
            : `Error: ${testResult.error}`
          }
        </div>
      )}

      {/* Remote Tools */}
      {detectedTools.length > 0 && (
        <div style={sectionGap}>
          <div
            style={{ ...labelStyle, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
            onClick={() => setShowTools(!showTools)}
          >
            <span style={{ fontSize: 8 }}>{showTools ? "\u25BC" : "\u25B6"}</span>
            Remote Tools ({detectedTools.filter((t) => t.available).length}/{detectedTools.length} found)
          </div>
          {showTools && (
            <div style={{
              border: `1px solid ${C.b1}`,
              borderRadius: 4,
              overflow: "hidden",
            }}>
              {detectedTools.map((t) => (
                <div
                  key={t.backendId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "4px 8px",
                    borderBottom: `1px solid ${C.b1}`,
                    fontSize: 11,
                    fontFamily: MONO,
                  }}
                >
                  <Badge color={t.available ? C.ok : C.t3}>
                    {t.available ? "OK" : "---"}
                  </Badge>
                  <span style={{ color: C.t2, minWidth: 100 }}>{t.name}</span>
                  {t.available && t.version && (
                    <span style={{ fontSize: 9, color: C.accent, fontWeight: 600, flexShrink: 0 }}>
                      {t.version}
                    </span>
                  )}
                  {t.available ? (
                    <input
                      value={remoteToolPaths[t.backendId] || t.path}
                      onChange={(e) => setRemoteToolPaths((prev) => ({ ...prev, [t.backendId]: e.target.value }))}
                      style={{
                        flex: 1,
                        padding: "2px 6px",
                        borderRadius: 3,
                        border: `1px solid ${C.b1}`,
                        background: C.bg,
                        color: C.t1,
                        fontFamily: MONO,
                        fontSize: 10,
                        outline: "none",
                      }}
                    />
                  ) : (
                    <span style={{ color: C.t3, fontSize: 10, fontStyle: "italic" }}>not found</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Connection Log */}
      {connLog.length > 0 && (
        <div>
          <div
            style={{ ...labelStyle, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
            onClick={() => setShowLog(!showLog)}
          >
            <span style={{ fontSize: 8 }}>{showLog ? "\u25BC" : "\u25B6"}</span>
            Connection Log ({connLog.length})
          </div>
          {showLog && (
            <div style={{
              maxHeight: 150,
              overflowY: "auto",
              border: `1px solid ${C.b1}`,
              borderRadius: 4,
              padding: 4,
            }}>
              {connLog.map((entry, i) => (
                <div key={i} style={{
                  fontSize: 10,
                  fontFamily: MONO,
                  color: entry.ok ? C.t2 : C.err,
                  padding: "1px 0",
                }}>
                  <span style={{ color: C.t3 }}>{entry.time}</span>{" "}
                  {entry.msg}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
