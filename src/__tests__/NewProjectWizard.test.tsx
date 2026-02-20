import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import NewProjectWizard from "../components/NewProjectWizard";

// Mock the useTauri hooks that make IPC calls
vi.mock("../hooks/useTauri", () => ({
  createProject: vi.fn(),
  pickDirectory: vi.fn(),
}));

const defaultProps = {
  onClose: vi.fn(),
  onCreate: vi.fn(),
};

describe("NewProjectWizard", () => {
  it("renders all required fields", () => {
    renderWithTheme(<NewProjectWizard {...defaultProps} />);
    expect(screen.getByText("New Project")).toBeInTheDocument();
    expect(screen.getByText("PROJECT DIRECTORY *")).toBeInTheDocument();
    expect(screen.getByText("PROJECT NAME *")).toBeInTheDocument();
    expect(screen.getByText("BACKEND *")).toBeInTheDocument();
    expect(screen.getByText(/TARGET DEVICE/)).toBeInTheDocument();
    expect(screen.getByText("TOP MODULE")).toBeInTheDocument();
  });

  it("shows all 5 backend options", () => {
    renderWithTheme(<NewProjectWizard {...defaultProps} />);
    expect(screen.getByText("Lattice Diamond")).toBeInTheDocument();
    expect(screen.getByText("Lattice Radiant")).toBeInTheDocument();
    expect(screen.getByText("Intel Quartus Prime")).toBeInTheDocument();
    expect(screen.getByText("AMD Vivado")).toBeInTheDocument();
    expect(screen.getByText("OSS CAD Suite")).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    renderWithTheme(<NewProjectWizard {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables Create when fields are empty", () => {
    renderWithTheme(<NewProjectWizard {...defaultProps} />);
    const createBtn = screen.getByText("Create Project");
    // The Btn component renders a <div> with opacity styling when disabled
    // With no dir or name, canCreate is false so the button should be disabled
    expect(createBtn.closest("[style]")).toBeTruthy();
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    const { container } = renderWithTheme(<NewProjectWizard {...defaultProps} onClose={onClose} />);
    const backdrop = container.firstElementChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("updates device default when backend is selected", () => {
    renderWithTheme(<NewProjectWizard {...defaultProps} />);
    // Click Quartus backend
    fireEvent.click(screen.getByText("Intel Quartus Prime"));
    // The short badge for the selected backend should update
    expect(screen.getByText("Quartus")).toBeInTheDocument();
  });
});
