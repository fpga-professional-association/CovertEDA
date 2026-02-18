import { useState, useEffect } from "react";
import { RecentProject, ProjectConfig, BackendMeta, ExampleProject, DetectedTool, LicenseCheckResult } from "../types";
import { useTheme } from "../context/ThemeContext";
import { Btn, Badge } from "./shared";
import { Chip, Zap, Key, Settings } from "./Icons";
import { BACKEND_META, EXAMPLE_PROJECTS } from "../data/mockData";
import { PROJECT_TEMPLATES, TEMPLATE_CATEGORIES } from "../data/projectTemplates";
import {
  getRecentProjects,
  openProject,
  createProject,
  checkProjectDir,
  pickDirectory,
  removeRecentProject,
  detectTools,
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
  const [templateFilter, setTemplateFilter] = useState<string>("All");
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    getRecentProjects().then(setRecents);
    detectTools().then(setTools);
    checkLicenses().then(setLicenseResult);
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

  const handleExampleClick = async (ex: ExampleProject) => {
    try {
      // Check if the project already has a .coverteda file
      const existing = await checkProjectDir(ex.path);
      if (existing) {
        // Must call openProject to register as current_project in backend (for start_build)
        const config = await openProject(ex.path);
        onOpenProject(ex.path, config);
      } else {
        // Create the project config (also registers current_project)
        const config = await createProject(ex.path, ex.name, ex.backendId, ex.device, ex.topModule);
        onOpenProject(ex.path, config);
      }
    } catch (err) {
      console.error("Failed to open example:", err);
    }
  };

  const card: React.CSSProperties = {
    background: C.s1,
    border: `1px solid ${C.b1}`,
    borderRadius: 8,
    padding: "20px 24px",
    cursor: "pointer",
    transition: "all .15s",
  };

  const availableTools = tools.filter((t) => t.available);
  const hasLicense = licenseResult && licenseResult.features.length > 0;

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
        style={{
          flex: 1,
          display: "flex",
          overflow: "hidden",
          padding: "32px 40px 40px",
          gap: 40,
        }}
      >
        {/* Left: Actions + Environment */}
        <div style={{ width: 340, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16, overflow: "auto" }}>
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
            <div style={{ fontSize: 9, color: C.t3, fontFamily: MONO, marginBottom: 8 }}>
              DETECTED TOOLS
            </div>
            {tools.length === 0 ? (
              <div style={{ fontSize: 9, fontFamily: MONO, color: C.t3 }}>Scanning...</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {tools.map((t) => {
                  const bm = backendMeta(t.backendId);
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
                          fontSize: 8,
                          fontFamily: MONO,
                          fontWeight: 600,
                          color: t.available ? C.ok : C.t3,
                        }}
                      >
                        {t.available ? "FOUND" : "NOT FOUND"}
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
                  {licenseResult.licenseFile && (
                    <div style={{ fontSize: 7, fontFamily: MONO, color: C.t3, marginTop: 4, opacity: 0.7 }}>
                      {licenseResult.licenseFile}
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

          {/* Backend badges */}
          {availableTools.length === 0 && tools.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 9, color: C.t3, fontFamily: MONO, marginBottom: 8 }}>
                SUPPORTED BACKENDS
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {BACKEND_META.map((b) => (
                  <Badge key={b.id} color={b.color}>
                    {b.icon} {b.short}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Templates + Examples + Recent Projects */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* Project Templates */}
          <div style={{ marginBottom: 20 }}>
            <div
              onClick={() => setShowTemplates((p) => !p)}
              style={{
                fontSize: 11, fontWeight: 600, color: C.t3, fontFamily: MONO,
                marginBottom: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <span style={{ fontSize: 8, transition: "transform .15s", transform: showTemplates ? "rotate(90deg)" : "rotate(0deg)" }}>
                {"\u25B6"}
              </span>
              PROJECT TEMPLATES
              <span style={{ fontSize: 8, color: C.t3, fontWeight: 400 }}>
                ({PROJECT_TEMPLATES.length} designs)
              </span>
            </div>
            {showTemplates && (
              <>
                <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
                  {["All", ...TEMPLATE_CATEGORIES].map((cat) => (
                    <span
                      key={cat}
                      onClick={() => setTemplateFilter(cat)}
                      style={{
                        padding: "2px 8px", borderRadius: 3, cursor: "pointer",
                        fontSize: 8, fontFamily: MONO, fontWeight: 600,
                        border: `1px solid ${templateFilter === cat ? C.accent : C.b1}`,
                        color: templateFilter === cat ? C.accent : C.t3,
                        background: templateFilter === cat ? `${C.accent}15` : "transparent",
                      }}
                    >
                      {cat}
                    </span>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
                  {PROJECT_TEMPLATES
                    .filter((t) => templateFilter === "All" || t.category === templateFilter)
                    .map((t) => {
                      const bm = backendMeta(t.backendId);
                      return (
                        <div
                          key={t.name}
                          onMouseEnter={() => setHover(`tpl:${t.name}`)}
                          onMouseLeave={() => setHover(null)}
                          onClick={() => {
                            setWizardDir(undefined);
                            setWizardOpen(true);
                          }}
                          style={{
                            padding: "10px 12px", borderRadius: 6, cursor: "pointer",
                            background: hover === `tpl:${t.name}` ? C.s2 : C.s1,
                            border: `1px solid ${hover === `tpl:${t.name}` ? bm.color : C.b1}`,
                            transition: "all .15s",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                            <span style={{ fontSize: 10, fontWeight: 600, color: C.t1 }}>{t.name}</span>
                            <Badge color={bm.color}>{bm.short}</Badge>
                            <span style={{
                              fontSize: 6, fontFamily: MONO, padding: "1px 4px", borderRadius: 2,
                              background: `${C.cyan}15`, color: C.cyan, fontWeight: 600,
                            }}>
                              {t.category}
                            </span>
                          </div>
                          <div style={{ fontSize: 8, color: C.t3, lineHeight: 1.4 }}>
                            {t.description}
                          </div>
                          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                            <span style={{ fontSize: 7, fontFamily: MONO, color: C.t3 }}>
                              {t.device}
                            </span>
                            <span style={{ fontSize: 7, fontFamily: MONO, color: C.t3 }}>
                              {t.files.length} file{t.files.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </>
            )}
          </div>

          {/* Example Projects */}
          {EXAMPLE_PROJECTS.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.t3, fontFamily: MONO, marginBottom: 10 }}>
                EXAMPLE PROJECTS
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {EXAMPLE_PROJECTS.map((ex) => {
                  const bm = backendMeta(ex.backendId);
                  return (
                    <div
                      key={ex.path}
                      onClick={() => handleExampleClick(ex)}
                      onMouseEnter={() => setHover(`ex:${ex.path}`)}
                      onMouseLeave={() => setHover(null)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 14px",
                        borderRadius: 6,
                        background: hover === `ex:${ex.path}` ? C.s2 : C.s1,
                        border: `1px solid ${hover === `ex:${ex.path}` ? bm.color : C.b1}`,
                        cursor: "pointer",
                        transition: "all .15s",
                      }}
                    >
                      <span style={{ color: bm.color, fontSize: 16, width: 20, textAlign: "center" }}>
                        {bm.icon}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: C.t1 }}>
                            {ex.name}
                          </span>
                          <Badge color={bm.color}>{bm.short}</Badge>
                        </div>
                        <div style={{ fontSize: 9, color: C.t3, marginTop: 2, lineHeight: 1.4 }}>
                          {ex.description}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                          <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>
                            {ex.device}
                          </span>
                          <span style={{ fontSize: 8, color: C.b2 }}>{"\u2022"}</span>
                          <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>
                            {ex.path}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ fontSize: 11, fontWeight: 600, color: C.t3, fontFamily: MONO, marginBottom: 12 }}>
            RECENT PROJECTS
          </div>

          {recents.length === 0 ? (
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
