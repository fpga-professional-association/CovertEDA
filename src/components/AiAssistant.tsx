import { useState, useRef, useCallback, useEffect } from "react";
import { useTheme } from "../context/ThemeContext";
import { Btn, Input } from "./shared";
import { Brain } from "./Icons";
import { getAppConfig, saveAppConfig, AppConfig } from "../hooks/useTauri";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

const SYSTEM_PROMPT = `You are an expert FPGA design assistant integrated into CovertEDA, a unified FPGA development IDE.
You help users with:
- HDL (Verilog, SystemVerilog, VHDL) code writing, review, and debugging
- FPGA timing closure strategies and constraint writing (SDC, PDC, XDC, LPF)
- Build error diagnosis and resolution for Lattice Radiant, Intel Quartus, AMD Vivado, and OSS tools
- FPGA architecture questions (LUTs, FFs, BRAMs, DSPs, clocking, I/O standards)
- IP core configuration and integration
- Design best practices and optimization

Keep answers concise and practical. Use code blocks for HDL examples. Reference specific tool commands when relevant.`;

// ── Provider Registry ──

interface AiProvider {
  id: string;
  name: string;
  baseUrl: string;
  format: "anthropic" | "openai";
  models: { id: string; label: string }[];
  keyPlaceholder: string;
  keyRequired: boolean;
  keyHelp: string;
}

const AI_PROVIDERS: AiProvider[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1/messages",
    format: "anthropic",
    models: [
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Fast)" },
      { id: "claude-opus-4-6", label: "Claude Opus 4.6 (Best)" },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (Cheapest)" },
    ],
    keyPlaceholder: "sk-ant-api03-...",
    keyRequired: true,
    keyHelp: "Get your key at console.anthropic.com",
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1/chat/completions",
    format: "openai",
    models: [
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4o-mini", label: "GPT-4o mini" },
      { id: "o3-mini", label: "o3-mini" },
      { id: "o1", label: "o1" },
    ],
    keyPlaceholder: "sk-...",
    keyRequired: true,
    keyHelp: "Get your key at platform.openai.com",
  },
  {
    id: "google",
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    format: "openai",
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    ],
    keyPlaceholder: "AI...",
    keyRequired: true,
    keyHelp: "Get your key at aistudio.google.com",
  },
  {
    id: "mistral",
    name: "Mistral",
    baseUrl: "https://api.mistral.ai/v1/chat/completions",
    format: "openai",
    models: [
      { id: "mistral-large-latest", label: "Mistral Large" },
      { id: "codestral-latest", label: "Codestral" },
      { id: "mistral-small-latest", label: "Mistral Small" },
    ],
    keyPlaceholder: "API key",
    keyRequired: true,
    keyHelp: "Get your key at console.mistral.ai",
  },
  {
    id: "xai",
    name: "xAI",
    baseUrl: "https://api.x.ai/v1/chat/completions",
    format: "openai",
    models: [
      { id: "grok-3", label: "Grok 3" },
      { id: "grok-3-mini", label: "Grok 3 mini" },
    ],
    keyPlaceholder: "xai-...",
    keyRequired: true,
    keyHelp: "Get your key at console.x.ai",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/chat/completions",
    format: "openai",
    models: [
      { id: "deepseek-chat", label: "DeepSeek Chat" },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner" },
    ],
    keyPlaceholder: "sk-...",
    keyRequired: true,
    keyHelp: "Get your key at platform.deepseek.com",
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    baseUrl: "http://localhost:11434/v1/chat/completions",
    format: "openai",
    models: [], // user-entered
    keyPlaceholder: "",
    keyRequired: false,
    keyHelp: "Run Ollama locally — no API key needed",
  },
];

function getProvider(id: string): AiProvider {
  return AI_PROVIDERS.find((p) => p.id === id) ?? AI_PROVIDERS[0];
}

