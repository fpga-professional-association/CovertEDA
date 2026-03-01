import { useState } from "react";
import { ProjectConfig, BackendMeta } from "../types";
import { useTheme } from "../context/ThemeContext";
import { Btn, Badge, Input } from "./shared";
import { BACKEND_META } from "../data/mockData";
import DevicePicker from "./DevicePicker";
import { createProject, pickDirectory } from "../hooks/useTauri";

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

  const handleCreate = async () => {
    if (!dir || !name || !backendId) {
      setError("Please fill in all required fields.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const config = await createProject(dir, name, backendId, device, topModule);
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
        <div style={{ marginBottom: 20 }}>
          <span style={label}>TOP MODULE</span>
          <Input
            value={topModule}
            onChange={setTopModule}
            placeholder="top_level"
          />
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
