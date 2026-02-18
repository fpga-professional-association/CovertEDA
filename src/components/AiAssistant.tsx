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

const MODEL_OPTIONS = [
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Fast)" },
  { id: "claude-opus-4-6", label: "Claude Opus 4.6 (Best)" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (Cheapest)" },
];

export default function AiAssistant({ projectContext }: { projectContext?: string }) {
  const { C, MONO, SANS } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [showSetup, setShowSetup] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const configRef = useRef<AppConfig | null>(null);

  // Load config on mount
  useEffect(() => {
    getAppConfig().then((cfg) => {
      configRef.current = cfg;
      if (cfg.ai_api_key) {
        setApiKey(cfg.ai_api_key);
        setShowSetup(false);
      } else {
        setShowSetup(true);
      }
      if (cfg.ai_model) setModel(cfg.ai_model);
    });
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const saveKey = useCallback((key: string) => {
    setApiKey(key);
    setShowSetup(false);
    if (configRef.current) {
      const updated = { ...configRef.current, ai_api_key: key };
      configRef.current = updated;
      saveAppConfig(updated).catch(() => {});
    }
  }, []);

  const saveModel = useCallback((m: string) => {
    setModel(m);
    if (configRef.current) {
      const updated = { ...configRef.current, ai_model: m };
      configRef.current = updated;
      saveAppConfig(updated).catch(() => {});
    }
  }, []);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !apiKey || loading) return;
    const userMsg: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      // Build API messages
      const apiMessages = newMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Add project context to system prompt if available
      const systemContent = projectContext
        ? `${SYSTEM_PROMPT}\n\nCurrent project context:\n${projectContext}`
        : SYSTEM_PROMPT;

      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model,
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
      const assistantContent = data.content?.[0]?.text ?? "No response";
      setMessages((prev) => [...prev, { role: "assistant", content: assistantContent }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err instanceof Error ? err.message : String(err)}` },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, apiKey, model, messages, loading, projectContext]);

  const panelP: React.CSSProperties = {
    background: C.s1,
    borderRadius: 7,
    border: `1px solid ${C.b1}`,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    height: "100%",
  };

  // Setup screen
  if (showSetup || !apiKey) {
    return (
      <div style={panelP}>
        <div style={{ padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.t1, marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
            <Brain />
            AI Assistant Setup
          </div>
          <div style={{ fontSize: 9, fontFamily: MONO, color: C.t3, marginBottom: 14, lineHeight: 1.6 }}>
            Connect to Claude AI for FPGA design assistance, code generation, error diagnosis, and timing closure guidance.
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 8, fontFamily: MONO, fontWeight: 600, color: C.t3, marginBottom: 4 }}>
              API KEY
            </div>
            <Input
              value={keyDraft}
              onChange={setKeyDraft}
              placeholder="sk-ant-api03-..."
              style={{ width: "100%", marginBottom: 8 }}
            />
            <div style={{ fontSize: 7, fontFamily: MONO, color: C.t3, marginBottom: 10 }}>
              Get your API key at console.anthropic.com. Your key is stored locally.
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 8, fontFamily: MONO, fontWeight: 600, color: C.t3, marginBottom: 4 }}>
              MODEL
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {MODEL_OPTIONS.map((m) => (
                <div
                  key={m.id}
                  onClick={() => saveModel(m.id)}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 4,
                    border: `1px solid ${model === m.id ? C.accent : C.b1}`,
                    background: model === m.id ? `${C.accent}18` : C.bg,
                    cursor: "pointer",
                    fontSize: 8,
                    fontFamily: MONO,
                    fontWeight: 600,
                    color: model === m.id ? C.accent : C.t2,
                  }}
                >
                  {m.label}
                </div>
              ))}
            </div>
          </div>
          <Btn
            primary
            small
            onClick={() => { if (keyDraft.trim()) saveKey(keyDraft.trim()); }}
            disabled={!keyDraft.trim()}
          >
            Connect
          </Btn>
        </div>
      </div>
    );
  }

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
          {MODEL_OPTIONS.find((m) => m.id === model)?.label.split(" (")[0] ?? model}
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
              {m.role === "user" ? "You" : "Claude"}
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