export default function AiAssistant({ projectContext }: { projectContext?: string }) {
  const { C, MONO, SANS } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [providerId, setProviderId] = useState("anthropic");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [ollamaModel, setOllamaModel] = useState("llama3.1");
  const [ollamaUrl, setOllamaUrl] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const configRef = useRef<AppConfig | null>(null);

  const provider = getProvider(providerId);
  const effectiveModel = providerId === "ollama" ? ollamaModel : model;

  // Load config on mount
  useEffect(() => {
    getAppConfig().then((cfg) => {
      configRef.current = cfg;
      const pid = cfg.ai_provider ?? "anthropic";
      setProviderId(pid);
      if (cfg.ai_model) {
        if (pid === "ollama") {
          setOllamaModel(cfg.ai_model);
        } else {
          setModel(cfg.ai_model);
        }
      }
      if (cfg.ai_base_url) setOllamaUrl(cfg.ai_base_url);

      const prov = getProvider(pid);
      if (prov.keyRequired) {
        if (cfg.ai_api_key) {
          setApiKey(cfg.ai_api_key);
          setShowSetup(false);
        } else {
          setShowSetup(true);
        }
      } else {
        // Ollama — no key needed
        setApiKey("__local__");
        setShowSetup(false);
      }
    });
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const persistConfig = useCallback((patch: Partial<AppConfig>) => {
    if (configRef.current) {
      const updated = { ...configRef.current, ...patch };
      configRef.current = updated;
      saveAppConfig(updated).catch(() => {});
    }
  }, []);

  const saveKey = useCallback((key: string) => {
    setApiKey(key);
    setShowSetup(false);
    persistConfig({ ai_api_key: key });
  }, [persistConfig]);

  const selectProvider = useCallback((pid: string) => {
    setProviderId(pid);
    const prov = getProvider(pid);
    // Pick first model as default when switching
    if (prov.models.length > 0) {
      setModel(prov.models[0].id);
      persistConfig({ ai_provider: pid, ai_model: prov.models[0].id });
    } else {
      persistConfig({ ai_provider: pid, ai_model: ollamaModel });
    }
    if (!prov.keyRequired) {
      setApiKey("__local__");
    }
  }, [persistConfig, ollamaModel]);

  const selectModel = useCallback((m: string) => {
    if (providerId === "ollama") {
      setOllamaModel(m);
    } else {
      setModel(m);
    }
    persistConfig({ ai_model: m });
  }, [persistConfig, providerId]);

  const saveOllamaUrl = useCallback((url: string) => {
    setOllamaUrl(url);
    persistConfig({ ai_base_url: url || null });
  }, [persistConfig]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;
    if (provider.keyRequired && !apiKey) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    const systemContent = projectContext
      ? `${SYSTEM_PROMPT}\n\nCurrent project context:\n${projectContext}`
      : SYSTEM_PROMPT;

    try {
      let assistantContent: string;

      if (provider.format === "anthropic") {
        // Anthropic API format
        const apiMessages = newMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const resp = await fetch(provider.baseUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey!,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify({
            model: effectiveModel,
            max_tokens: 4096,
            system: systemContent,
            messages: apiMessages,
          }),
        });

        if (!resp.ok) {
          const err = await resp.text();
          throw new Error(`API error ${resp.status}: ${err}`);
        }

        const data = await resp.json();
        assistantContent = data.content?.[0]?.text ?? "No response";
      } else {
        // OpenAI-compatible format
        const apiMessages = [
          { role: "system", content: systemContent },
          ...newMessages.map((m) => ({ role: m.role, content: m.content })),
        ];

        const baseUrl = providerId === "ollama" && ollamaUrl
          ? `${ollamaUrl.replace(/\/$/, "")}/v1/chat/completions`
          : provider.baseUrl;

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (provider.keyRequired && apiKey) {
          headers["Authorization"] = `Bearer ${apiKey}`;
        }

        const resp = await fetch(baseUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: effectiveModel,
            max_tokens: 4096,
            messages: apiMessages,
          }),
        });

        if (!resp.ok) {
          const err = await resp.text();
          throw new Error(`API error ${resp.status}: ${err}`);
        }

        const data = await resp.json();
        assistantContent = data.choices?.[0]?.message?.content ?? "No response";
      }

      setMessages((prev) => [...prev, { role: "assistant", content: assistantContent }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err instanceof Error ? err.message : String(err)}` },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, apiKey, effectiveModel, messages, loading, projectContext, provider, providerId, ollamaUrl]);

  const panelP: React.CSSProperties = {
    background: C.s1,
    borderRadius: 7,
    border: `1px solid ${C.b1}`,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    height: "100%",
  };

  const chipStyle = (selected: boolean): React.CSSProperties => ({
    padding: "4px 8px",
    borderRadius: 4,
    border: `1px solid ${selected ? C.accent : C.b1}`,
    background: selected ? `${C.accent}18` : C.bg,
    cursor: "pointer",
    fontSize: 8,
    fontFamily: MONO,
    fontWeight: 600,
    color: selected ? C.accent : C.t2,
  });

  // Setup screen
  if (showSetup || (provider.keyRequired && !apiKey)) {
    return (
      <div style={panelP}>
        <div style={{ padding: 14, overflow: "auto", flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.t1, marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
            <Brain />
            AI Assistant Setup
          </div>

          {/* Step 1: Provider selector */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 8, fontFamily: MONO, fontWeight: 600, color: C.t3, marginBottom: 6 }}>
              PROVIDER
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {AI_PROVIDERS.map((p) => {
                const sel = providerId === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => selectProvider(p.id)}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 5,
                      border: `1.5px solid ${sel ? C.accent : C.b1}`,
                      background: sel ? `${C.accent}10` : C.bg,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontSize: 9, fontWeight: 600, color: sel ? C.t1 : C.t2 }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: 7, fontFamily: MONO, color: C.t3, marginTop: 1 }}>
                      {p.models.length > 0 ? `${p.models.length} models` : "Custom model"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step 2: API key (skip for Ollama) */}
          {provider.keyRequired && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 8, fontFamily: MONO, fontWeight: 600, color: C.t3, marginBottom: 4 }}>
                API KEY
              </div>
              <Input
                value={keyDraft}
                onChange={setKeyDraft}
                placeholder={provider.keyPlaceholder}
                style={{ width: "100%", marginBottom: 4 }}
              />
              <div style={{ fontSize: 7, fontFamily: MONO, color: C.t3 }}>
                {provider.keyHelp}. Stored locally only.
              </div>
            </div>
          )}

          {/* Ollama: custom base URL */}
          {providerId === "ollama" && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 8, fontFamily: MONO, fontWeight: 600, color: C.t3, marginBottom: 4 }}>
                OLLAMA URL (optional)
              </div>
              <Input
                value={ollamaUrl}
                onChange={saveOllamaUrl}
                placeholder="http://localhost:11434"
                style={{ width: "100%" }}
              />
              <div style={{ fontSize: 7, fontFamily: MONO, color: C.t3, marginTop: 3 }}>
                Leave blank for default localhost:11434
              </div>
            </div>
          )}

          {/* Model selector */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 8, fontFamily: MONO, fontWeight: 600, color: C.t3, marginBottom: 4 }}>
              MODEL
            </div>
            {provider.models.length > 0 ? (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {provider.models.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => selectModel(m.id)}
                    style={chipStyle(model === m.id)}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
            ) : (
              <Input
                value={ollamaModel}
                onChange={(v) => selectModel(v)}
                placeholder="llama3.1, codellama, mistral, etc."
                style={{ width: "100%" }}
              />
            )}
          </div>

          <Btn
            primary
            small
            onClick={() => {
              if (provider.keyRequired) {
                if (keyDraft.trim()) saveKey(keyDraft.trim());
              } else {
                setApiKey("__local__");
                setShowSetup(false);
                persistConfig({ ai_provider: providerId, ai_model: ollamaModel });
              }
            }}
            disabled={provider.keyRequired && !keyDraft.trim()}
          >
            Connect
          </Btn>
        </div>
      </div>
    );
  }

  // Resolve display name for the header badge
  const modelLabel = providerId === "ollama"
    ? ollamaModel
    : (provider.models.find((m) => m.id === effectiveModel)?.label.split(" (")[0] ?? effectiveModel);

  return (
    <div style={panelP}>
      {/* Header */}
      <div style={{
        padding: "8px 14px",
        borderBottom: `1px solid ${C.b1}`,
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexShrink: 0,
      }}>
        <Brain />
        <span style={{ fontSize: 10, fontWeight: 700, color: C.t1 }}>AI Assistant</span>
        <span style={{ fontSize: 7, fontFamily: MONO, color: C.t3, padding: "1px 5px", background: C.bg, borderRadius: 3, border: `1px solid ${C.b1}` }}>
          {provider.name}
        </span>
        <span style={{ fontSize: 7, fontFamily: MONO, color: C.t3, padding: "1px 5px", background: C.bg, borderRadius: 3, border: `1px solid ${C.b1}` }}>
          {modelLabel}
        </span>
        <div style={{ flex: 1 }} />
        <div
          onClick={() => setShowSetup(true)}
          style={{ fontSize: 7, fontFamily: MONO, color: C.t3, cursor: "pointer", textDecoration: "underline" }}
        >
          Settings
        </div>
        <div
          onClick={() => setMessages([])}
          style={{ fontSize: 7, fontFamily: MONO, color: C.t3, cursor: "pointer", textDecoration: "underline" }}
        >
          Clear
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflow: "auto", padding: 12 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>{"\u{1F9E0}"}</div>
            <div style={{ fontSize: 10, color: C.t2, marginBottom: 4 }}>FPGA Design Assistant</div>
            <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, lineHeight: 1.6 }}>
              Ask about HDL code, timing constraints, build errors, IP configuration, or FPGA architecture.
            </div>
            <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
              {[
                "Explain setup/hold time violations",
                "Write a FIFO in SystemVerilog",
                "Help with SDC constraints",
                "Diagnose timing failure",
              ].map((q) => (
                <div
                  key={q}
                  onClick={() => { setInput(q); }}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 4,
                    border: `1px solid ${C.b1}`,
                    background: C.bg,
                    cursor: "pointer",
                    fontSize: 7,
                    fontFamily: MONO,
                    color: C.t2,
                  }}
                >
                  {q}
                </div>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{
              fontSize: 7,
              fontFamily: MONO,
              fontWeight: 700,
              color: m.role === "user" ? C.accent : C.ok,
              marginBottom: 3,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}>
              {m.role === "user" ? "You" : provider.name}
            </div>
            <div style={{
              fontSize: 9,
              fontFamily: m.role === "assistant" ? MONO : SANS,
              color: C.t1,
              lineHeight: 1.6,
              padding: "8px 10px",
              borderRadius: 6,
              background: m.role === "user" ? `${C.accent}08` : C.bg,
              border: `1px solid ${m.role === "user" ? `${C.accent}20` : C.b1}`,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}>
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ fontSize: 9, fontFamily: MONO, color: C.t3, padding: "8px 0" }}>
            Thinking...
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{
        padding: "8px 12px",
        borderTop: `1px solid ${C.b1}`,
        display: "flex",
        gap: 8,
        flexShrink: 0,
      }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder="Ask about your FPGA design..."
          style={{
            flex: 1,
            padding: "6px 10px",
            fontSize: 10,
            fontFamily: SANS,
            background: C.bg,
            color: C.t1,
            border: `1px solid ${C.b1}`,
            borderRadius: 5,
            outline: "none",
          }}
        />
        <Btn primary small onClick={sendMessage} disabled={loading || !input.trim()}>
          Send
        </Btn>
      </div>
    </div>
  );
}
