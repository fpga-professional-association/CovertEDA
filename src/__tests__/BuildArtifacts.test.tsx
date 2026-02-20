import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme, makeProjectFile } from "../test/helpers";
import BuildArtifacts from "../components/BuildArtifacts";

const implDir = "impl1";

function makeArtifactFiles() {
  return [
    makeProjectFile({ n: "top.bit", ty: "output", path: `/project/${implDir}/top.bit`, synth: false }),
    makeProjectFile({ n: "top.twr", ty: "output", path: `/project/${implDir}/top.twr`, synth: false }),
    makeProjectFile({ n: "top.mrp", ty: "output", path: `/project/${implDir}/top.mrp`, synth: false }),
    makeProjectFile({ n: "top.srp", ty: "output", path: `/project/${implDir}/top.srp`, synth: false }),
  ];
}

describe("BuildArtifacts", () => {
  it("renders artifact file names", () => {
    renderWithTheme(
      <BuildArtifacts files={makeArtifactFiles()} implDir={implDir} onOpenFile={vi.fn()} />
    );
    expect(screen.getByText("top.bit")).toBeInTheDocument();
    expect(screen.getByText("top.twr")).toBeInTheDocument();
    expect(screen.getByText("top.mrp")).toBeInTheDocument();
  });

  it("fires onOpenFile with path when artifact is clicked", () => {
    const onOpenFile = vi.fn();
    renderWithTheme(
      <BuildArtifacts files={makeArtifactFiles()} implDir={implDir} onOpenFile={onOpenFile} />
    );
    fireEvent.click(screen.getByText("top.bit"));
    expect(onOpenFile).toHaveBeenCalledWith(`/project/${implDir}/top.bit`);
  });

  it("shows extension labels for known types", () => {
    renderWithTheme(
      <BuildArtifacts files={makeArtifactFiles()} implDir={implDir} onOpenFile={vi.fn()} />
    );
    expect(screen.getByText("Bitstream")).toBeInTheDocument();
    expect(screen.getByText("Timing")).toBeInTheDocument();
    expect(screen.getByText("Utilization")).toBeInTheDocument();
    expect(screen.getByText("Synthesis Log")).toBeInTheDocument();
  });

  it("returns null when no artifacts match the impl dir", () => {
    const files = [makeProjectFile({ n: "counter.v", path: "/project/src/counter.v" })];
    const { container } = renderWithTheme(
      <BuildArtifacts files={files} implDir={implDir} onOpenFile={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });
});
