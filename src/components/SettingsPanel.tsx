import { useState, useEffect, useCallback } from "react";
import { useTheme } from "../context/ThemeContext";
import { ThemeId } from "../theme";
import { Btn, Input } from "./shared";
import { getAppConfig, saveAppConfig, pickDirectory, pickFile, AppConfig } from "../hooks/useTauri";

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

const THEME_OPTIONS: { id: ThemeId; label: string; desc: string }[] = [
  { id: "dark", label: "Dark", desc: "Default dark palette" },
  { id: "light", label: "Light", desc: "Light background" },
  { id: "colorblind", label: "Colorblind", desc: "Deuteranopia-safe" },
];

const AI_SETTINGS_PROVIDERS: {
  id: string;
  name: string;
  models: { id: string; label: string }[];
  keyPlaceholder: string;
  keyHelp: string;
}[] = [
  {
    id: "anthropic", name: "Anthropic",
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
    models: [
      { id: "grok-3", label: "Grok 3" },
      { id: "grok-3-mini", label: "Grok 3 mini" },
    ],
    keyPlaceholder: "xai-...",
    keyHelp: "Get your key at console.x.ai",
  },
  {
    id: "deepseek", name: "DeepSeek",
    models: [
      { id: "deepseek-chat", label: "DeepSeek Chat" },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner" },
    ],
    keyPlaceholder: "sk-...",
    keyHelp: "Get your key at platform.deepseek.com",
  },
  {
    id: "ollama", name: "Ollama",
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

  useEffect(() => {
    getAppConfig().then(setConfig);
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
                  onClick={() => handleThemeChange(t.id)}
                  onMouseEnter={() => setHover(`theme-${t.id}`)}
                  onMouseLeave={() => setHover(null)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: `1.5px solid ${selected ? C.accent : C.b1}`,
                    background: selected ? `${C.accent}10` : hovered ? C.s2 : C.bg,
                    cursor: "pointer",
                    transition: "all .1s",
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
                    transition: "all .1s",
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
                style={{ flex: 1 }}
              />
              <Btn small onClick={() => browseToolPath(tf.key)}>Browse</Btn>
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
                style={{ flex: 1 }}
              />
              <Btn small onClick={() => handleLicenseFileBrowse(lf.vendor)}>Browse</Btn>
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
                  onClick={() => {
                    setConfig((prev) => {
                      if (!prev) return prev;
                      const defaultModel = p.models.length > 0 ? p.models[0].id : (prev.ai_model ?? "llama3.1");
                      const updated = {
                        ...prev,
                        ai_provider: p.id,
                        ai_model: defaultModel,
                        ai_api_key: p.id === (prev.ai_provider ?? "anthropic") ? prev.ai_api_key : null,
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
                  <div style={{ display: "flex", gap: 8 }}>
                    <Input
                      value={config?.ai_api_key ?? ""}
                      onChange={(v) => {
                        setConfig((prev) => {
                          if (!prev) return prev;
                          const updated = { ...prev, ai_api_key: v || null };
                          save(updated);
                          return updated;
                        });
                      }}
                      placeholder={prov?.keyPlaceholder ?? "API key"}
                      style={{ flex: 1 }}
                    />
                  </div>
                  <div style={{ fontSize: 7, fontFamily: MONO, color: C.t3, marginTop: 3 }}>
                    {prov?.keyHelp ?? "Enter your API key"}. Stored locally only.
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
                    style={{ width: "100%" }}
                  />
                )}
              </div>
            </>
          );
        })()}

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Btn small onClick={onClose} disabled={saving}>
            {saving ? "Saving..." : "Close"}
          </Btn>
        </div>
      </div>
    </div>
  );
}
