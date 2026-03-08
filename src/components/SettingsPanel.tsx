import { useState, useEffect, useCallback } from "react";
import { useTheme } from "../context/ThemeContext";
import { ThemeId } from "../theme";
import { Btn, Input } from "./shared";
import { getAppConfig, saveAppConfig, getAiApiKey, setAiApiKey, getAiApiKeyForProvider, setAiApiKeyForProvider, listAiProvidersWithKeys, pickDirectory, pickFile, AppConfig } from "../hooks/useTauri";

const SCALE_PRESETS = [
  { label: "50%", value: 0.5 },
  { label: "75%", value: 0.75 },
  { label: "100%", value: 1.0 },
  { label: "120%", value: 1.2 },
  { label: "150%", value: 1.5 },
  { label: "200%", value: 2.0 },
  { label: "250%", value: 2.5 },
  { label: "300%", value: 3.0 },
];

const THEME_OPTIONS: { id: ThemeId; label: string; desc: string; tooltip: string }[] = [
  { id: "dark", label: "Dark", desc: "Default dark palette", tooltip: "High-contrast dark palette optimized for low-light environments" },
  { id: "light", label: "Light", desc: "Light background", tooltip: "Light palette for bright environments" },
  { id: "colorblind", label: "Colorblind", desc: "Deuteranopia-safe", tooltip: "Deuteranopia-safe color palette" },
];

