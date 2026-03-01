import { useState } from "react";
import { ProjectConfig, BackendMeta, SourceDirSuggestion } from "../types";
import { useTheme } from "../context/ThemeContext";
import { Btn, Badge, Input } from "./shared";
import { BACKEND_META } from "../data/mockData";
import DevicePicker from "./DevicePicker";
import {
  createProject,
  pickDirectory,
  scanSourceDirectories,
  detectTopModule,
} from "../hooks/useTauri";

export default function NewProjectWizard({
  initialDir,
  onClose,
  onCreate,
}: {
  initialDir?: string;
  onClose: () => void;
  onCreate: (dir: string, config: ProjectConfig) => void;
}) {
  const { C, MONO, SANS } = useTheme();
  const [dir, setDir] = useState(initialDir || "");
  const [name, setName] = useState(() => {
    if (initialDir) {
      const parts = initialDir.replace(/\/+$/, "").split("/");
      return parts[parts.length - 1] || "";
    }
    return "";
  });
  const [backendId, setBackendId] = useState("diamond");
  const [device, setDevice] = useState(BACKEND_META[0].defaultDevice);
  const [topModule, setTopModule] = useState("top_level");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [hover, setHover] = useState<string | null>(null);

  // Source directory state
  const [sourcePatterns, setSourcePatterns] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<SourceDirSuggestion[]>([]);
  const [scanning, setScanning] = useState(false);
  const [detectingTop, setDetectingTop] = useState(false);

  const selectedBackend = BACKEND_META.find((b) => b.id === backendId) || BACKEND_META[0];

  const handleBrowse = async () => {
    const picked = await pickDirectory();
    if (picked) {
      setDir(picked);
      if (!name) {
        const parts = picked.replace(/\/+$/, "").split("/");
        setName(parts[parts.length - 1] || "");
      }
    }
  };

  const handleBackendSelect = (b: BackendMeta) => {
    setBackendId(b.id);
    setDevice(b.defaultDevice);
  };

  const handleAutoDetect = async () => {
    if (!dir) return;
    setScanning(true);
    try {
      const results = await scanSourceDirectories(dir);
      setSuggestions(results);
      // Auto-select directories with HDL files
      if (results.length > 0 && sourcePatterns.length === 0) {
        const patterns = results.map((s) => {
          const base = s.dir === "." ? "" : `${s.dir}/`;
          const exts = s.extensions.map((e) => `*.${e}`).join(",");
          return s.extensions.length === 1
            ? `${base}**/*.${s.extensions[0]}`
            : `${base}**/{${exts}}`;
        });
        setSourcePatterns(patterns);
      }
    } catch {
      /* ignore */
    }
    setScanning(false);
  };

  const handleDetectTop = async () => {
    if (!dir || sourcePatterns.length === 0) return;
    setDetectingTop(true);
    try {
      const top = await detectTopModule(dir, sourcePatterns);
      if (top) setTopModule(top);
    } catch {
      /* ignore */
    }
    setDetectingTop(false);
  };

  const handleRemovePattern = (idx: number) => {
    setSourcePatterns((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddPattern = () => {
    const pattern = window.prompt("Enter source pattern (e.g. rtl/**/*.v):");
    if (pattern) setSourcePatterns((prev) => [...prev, pattern]);
  };

  const handleCreate = async () => {
    if (!dir || !name || !backendId) {
      setError("Please fill in all required fields.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const config = await createProject(
        dir, name, backendId, device, topModule,
        sourcePatterns.length > 0 ? sourcePatterns : undefined,
      );
      onCreate(dir, config);
    } catch (e) {
      setError(String(e));
      setCreating(false);
    }
  };

  const canCreate = dir.length > 0 && name.length > 0;

  const label: React.CSSProperties = {
    fontSize: 9,
    fontFamily: MONO,
    fontWeight: 600,
    color: C.t3,
    marginBottom: 4,
    display: "block",
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
          New Project
        </div>

        {/* Project Directory */}
        <div style={{ marginBottom: 16 }}>
          <span style={label}>PROJECT DIRECTORY *</span>
          <div style={{ display: "flex", gap: 8 }}>
            <Input
              value={dir}
              onChange={setDir}
              placeholder="/path/to/project"
              style={{ flex: 1 }}
            />
            <Btn small onClick={handleBrowse}>Browse</Btn>
          </div>
        </div>

        {/* Project Name */}
        <div style={{ marginBottom: 16 }}>
          <span style={label}>PROJECT NAME *</span>
          <Input
            value={name}
            onChange={setName}
            placeholder="my-fpga-project"
          />
        </div>

        {/* Backend Selection */}
        <div style={{ marginBottom: 16 }}>
          <span style={label}>BACKEND *</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {BACKEND_META.map((b) => {
              const selected = backendId === b.id;
              const hovered = hover === b.id;
              return (
                <div
                  key={b.id}
                  onClick={() => handleBackendSelect(b)}
                  onMouseEnter={() => setHover(b.id)}
                  onMouseLeave={() => setHover(null)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 6,
                    border: `1.5px solid ${selected ? b.color : C.b1}`,
                    background: selected ? `${b.color}10` : hovered ? C.s2 : C.bg,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: b.color, fontSize: 14 }}>{b.icon}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: selected ? C.t1 : C.t2 }}>
                      {b.name}
                    </span>
                  </div>
                  <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, marginTop: 3 }}>
                    {b.defaultDevice}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Device */}
        <div style={{ marginBottom: 16 }}>
          <span style={label}>
            TARGET DEVICE{" "}
            <Badge color={selectedBackend.color} style={{ marginLeft: 4 }}>
              {selectedBackend.short}
            </Badge>
          </span>
          <DevicePicker
            value={device}
            onChange={setDevice}
            backendId={backendId}
          />
        </div>

        {/* Top Module */}
        <div style={{ marginBottom: 16 }}>
          <span style={label}>TOP MODULE</span>
          <div style={{ display: "flex", gap: 8 }}>
            <Input
              value={topModule}
              onChange={setTopModule}
              placeholder="top_level"
              style={{ flex: 1 }}
            />
            {dir && sourcePatterns.length > 0 && (
              <Btn small onClick={handleDetectTop} disabled={detectingTop}>
                {detectingTop ? "Detecting..." : "Auto-detect"}
              </Btn>
            )}
          </div>
        </div>

        {/* Source Directories */}
        <div style={{ marginBottom: 20 }}>
          <span style={label}>SOURCE DIRECTORIES</span>
          {sourcePatterns.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
              {sourcePatterns.map((p, i) => (
                <span
                  key={i}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: `${C.accent}15`,
                    border: `1px solid ${C.accent}30`,
                    fontSize: 9,
                    fontFamily: MONO,
                    color: C.t2,
                  }}
                >
                  {p}
                  <span
                    onClick={() => handleRemovePattern(i)}
                    style={{ cursor: "pointer", color: C.t3, fontSize: 10, fontWeight: 700 }}
                    title="Remove pattern"
                  >
                    {"\u2715"}
                  </span>
                </span>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <Btn small onClick={handleAddPattern}>+ Add Pattern</Btn>
            {dir && (
              <Btn small onClick={handleAutoDetect} disabled={scanning}>
                {scanning ? "Scanning..." : "Auto-Detect"}
              </Btn>
            )}
          </div>
          {suggestions.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 9, fontFamily: MONO, color: C.t3 }}>
              <div style={{ marginBottom: 4, fontWeight: 600 }}>Detected directories:</div>
              {suggestions.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ color: C.ok }}>{s.dir}/</span>
                  <span>{s.fileCount} file{s.fileCount !== 1 ? "s" : ""}</span>
                  <span style={{ color: C.t3 }}>({s.extensions.join(", ")})</span>
                </div>
              ))}
            </div>
          )}
          {sourcePatterns.length === 0 && (
            <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, marginTop: 4 }}>
              Leave empty to use backend defaults (e.g. src/**/*.v)
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{ fontSize: 10, color: C.err, marginBottom: 12 }}>{error}</div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Btn small onClick={onClose}>Cancel</Btn>
          <Btn primary small onClick={handleCreate} disabled={!canCreate || creating}>
            {creating ? "Creating..." : "Create Project"}
          </Btn>
        </div>
      </div>
    </div>
  );
}
