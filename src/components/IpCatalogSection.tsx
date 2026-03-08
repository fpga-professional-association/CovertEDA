import { useState, useCallback, useMemo } from "react";
import { useTheme } from "../context/ThemeContext";
import { Btn, Select } from "./shared";
import { Box } from "./Icons";
import { RADIANT_IP_CATALOG, QUARTUS_IP_CATALOG, OSS_IP_CATALOG, ICE40_IP_CATALOG, GOWIN_IP_CATALOG, IP_CATEGORIES, IpCore } from "../data/ipCatalog";
import { listen, executeIpGenerate, pickDirectory } from "../hooks/useTauri";

interface IpCatalogSectionProps {
  backendId: string;
  projectDir: string;
  device: string;
  onRefreshFiles?: () => void;
  onAddToSynth?: (instanceName: string) => void;
  customIps?: IpCore[];
  onCustomIpsChange?: (ips: IpCore[]) => void;
}

export default function IpCatalogSection({ backendId, projectDir, device, onRefreshFiles, onAddToSynth, customIps, onCustomIpsChange }: IpCatalogSectionProps) {
  const { C, MONO } = useTheme();
  const [ipSearch, setIpSearch] = useState("");
  const [configuring, setConfiguring] = useState<IpCore | null>(null);
  const [ipParams, setIpParams] = useState<Record<string, string>>({});
  const [instanceName, setInstanceName] = useState("u_inst");
  const [copiedTemplate, setCopiedTemplate] = useState(false);
  const [tclVisible, setTclVisible] = useState(false);
  const [genState, setGenState] = useState<"idle" | "preview" | "running" | "done" | "error">("idle");
  const [genOutput, setGenOutput] = useState<string[]>([]);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPath, setCustomPath] = useState("");
  const [customCategory, setCustomCategory] = useState<IpCore["category"]>("Misc");
  const [customDesc, setCustomDesc] = useState("");

  const builtinCatalog = useMemo(() => {
    let base: IpCore[];
    let sourceName: string;
    if (backendId === "quartus") { base = QUARTUS_IP_CATALOG; sourceName = "Quartus IP Library"; }
    else if (backendId === "opensource") {
      const d = device.toUpperCase();
      if (d.startsWith("ICE40")) { base = ICE40_IP_CATALOG; sourceName = "iCE40 IP Library"; }
      else if (d.startsWith("GW")) { base = GOWIN_IP_CATALOG; sourceName = "Gowin IP Library"; }
      else { base = OSS_IP_CATALOG; sourceName = "OSS CAD Suite"; }
    } else { base = RADIANT_IP_CATALOG; sourceName = "Radiant IP Library"; }
    return base.map((ip) => ({ ...ip, source: ip.source ?? `Built-in: ${sourceName}` }));
  }, [backendId, device]);

  const catalog = useMemo(() => {
    return [...builtinCatalog, ...(customIps ?? [])];
  }, [builtinCatalog, customIps]);

  const filtered = useMemo(() => {
    if (!ipSearch) return catalog;
    const q = ipSearch.toLowerCase();
    return catalog.filter(
      (ip) => ip.name.toLowerCase().includes(q) || ip.description.toLowerCase().includes(q) || ip.category.toLowerCase().includes(q)
    );
  }, [ipSearch, catalog]);

  const grouped = useMemo(() => {
    const map: Record<string, typeof filtered> = {};
    for (const cat of IP_CATEGORIES) map[cat] = [];
    for (const ip of filtered) (map[ip.category] ??= []).push(ip);
    return Object.entries(map).filter(([, items]) => items.length > 0);
  }, [filtered]);

  const openConfigurator = useCallback((ip: IpCore) => {
    setConfiguring(ip);
    const defaults: Record<string, string> = {};
    for (const p of ip.params ?? []) defaults[p.key] = p.default;
    setIpParams(defaults);
    setInstanceName(`u_${ip.name.toLowerCase().replace(/\s+/g, "_")}`);
    setCopiedTemplate(false);
    setTclVisible(false);
    setGenState("idle");
    setGenOutput([]);
  }, []);

  const generateTemplate = useMemo(() => {
    if (!configuring?.template) return null;
    let t = configuring.template;
    for (const [key, val] of Object.entries(ipParams)) {
      t = t.replace(new RegExp(`\\{${key}\\}`, "g"), val);
    }
    t = t.replace(/\{INSTANCE_NAME\}/g, instanceName);
    return t;
  }, [configuring, ipParams, instanceName]);

  const copyTemplate = useCallback(() => {
    if (generateTemplate) {
      navigator.clipboard.writeText(generateTemplate);
      setCopiedTemplate(true);
      setTimeout(() => setCopiedTemplate(false), 2000);
    }
  }, [generateTemplate]);

  const genTcl = useMemo(() => {
    if (!tclVisible || !configuring) return null;
    const sortedParams = Object.entries(ipParams)
      .filter(([, v]) => v)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const isQuartus = backendId === "quartus";
    const isVivado = backendId === "vivado";
    if (isQuartus) {
      const paramLines = sortedParams.map(([k, v]) => `set_parameter -name ${k} ${v}`).join("\n");
      return `# IP generation TCL for ${configuring.name}\npackage require ::quartus::project\nset_global_assignment -name IP_COMPONENT "${configuring.name}"\nset_global_assignment -name IP_INSTANCE "${instanceName}"\n${paramLines}\ngenerate_ip "${instanceName}"`;
    }
    if (isVivado) {
      const paramLines = sortedParams.map(([k, v]) => `CONFIG.${k} {${v}}`).join(" \\\n  ");
      return `# IP generation TCL for ${configuring.name}\ncreate_ip -name ${configuring.name} -vendor xilinx.com -library ip -module_name ${instanceName}\nset_property -dict [list \\\n  ${paramLines} \\\n] [get_ips ${instanceName}]\ngenerate_target all [get_ips ${instanceName}]`;
    }
    const paramLines = sortedParams
      .map(([k, v]) => `  -param "${k}:${v}"`)
      .join(" \\\n");
    return `# IP generation TCL for ${configuring.name}\nsbp_design new -name "${instanceName}" -family "LIFCL" -device "${device}"\nsbp_configure -component "${configuring.name}" \\\n${paramLines}\nsbp_generate -lang "verilog"\nsbp_save\nsbp_close_design`;
  }, [tclVisible, configuring, ipParams, instanceName, backendId, device]);

  const handleRunGenerate = useCallback(async () => {
    if (!genTcl) return;
    setGenState("running");
    setGenOutput([]);
    try {
      const unlistenStdout = await listen<{ genId: string; line: string }>(
        "ip:stdout",
        (data) => setGenOutput((p) => [...p, data.line]),
      );
      const unlistenFinished = await listen<{ genId: string; status: string; message: string }>(
        "ip:finished",
        (data) => {
          setGenOutput((p) => [...p, data.message]);
          setGenState(data.status === "success" ? "done" : "error");
          unlistenStdout();
          unlistenFinished();
        },
      );
      await executeIpGenerate(backendId, projectDir, genTcl);
    } catch (err) {
      setGenState("error");
      setGenOutput((p) => [...p, `Error: ${err}`]);
    }
  }, [genTcl, backendId, projectDir]);

  const panelP: React.CSSProperties = {
    background: C.s1, borderRadius: 7, border: `1px solid ${C.b1}`, overflow: "hidden", padding: 14,
  };

  if (configuring) {
    return (
      <div style={{ ...panelP, display: "flex", flexDirection: "column", overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Btn small onClick={() => { setConfiguring(null); setGenState("idle"); setTclVisible(false); setGenOutput([]); }}
            icon={<span style={{ fontSize: 10 }}>{"\u2190"}</span>} title="Back to IP catalog list">
            IP Catalog
          </Btn>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.t1, flex: 1 }}>
            {configuring.name}
          </div>
          <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>
            {configuring.category}
          </span>
        </div>

        <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, marginBottom: 12, lineHeight: 1.5 }}>
          {configuring.description}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, flex: 1 }}>
          <div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 8, fontFamily: MONO, fontWeight: 600, color: C.t3, marginBottom: 3 }}>
                INSTANCE NAME
              </div>
              <input
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                title="Instance name for the generated IP core"
                style={{
                  width: "100%", padding: "4px 8px", fontSize: 9, fontFamily: MONO,
                  background: C.bg, color: C.t1, border: `1px solid ${C.b1}`, borderRadius: 3,
                  outline: "none", boxSizing: "border-box",
                }}
              />
            </div>

            {configuring.params?.map((p) => (
              <div key={p.key} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 8, fontFamily: MONO, fontWeight: 600, color: C.t3, marginBottom: 3 }}>
                  {p.label} {p.unit && <span style={{ fontWeight: 400 }}>({p.unit})</span>}
                </div>
                {p.type === "select" ? (
                  <Select
                    value={ipParams[p.key] ?? p.default}
                    onChange={(v) => setIpParams((prev) => ({ ...prev, [p.key]: v }))}
                    options={(p.choices ?? []).map((c) => ({ value: c, label: c }))}
                    style={{ width: "100%" }}
                    title={`${p.label}${p.unit ? ` (${p.unit})` : ""}${p.choices ? ` — options: ${p.choices.join(", ")}` : ""}`}
                  />
                ) : p.type === "boolean" ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    {["true", "false"].map((v) => (
                      <span
                        key={v}
                        onClick={() => setIpParams((prev) => ({ ...prev, [p.key]: v }))}
                        title={`Set ${p.label} to ${v === "true" ? "Yes" : "No"}`}
                        style={{
                          padding: "3px 8px", borderRadius: 3, cursor: "pointer",
                          fontSize: 8, fontFamily: MONO, fontWeight: 600,
                          border: `1px solid ${(ipParams[p.key] ?? p.default) === v ? C.accent : C.b1}`,
                          color: (ipParams[p.key] ?? p.default) === v ? C.accent : C.t2,
                          background: (ipParams[p.key] ?? p.default) === v ? `${C.accent}15` : C.bg,
                        }}
                      >
                        {v === "true" ? "Yes" : "No"}
                      </span>
                    ))}
                  </div>
                ) : (
                  <input
                    type={p.type === "number" ? "number" : "text"}
                    value={ipParams[p.key] ?? p.default}
                    onChange={(e) => setIpParams((prev) => ({ ...prev, [p.key]: e.target.value }))}
                    min={p.min}
                    max={p.max}
                    title={`${p.label}${p.unit ? ` (${p.unit})` : ""}${p.min != null || p.max != null ? ` — range: ${p.min ?? ""}..${p.max ?? ""}` : ""}`}
                    style={{
                      width: "100%", padding: "4px 8px", fontSize: 9, fontFamily: MONO,
                      background: C.bg, color: C.t1, border: `1px solid ${C.b1}`, borderRadius: 3,
                      outline: "none", boxSizing: "border-box",
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          <div>
            {generateTemplate && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 8, fontFamily: MONO, fontWeight: 600, color: C.t3 }}>
                    INSTANTIATION
                  </div>
                  <span
                    onClick={copyTemplate}
                    title="Copy instantiation template to clipboard"
                    style={{
                      fontSize: 7, fontFamily: MONO, padding: "2px 6px", borderRadius: 3,
                      background: copiedTemplate ? `${C.ok}15` : `${C.accent}15`,
                      color: copiedTemplate ? C.ok : C.accent,
                      fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    {copiedTemplate ? "Copied!" : "Copy"}
                  </span>
                </div>
                <pre style={{
                  fontSize: 8, fontFamily: MONO, color: C.t1, background: C.bg,
                  border: `1px solid ${C.b1}`, borderRadius: 4, padding: "8px 10px",
                  overflow: "auto", maxHeight: 200, lineHeight: 1.5, whiteSpace: "pre-wrap",
                  margin: 0,
                }}>
                  {generateTemplate}
                </pre>
              </div>
            )}

            {configuring.params && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 8, fontFamily: MONO, fontWeight: 600, color: C.t3 }}>
                    IP GENERATION
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                  <Btn small onClick={() => { setTclVisible((v) => !v); setGenState((p) => p === "done" ? "done" : tclVisible ? "idle" : "preview"); }} disabled={genState === "running"} title="Preview the TCL script that will generate this IP">
                    {tclVisible ? "Hide TCL" : "Preview TCL"}
                  </Btn>
                  {genTcl && genState !== "running" && (
                    <Btn small primary onClick={handleRunGenerate} title="Generate IP core with current configuration">
                      {genState === "done" ? "Re-Generate" : "Generate IP"}
                    </Btn>
                  )}
                  {genState === "done" && (
                    <>
                      <span style={{ fontSize: 8, fontFamily: MONO, color: C.ok, fontWeight: 600, alignSelf: "center" }}>
                        {"\u2713"} Complete
                      </span>
                      <Btn small onClick={() => {
                        onRefreshFiles?.();
                        onAddToSynth?.(instanceName);
                        setGenOutput([`IP "${instanceName}" added to project and synthesis flow.`]);
                      }} style={{ color: C.ok, borderColor: `${C.ok}44` }} title="Add generated IP to project and include in synthesis flow">
                        Add to Synthesis
                      </Btn>
                      <Btn small onClick={() => {
                        onRefreshFiles?.();
                        setGenOutput([`IP files added to project (not in synthesis).`]);
                      }} title="Add generated IP files to project without including in synthesis">
                        Add to Project Only
                      </Btn>
                      <Btn small onClick={() => {
                        setConfiguring(null);
                        setGenState("idle");
                        setTclVisible(false);
                        setGenOutput([]);
                      }} style={{ color: C.err, borderColor: `${C.err}44` }} title="Discard generated IP and return to catalog">
                        Discard
                      </Btn>
                    </>
                  )}
                </div>
                {genTcl && (
                  <pre style={{
                    fontSize: 7, fontFamily: MONO, color: C.t2, background: C.bg,
                    border: `1px solid ${C.b1}`, borderRadius: 4, padding: "6px 8px",
                    overflow: "auto", maxHeight: 120, lineHeight: 1.4, whiteSpace: "pre-wrap",
                    margin: "0 0 6px",
                  }}>
                    {genTcl}
                  </pre>
                )}
                {genOutput.length > 0 && (
                  <div style={{
                    background: C.bg, borderRadius: 4, padding: "6px 8px",
                    maxHeight: 120, overflowY: "auto", fontSize: 7, fontFamily: MONO, lineHeight: 1.5,
                  }}>
                    {genOutput.map((line, i) => (
                      <div key={i} style={{ color: line.includes("error") || line.includes("Error") ? C.err : line.includes("complete") ? C.ok : C.t2 }}>
                        {line}
                      </div>
                    ))}
                    {genState === "running" && (
                      <div style={{ color: C.accent }}>
                        <span style={{ animation: "pulse 1s infinite" }}>{"\u25CF"}</span> Running...
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={panelP}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.t1, marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
          <Box />
          IP Catalog
          <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3, fontWeight: 400 }}>
            {filtered.length} cores
          </span>
          <div style={{ flex: 1 }} />
          {onCustomIpsChange && (
            <Btn small onClick={() => setShowAddCustom(true)} title="Add a custom IP core location">
              + Add Custom IP
            </Btn>
          )}
        </div>
        {/* Add Custom IP form (at top) */}
        {onCustomIpsChange && showAddCustom && (
          <div style={{
            display: "flex", flexDirection: "column", gap: 8,
            marginBottom: 12, padding: 10, background: C.bg, borderRadius: 5, border: `1px solid ${C.b1}`,
          }}>
            <div style={{ fontSize: 9, fontFamily: MONO, fontWeight: 700, color: C.t3, letterSpacing: 1 }}>
              ADD CUSTOM IP
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="IP name"
                style={{
                  flex: 1, background: C.s1, border: `1px solid ${C.b1}`, borderRadius: 4,
                  padding: "4px 8px", fontSize: 9, fontFamily: MONO, color: C.t1, outline: "none",
                }}
              />
              <Select
                value={customCategory}
                onChange={(v) => setCustomCategory(v as IpCore["category"])}
                options={IP_CATEGORIES.map((c) => ({ value: c, label: c }))}
                style={{ minWidth: 80 }}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                placeholder="IP source path"
                style={{
                  flex: 1, background: C.s1, border: `1px solid ${C.b1}`, borderRadius: 4,
                  padding: "4px 8px", fontSize: 9, fontFamily: MONO, color: C.t1, outline: "none",
                }}
              />
              <Btn small onClick={async () => {
                const dir = await pickDirectory();
                if (dir) setCustomPath(dir);
              }} title="Browse for IP directory">
                Browse
              </Btn>
            </div>
            <input
              value={customDesc}
              onChange={(e) => setCustomDesc(e.target.value)}
              placeholder="Description (optional)"
              style={{
                background: C.s1, border: `1px solid ${C.b1}`, borderRadius: 4,
                padding: "4px 8px", fontSize: 9, fontFamily: MONO, color: C.t1, outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <Btn primary small disabled={!customName.trim() || !customPath.trim()} onClick={() => {
                const newIp: IpCore = {
                  name: customName.trim(),
                  category: customCategory,
                  description: customDesc.trim() || "Custom IP core",
                  families: [],
                  source: customPath.trim(),
                  isCustom: true,
                };
                onCustomIpsChange([...(customIps ?? []), newIp]);
                setCustomName(""); setCustomPath(""); setCustomDesc(""); setShowAddCustom(false);
              }} title="Add this custom IP to the catalog">
                Add IP
              </Btn>
              <Btn small onClick={() => { setShowAddCustom(false); setCustomName(""); setCustomPath(""); setCustomDesc(""); }}>
                Cancel
              </Btn>
            </div>
          </div>
        )}
        <input
          type="text"
          value={ipSearch}
          onChange={(e) => setIpSearch(e.target.value)}
          placeholder="Search IP cores..."
          title="Search IP cores by name or category"
          style={{
            width: "100%", padding: "5px 8px", fontSize: 9, fontFamily: MONO,
            background: C.bg, color: C.t1, border: `1px solid ${C.b1}`, borderRadius: 4,
            outline: "none", marginBottom: 10, boxSizing: "border-box",
          }}
        />
        <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, marginBottom: 8 }}>
          Click &quot;Configure&quot; on any IP to set parameters and generate instantiation code.
        </div>
      </div>
      {grouped.map(([cat, items]) => (
        <div key={cat} style={panelP}>
          <div style={{ fontSize: 9, fontFamily: MONO, fontWeight: 700, color: C.t3, letterSpacing: 1, marginBottom: 8 }}>
            {cat.toUpperCase()}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
            {items.map((ip) => (
              <div
                key={ip.name}
                style={{
                  padding: "8px 10px", background: C.bg, borderRadius: 5,
                  border: `1px solid ${C.b1}`,
                  cursor: ip.params ? "pointer" : "default",
                }}
                onClick={() => { if (ip.params) openConfigurator(ip); }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ fontSize: 10, fontFamily: MONO, fontWeight: 600, color: C.t1, flex: 1 }}>
                    {ip.name}
                  </div>
                  {ip.params && (
                    <span
                      onClick={(e) => { e.stopPropagation(); openConfigurator(ip); }}
                      title={`Configure ${ip.name} parameters`}
                      style={{
                        fontSize: 7, fontFamily: MONO, padding: "2px 6px", borderRadius: 3,
                        background: `${C.accent}15`, color: C.accent, fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      Configure
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, marginTop: 2, lineHeight: 1.4 }}>
                  {ip.description}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4, alignItems: "center" }}>
                  {ip.families.map((f) => (
                    <span key={f} style={{
                      fontSize: 6, fontFamily: MONO, padding: "1px 4px", borderRadius: 2,
                      background: `${C.accent}15`, color: C.accent, fontWeight: 600,
                    }}>
                      {f}
                    </span>
                  ))}
                  {ip.isCustom && onCustomIpsChange && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        onCustomIpsChange((customIps ?? []).filter((c) => c.name !== ip.name));
                      }}
                      title="Remove custom IP"
                      style={{
                        fontSize: 7, fontFamily: MONO, padding: "1px 5px", borderRadius: 2,
                        background: `${C.err}15`, color: C.err, cursor: "pointer", fontWeight: 600,
                      }}
                    >
                      {"\u2715"} Remove
                    </span>
                  )}
                </div>
                {/* Source location */}
                {ip.source && (
                  <div
                    style={{
                      fontSize: 7, fontFamily: MONO, color: ip.isCustom ? C.accent : C.t3,
                      marginTop: 4, padding: "2px 5px", borderRadius: 3,
                      background: ip.isCustom ? `${C.accent}08` : `${C.t3}08`,
                      border: `1px solid ${ip.isCustom ? `${C.accent}20` : `${C.t3}15`}`,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                    title={ip.source}
                  >
                    {ip.source}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

    </div>
  );
}
