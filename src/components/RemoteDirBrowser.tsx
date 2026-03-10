import { useState, useEffect, useCallback, useRef } from "react";
import { useTheme } from "../context/ThemeContext";
import { Btn } from "./shared";
import { sshBrowseDirectory, sshCheckProjectDir } from "../hooks/useTauri";
import type { RemoteDirEntry, ProjectConfig } from "../types";

interface Props {
  initialDir: string;
  onSelect: (dir: string, config: ProjectConfig | null) => void;
  onClose: () => void;
}

export default function RemoteDirBrowser({ initialDir, onSelect, onClose }: Props) {
  const { C, MONO, SANS } = useTheme();
  const [currentDir, setCurrentDir] = useState(initialDir || "/home");
  const [entries, setEntries] = useState<RemoteDirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectConfig, setProjectConfig] = useState<ProjectConfig | null>(null);
  const [checkingProject, setCheckingProject] = useState(false);
  const [pathInput, setPathInput] = useState(initialDir || "/home");
  const [hover, setHover] = useState<string | null>(null);
  const cache = useRef<Record<string, RemoteDirEntry[]>>({});

  const navigate = useCallback(async (dir: string) => {
    setLoading(true);
    setError(null);
    setCurrentDir(dir);
    setPathInput(dir);
    try {
      let items: RemoteDirEntry[];
      if (cache.current[dir]) {
        items = cache.current[dir];
      } else {
        items = await sshBrowseDirectory(dir);
        cache.current[dir] = items;
      }
      setEntries(items);
      // Check for .coverteda
      setCheckingProject(true);
      const config = await sshCheckProjectDir(dir);
      setProjectConfig(config);
    } catch (e) {
      setError(String(e));
      setEntries([]);
      setProjectConfig(null);
    } finally {
      setLoading(false);
      setCheckingProject(false);
    }
  }, []);

  useEffect(() => {
    navigate(initialDir || "/home");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const segments = currentDir.split("/").filter(Boolean);

  const handlePathSubmit = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      const normalized = pathInput.trim() || "/";
      navigate(normalized);
    }
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
          width: 560,
          maxHeight: "75vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px 0", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.t1 }}>
            Browse Remote Directory
          </span>
          <div style={{ flex: 1 }} />
          {projectConfig && (
            <span
              style={{
                fontSize: 8,
                fontFamily: MONO,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 3,
                background: `${C.ok}15`,
                color: C.ok,
                border: `1px solid ${C.ok}30`,
              }}
            >
              Project Found
            </span>
          )}
          {checkingProject && !projectConfig && (
            <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3 }}>checking...</span>
          )}
        </div>

        {/* Breadcrumb */}
        <div
          style={{
            padding: "10px 20px",
            display: "flex",
            alignItems: "center",
            gap: 2,
            flexWrap: "wrap",
            fontSize: 10,
            fontFamily: MONO,
          }}
        >
          <span
            onClick={() => navigate("/")}
            onMouseEnter={() => setHover("bc-root")}
            onMouseLeave={() => setHover(null)}
            style={{
              cursor: "pointer",
              color: hover === "bc-root" ? C.accent : C.t2,
              padding: "1px 4px",
              borderRadius: 3,
              background: hover === "bc-root" ? `${C.accent}10` : "transparent",
            }}
          >
            /
          </span>
          {segments.map((seg, i) => {
            const path = "/" + segments.slice(0, i + 1).join("/");
            const isLast = i === segments.length - 1;
            const hk = `bc-${i}`;
            return (
              <span key={path} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <span style={{ color: C.t3 }}>/</span>
                <span
                  onClick={() => !isLast && navigate(path)}
                  onMouseEnter={() => setHover(hk)}
                  onMouseLeave={() => setHover(null)}
                  style={{
                    cursor: isLast ? "default" : "pointer",
                    color: isLast ? C.t1 : hover === hk ? C.accent : C.t2,
                    fontWeight: isLast ? 600 : 400,
                    padding: "1px 4px",
                    borderRadius: 3,
                    background: hover === hk && !isLast ? `${C.accent}10` : "transparent",
                  }}
                >
                  {seg}
                </span>
              </span>
            );
          })}
        </div>

        {/* Path input */}
        <div style={{ padding: "0 20px 10px" }}>
          <input
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={handlePathSubmit}
            placeholder="/path/to/directory"
            title="Type a path and press Enter to navigate"
            style={{
              width: "100%",
              padding: "5px 8px",
              background: C.bg,
              border: `1px solid ${C.b1}`,
              borderRadius: 4,
              color: C.t1,
              fontSize: 10,
              fontFamily: MONO,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              margin: "0 20px 8px",
              padding: "6px 10px",
              borderRadius: 4,
              background: `${C.err}10`,
              border: `1px solid ${C.err}30`,
              fontSize: 9,
              fontFamily: MONO,
              color: C.err,
            }}
          >
            {error}
          </div>
        )}

        {/* Directory listing */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "0 20px",
            minHeight: 200,
          }}
        >
          {loading ? (
            <div style={{ padding: 20, textAlign: "center", fontSize: 10, color: C.t3, fontFamily: MONO }}>
              Loading...
            </div>
          ) : entries.length === 0 && !error ? (
            <div style={{ padding: 20, textAlign: "center", fontSize: 10, color: C.t3, fontFamily: MONO }}>
              Empty directory
            </div>
          ) : (
            entries.map((entry) => {
              const hk = `entry-${entry.path}`;
              return (
                <div
                  key={entry.path}
                  onClick={() => entry.isDir && navigate(entry.path)}
                  onMouseEnter={() => setHover(hk)}
                  onMouseLeave={() => setHover(null)}
                  title={entry.path}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "4px 8px",
                    borderRadius: 4,
                    cursor: entry.isDir ? "pointer" : "default",
                    background: hover === hk && entry.isDir ? C.s2 : "transparent",
                  }}
                >
                  <span style={{ fontSize: 12, width: 16, textAlign: "center", color: entry.isDir ? C.accent : C.t3, flexShrink: 0 }}>
                    {entry.isDir ? "\uD83D\uDCC1" : "\uD83D\uDCC4"}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: MONO,
                      color: entry.isDir ? C.t1 : C.t3,
                      fontWeight: entry.isDir ? 500 : 400,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.name}
                    {entry.name === ".coverteda" && (
                      <span style={{ color: C.ok, fontWeight: 600, marginLeft: 6, fontSize: 8 }}>
                        PROJECT FILE
                      </span>
                    )}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: `1px solid ${C.b1}`,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 9, fontFamily: MONO, color: C.t3, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {currentDir}
          </span>
          <Btn small onClick={onClose}>Cancel</Btn>
          <Btn
            small
            primary
            onClick={() => onSelect(currentDir, projectConfig)}
            title="Select this directory"
          >
            {projectConfig ? "Open Project" : "Select Directory"}
          </Btn>
        </div>
      </div>
    </div>
  );
}
