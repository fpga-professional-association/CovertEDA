import { useState, useMemo } from "react";
import { SourceTemplate } from "../types";
import { useTheme } from "../context/ThemeContext";
import { Btn, Badge, Input } from "./shared";

// Sample templates
const TEMPLATES: SourceTemplate[] = [
  {
    name: "Synchronous Counter",
    category: "Basic",
    language: "Verilog",
    description: "Simple N-bit binary counter with enable and reset",
    template: `module counter #(parameter WIDTH = 8) (
  input clk, rst, en,
  output [WIDTH-1:0] count
);
  reg [WIDTH-1:0] count_r;

  always @(posedge clk) begin
    if (rst) count_r <= 0;
    else if (en) count_r <= count_r + 1;
  end

  assign count = count_r;
endmodule`,
    parameters: [
      { name: "WIDTH", description: "Counter width in bits", default_value: "8", param_type: "integer" },
    ],
  },
  {
    name: "Synchronous RAM",
    category: "Memory",
    language: "Verilog",
    description: "Dual-port synchronous RAM with parameterized depth/width",
    template: `module ram_sp #(parameter DEPTH = 256, WIDTH = 32) (
  input clk, we,
  input [$clog2(DEPTH)-1:0] addr,
  input [WIDTH-1:0] din,
  output reg [WIDTH-1:0] dout
);
  reg [WIDTH-1:0] mem [DEPTH-1:0];

  always @(posedge clk) begin
    if (we) mem[addr] <= din;
    dout <= mem[addr];
  end
endmodule`,
    parameters: [
      { name: "DEPTH", description: "Number of words", default_value: "256", param_type: "integer" },
      { name: "WIDTH", description: "Word width in bits", default_value: "32", param_type: "integer" },
    ],
  },
  {
    name: "Pulse Detector",
    category: "Control",
    language: "Verilog",
    description: "Detects rising or falling edges with optional metastability filter",
    template: `module edge_detector #(parameter EDGE = "rising") (
  input clk, rst, sig_in,
  output sig_edge
);
  reg sig_r1, sig_r2;

  always @(posedge clk) begin
    if (rst) {sig_r2, sig_r1} <= 2'b0;
    else {sig_r2, sig_r1} <= {sig_r1, sig_in};
  end

  generate
    if (EDGE == "rising")
      assign sig_edge = sig_r1 & ~sig_r2;
    else
      assign sig_edge = ~sig_r1 & sig_r2;
  endgenerate
endmodule`,
    parameters: [
      { name: "EDGE", description: "Edge type: rising or falling", default_value: "rising", param_type: "string" },
    ],
  },
  {
    name: "AXI Lite Slave Interface",
    category: "Interface",
    language: "SystemVerilog",
    description: "AXI-Lite slave template for register file implementation",
    template: `module axi_lite_slave #(
  parameter ADDR_WIDTH = 8,
  parameter DATA_WIDTH = 32
) (
  input aclk, aresetn,
  // Read address
  input [ADDR_WIDTH-1:0] araddr,
  input arvalid, output arready,
  // Read data
  output [DATA_WIDTH-1:0] rdata,
  output rvalid, input rready,
  // Write address
  input [ADDR_WIDTH-1:0] awaddr,
  input awvalid, output awready,
  // Write data
  input [DATA_WIDTH-1:0] wdata,
  input wvalid, output wready,
  // Write response
  output bvalid, input bready
);
  // Implementation here
endmodule`,
    parameters: [
      { name: "ADDR_WIDTH", description: "Address width", default_value: "8", param_type: "integer" },
      { name: "DATA_WIDTH", description: "Data width", default_value: "32", param_type: "integer" },
    ],
  },
  {
    name: "UVM Testbench",
    category: "Verification",
    language: "SystemVerilog",
    description: "Basic UVM testbench structure",
    template: `\`include "uvm_macros.svh"
import uvm_pkg::*;

class my_test extends uvm_test;
  \`uvm_component_utils(my_test)

  function new(string name, uvm_component parent);
    super.new(name, parent);
  endfunction

  function void build_phase(uvm_phase phase);
    super.build_phase(phase);
    // Build environment
  endfunction

  task run_phase(uvm_phase phase);
    // Raise objection
    phase.raise_objection(this);
    // Run tests
    phase.drop_objection(this);
  endtask
endclass`,
    parameters: [
      { name: "DUT_WIDTH", description: "DUT data width", default_value: "32", param_type: "integer" },
    ],
  },
];

const CATEGORIES = ["Basic", "Memory", "Control", "Interface", "Verification"];

interface SourceTemplatesProps {
  templates?: SourceTemplate[] | null;
  onInsert?: (template: string) => void;
}

