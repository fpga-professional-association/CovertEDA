import { useMemo } from "react";
import { ProjectFile } from "../types";
import { useTheme } from "../context/ThemeContext";

// ── Inject CSS hover for build artifact rows ──
if (typeof document !== "undefined" && !document.getElementById("ceda-ba-hover")) {
  const s = document.createElement("style");
  s.id = "ceda-ba-hover";
  s.textContent = `.ceda-ba-row:hover { background: var(--ceda-hover-bg) !important; }`;
  document.head.appendChild(s);
}

interface BuildArtifactsProps {
  files: ProjectFile[];
  implDir: string;
  onOpenFile: (path: string) => void;
}

const EXT_LABELS: Record<string, string> = {
  ".bit": "Bitstream",
  ".jed": "JEDEC",
  ".bin": "Binary",
  ".sof": "SRAM Object",
  ".twr": "Timing",
  ".mrp": "Utilization",
  ".par": "PAR Details",
  ".drc": "DRC Check",
  ".srp": "Synthesis Log",
  ".bgn": "Bitgen Log",
  ".pad": "Pad Report",
  ".arearep": "Area Report",
};

function getExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.substring(dot).toLowerCase() : "";
}

interface ArtifactFile {
  name: string;
  path: string;
  ext: string;
  color: string;
  label: string;
  sizeBytes: number;
}

function BuildArtifacts({ files, implDir, onOpenFile }: BuildArtifactsProps) {
  const { C, MONO } = useTheme();

  const EXT_COLORS: Record<string, string> = {
    ".bit": C.ok,
    ".jed": C.ok,
    ".bin": C.ok,
    ".sof": C.ok,
    ".twr": C.cyan,
    ".mrp": C.cyan,
    ".par": C.cyan,
    ".drc": C.cyan,
    ".srp": C.orange,
    ".bgn": C.orange,
    ".pad": C.orange,
    ".arearep": C.orange,
    ".log": C.orange,
  };

  const artifacts = useMemo(() => {
    const implFiles = files.filter(
      (f) => f.ty !== "folder" && f.path && f.path.includes(implDir)
    );

    const mapped: ArtifactFile[] = implFiles
      .map((f) => {
        const ext = getExt(f.n);
        return {
          name: f.n,
          path: f.path!,
          ext,
          color: EXT_COLORS[ext] ?? C.t3,
          label: EXT_LABELS[ext] ?? ext.replace(".", "").toUpperCase(),
          sizeBytes: 0, // We don't have sizes in ProjectFile
        };
      })
      .filter((f) => f.ext in EXT_COLORS);

    // Sort: bitstreams first, then reports, then logs
    const order = [".bit", ".jed", ".bin", ".sof", ".twr", ".mrp", ".par", ".drc", ".srp", ".bgn", ".pad", ".arearep"];
    mapped.sort((a, b) => {
      const ai = order.indexOf(a.ext);
      const bi = order.indexOf(b.ext);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    return mapped;
  }, [files, implDir]);

  if (artifacts.length === 0) return null;

  return (
    <div
      style={{
        background: C.s1,
        borderRadius: 7,
        border: `1px solid ${C.b1}`,
        overflow: "hidden",
        marginTop: 12,
        padding: 14,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.t1,
          marginBottom: 10,
          display: "flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        <span style={{ color: C.ok }}>{"\u25A3"}</span>
        Build Artifacts
        <span style={{ fontSize: 8, fontFamily: MONO, color: C.t3, fontWeight: 400 }}>
          {artifacts.length} files
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {artifacts.map((a) => (
          <div
            key={a.path}
            className="ceda-ba-row"
            onClick={() => onOpenFile(a.path)}
            style={{
              ["--ceda-hover-bg" as string]: `${C.s3}88`,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 8px",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 10,
              fontFamily: MONO,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: a.color,
                flexShrink: 0,
              }}
            />
            <span style={{ color: C.t1, flex: 1 }}>{a.name}</span>
            <span
              style={{
                fontSize: 7,
                padding: "1px 5px",
                borderRadius: 3,
                background: `${a.color}20`,
                color: a.color,
                fontWeight: 600,
              }}
            >
              {a.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default BuildArtifacts;
