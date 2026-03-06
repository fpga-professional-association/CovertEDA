import { useState, useRef, useCallback, useEffect } from "react";
import { useTheme } from "../context/ThemeContext";
import { Btn, Input, HoverRow } from "./shared";
import { Brain } from "./Icons";
import { getAppConfig, saveAppConfig, getAiApiKey, setAiApiKey, AppConfig, readFile, writeTextFile } from "../hooks/useTauri";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

// ── Prompt Library & Skills Types ──

interface SavedPrompt {
  id: string;
  title: string;
  content: string;
  category: "builtin" | "user";
  createdAt: string;
}

interface AiSkill {
  id: string;
  name: string;
  description: string;
  template: string;
  systemPromptAddition?: string;
  provider?: string;
  createdAt: string;
}

interface PromptStore {
  prompts: SavedPrompt[];
  skills: AiSkill[];
}

// ── Built-in Prompts ──

const BUILTIN_PROMPTS: SavedPrompt[] = [
  { id: "bp-1", title: "Review HDL for synthesis issues", content: "Review my HDL source files for common synthesis issues: latches from incomplete if/case, combinational loops, undriven nets, multi-driven signals, and clock domain crossing problems. List each issue with file, line context, and suggested fix.", category: "builtin", createdAt: "" },
  { id: "bp-2", title: "Analyze timing violations", content: "Analyze the timing report from my latest build. Identify the worst failing paths, explain why they fail (setup vs hold, clock skew, excessive logic depth), and suggest specific fixes like pipelining, retiming, or constraint changes.", category: "builtin", createdAt: "" },
  { id: "bp-3", title: "Explain resource utilization", content: "Explain the resource utilization report from my build. Highlight which resources are over-utilized (LUTs, FFs, BRAMs, DSPs), what design structures drive that usage, and recommend optimizations to reduce resource consumption.", category: "builtin", createdAt: "" },
  { id: "bp-4", title: "Generate timing constraints", content: "Generate timing constraints for my design. Based on the source files and top module, create appropriate clock definitions, I/O delays, false paths, and multicycle paths. Output in the correct constraint format for my current backend tool.", category: "builtin", createdAt: "" },
  { id: "bp-5", title: "Optimize for lower power", content: "Analyze my design for power optimization opportunities. Consider clock gating, operand isolation, memory access patterns, I/O standard selection, and logic restructuring. Prioritize suggestions by estimated power savings.", category: "builtin", createdAt: "" },
  { id: "bp-6", title: "Check for FPGA design pitfalls", content: "Check my design for common FPGA pitfalls: improper reset usage, unsafe CDC, blocking vs non-blocking assignment errors, sensitivity list issues, vendor-specific gotchas for my target device, and simulation/synthesis mismatches.", category: "builtin", createdAt: "" },
  { id: "bp-7", title: "Explain build errors", content: "Explain the build errors from my recent build log. For each error, explain the root cause in plain language, show what code likely triggered it, and provide a concrete fix. Group related errors together.", category: "builtin", createdAt: "" },
  { id: "bp-8", title: "Write testbench", content: "Write a testbench for my top module. Include clock generation, reset sequence, stimulus for all inputs, expected output checks with assertions, and a timeout watchdog. Use SystemVerilog if possible, otherwise Verilog.", category: "builtin", createdAt: "" },
];

// ── Built-in Skills ──

const BUILTIN_SKILLS: AiSkill[] = [
  {
    id: "bs-1",
    name: "Code Review",
    description: "Review a specific file for synthesis issues",
    template: "Review the file {{filename}} for synthesis issues, focusing on {{focus_area}}. Check for latches, combinational loops, CDC issues, and vendor-specific problems. Provide line-by-line feedback where relevant.",
    createdAt: "",
  },
  {
    id: "bs-2",
    name: "Constraint Generator",
    description: "Generate timing constraints for a clock",
    template: "Generate timing constraints for a {{frequency}} MHz clock named {{clock_name}} targeting my current device and backend. Include the clock definition, derived clocks if needed, I/O delays relative to this clock, and any recommended false/multicycle paths.",
    createdAt: "",
  },
  {
    id: "bs-3",
    name: "Module Generator",
    description: "Generate an HDL module from a description",
    template: "Write a {{language}} module called {{module_name}} that implements: {{description}}. Include proper reset handling, parameterization where sensible, and inline comments for complex logic.",
    createdAt: "",
  },
];