export default function SourceTemplates({ templates = TEMPLATES, onInsert }: SourceTemplatesProps): React.ReactElement {
  const { C, MONO } = useTheme();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<SourceTemplate | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    if (!templates) return [];
    if (!selectedCategory) return templates;
    return templates.filter((t) => t.category === selectedCategory);
  }, [templates, selectedCategory]);

  const handleSelectTemplate = (template: SourceTemplate) => {
    setSelectedTemplate(template);
    const initialParams: Record<string, string> = {};
    template.parameters.forEach((p) => {
      initialParams[p.name] = p.default_value;
    });
    setParams(initialParams);
  };

  const generatedCode = selectedTemplate
    ? selectedTemplate.template.replace(
        /\${(\w+)}/g,
        (_, key) => params[key] || `$${key}`
      )
    : "";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 12,
        background: C.bg,
        borderRadius: 8,
        overflow: "auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 11, fontFamily: MONO, color: C.t3, marginBottom: 2 }}>
            SOURCE TEMPLATES
          </div>
          <div style={{ fontSize: 14, fontFamily: MONO, fontWeight: 600, color: C.t1 }}>
            HDL Code Generator
          </div>
        </div>
        {selectedTemplate && (
          <Badge color={C.cyan}>{selectedTemplate.language}</Badge>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 12 }}>
        {/* Category Filter */}
        <div
          style={{
            padding: 12,
            background: C.s1,
            borderRadius: 6,
            border: `1px solid ${C.b1}`,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontFamily: MONO,
              fontWeight: 600,
              color: C.t2,
            }}
          >
            CATEGORIES
          </div>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              style={{
                padding: "6px 8px",
                background: selectedCategory === cat ? C.accent : C.bg,
                border: `1px solid ${selectedCategory === cat ? C.accent : C.b1}`,
                borderRadius: 4,
                color: selectedCategory === cat ? "#fff" : C.t2,
                fontSize: 8,
                fontFamily: MONO,
                fontWeight: 600,
                cursor: "pointer",
                textAlign: "left",
                transition: "background-color 100ms ease-out",
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Templates & Editor */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {!selectedTemplate ? (
            /* Template Cards */
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: 12,
              }}
            >
              {filtered.map((tmpl) => (
                <div
                  key={tmpl.name}
                  onClick={() => handleSelectTemplate(tmpl)}
                  style={{
                    padding: 12,
                    background: C.s1,
                    border: `1px solid ${C.b1}`,
                    borderRadius: 6,
                    cursor: "pointer",
                    transition: "border-color 100ms ease-out, background-color 100ms ease-out",
                  }}
                  title={tmpl.description}
                >
                  <div
                    style={{
                      fontSize: 9,
                      fontFamily: MONO,
                      fontWeight: 600,
                      color: C.accent,
                      marginBottom: 4,
                    }}
                  >
                    {tmpl.name}
                  </div>
                  <div
                    style={{
                      fontSize: 7,
                      fontFamily: MONO,
                      color: C.t3,
                      marginBottom: 8,
                      lineHeight: "1.3",
                    }}
                  >
                    {tmpl.description}
                  </div>
                  <Badge color={C.cyan}>{tmpl.language}</Badge>
                </div>
              ))}
            </div>
          ) : (
            /* Template Editor */
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Back Button */}
              <div>
                <Btn
                  small
                  onClick={() => {
                    setSelectedTemplate(null);
                    setParams({});
                  }}
                >
                  ← Back
                </Btn>
              </div>

              {/* Parameters */}
              {selectedTemplate.parameters.length > 0 && (
                <div
                  style={{
                    padding: 12,
                    background: C.s1,
                    borderRadius: 6,
                    border: `1px solid ${C.b1}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      fontFamily: MONO,
                      fontWeight: 600,
                      color: C.t2,
                      marginBottom: 8,
                    }}
                  >
                    PARAMETERS
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {selectedTemplate.parameters.map((param) => (
                      <div key={param.name}>
                        <label
                          style={{
                            fontSize: 8,
                            fontFamily: MONO,
                            color: C.t3,
                            display: "block",
                            marginBottom: 2,
                          }}
                        >
                          {param.name}
                        </label>
                        <Input
                          value={params[param.name] || ""}
                          onChange={(v) =>
                            setParams({ ...params, [param.name]: v })
                          }
                          placeholder={param.default_value}
                        />
                        <div
                          style={{
                            fontSize: 7,
                            fontFamily: MONO,
                            color: C.t3,
                            marginTop: 2,
                          }}
                        >
                          {param.description}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Code Preview */}
              <div
                style={{
                  padding: 12,
                  background: C.s1,
                  borderRadius: 6,
                  border: `1px solid ${C.b1}`,
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    fontFamily: MONO,
                    fontWeight: 600,
                    color: C.t2,
                    marginBottom: 8,
                  }}
                >
                  CODE PREVIEW
                </div>
                <div
                  style={{
                    padding: 8,
                    background: C.bg,
                    borderRadius: 4,
                    border: `1px solid ${C.b1}`,
                    fontFamily: MONO,
                    fontSize: 7,
                    color: C.t3,
                    maxHeight: 250,
                    overflowY: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    lineHeight: "1.4",
                  }}
                >
                  {generatedCode}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 8 }}>
                <Btn small primary onClick={() => onInsert?.(generatedCode)}>
                  Insert into Project
                </Btn>
                <Btn
                  small
                  onClick={() => {
                    navigator.clipboard.writeText(generatedCode);
                  }}
                >
                  Copy Code
                </Btn>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
