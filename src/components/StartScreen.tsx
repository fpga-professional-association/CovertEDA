import { useState, useEffect, useCallback, useRef } from "react";
import { RecentProject, ProjectConfig, BackendMeta, DetectedTool, LicenseCheckResult } from "../types";
import { useTheme } from "../context/ThemeContext";
import { Btn, Badge } from "./shared";
import { Chip, Zap, Key, Settings } from "./Icons";
import { BACKEND_META } from "../data/mockData";
import {
  getRecentProjects,
  openProject,
  checkProjectDir,
  pickDirectory,
  removeRecentProject,
  detectTools,
  refreshTools,
  checkLicenses,
} from "../hooks/useTauri";
import NewProjectWizard from "./NewProjectWizard";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function backendMeta(id: string): BackendMeta {
  return BACKEND_META.find((b) => b.id === id) || BACKEND_META[0];
}

export default function StartScreen({
  onOpenProject,
  onOpenSettings,
}: {
  onOpenProject: (dir: string, config: ProjectConfig) => void;
  onOpenSettings?: () => void;
}) {
  const { C, MONO, SANS } = useTheme();
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const [tools, setTools] = useState<DetectedTool[]>([]);
  const [licenseResult, setLicenseResult] = useState<LicenseCheckResult | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardDir, setWizardDir] = useState<string | undefined>();
  const [hover, setHover] = useState<string | null>(null);
  const [showRecents, setShowRecents] = useState(true);
  const [leftWidth, setLeftWidth] = useState(340);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      setLeftWidth(Math.max(200, Math.min(x, rect.width - 200)));
    };
    const onUp = () => {
      dragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  useEffect(() => {
    getRecentProjects().then(setRecents).catch(() => {});
    detectTools().then(setTools).catch(() => {});
    checkLicenses().then(setLicenseResult).catch(() => {});
  }, []);

  const handleOpenDir = async () => {
    const dir = await pickDirectory();
    if (!dir) return;
    const existing = await checkProjectDir(dir);
    if (existing) {
      // Must call openProject (not just checkProjectDir) to register as current_project in backend
      const config = await openProject(dir);
      onOpenProject(dir, config);
    } else {
      setWizardDir(dir);
      setWizardOpen(true);
    }
  };

  const handleRecentClick = async (r: RecentProject) => {
    try {
      const config = await openProject(r.path);
      onOpenProject(r.path, config);
    } catch {
      await removeRecentProject(r.path);
      setRecents((prev) => prev.filter((p) => p.path !== r.path));
    }
  };

  const handleRemoveRecent = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    await removeRecentProject(path);
    setRecents((prev) => prev.filter((p) => p.path !== path));
  };

  const card: React.CSSProperties = {
    background: C.s1,
    border: `1px solid ${C.b1}`,
    borderRadius: 8,
    padding: "20px 24px",
    cursor: "pointer",
    transition: "all .15s",
  };

  const hasLicense = licenseResult && licenseResult.features.length > 0;

  // Placeholder backends not yet implemented — show as "IN DEVELOPMENT"
  const PLACEHOLDER_IDS = new Set(["gowin", "efinity", "quicklogic", "flexlogix"]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: C.bg,
        color: C.t2,
        fontFamily: SANS,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "24px 40px 0",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span style={{ color: C.accent }}><Chip size={22} /></span>
        <span style={{ fontSize: 18, fontWeight: 700, color: C.t1, fontFamily: SANS }}>
          CovertEDA
        </span>
        <span style={{ fontSize: 10, color: C.t3, fontFamily: MONO }}>v0.1.0</span>
        <div style={{ flex: 1 }} />
        {onOpenSettings && (
          <span
            onClick={onOpenSettings}
            style={{
              cursor: "pointer",
              color: C.t3,
              padding: "4px 8px",
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 9,
              fontFamily: MONO,
              fontWeight: 600,
              transition: "color .1s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = C.t1; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = C.t3; }}
          >
            <Settings />
            Settings
          </span>
        )}
      </div>

      <div
        ref={containerRef}
        style={{
          flex: 1,
          display: "flex",
          overflow: "hidden",
          padding: "32px 40px 40px",
        }}
      >
        {/* Left: Actions + Environment */}
        <div style={{ width: leftWidth, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16, overflow: "auto", paddingRight: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.t3, fontFamily: MONO, marginBottom: 4 }}>
            GET STARTED
          </div>

          {/* Create New Project */}
          <div
            onClick={() => { setWizardDir(undefined); setWizardOpen(true); }}
            onMouseEnter={() => setHover("create")}
            onMouseLeave={() => setHover(null)}
            style={{
              ...card,
              borderColor: hover === "create" ? C.accent : C.b1,
              background: hover === "create" ? C.s2 : C.s1,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ color: C.accent }}><Zap /></span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>Create New Project</span>
            </div>
            <div style={{ fontSize: 10, color: C.t3, lineHeight: 1.5 }}>
              Set up a new FPGA project with backend selection, device targeting, and smart defaults.
            </div>
          </div>

          {/* Open Existing Directory */}
          <div
            onClick={handleOpenDir}
            onMouseEnter={() => setHover("open")}
            onMouseLeave={() => setHover(null)}
            style={{
              ...card,
              borderColor: hover === "open" ? C.accent : C.b1,
              background: hover === "open" ? C.s2 : C.s1,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ color: C.cyan, fontSize: 14 }}>&#128194;</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>Open Existing Directory</span>
            </div>
            <div style={{ fontSize: 10, color: C.t3, lineHeight: 1.5 }}>
              Open a folder with an existing <code style={{ color: C.t2 }}>.coverteda</code> project file, or initialize a new one.
            </div>
          </div>

          {/* Detected Tools */}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 9, color: C.t3, fontFamily: MONO, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              DETECTED TOOLS
              <span
                onClick={() => {
                  const prev = tools;
                  setTools([]);
                  refreshTools().then(setTools).catch(() => setTools(prev));
                }}
                onMouseEnter={() => setHover("refresh-tools")}
                onMouseLeave={() => setHover(null)}
                title="Re-detect tools"
                style={{
                  cursor: "pointer",
                  opacity: hover === "refresh-tools" ? 1 : 0.5,
                  fontSize: 10,
                  transition: "opacity .15s",
                }}
              >
                {"\u21BB"}
              </span>
            </div>
            {tools.length === 0 ? (
              <div style={{ fontSize: 9, fontFamily: MONO, color: C.t3 }}>Scanning...</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {tools.map((t) => {
                  const bm = backendMeta(t.backendId);
                  const isPlaceholder = PLACEHOLDER_IDS.has(t.backendId);
                  return (
                    <div
                      key={t.backendId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "4px 8px",
                        borderRadius: 4,
                        background: t.available ? `${bm.color}08` : "transparent",
                        border: `1px solid ${t.available ? `${bm.color}30` : C.b1}`,
                        opacity: isPlaceholder ? 0.6 : 1,
                      }}
                    >
                      <span style={{ color: bm.color, fontSize: 12 }}>{bm.icon}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: t.available ? C.t1 : C.t3 }}>
                        {t.name}
                      </span>
                      {t.available && (
                        <span style={{ fontSize: 8, fontFamily: MONO, color: bm.color }}>{t.version}</span>
                      )}
                      <div style={{ flex: 1 }} />
                      <span
                        style={{
                          fontSize: 7,
                          fontFamily: MONO,
                          fontWeight: 600,
                          padding: "1px 5px",
                          borderRadius: 2,
                          color: t.available ? C.ok : isPlaceholder ? C.warn : C.t3,
                          background: isPlaceholder ? `${C.warn}12` : "transparent",
                        }}
                      >
                        {t.available ? "FOUND" : isPlaceholder ? "IN DEVELOPMENT" : "NOT FOUND"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* License Status */}
          {licenseResult && (
            <div>
              <div style={{ fontSize: 9, color: C.t3, fontFamily: MONO, marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                <Key />
                LICENSE STATUS
                <span
                  onClick={() => {
                    setLicenseResult(null);
                    checkLicenses().then(setLicenseResult).catch(() => {});
                  }}
                  onMouseEnter={() => setHover("refresh-lic")}
                  onMouseLeave={() => setHover(null)}
                  title="Re-check licenses"
                  style={{
                    cursor: "pointer",
                    opacity: hover === "refresh-lic" ? 1 : 0.5,
                    fontSize: 10,
                    transition: "opacity .15s",
                  }}
                >
                  {"\u21BB"}
                </span>
              </div>
              {hasLicense ? (
                <div
                  style={{
                    padding: "8px 10px",
                    borderRadius: 5,
                    background: `${C.ok}08`,
                    border: `1px solid ${C.ok}30`,
                  }}
                >
                  <div style={{ fontSize: 9, fontFamily: MONO, color: C.ok, fontWeight: 600, marginBottom: 4 }}>
                    {licenseResult.features.length} feature{licenseResult.features.length !== 1 ? "s" : ""} licensed
                  </div>
                  {licenseResult.features.map((f, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          background: f.status === "active" ? C.ok : f.status === "warning" ? C.warn : C.err,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: 9, fontFamily: MONO, color: C.t2 }}>{f.feature}</span>
                      <div style={{ flex: 1 }} />
                      <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>exp {f.expires}</span>
                    </div>
                  ))}
                  {licenseResult.licenseFiles.length > 0 && (
                    <div style={{ fontSize: 7, fontFamily: MONO, color: C.t3, marginTop: 4, opacity: 0.7 }}>
                      {licenseResult.licenseFiles.map(lf => lf.path).join(", ")}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 9, fontFamily: MONO, color: C.t3 }}>
                  No license file found
                </div>
              )}
            </div>
          )}

        </div>

        {/* Drag handle */}
        <div
          onMouseDown={onDragStart}
          style={{
            width: 6,
            cursor: "col-resize",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: 2, height: 40, borderRadius: 1, background: C.b1, transition: "background .15s" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = C.accent; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = C.b1; }}
          />
        </div>

        {/* Right: Recent Projects */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, paddingLeft: 16 }}>
          <div
            onClick={() => setShowRecents((p) => !p)}
            style={{
              fontSize: 11, fontWeight: 600, color: C.t3, fontFamily: MONO,
              marginBottom: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <span style={{ fontSize: 8, transition: "transform .15s", transform: showRecents ? "rotate(90deg)" : "rotate(0deg)" }}>
              {"\u25B6"}
            </span>
            RECENT PROJECTS
            <span style={{ fontSize: 8, color: C.t3, fontWeight: 400 }}>
              ({recents.length} project{recents.length !== 1 ? "s" : ""})
            </span>
          </div>

          {!showRecents ? null : recents.length === 0 ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <span style={{ fontSize: 32, opacity: 0.15 }}><Chip size={48} /></span>
              <span style={{ color: C.t3, fontSize: 11 }}>No recent projects</span>
              <Btn primary small onClick={() => { setWizardDir(undefined); setWizardOpen(true); }}>
                Create your first project
              </Btn>
            </div>
          ) : (
            <div style={{ flex: 1, overflow: "auto" }}>
              {recents.map((r) => {
                const bm = backendMeta(r.backendId);
                return (
                  <div
                    key={r.path}
                    onClick={() => handleRecentClick(r)}
                    onMouseEnter={() => setHover(r.path)}
                    onMouseLeave={() => setHover(null)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 14px",
                      borderRadius: 6,
                      background: hover === r.path ? C.s2 : "transparent",
                      cursor: "pointer",
                      transition: "background .1s",
                      marginBottom: 2,
                    }}
                  >
                    <span style={{ color: bm.color, fontSize: 16, width: 20, textAlign: "center" }}>
                      {bm.icon}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.t1 }}>
                          {r.name}
                        </span>
                        <Badge color={bm.color}>{bm.short}</Badge>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                        <span
                          style={{
                            fontSize: 9,
                            fontFamily: MONO,
                            color: C.t3,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {r.device}
                        </span>
                        <span style={{ fontSize: 8, color: C.b2 }}>{"\u2022"}</span>
                        <span
                          style={{
                            fontSize: 9,
                            fontFamily: MONO,
                            color: C.t3,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {r.path}
                        </span>
                      </div>
                    </div>
                    <span style={{ fontSize: 9, fontFamily: MONO, color: C.t3, flexShrink: 0 }}>
                      {relativeTime(r.lastOpened)}
                    </span>
                    {hover === r.path && (
                      <span
                        onClick={(e) => handleRemoveRecent(e, r.path)}
                        title="Remove from recents"
                        style={{
                          fontSize: 11,
                          color: C.t3,
                          cursor: "pointer",
                          padding: "0 4px",
                          flexShrink: 0,
                        }}
                      >
                        {"\u2715"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Wizard modal */}
      {wizardOpen && (
        <NewProjectWizard
          initialDir={wizardDir}
          onClose={() => setWizardOpen(false)}
          onCreate={(dir, config) => {
            setWizardOpen(false);
            onOpenProject(dir, config);
          }}
        />
      )}
    </div>
  );
}