const AI_SETTINGS_PROVIDERS: {
  id: string;
  name: string;
  tooltip: string;
  models: { id: string; label: string }[];
  keyPlaceholder: string;
  keyHelp: string;
}[] = [
  {
    id: "anthropic", name: "Anthropic",
    tooltip: "Use Anthropic Claude models",
    models: [
      { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
      { id: "claude-opus-4-6", label: "Opus 4.6" },
      { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
    ],
    keyPlaceholder: "sk-ant-api03-...",
    keyHelp: "Get your key at console.anthropic.com",
  },
  {
    id: "openai", name: "OpenAI",
    tooltip: "Use OpenAI GPT models",
    models: [
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4o-mini", label: "GPT-4o mini" },
      { id: "o3-mini", label: "o3-mini" },
      { id: "o1", label: "o1" },
    ],
    keyPlaceholder: "sk-...",
    keyHelp: "Get your key at platform.openai.com",
  },
  {
    id: "google", name: "Gemini",
    tooltip: "Use Google Gemini models",
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    ],
    keyPlaceholder: "AI...",
    keyHelp: "Get your key at aistudio.google.com",
  },
  {
    id: "mistral", name: "Mistral",
    tooltip: "Use Mistral AI models",
    models: [
      { id: "mistral-large-latest", label: "Mistral Large" },
      { id: "codestral-latest", label: "Codestral" },
      { id: "mistral-small-latest", label: "Mistral Small" },
    ],
    keyPlaceholder: "API key",
    keyHelp: "Get your key at console.mistral.ai",
  },
  {
    id: "xai", name: "xAI",
    tooltip: "Use xAI Grok models",
    models: [
      { id: "grok-3", label: "Grok 3" },
      { id: "grok-3-mini", label: "Grok 3 mini" },
    ],
    keyPlaceholder: "xai-...",
    keyHelp: "Get your key at console.x.ai",
  },
  {
    id: "deepseek", name: "DeepSeek",
    tooltip: "Use DeepSeek models",
    models: [
      { id: "deepseek-chat", label: "DeepSeek Chat" },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner" },
    ],
    keyPlaceholder: "sk-...",
    keyHelp: "Get your key at platform.deepseek.com",
  },
  {
    id: "ollama", name: "Ollama",
    tooltip: "Use locally-hosted Ollama models",
    models: [],
    keyPlaceholder: "",
    keyHelp: "Run Ollama locally",
  },
];

const TOOL_FIELDS: { key: keyof AppConfig["tool_paths"]; label: string }[] = [
  { key: "diamond", label: "Lattice Diamond" },
  { key: "radiant", label: "Lattice Radiant" },
  { key: "quartus", label: "Intel Quartus" },
  { key: "vivado", label: "AMD Vivado" },
  { key: "oss_cad_suite", label: "OSS CAD Suite" },
];

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { C, MONO, SANS, themeId, setThemeId, scaleFactor, setScaleFactor } = useTheme();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [aiKey, setAiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [providersWithKeys, setProvidersWithKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    getAppConfig().then(async (cfg) => {
      setConfig(cfg);
      // Load per-provider key for current provider
      const pid = cfg.ai_provider ?? "anthropic";
      const key = await getAiApiKeyForProvider(pid).catch(() => null)
        ?? await getAiApiKey().catch(() => null);
      setAiKey(key ?? "");
      // List which providers have saved keys
      const withKeys = await listAiProvidersWithKeys().catch(() => []);
      setProvidersWithKeys(new Set(withKeys));
    });
  }, []);

  const save = useCallback(async (updated: AppConfig) => {
    setSaving(true);
    try {
      await saveAppConfig(updated);
    } finally {
      setSaving(false);
    }
  }, []);

  const updateToolPath = useCallback((key: keyof AppConfig["tool_paths"], value: string) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, tool_paths: { ...prev.tool_paths, [key]: value || null } };
      save(updated);
      return updated;
    });
  }, [save]);

  const browseToolPath = useCallback(async (key: keyof AppConfig["tool_paths"]) => {
    const picked = await pickDirectory();
    if (picked) updateToolPath(key, picked);
  }, [updateToolPath]);

  const handleThemeChange = useCallback((id: ThemeId) => {
    setThemeId(id);
    setConfig((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, theme: id };
      save(updated);
      return updated;
    });
  }, [setThemeId, save]);

  const handleScaleChange = useCallback((val: number) => {
    setScaleFactor(val);
    setConfig((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, scale_factor: val };
      save(updated);
      return updated;
    });
  }, [setScaleFactor, save]);

  const handleLicenseFileBrowse = useCallback(async (vendor: string) => {
    const picked = await pickFile([{ name: "License", extensions: ["dat", "lic", "txt"] }]);
    if (picked) {
      setConfig((prev) => {
        if (!prev) return prev;
        const updated = {
          ...prev,
          license_files: { ...(prev.license_files ?? {}), [vendor]: picked },
        };
        save(updated);
        return updated;
      });
    }
  }, [save]);

  const updateLicenseFile = useCallback((vendor: string, value: string) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const lf = { ...(prev.license_files ?? {}) };
      if (value) {
        lf[vendor] = value;
      } else {
        delete lf[vendor];
      }
      const updated = { ...prev, license_files: lf };
      save(updated);
      return updated;
    });
  }, [save]);

  const label: React.CSSProperties = {
    fontSize: 9,
    fontFamily: MONO,
    fontWeight: 600,
    color: C.t3,
    marginBottom: 4,
    display: "block",
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: C.t1,
    marginBottom: 10,
    display: "flex",
    alignItems: "center",
    gap: 5,
  };

  return (
    <div
      title="Click to close settings"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        fontFamily: SANS,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.s1,
          border: `1px solid ${C.b1}`,
          borderRadius: 10,
          width: 520,
          maxHeight: "80vh",
          overflow: "auto",
          padding: "24px 28px",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: C.t1, marginBottom: 20 }}>
          Settings
        </div>

        {/* ── Appearance ── */}
        <div style={sectionTitle}>
          <span style={{ color: C.accent }}>{"\u25CF"}</span>
          Appearance
        </div>

        {/* Theme Selection */}
        <div style={{ marginBottom: 16 }}>
          <span style={label}>THEME</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {THEME_OPTIONS.map((t) => {
              const selected = themeId === t.id;
              const hovered = hover === `theme-${t.id}`;
              return (
                <div
                  key={t.id}
                  title={t.tooltip}
                  onClick={() => handleThemeChange(t.id)}
                  onMouseEnter={() => setHover(`theme-${t.id}`)}
                  onMouseLeave={() => setHover(null)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: `1.5px solid ${selected ? C.accent : C.b1}`,
                    background: selected ? `${C.accent}10` : hovered ? C.s2 : C.bg,
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 600, color: selected ? C.t1 : C.t2 }}>
                    {t.label}
                  </div>
                  <div style={{ fontSize: 7, fontFamily: MONO, color: C.t3, marginTop: 2 }}>
                    {t.desc}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Scale */}
        <div style={{ marginBottom: 20 }}>
          <span style={label}>ZOOM ({Math.round(scaleFactor * 100)}%)</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>50%</span>
            <input
              type="range"
              min={50}
              max={300}
              step={5}
              value={Math.round(scaleFactor * 100)}
              onChange={(e) => handleScaleChange(Number(e.target.value) / 100)}
              title={`Set zoom to ${Math.round(scaleFactor * 100)}%`}
              style={{ flex: 1, accentColor: C.accent }}
            />
            <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>300%</span>
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {SCALE_PRESETS.map((s) => {
              const selected = Math.abs(scaleFactor - s.value) < 0.01;
              return (
                <div
                  key={s.value}
                  title={`Set zoom to ${s.label}`}
                  onClick={() => handleScaleChange(s.value)}
                  style={{
                    padding: "3px 8px",
                    borderRadius: 4,
                    border: `1px solid ${selected ? C.accent : C.b1}`,
                    background: selected ? `${C.accent}18` : C.bg,
                    cursor: "pointer",
                    fontSize: 8,
                    fontFamily: MONO,
                    fontWeight: 600,
                    color: selected ? C.accent : C.t2,
                  }}
                >
                  {s.label}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Tool Paths ── */}
        <div style={{ ...sectionTitle, marginTop: 8 }}>
          <span style={{ color: C.orange }}>{"\u25CF"}</span>
          Tool Paths
        </div>

        {TOOL_FIELDS.map((tf) => (
          <div key={tf.key} style={{ marginBottom: 12 }}>
            <span style={label}>{tf.label.toUpperCase()}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <Input
                value={config?.tool_paths[tf.key] ?? ""}
                onChange={(v) => updateToolPath(tf.key, v)}
                placeholder="Auto-detect"
                title={`Path to ${tf.label} installation directory`}
                style={{ flex: 1 }}
              />
              <Btn small onClick={() => browseToolPath(tf.key)} title={`Browse filesystem for ${tf.label} installation`}>Browse</Btn>
            </div>
          </div>
        ))}

        {/* ── License Files ── */}
        <div style={{ ...sectionTitle, marginTop: 8 }}>
          <span style={{ color: C.warn }}>{"\u25CF"}</span>
          License Files
        </div>

        {[
          { vendor: "radiant", label: "Lattice Radiant" },
          { vendor: "quartus", label: "Intel Quartus" },
          { vendor: "vivado", label: "AMD Vivado" },
          { vendor: "diamond", label: "Lattice Diamond" },
        ].map((lf) => (
          <div key={lf.vendor} style={{ marginBottom: 12 }}>
            <span style={label}>{lf.label.toUpperCase()}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <Input
                value={config?.license_files?.[lf.vendor] ?? ""}
                onChange={(v) => updateLicenseFile(lf.vendor, v)}
                placeholder="Auto-detect"
                title={`Path to ${lf.label} license file`}
                style={{ flex: 1 }}
              />
              <Btn small onClick={() => handleLicenseFileBrowse(lf.vendor)} title={`Browse filesystem for ${lf.label} license file`}>Browse</Btn>
            </div>
          </div>
        ))}

        {/* ── AI Assistant ── */}
        <div style={{ ...sectionTitle, marginTop: 8 }}>
          <span style={{ color: C.pink }}>{"\u25CF"}</span>
          AI Assistant
        </div>

        {/* Provider selector */}
        <div style={{ marginBottom: 12 }}>
          <span style={label}>PROVIDER</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {AI_SETTINGS_PROVIDERS.map((p) => {
              const selected = (config?.ai_provider ?? "anthropic") === p.id;
              return (
                <div
                  key={p.id}
                  title={p.tooltip}
                  onClick={async () => {
                    const switchingProvider = p.id !== (config?.ai_provider ?? "anthropic");
                    if (switchingProvider) {
                      // Load per-provider key for the new provider
                      const key = await getAiApiKeyForProvider(p.id).catch(() => null);
                      setAiKey(key ?? "");
                      setShowKey(false);
                      setCopiedKey(false);
                    }
                    setConfig((prev) => {
                      if (!prev) return prev;
                      const defaultModel = p.models.length > 0 ? p.models[0].id : (prev.ai_model ?? "llama3.1");
                      const updated = {
                        ...prev,
                        ai_provider: p.id,
                        ai_model: defaultModel,
                      };
                      save(updated);
                      return updated;
                    });
                  }}
                  style={{
                    padding: "3px 8px",
                    borderRadius: 4,
                    border: `1px solid ${selected ? C.accent : C.b1}`,
                    background: selected ? `${C.accent}18` : C.bg,
                    cursor: "pointer",
                    fontSize: 8,
                    fontFamily: MONO,
                    fontWeight: 600,
                    color: selected ? C.accent : C.t2,
                  }}
                >
                  {p.name}
                  {providersWithKeys.has(p.id) && (
                    <span style={{
                      display: "inline-block", width: 5, height: 5, borderRadius: "50%",
                      background: C.ok, marginLeft: 4, verticalAlign: "middle",
                    }} title="API key saved" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* API key (hidden for Ollama) */}
        {(() => {
          const prov = AI_SETTINGS_PROVIDERS.find((p) => p.id === (config?.ai_provider ?? "anthropic"));
          const isOllama = prov?.id === "ollama";
          return (
            <>
              {!isOllama && (
                <div style={{ marginBottom: 12 }}>
                  <span style={label}>API KEY</span>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <div style={{ flex: 1, position: "relative" }}>
                      <input
                        type={showKey ? "text" : "password"}
                        value={aiKey}
                        onChange={(e) => {
                          const v = e.target.value;
                          setAiKey(v);
                          const pid = config?.ai_provider ?? "anthropic";
                          setAiApiKeyForProvider(pid, v || null).catch(() => {});
                          setAiApiKey(v || null).catch(() => {}); // backward compat
                          // Update green dot indicators
                          setProvidersWithKeys((prev) => {
                            const next = new Set(prev);
                            if (v) next.add(pid); else next.delete(pid);
                            return next;
                          });
                        }}
                        placeholder={prov?.keyPlaceholder ?? "API key"}
                        title={`API key for ${prov?.name ?? "AI provider"}`}
                        style={{
                          width: "100%",
                          padding: "5px 8px",
                          background: C.bg,
                          border: `1px solid ${C.b1}`,
                          borderRadius: 4,
                          color: C.t1,
                          fontSize: 9,
                          fontFamily: MONO,
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                    <span
                      onClick={() => setShowKey((p) => !p)}
                      title={showKey ? "Hide API key" : "Show API key"}
                      style={{
                        fontSize: 7, fontFamily: MONO, padding: "3px 6px", borderRadius: 3,
                        background: C.bg, border: `1px solid ${C.b1}`, cursor: "pointer",
                        color: C.t2, fontWeight: 600, whiteSpace: "nowrap",
                      }}
                    >
                      {showKey ? "Hide" : "Show"}
                    </span>
                    <span
                      onClick={() => {
                        if (aiKey) {
                          navigator.clipboard.writeText(aiKey);
                          setCopiedKey(true);
                          setTimeout(() => setCopiedKey(false), 1500);
                        }
                      }}
                      title="Copy API key to clipboard"
                      style={{
                        fontSize: 7, fontFamily: MONO, padding: "3px 6px", borderRadius: 3,
                        background: copiedKey ? `${C.ok}15` : C.bg,
                        border: `1px solid ${copiedKey ? `${C.ok}44` : C.b1}`,
                        cursor: aiKey ? "pointer" : "default",
                        color: copiedKey ? C.ok : (aiKey ? C.t2 : C.t3),
                        fontWeight: 600, whiteSpace: "nowrap",
                        opacity: aiKey ? 1 : 0.5,
                      }}
                    >
                      {copiedKey ? "\u2713 Copied" : "Copy"}
                    </span>
                  </div>
                  <div style={{ fontSize: 7, fontFamily: MONO, color: C.t3, marginTop: 3 }}>
                    {prov?.keyHelp ?? "Enter your API key"}. Stored securely in OS keyring.
                  </div>
                </div>
              )}

              {/* Ollama base URL */}
              {isOllama && (
                <div style={{ marginBottom: 12 }}>
                  <span style={label}>OLLAMA URL</span>
                  <Input
                    value={config?.ai_base_url ?? ""}
                    onChange={(v) => {
                      setConfig((prev) => {
                        if (!prev) return prev;
                        const updated = { ...prev, ai_base_url: v || null };
                        save(updated);
                        return updated;
                      });
                    }}
                    placeholder="http://localhost:11434"
                    title="Base URL for local Ollama server"
                    style={{ width: "100%" }}
                  />
                  <div style={{ fontSize: 7, fontFamily: MONO, color: C.t3, marginTop: 3 }}>
                    Leave blank for default localhost:11434. No API key needed.
                  </div>
                </div>
              )}

              {/* Model selector */}
              <div style={{ marginBottom: 20 }}>
                <span style={label}>MODEL</span>
                {prov && prov.models.length > 0 ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {prov.models.map((m) => {
                      const selected = (config?.ai_model ?? prov.models[0]?.id) === m.id;
                      return (
                        <div
                          key={m.id}
                          title={`Use ${m.label} model`}
                          onClick={() => {
                            setConfig((prev) => {
                              if (!prev) return prev;
                              const updated = { ...prev, ai_model: m.id };
                              save(updated);
                              return updated;
                            });
                          }}
                          style={{
                            padding: "3px 8px",
                            borderRadius: 4,
                            border: `1px solid ${selected ? C.accent : C.b1}`,
                            background: selected ? `${C.accent}18` : C.bg,
                            cursor: "pointer",
                            fontSize: 8,
                            fontFamily: MONO,
                            fontWeight: 600,
                            color: selected ? C.accent : C.t2,
                          }}
                        >
                          {m.label}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <Input
                    value={config?.ai_model ?? ""}
                    onChange={(v) => {
                      setConfig((prev) => {
                        if (!prev) return prev;
                        const updated = { ...prev, ai_model: v || null };
                        save(updated);
                        return updated;
                      });
                    }}
                    placeholder="llama3.1, codellama, mistral, etc."
                    title="Name of the Ollama model to use"
                    style={{ width: "100%" }}
                  />
                )}
              </div>
            </>
          );
        })()}

        {/* ── Preferred Editor ── */}
        <div style={{ ...sectionTitle, marginTop: 8 }}>
          <span style={{ color: C.ok }}>{"\u25CF"}</span>
          External Editor
        </div>

        <div style={{ marginBottom: 20 }}>
          <span style={label}>PREFERRED EDITOR</span>
          <div style={{ display: "flex", gap: 8 }}>
            <Input
              value={config?.preferred_editor ?? ""}
              onChange={(v) => {
                setConfig((prev) => {
                  if (!prev) return prev;
                  const updated = { ...prev, preferred_editor: v || null };
                  save(updated);
                  return updated;
                });
              }}
              placeholder="System Default"
              title="Path to preferred editor executable"
              style={{ flex: 1 }}
            />
            <Btn small title="Browse filesystem for editor executable" onClick={async () => {
              const picked = await pickFile();
              if (picked) {
                setConfig((prev) => {
                  if (!prev) return prev;
                  const updated = { ...prev, preferred_editor: picked };
                  save(updated);
                  return updated;
                });
              }
            }}>Browse</Btn>
            {config?.preferred_editor && (
              <Btn small title="Clear editor selection and use system default" onClick={() => {
                setConfig((prev) => {
                  if (!prev) return prev;
                  const updated = { ...prev, preferred_editor: null };
                  save(updated);
                  return updated;
                });
              }}>Clear</Btn>
            )}
          </div>
          <div style={{ fontSize: 7, fontFamily: MONO, color: C.t3, marginTop: 3 }}>
            Path to editor executable (e.g. code, vim, notepad++). Leave blank for system default.
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Btn small onClick={onClose} disabled={saving} title="Close settings panel">
            {saving ? "Saving..." : "Close"}
          </Btn>
        </div>
      </div>
    </div>
  );
}
