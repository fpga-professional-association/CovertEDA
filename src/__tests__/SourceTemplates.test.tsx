import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import SourceTemplates from "../components/SourceTemplates";

describe("SourceTemplates", () => {
  it("renders category filters", () => {
    renderWithTheme(<SourceTemplates />);
    expect(screen.getByText("Basic")).toBeInTheDocument();
    expect(screen.getByText("Memory")).toBeInTheDocument();
    expect(screen.getByText("Control")).toBeInTheDocument();
  });

  it("displays template cards", () => {
    renderWithTheme(<SourceTemplates />);
    expect(screen.getByText("Synchronous Counter")).toBeInTheDocument();
    expect(screen.getByText("Synchronous RAM")).toBeInTheDocument();
  });

  it("shows parameter form when a template is selected", () => {
    renderWithTheme(<SourceTemplates />);
    const templateCard = screen.getByText("Synchronous Counter");
    fireEvent.click(templateCard);
    expect(screen.getByText("PARAMETERS")).toBeInTheDocument();
  });

  it("displays code preview after template selection", () => {
    renderWithTheme(<SourceTemplates />);
    const templateCard = screen.getByText("Synchronous Counter");
    fireEvent.click(templateCard);
    expect(screen.getByText("CODE PREVIEW")).toBeInTheDocument();
  });

  it("renders Insert into Project button", () => {
    renderWithTheme(<SourceTemplates />);
    const templateCard = screen.getByText("Synchronous Counter");
    fireEvent.click(templateCard);
    const buttons = screen.getAllByRole("button");
    const insertBtn = buttons.find((b) => b.textContent?.includes("Insert into Project"));
    expect(insertBtn).toBeInTheDocument();
  });
});
