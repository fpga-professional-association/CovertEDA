import { screen } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import Programmer from "../components/Programmer";

vi.mock("../hooks/useTauri", () => ({
  detectProgrammerCables: vi.fn(() => Promise.resolve([])),
  findBitstreams: vi.fn(() => Promise.resolve([])),
  programDevice: vi.fn(() => Promise.resolve("prog-123")),
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

describe("Programmer", () => {
  it("renders device programmer header", () => {
    renderWithTheme(<Programmer device="LIFCL-40" backendId="radiant" />);
    expect(screen.getByText("Device Programmer")).toBeInTheDocument();
  });

  it("shows device badge", () => {
    renderWithTheme(<Programmer device="LIFCL-40" backendId="radiant" />);
    expect(screen.getByText("LIFCL-40")).toBeInTheDocument();
  });

  it("shows no cables message initially", () => {
    renderWithTheme(<Programmer device="LIFCL-40" backendId="radiant" />);
    expect(screen.getByText("No cables detected")).toBeInTheDocument();
  });

  it("renders scan button", () => {
    renderWithTheme(<Programmer device="LIFCL-40" backendId="radiant" />);
    expect(screen.getAllByText(/Scan/).length).toBeGreaterThan(0);
  });

  it("renders program button disabled when no cable/bitstream", () => {
    renderWithTheme(<Programmer device="LIFCL-40" backendId="radiant" />);
    const btn = screen.getByText("Program Device").closest("button");
    expect(btn).toBeDisabled();
  });

  it("renders output section", () => {
    renderWithTheme(<Programmer device="LIFCL-40" backendId="radiant" />);
    expect(screen.getByText("Output")).toBeInTheDocument();
  });

  it("shows hint text about Radiant support", () => {
    renderWithTheme(<Programmer device="LIFCL-40" backendId="radiant" />);
    expect(screen.getByText(/Supports Lattice Radiant pgrcmd/)).toBeInTheDocument();
  });
});
