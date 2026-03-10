import { useState, useEffect, useCallback, useRef } from "react";
import { RecentProject, ProjectConfig, BackendMeta, DetectedTool, LicenseCheckResult, RemoteToolInfo, SshConnectionInfo } from "../types";
import { useTheme } from "../context/ThemeContext";
import { Btn, Badge, Input } from "./shared";
import { Chip, Zap, Key, Settings, GitHub, LinkedIn } from "./Icons";

// ── Inject CSS hover for start screen elements ──
if (typeof document !== "undefined" && !document.getElementById("ceda-ss-hover")) {
  const s = document.createElement("style");
  s.id = "ceda-ss-hover";
  s.textContent = [
    `.ceda-ss-icon:hover { color: var(--ceda-hover-color) !important; }`,
    `.ceda-ss-divider:hover { background: var(--ceda-hover-bg) !important; }`,
  ].join("\n");
  document.head.appendChild(s);
}
import { BACKEND_META } from "../data/mockData";
import {
  getRecentProjects,
  openProject,
  checkProjectDir,
  pickDirectory,
  removeRecentProject,
  detectTools,
  refreshTools,
  whichTool,
  addToolToPath,
  listToolVersions,
  selectToolVersion,
  checkLicenses,
  exitApp,
  importVendorProject,
  createProject,
  openUrl,
  sshLoadConfig,
  sshSaveConfig,
  sshTestConnection,
  sshDetectTools,
  type WhichResult,
  type DetectedVersion,
} from "../hooks/useTauri";
import type { SshConfig, VendorImportResult } from "../types";
import NewProjectWizard from "./NewProjectWizard";
import RemoteDirBrowser from "./RemoteDirBrowser";

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
  const [openingDir, setOpeningDir] = useState(false);
  const [showRecents, setShowRecents] = useState(true);
  const [leftWidth, setLeftWidth] = useState(340);
  const [whichInfo, setWhichInfo] = useState<Record<string, WhichResult & { status: string }>>({});
  const [allVersions, setAllVersions] = useState<Record<string, DetectedVersion[]>>({});
  const [selectingVersion, setSelectingVersion] = useState<string | null>(null);
  // SSH state
  const [sshConnected, setSshConnected] = useState(false);
  const [sshConnecting, setSshConnecting] = useState(false);
  const [sshInfo, setSshInfo] = useState<SshConnectionInfo | null>(null);
  const [sshConfig, setSshConfig] = useState<SshConfig | null>(null);
  const [sshExpanded, setSshExpanded] = useState(false);
  const [sshHost, setSshHost] = useState("");
  const [sshUser, setSshUser] = useState("");
  const [sshKeyPath, setSshKeyPath] = useState("");
  const [remoteTools, setRemoteTools] = useState<RemoteToolInfo[]>([]);
  const [remoteBrowseOpen, setRemoteBrowseOpen] = useState(false);
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
    sshLoadConfig().then((cfg) => {
      if (cfg) {
        setSshConfig(cfg);
        setSshHost(cfg.host);
        setSshUser(cfg.user);
        setSshKeyPath(cfg.keyPath ?? "");
      }
    }).catch(() => {});
  }, []);

  const handleOpenDir = async () => {
    // If SSH connected, use remote directory browser
    if (sshConnected) {
      setRemoteBrowseOpen(true);
      return;
    }
    const dir = await pickDirectory();
    if (!dir) return;
    setOpeningDir(true);
    try {
      // 1. Check if .coverteda already exists
      const existing = await checkProjectDir(dir);
      if (existing) {
        const config = await openProject(dir);
        onOpenProject(dir, config);
        return;
      }

      // 2. Try to detect vendor project files
      let vendorResult: VendorImportResult | null = null;
      try {
        const result = await importVendorProject(dir);
        if (result.found) vendorResult = result;
      } catch { /* ignore */ }

      if (vendorResult) {
        // Auto-import: create .coverteda from vendor data (no dialog)
        await createProject(
          dir,
          vendorResult.projectName || dir.split("/").pop() || "project",
          vendorResult.backendId,
          vendorResult.device || "auto",
          vendorResult.topModule || "top_level",
          vendorResult.sourceFiles.length > 0 ? vendorResult.sourceFiles : undefined,
          vendorResult.constraintFiles.length > 0 ? vendorResult.constraintFiles : undefined,
        );
        const config = await openProject(dir);
        onOpenProject(dir, config);
        return;
      }

      // 3. Nothing found — create project with defaults
      const dirName = dir.split("/").pop() || dir.split("\\").pop() || "project";
      // Pick the first available backend from detected tools
      const detectedBackend = tools.find((t) => t.available)?.backendId || "radiant";
      await createProject(dir, dirName, detectedBackend, "auto", "top_level");
      const config = await openProject(dir);
      onOpenProject(dir, config);
    } catch (e) {
      console.error("Open directory failed:", e);
    } finally {
      setOpeningDir(false);
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

  const handleSshConnect = async () => {
    setSshConnecting(true);
    setSshInfo(null);
    try {
      const tool = sshConfig?.tool ?? "openssh";
      const auth = sshConfig?.auth ?? "agent";
      const info = await sshTestConnection(
        sshHost, sshConfig?.port ?? 22, sshUser, tool,
        auth === "key" ? sshKeyPath || undefined : undefined,
        sshConfig?.customSshPath ?? undefined,
        sshConfig?.customScpPath ?? undefined,
      );
      setSshInfo(info);
      if (info.ok) {
        setSshConnected(true);
        setSshExpanded(false);
        // Save config
        const cfg: SshConfig = {
          enabled: true,
          tool,
          host: sshHost,
          port: sshConfig?.port ?? 22,
          user: sshUser,
          auth,
          keyPath: sshKeyPath || undefined,
          remoteProjectDir: sshConfig?.remoteProjectDir ?? "",
          remoteToolPaths: sshConfig?.remoteToolPaths ?? {},
        };
        setSshConfig(cfg);
        await sshSaveConfig(cfg);
        // Detect remote tools
        sshDetectTools().then(setRemoteTools).catch(() => {});
      }
    } catch (e) {
      setSshInfo({ ok: false, error: String(e) });
    } finally {
      setSshConnecting(false);
    }
  };

  const handleSshDisconnect = () => {
    setSshConnected(false);
    setSshInfo(null);
    setRemoteTools([]);
  };

  const handleRemoteDirSelect = async (dir: string, config: ProjectConfig | null) => {
    setRemoteBrowseOpen(false);
    if (config) {
      // Save the remote project dir
      if (sshConfig) {
        const updated = { ...sshConfig, remoteProjectDir: dir };
        setSshConfig(updated);
        sshSaveConfig(updated).catch(() => {});
      }
      onOpenProject(dir, config);
    } else {
      // No .coverteda found — open wizard with remote dir
      setWizardDir(dir);
      setWizardOpen(true);
    }
  };

  const card: React.CSSProperties = {
    background: C.s1,
    border: `1px solid ${C.b1}`,
    borderRadius: 8,
    padding: "20px 24px",
    cursor: "pointer",
  };

  const hasLicense = licenseResult && licenseResult.features.length > 0;

  // Placeholder backends not yet implemented — show as "IN DEVELOPMENT"
  const PLACEHOLDER_IDS = new Set<string>();

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
        <span style={{ fontSize: 10, color: C.t3, fontFamily: MONO }}>v0.2.4</span>
        <div style={{ flex: 1 }} />
        <span
          onClick={() => openUrl("https://github.com/fpga-professional-association/CovertEDA")}
          className="ceda-ss-icon"
          title="Open GitHub in browser"
          style={{
            ["--ceda-hover-color" as string]: C.t1,
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
          }}
        >
          <GitHub />
          GitHub
        </span>
        <span
          onClick={() => openUrl("https://www.linkedin.com/company/fpga-professional-association/")}
          className="ceda-ss-icon"
          title="Open LinkedIn in browser"
          style={{
            ["--ceda-hover-color" as string]: C.t1,
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
          }}
        >
          <LinkedIn />
          FPGA Assoc
        </span>
        {onOpenSettings && (
          <span
            onClick={onOpenSettings}
            className="ceda-ss-icon"
            title="Open application settings"
            style={{
              ["--ceda-hover-color" as string]: C.t1,
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
            }}
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
            title="Create a new FPGA project with backend selection and device targeting"
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
            title="Browse for an existing FPGA project directory"
            style={{
              ...card,
              borderColor: hover === "open" ? C.accent : C.b1,
              background: hover === "open" ? C.s2 : C.s1,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ color: C.cyan, fontSize: 14 }}>&#128194;</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>
                {sshConnected ? "Open Remote Directory" : "Open Existing Directory"}
              </span>
              {sshConnected && (
                <Badge color={C.ok}>SSH</Badge>
              )}
            </div>
            <div style={{ fontSize: 10, color: C.t3, lineHeight: 1.5 }}>
              {sshConnected
                ? "Browse the remote server to find or create an FPGA project."
                : <>Open any FPGA project directory. Auto-detects vendor files and creates a <code style={{ color: C.t2 }}>.coverteda</code> project.</>
              }
            </div>
          </div>

          {openingDir && (
            <div style={{
              padding: "10px 12px",
              background: `${C.accent}08`,
              border: `1px solid ${C.accent}30`,
              borderRadius: 6,
              fontSize: 11,
              color: C.t2,
              fontFamily: MONO,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}>
              Opening directory...
            </div>
          )}

          {/* Exit */}
          <div
            onClick={() => exitApp()}
            onMouseEnter={() => setHover("exit")}
            onMouseLeave={() => setHover(null)}
            title="Exit CovertEDA"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "8px 16px",
              borderRadius: 6,
              border: `1px solid ${hover === "exit" ? C.err : C.b1}`,
              background: hover === "exit" ? `${C.err}12` : "transparent",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
              fontFamily: MONO,
              color: hover === "exit" ? C.err : C.t3,
            }}
          >
            Exit
          </div>

          {/* SSH Remote */}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 9, color: C.t3, fontFamily: MONO, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
              SSH REMOTE
            </div>
            {!sshConnected ? (
              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: `1px solid ${C.b1}`,
                  background: C.bg,
                }}
              >
                {!sshExpanded ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12 }}>{"\uD83D\uDD12"}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: C.t2, flex: 1 }}>
                      SSH Remote
                    </span>
                    <Btn small onClick={() => {
                      if (sshHost && sshUser) {
                        handleSshConnect();
                      } else {
                        setSshExpanded(true);
                      }
                    }}>
                      Connect
                    </Btn>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <div style={{ flex: 2 }}>
                        <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3, fontWeight: 600, display: "block", marginBottom: 2 }}>HOST</span>
                        <Input
                          value={sshHost}
                          onChange={setSshHost}
                          placeholder="build-server.local"
                          title="SSH hostname or IP"
                          style={{ width: "100%" }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3, fontWeight: 600, display: "block", marginBottom: 2 }}>USER</span>
                        <Input
                          value={sshUser}
                          onChange={setSshUser}
                          placeholder="fpga"
                          title="SSH username"
                          style={{ width: "100%" }}
                        />
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3, fontWeight: 600, display: "block", marginBottom: 2 }}>KEY PATH (optional)</span>
                      <Input
                        value={sshKeyPath}
                        onChange={setSshKeyPath}
                        placeholder="~/.ssh/id_rsa"
                        title="Path to SSH private key"
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <Btn small onClick={() => setSshExpanded(false)}>Cancel</Btn>
                      <Btn
                        small
                        primary
                        onClick={handleSshConnect}
                        disabled={sshConnecting || !sshHost || !sshUser}
                      >
                        {sshConnecting ? "Connecting..." : "Connect"}
                      </Btn>
                    </div>
                    {sshInfo && !sshInfo.ok && (
                      <div style={{ fontSize: 8, fontFamily: MONO, color: C.err, marginTop: 2 }}>
                        {sshInfo.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: `1px solid ${C.ok}30`,
                  background: `${C.ok}06`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: C.ok,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 10, fontWeight: 600, color: C.t1, flex: 1 }}>
                    {sshInfo?.hostname ?? sshHost}
                  </span>
                  <Badge color={C.ok}>CONNECTED</Badge>
                  <Btn small onClick={handleSshDisconnect}>Disconnect</Btn>
                </div>
                {sshInfo?.os && (
                  <div style={{ fontSize: 8, fontFamily: MONO, color: C.t3, marginTop: 4, marginLeft: 15 }}>
                    {sshInfo.os.length > 60 ? sshInfo.os.slice(0, 60) + "..." : sshInfo.os}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Remote Tools (when SSH connected) */}
          {sshConnected && remoteTools.length > 0 && (
            <div>
              <div style={{ fontSize: 9, color: C.t3, fontFamily: MONO, marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                REMOTE TOOLS ({sshInfo?.hostname ?? sshHost})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {remoteTools.map((t) => {
                  const bm = backendMeta(t.backendId);
                  return (
                    <div
                      key={t.backendId}
                      title={t.available ? `${t.name} — ${t.path}` : `${t.name} — not found`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "3px 8px",
                        borderRadius: 4,
                        background: t.available ? `${bm.color}08` : "transparent",
                        border: `1px solid ${t.available ? `${bm.color}30` : C.b1}`,
                      }}
                    >
                      <span style={{ color: bm.color, fontSize: 11 }}>{bm.icon}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: t.available ? C.t1 : C.t3 }}>
                        {t.name}
                      </span>
                      {t.available && (
                        <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                          {t.path}
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: 8,
                          fontFamily: MONO,
                          fontWeight: 700,
                          color: t.available ? C.ok : C.t3,
                        }}
                      >
                        {t.available ? "FOUND" : "NOT FOUND"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
                  const wi = whichInfo[t.backendId];
                  const expanded = wi !== undefined;
                  const clickable = !isPlaceholder;
                  return (
                    <div key={t.backendId}>
                      <div
                        onClick={clickable ? () => {
                          if (expanded) {
                            setWhichInfo((prev) => {
                              const next = { ...prev };
                              delete next[t.backendId];
                              return next;
                            });
                          } else {
                            setWhichInfo((prev) => ({
                              ...prev,
                              [t.backendId]: { whichPath: null, detectedBinDir: null, status: "loading" },
                            }));
                            whichTool(t.backendId).then((r) =>
                              setWhichInfo((prev) => ({
                                ...prev,
                                [t.backendId]: { ...r, status: "done" },
                              }))
                            ).catch(() =>
                              setWhichInfo((prev) => ({
                                ...prev,
                                [t.backendId]: { whichPath: null, detectedBinDir: null, status: "error" },
                              }))
                            );
                            // Fetch all versions in parallel
                            listToolVersions(t.backendId).then((v) =>
                              setAllVersions((prev) => ({ ...prev, [t.backendId]: v }))
                            ).catch(() => {});
                          }
                        } : undefined}
                        onMouseEnter={() => setHover(`tool-${t.backendId}`)}
                        onMouseLeave={() => setHover(null)}
                        title={
                          isPlaceholder
                            ? `${t.name} — in development`
                            : t.available
                              ? `Available — ${t.name} ${t.version || ""}${t.installPath ? ` (${t.installPath})` : ""}`
                              : `Not found — ${t.name} is not installed or not on PATH`
                        }
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "4px 8px",
                          borderRadius: expanded ? "4px 4px 0 0" : 4,
                          background: t.available ? `${bm.color}08` : "transparent",
                          border: `1px solid ${t.available ? `${bm.color}30` : C.b1}`,
                          opacity: isPlaceholder ? 0.6 : hover === `tool-${t.backendId}` ? 1 : clickable ? 0.9 : 1,
                          cursor: clickable ? "pointer" : "default",
                          transition: "opacity .15s",
                        }}
                      >
                        <span style={{ color: bm.color, fontSize: 13 }}>{bm.icon}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: t.available ? C.t1 : C.t3 }}>
                          {t.name}
                        </span>
                        {t.available && (
                          <span style={{ fontSize: 9, fontFamily: MONO, color: bm.color }}>{t.version}</span>
                        )}
                        <div style={{ flex: 1 }} />
                        <span
                          style={{
                            fontSize: 8,
                            fontFamily: MONO,
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: 3,
                            color: t.available ? C.ok : isPlaceholder ? C.warn : C.t3,
                            background: isPlaceholder ? `${C.warn}12` : "transparent",
                          }}
                        >
                          {t.available ? "FOUND" : isPlaceholder ? "IN DEVELOPMENT" : "NOT FOUND"}
                        </span>
                      </div>
                      {expanded && (
                        <div
                          style={{
                            fontSize: 9,
                            fontFamily: MONO,
                            padding: "4px 8px",
                            background: `${bm.color}06`,
                            border: `1px solid ${t.available ? `${bm.color}30` : C.b1}`,
                            borderTop: "none",
                            borderRadius: "0 0 4px 4px",
                            display: "flex",
                            flexDirection: "column",
                            gap: 3,
                          }}
                        >
                          {wi.status === "loading" ? (
                            <span style={{ color: C.t3 }}>detecting...</span>
                          ) : (
                            <>
                              {/* Version pills — only show when multiple versions detected */}
                              {(allVersions[t.backendId]?.length ?? 0) > 1 && (
                                <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                                  <span style={{ color: C.t3 }}>versions:</span>
                                  {allVersions[t.backendId].map((v) => {
                                    const isActive = t.installPath === v.installPath;
                                    const isSelecting = selectingVersion === `${t.backendId}-${v.version}`;
                                    return (
                                      <span
                                        key={v.version}
                                        title={isActive ? `${v.version} — active (${v.installPath})` : `Switch to ${v.version} (${v.installPath})`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (isActive || isSelecting) return;
                                          setSelectingVersion(`${t.backendId}-${v.version}`);
                                          selectToolVersion(t.backendId, v.installPath, v.version)
                                            .then(() => refreshTools())
                                            .then((updated) => {
                                              setTools(updated);
                                              setSelectingVersion(null);
                                              // Refresh which info
                                              whichTool(t.backendId).then((r) =>
                                                setWhichInfo((prev) => ({
                                                  ...prev,
                                                  [t.backendId]: { ...r, status: "done" },
                                                }))
                                              );
                                            })
                                            .catch(() => setSelectingVersion(null));
                                        }}
                                        onMouseEnter={() => setHover(`ver-${t.backendId}-${v.version}`)}
                                        onMouseLeave={() => setHover(null)}
                                        style={{
                                          padding: "1px 6px",
                                          borderRadius: 3,
                                          fontSize: 8,
                                          fontWeight: isActive ? 700 : 500,
                                          cursor: isActive ? "default" : isSelecting ? "wait" : "pointer",
                                          border: `1px solid ${isActive ? bm.color : hover === `ver-${t.backendId}-${v.version}` ? `${bm.color}60` : C.b1}`,
                                          background: isActive ? `${bm.color}20` : "transparent",
                                          color: isActive ? bm.color : C.t2,
                                          opacity: v.verified ? 1 : 0.5,
                                        }}
                                      >
                                        {v.version}{isActive ? " \u2713" : ""}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                              {/* PATH lookup result */}
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ color: C.t3 }}>path:</span>
                                <span style={{ color: wi.whichPath ? C.ok : C.t3, wordBreak: "break-all" }}>
                                  {wi.whichPath ?? "not on PATH"}
                                </span>
                              </div>
                              {/* detected bin dir */}
                              {wi.detectedBinDir && (
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ color: C.t3 }}>detected:</span>
                                  <span style={{ color: C.t2, wordBreak: "break-all" }}>{wi.detectedBinDir}</span>
                                </div>
                              )}
                              {/* Add to PATH button — show when detected but not on PATH */}
                              {!wi.whichPath && wi.detectedBinDir && wi.status !== "added" && (
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                                  <span
                                    title={`Add ${t.name} to system PATH`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setWhichInfo((prev) => ({
                                        ...prev,
                                        [t.backendId]: { ...prev[t.backendId], status: "adding" },
                                      }));
                                      addToolToPath(t.backendId).then((msg) => {
                                        setWhichInfo((prev) => ({
                                          ...prev,
                                          [t.backendId]: { ...prev[t.backendId], status: "added", whichPath: msg },
                                        }));
                                      }).catch((err) => {
                                        setWhichInfo((prev) => ({
                                          ...prev,
                                          [t.backendId]: { ...prev[t.backendId], status: `error: ${err}` },
                                        }));
                                      });
                                    }}
                                    onMouseEnter={() => setHover(`addpath-${t.backendId}`)}
                                    onMouseLeave={() => setHover(null)}
                                    style={{
                                      cursor: wi.status === "adding" ? "wait" : "pointer",
                                      padding: "2px 8px",
                                      borderRadius: 3,
                                      background: hover === `addpath-${t.backendId}` ? `${bm.color}30` : `${bm.color}15`,
                                      color: bm.color,
                                      fontWeight: 700,
                                      fontSize: 8,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {wi.status === "adding" ? "ADDING..." : "ADD TO PATH"}
                                  </span>
                                  <span style={{ color: C.t3, fontSize: 8 }}>
                                    {navigator.platform?.startsWith("Win") ? "updates system PATH" : "writes to shell config"}
                                  </span>
                                </div>
                              )}
                              {/* Success message after adding */}
                              {wi.status === "added" && (
                                <span style={{ color: C.ok, fontSize: 8 }}>
                                  {wi.whichPath} (restart terminal to take effect)
                                </span>
                              )}
                              {/* Error message */}
                              {typeof wi.status === "string" && wi.status.startsWith("error:") && (
                                <span style={{ color: C.err, fontSize: 8 }}>{wi.status}</span>
                              )}
                            </>
                          )}
                        </div>
                      )}
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
                    <div key={i} title={`${f.feature} — ${f.status}, expires ${f.expires}`} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
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
          title="Drag to resize panels"
          style={{
            width: 6,
            cursor: "col-resize",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div className="ceda-ss-divider" style={{ ["--ceda-hover-bg" as string]: C.accent, width: 2, height: 40, borderRadius: 1, background: C.b1 }} />
        </div>

        {/* Right: Recent Projects */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, paddingLeft: 16 }}>
          <div
            onClick={() => setShowRecents((p) => !p)}
            title={showRecents ? "Collapse recent projects" : "Expand recent projects"}
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
                    title={r.path}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 14px",
                      borderRadius: 6,
                      background: hover === r.path ? C.s2 : "transparent",
                      cursor: "pointer",
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

      {/* Remote directory browser modal */}
      {remoteBrowseOpen && (
        <RemoteDirBrowser
          initialDir={sshConfig?.remoteProjectDir || `/home/${sshUser}`}
          onSelect={handleRemoteDirSelect}
          onClose={() => setRemoteBrowseOpen(false)}
        />
      )}

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
