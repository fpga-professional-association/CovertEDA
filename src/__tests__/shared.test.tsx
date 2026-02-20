import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme } from "../test/helpers";
import { Badge, Btn, HoverRow, NavBtn, Input, Select, ResourceBar } from "../components/shared";

describe("Badge", () => {
  it("renders children text", () => {
    renderWithTheme(<Badge>v1.0</Badge>);
    expect(screen.getByText("v1.0")).toBeInTheDocument();
  });

  it("applies custom color to the text", () => {
    renderWithTheme(<Badge color="#ff0000">error</Badge>);
    const el = screen.getByText("error");
    expect(el).toHaveStyle({ color: "#ff0000" });
  });
});

describe("Btn", () => {
  it("renders children text", () => {
    renderWithTheme(<Btn>Click Me</Btn>);
    expect(screen.getByText("Click Me")).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    renderWithTheme(<Btn onClick={onClick}>Go</Btn>);
    fireEvent.click(screen.getByText("Go"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", () => {
    const onClick = vi.fn();
    renderWithTheme(<Btn onClick={onClick} disabled>Go</Btn>);
    fireEvent.click(screen.getByText("Go"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("applies primary styling with white text color", () => {
    renderWithTheme(<Btn primary>Primary</Btn>);
    const btn = screen.getByText("Primary").closest("button")!;
    expect(btn).toHaveStyle({ color: "#fff" });
  });
});

describe("HoverRow", () => {
  it("renders children", () => {
    renderWithTheme(<HoverRow><span>Row Content</span></HoverRow>);
    expect(screen.getByText("Row Content")).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    renderWithTheme(<HoverRow onClick={onClick}><span>Clickable</span></HoverRow>);
    fireEvent.click(screen.getByText("Clickable"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("NavBtn", () => {
  it("renders with label text", () => {
    renderWithTheme(<NavBtn icon={<span>IC</span>} label="Build" />);
    expect(screen.getByText("Build")).toBeInTheDocument();
  });

  it("shows tooltip via title attribute", () => {
    renderWithTheme(<NavBtn icon={<span>IC</span>} label="Build" tooltip="Start a build" />);
    const el = screen.getByTitle("Start a build");
    expect(el).toBeInTheDocument();
  });

  it("falls back to label for title when no tooltip is provided", () => {
    renderWithTheme(<NavBtn icon={<span>IC</span>} label="Reports" />);
    const el = screen.getByTitle("Reports");
    expect(el).toBeInTheDocument();
  });
});

describe("Input", () => {
  it("renders with the provided value", () => {
    renderWithTheme(<Input value="hello" />);
    const input = screen.getByDisplayValue("hello");
    expect(input).toBeInTheDocument();
  });

  it("calls onChange with the new value when typing", () => {
    const onChange = vi.fn();
    renderWithTheme(<Input value="" onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "new" } });
    expect(onChange).toHaveBeenCalledWith("new");
  });
});

describe("Select", () => {
  const options = [
    { value: "a", label: "Option A" },
    { value: "b", label: "Option B" },
    { value: "c", label: "Option C" },
  ];

  it("renders the selected value label", () => {
    renderWithTheme(<Select value="b" onChange={vi.fn()} options={options} />);
    expect(screen.getByText("Option B")).toBeInTheDocument();
  });

  it("opens dropdown on click and shows all options", () => {
    renderWithTheme(<Select value="a" onChange={vi.fn()} options={options} />);
    fireEvent.click(screen.getByText("Option A"));
    // When the dropdown opens, there should be duplicate labels for the trigger and the dropdown item
    expect(screen.getAllByText("Option A").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Option B")).toBeInTheDocument();
    expect(screen.getByText("Option C")).toBeInTheDocument();
  });

  it("calls onChange when an option is clicked in the dropdown", () => {
    const onChange = vi.fn();
    renderWithTheme(<Select value="a" onChange={onChange} options={options} />);
    // Open dropdown
    fireEvent.click(screen.getByText("Option A"));
    // Click a different option
    fireEvent.click(screen.getByText("Option C"));
    expect(onChange).toHaveBeenCalledWith("c");
  });
});

describe("ResourceBar", () => {
  it("renders label and percentage", () => {
    renderWithTheme(<ResourceBar label="LUTs" used={500} total={1000} />);
    expect(screen.getByText("LUTs")).toBeInTheDocument();
    expect(screen.getByText("500/1,000 (50%)")).toBeInTheDocument();
  });
});