function extractPlaceholders(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const SYSTEM_PROMPT = `You are an expert FPGA design assistant integrated into CovertEDA, a unified FPGA development IDE.
You help users with:
- HDL (Verilog, SystemVerilog, VHDL) code writing, review, and debugging
- FPGA timing closure strategies and constraint writing (SDC, PDC, XDC, LPF)
- Build error diagnosis and resolution for Lattice Radiant, Intel Quartus, AMD Vivado, and OSS tools
- FPGA architecture questions (LUTs, FFs, BRAMs, DSPs, clocking, I/O standards)
- IP core configuration and integration
- Design best practices and optimization

You have real-time access to the user's project state through the context provided below, including:
the target device, backend tool, source files, constraint files, build status, timing/utilization/power/DRC
reports, git state, the project file tree, and source file contents. Reference this data directly and confidently
in your answers — do NOT ask the user to paste or share files you can already see in the context. If you need
file contents that are not included in the context, ask the user to open that specific file and share the
relevant section.

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

const AI_MD_TEMPLATE = `# AI Context for this project

<!-- Notes here are automatically included in AI assistant context -->

## Design Overview

## Known Issues

## Style Preferences
`;

export default function AiAssistant({ projectContext, projectDir, onOpenFile }: { projectContext?: string; projectDir?: string; onOpenFile?: (name: string, path?: string) => void }) {
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

  // Prompt Library state
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [userPrompts, setUserPrompts] = useState<SavedPrompt[]>([]);
  const [userSkills, setUserSkills] = useState<AiSkill[]>([]);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [promptTitle, setPromptTitle] = useState("");
  const [creatingSkill, setCreatingSkill] = useState(false);
  const [skillDraft, setSkillDraft] = useState({ name: "", description: "", template: "" });

  // Active skill state
  const [activeSkill, setActiveSkill] = useState<AiSkill | null>(null);
  const [skillParams, setSkillParams] = useState<Record<string, string>>({});
  const [skillSystemAddition, setSkillSystemAddition] = useState<string | null>(null);

  // ai.md state
  const [aiMdExists, setAiMdExists] = useState(false);
  const [aiMdToast, setAiMdToast] = useState(false);

  const provider = getProvider(providerId);
  const effectiveModel = providerId === "ollama" ? ollamaModel : model;

  // Load config on mount — API key comes from OS keyring, rest from config
  useEffect(() => {
    Promise.all([getAppConfig(), getAiApiKey()]).then(([cfg, key]) => {
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
        if (key) {
          setApiKey(key);
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

  // Load prompts/skills from project file
  useEffect(() => {
    if (!projectDir) return;
    readFile(`${projectDir}/.coverteda_prompts.json`)
      .then((fc) => {
        if (!fc.isBinary && fc.content) {
          const store: PromptStore = JSON.parse(fc.content);
          setUserPrompts(store.prompts ?? []);
          setUserSkills(store.skills ?? []);
        }
      })
      .catch(() => { /* file doesn't exist yet */ });
  }, [projectDir]);

  // Check if ai.md exists
  useEffect(() => {
    if (!projectDir) return;
    readFile(`${projectDir}/ai.md`)
      .then((fc) => setAiMdExists(!fc.isBinary && !!fc.content))
      .catch(() => setAiMdExists(false));
  }, [projectDir]);

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

  const savePromptStore = useCallback((prompts: SavedPrompt[], skills: AiSkill[]) => {
    if (!projectDir) return;
    const store: PromptStore = { prompts, skills };
    writeTextFile(`${projectDir}/.coverteda_prompts.json`, JSON.stringify(store, null, 2)).catch(() => {});
  }, [projectDir]);

  const saveKey = useCallback((key: string) => {
    setApiKey(key);
    setShowSetup(false);
    setAiApiKey(key).catch(() => {});
  }, []);

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

    let systemContent = projectContext
      ? `${SYSTEM_PROMPT}\n\nCurrent project context:\n${projectContext}`
      : SYSTEM_PROMPT;

    // Append one-shot skill system prompt addition
    if (skillSystemAddition) {
      systemContent += `\n\n${skillSystemAddition}`;
      setSkillSystemAddition(null);
    }

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
  }, [input, apiKey, effectiveModel, messages, loading, projectContext, provider, providerId, ollamaUrl, skillSystemAddition]);

  const handlePromptClick = useCallback((content: string) => {
    setInput(content);
    setPromptsOpen(false);
  }, []);

  const handleSavePrompt = useCallback(() => {
    if (!promptTitle.trim() || !input.trim()) return;
    const newPrompt: SavedPrompt = {
      id: genId(),
      title: promptTitle.trim(),
      content: input.trim(),
      category: "user",
      createdAt: new Date().toISOString(),
    };
    const updated = [...userPrompts, newPrompt];
    setUserPrompts(updated);
    savePromptStore(updated, userSkills);
    setPromptTitle("");
    setSavingPrompt(false);
  }, [promptTitle, input, userPrompts, userSkills, savePromptStore]);

  const handleDeletePrompt = useCallback((id: string) => {
    const updated = userPrompts.filter((p) => p.id !== id);
    setUserPrompts(updated);
    savePromptStore(updated, userSkills);
  }, [userPrompts, userSkills, savePromptStore]);

  const handleSkillActivate = useCallback((skill: AiSkill) => {
    setActiveSkill(skill);
    const placeholders = extractPlaceholders(skill.template);
    const params: Record<string, string> = {};
    for (const p of placeholders) params[p] = "";
    setSkillParams(params);
  }, []);

  const handleSkillApply = useCallback(() => {
    if (!activeSkill) return;
    let result = activeSkill.template;
    for (const [key, val] of Object.entries(skillParams)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), val || `{{${key}}}`);
    }
    setInput(result);
    if (activeSkill.systemPromptAddition) {
      setSkillSystemAddition(activeSkill.systemPromptAddition);
    }
    setActiveSkill(null);
    setSkillParams({});
    setPromptsOpen(false);
  }, [activeSkill, skillParams]);

  const handleSaveSkill = useCallback(() => {
    if (!skillDraft.name.trim() || !skillDraft.template.trim()) return;
    const newSkill: AiSkill = {
      id: genId(),
      name: skillDraft.name.trim(),
      description: skillDraft.description.trim(),
      template: skillDraft.template.trim(),
      createdAt: new Date().toISOString(),
    };
    const updated = [...userSkills, newSkill];
    setUserSkills(updated);
    savePromptStore(userPrompts, updated);
    setSkillDraft({ name: "", description: "", template: "" });
    setCreatingSkill(false);
  }, [skillDraft, userSkills, userPrompts, savePromptStore]);

  const handleDeleteSkill = useCallback((id: string) => {
    const updated = userSkills.filter((s) => s.id !== id);
    setUserSkills(updated);
    savePromptStore(userPrompts, updated);
  }, [userSkills, userPrompts, savePromptStore]);

  const handleAiMd = useCallback(async () => {
    if (!projectDir) return;
    const filePath = `${projectDir}/ai.md`;
    if (!aiMdExists) {
      await writeTextFile(filePath, AI_MD_TEMPLATE).catch(() => {});
      setAiMdExists(true);
      setAiMdToast(true);
      setTimeout(() => setAiMdToast(false), 2000);
    }
    if (onOpenFile) onOpenFile("ai.md", filePath);
  }, [projectDir, aiMdExists, onOpenFile]);

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

  const headerLinkStyle: React.CSSProperties = {
    fontSize: 7,
    fontFamily: MONO,
    color: C.t3,
    cursor: "pointer",
    textDecoration: "underline",
    position: "relative",
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: 7,
    fontFamily: MONO,
    fontWeight: 700,
    color: C.t3,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    padding: "6px 8px 4px",
  };

  const hasAiMdInContext = !!projectContext?.includes("Project AI notes (ai.md):");

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
                {provider.keyHelp}. Stored securely in OS keyring.
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

  const allSkills = [...BUILTIN_SKILLS, ...userSkills];

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
          onClick={() => setPromptsOpen((p) => !p)}
          style={{ ...headerLinkStyle, color: promptsOpen ? C.accent : C.t3 }}
        >
          Prompts
        </div>
        {projectDir && (
          <div onClick={handleAiMd} style={headerLinkStyle}>
            ai.md
            {hasAiMdInContext && (
              <span style={{
                position: "absolute",
                top: -1,
                right: -4,
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: C.ok,
              }} />
            )}
            {aiMdToast && (
              <span style={{
                position: "absolute",
                top: -14,
                left: "50%",
                transform: "translateX(-50%)",
                fontSize: 6,
                fontFamily: MONO,
                color: C.ok,
                whiteSpace: "nowrap",
                background: C.s1,
                padding: "1px 4px",
                borderRadius: 3,
                border: `1px solid ${C.b1}`,
              }}>
                {aiMdExists ? "Loaded" : "Created"}
              </span>
            )}
          </div>
        )}
        <div
          onClick={() => setShowSetup(true)}
          style={headerLinkStyle}
        >
          Settings
        </div>
        <div
          onClick={() => setMessages([])}
          style={headerLinkStyle}
        >
          Clear
        </div>
      </div>

      {/* Main content: chat + optional prompts panel */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Chat area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
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

        {/* Prompts Panel */}
        {promptsOpen && (
          <div style={{
            width: 220,
            flexShrink: 0,
            borderLeft: `1px solid ${C.b1}`,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}>
            <div style={{ flex: 1, overflow: "auto" }}>
              {/* Active skill parameter form */}
              {activeSkill && (
                <div style={{ padding: 8, borderBottom: `1px solid ${C.b1}` }}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: C.accent, marginBottom: 6, fontFamily: MONO }}>
                    {activeSkill.name}
                  </div>
                  {extractPlaceholders(activeSkill.template).map((ph) => (
                    <div key={ph} style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 7, fontFamily: MONO, color: C.t3, marginBottom: 2 }}>{ph}</div>
                      <Input
                        value={skillParams[ph] ?? ""}
                        onChange={(v) => setSkillParams((prev) => ({ ...prev, [ph]: v }))}
                        placeholder={ph}
                        style={{ fontSize: 8, padding: "3px 6px" }}
                      />
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                    <Btn primary small onClick={handleSkillApply}>Apply</Btn>
                    <Btn small onClick={() => { setActiveSkill(null); setSkillParams({}); }}>Cancel</Btn>
                  </div>
                </div>
              )}

              {/* Built-in Prompts */}
              <div style={sectionLabel}>Built-in</div>
              {BUILTIN_PROMPTS.map((p) => (
                <HoverRow key={p.id} onClick={() => handlePromptClick(p.content)} style={{ padding: "4px 8px" }}>
                  <div style={{ fontSize: 8, fontFamily: MONO, color: C.t2, lineHeight: 1.4 }}>{p.title}</div>
                </HoverRow>
              ))}

              {/* User Saved Prompts */}
              <div style={sectionLabel}>Saved</div>
              {userPrompts.length === 0 && (
                <div style={{ padding: "4px 8px", fontSize: 7, fontFamily: MONO, color: C.t3 }}>
                  No saved prompts yet
                </div>
              )}
              {userPrompts.map((p) => (
                <HoverRow key={p.id} onClick={() => handlePromptClick(p.content)} style={{ padding: "4px 8px", display: "flex", alignItems: "center" }}>
                  <div style={{ flex: 1, fontSize: 8, fontFamily: MONO, color: C.t2, lineHeight: 1.4 }}>{p.title}</div>
                  <div
                    onClick={(e) => { e.stopPropagation(); handleDeletePrompt(p.id); }}
                    style={{ fontSize: 8, color: C.t3, cursor: "pointer", padding: "0 2px", flexShrink: 0 }}
                  >
                    x
                  </div>
                </HoverRow>
              ))}

              {/* Save Current Prompt */}
              {savingPrompt ? (
                <div style={{ padding: "6px 8px" }}>
                  <Input
                    value={promptTitle}
                    onChange={setPromptTitle}
                    placeholder="Prompt title..."
                    style={{ fontSize: 8, padding: "3px 6px", marginBottom: 4 }}
                  />
                  <div style={{ display: "flex", gap: 4 }}>
                    <Btn primary small onClick={handleSavePrompt} disabled={!promptTitle.trim() || !input.trim()}>Save</Btn>
                    <Btn small onClick={() => { setSavingPrompt(false); setPromptTitle(""); }}>Cancel</Btn>
                  </div>
                  {!input.trim() && (
                    <div style={{ fontSize: 6, fontFamily: MONO, color: C.t3, marginTop: 3 }}>
                      Type a prompt in the input first
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: "6px 8px" }}>
                  <Btn small onClick={() => setSavingPrompt(true)} style={{ width: "100%", justifyContent: "center" }}>
                    Save Current
                  </Btn>
                </div>
              )}

              {/* Skills */}
              <div style={sectionLabel}>Skills</div>
              {allSkills.map((s) => {
                const isUser = s.id.startsWith("bs-") ? false : true;
                return (
                  <HoverRow key={s.id} onClick={() => handleSkillActivate(s)} style={{ padding: "4px 8px", display: "flex", alignItems: "center" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 8, fontFamily: MONO, color: C.accent, fontWeight: 600 }}>{s.name}</div>
                      <div style={{ fontSize: 6, fontFamily: MONO, color: C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.description}</div>
                    </div>
                    {isUser && (
                      <div
                        onClick={(e) => { e.stopPropagation(); handleDeleteSkill(s.id); }}
                        style={{ fontSize: 8, color: C.t3, cursor: "pointer", padding: "0 2px", flexShrink: 0 }}
                      >
                        x
                      </div>
                    )}
                  </HoverRow>
                );
              })}

              {/* Create new skill */}
              {creatingSkill ? (
                <div style={{ padding: "6px 8px" }}>
                  <Input
                    value={skillDraft.name}
                    onChange={(v) => setSkillDraft((d) => ({ ...d, name: v }))}
                    placeholder="Skill name"
                    style={{ fontSize: 8, padding: "3px 6px", marginBottom: 4 }}
                  />
                  <Input
                    value={skillDraft.description}
                    onChange={(v) => setSkillDraft((d) => ({ ...d, description: v }))}
                    placeholder="Description"
                    style={{ fontSize: 8, padding: "3px 6px", marginBottom: 4 }}
                  />
                  <textarea
                    value={skillDraft.template}
                    onChange={(e) => setSkillDraft((d) => ({ ...d, template: e.target.value }))}
                    placeholder={"Template with {{placeholders}}..."}
                    style={{
                      width: "100%",
                      height: 60,
                      padding: "3px 6px",
                      fontSize: 8,
                      fontFamily: MONO,
                      background: C.bg,
                      color: C.t1,
                      border: `1px solid ${C.b1}`,
                      borderRadius: 4,
                      outline: "none",
                      resize: "vertical",
                      marginBottom: 4,
                    }}
                  />
                  <div style={{ display: "flex", gap: 4 }}>
                    <Btn primary small onClick={handleSaveSkill} disabled={!skillDraft.name.trim() || !skillDraft.template.trim()}>Save</Btn>
                    <Btn small onClick={() => { setCreatingSkill(false); setSkillDraft({ name: "", description: "", template: "" }); }}>Cancel</Btn>
                  </div>
                </div>
              ) : (
                <div style={{ padding: "6px 8px" }}>
                  <Btn small onClick={() => setCreatingSkill(true)} style={{ width: "100%", justifyContent: "center" }}>
                    New Skill
                  </Btn>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
