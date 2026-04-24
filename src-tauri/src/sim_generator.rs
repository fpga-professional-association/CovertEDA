//! Testbench + simulation-script generation for the Simulation page.
//!
//! Three pieces:
//!   - `parse_top_ports`  : regex-scans a Verilog/SystemVerilog source file for
//!                          the top module's port list (name + direction + width).
//!   - `generate_verilog_testbench` : self-checking TB stub with clock / reset /
//!                                    a placeholder stimulus + check block.
//!   - `generate_cocotb_testbench` : Python cocotb test + companion Makefile
//!                                   that matches the repo's existing tb/ layout.
//!   - `generate_sim_script`       : thin TCL/shell script for ModelSim,
//!                                   Active-HDL, Icarus, or Verilator.
//!
//! Everything is pure text — we don't invoke tools, we just emit files the
//! user can read, edit, and run.

use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TopPort {
    pub name: String,
    pub direction: String, // "input" | "output" | "inout"
    /// Width in bits; 1 for a scalar, N for `[N-1:0]`.
    pub width: u32,
    /// Raw width expression (e.g. `WIDTH-1` or `3`) when the width isn't
    /// numeric; empty when scalar.
    pub range: String,
}

pub fn parse_top_ports(source: &str, top_module: &str) -> Vec<TopPort> {
    let re_mod = Regex::new(&format!(r"(?s)\bmodule\s+{}\b[^;]*?\(([^;]*?)\)\s*;", regex::escape(top_module)))
        .unwrap();
    let Some(cap) = re_mod.captures(source) else { return Vec::new() };
    let port_list = cap.get(1).map(|m| m.as_str()).unwrap_or("");

    // Strip line comments then block comments.
    let no_line = Regex::new(r"//[^\n]*").unwrap().replace_all(port_list, "");
    let cleaned = Regex::new(r"(?s)/\*.*?\*/").unwrap().replace_all(&no_line, "");

    // ANSI-style: "input wire [7:0] foo, output reg bar, ..."
    // Non-ANSI: just "foo, bar" — then direction/width come from body.
    let port_decl = Regex::new(
        r"(?x)
        (?:(input|output|inout)\s+)?
        (?:(wire|reg|logic|tri)\s+)?
        (?:\[\s*([^\]]+?)\s*\]\s+)?
        ([A-Za-z_]\w*)
        ",
    )
    .unwrap();

    let mut current_dir = "input".to_string();
    let mut ports: Vec<TopPort> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for chunk in cleaned.split(',') {
        let chunk = chunk.trim();
        if chunk.is_empty() {
            continue;
        }
        if let Some(m) = port_decl.captures(chunk) {
            if let Some(d) = m.get(1) {
                current_dir = d.as_str().to_string();
            }
            let range_raw = m.get(3).map(|r| r.as_str().to_string()).unwrap_or_default();
            let (width, range_kept) = parse_width(&range_raw);
            let name = m.get(4).map(|r| r.as_str().to_string()).unwrap_or_default();
            if name.is_empty() || seen.contains(&name) {
                continue;
            }
            seen.insert(name.clone());
            ports.push(TopPort {
                name,
                direction: current_dir.clone(),
                width,
                range: range_kept,
            });
        }
    }

    // Non-ANSI fallback: scan the module body for top-level input/output/inout
    // declarations if ports came back direction-less.
    if ports.iter().all(|p| p.direction.is_empty()) {
        let body = &source[re_mod.find(source).unwrap().end()..];
        let decl = Regex::new(
            r"(?m)^\s*(input|output|inout)\s+(?:wire|reg|logic|tri)?\s*(?:\[\s*([^\]]+?)\s*\])?\s*([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*;",
        )
        .unwrap();
        for m in decl.captures_iter(body) {
            let dir = m.get(1).unwrap().as_str().to_string();
            let range_raw = m.get(2).map(|r| r.as_str().to_string()).unwrap_or_default();
            let names = m.get(3).unwrap().as_str();
            let (width, range_kept) = parse_width(&range_raw);
            for n in names.split(',') {
                let n = n.trim().to_string();
                if n.is_empty() { continue; }
                if let Some(p) = ports.iter_mut().find(|p| p.name == n) {
                    p.direction = dir.clone();
                    p.width = width;
                    p.range = range_kept.clone();
                }
            }
        }
    }

    ports
}

fn parse_width(raw: &str) -> (u32, String) {
    if raw.is_empty() {
        return (1, String::new());
    }
    // Matches "N:0" where N is a numeric literal.
    let re = Regex::new(r"^\s*(\d+)\s*:\s*0\s*$").unwrap();
    if let Some(c) = re.captures(raw) {
        if let Ok(n) = c[1].parse::<u32>() {
            return (n + 1, format!("{n}:0"));
        }
    }
    (0, raw.to_string())
}

pub fn generate_verilog_testbench(top_module: &str, ports: &[TopPort]) -> String {
    // Heuristic: any 1-bit input whose name contains "clk" is the clock;
    // any 1-bit input whose name contains "rst" / "reset" is the reset.
    let clk = ports.iter().find(|p| p.direction == "input" && p.width == 1 && p.name.to_lowercase().contains("clk"));
    let rst = ports.iter().find(|p| p.direction == "input" && p.width == 1
        && (p.name.to_lowercase().contains("rst") || p.name.to_lowercase().contains("reset")));
    let rst_active_low = rst.map(|r| r.name.to_lowercase().ends_with("_n") || r.name.to_lowercase().contains("n_")).unwrap_or(false);

    let mut s = String::new();
    s.push_str("// =============================================================================\n");
    s.push_str(&format!("// Testbench for {top_module} (auto-generated by CovertEDA)\n"));
    s.push_str("// Self-checking skeleton — fill in stimulus and expected-value checks.\n");
    s.push_str("// =============================================================================\n\n");
    s.push_str("`timescale 1ns/1ps\n\n");
    s.push_str(&format!("module tb_{top_module};\n\n"));

    // Signal declarations.
    for p in ports {
        let w = if p.width > 1 { format!("[{}:0] ", p.width - 1) }
                else if !p.range.is_empty() { format!("[{}] ", p.range) }
                else { String::new() };
        let kind = if p.direction == "input" { "reg" } else { "wire" };
        s.push_str(&format!("  {kind}  {w}{name};\n", name = p.name));
    }
    s.push_str("\n");

    // Instance.
    s.push_str(&format!("  {top_module} dut (\n"));
    for (i, p) in ports.iter().enumerate() {
        let comma = if i + 1 < ports.len() { "," } else { "" };
        s.push_str(&format!("    .{name}({name}){comma}\n", name = p.name));
    }
    s.push_str("  );\n\n");

    // Clock.
    if let Some(c) = clk {
        s.push_str(&format!("  // 100 MHz clock on `{}`\n", c.name));
        s.push_str(&format!("  initial {} = 1'b0;\n", c.name));
        s.push_str(&format!("  always #5 {} = ~{};\n\n", c.name, c.name));
    }

    // Reset + stimulus + finish.
    s.push_str("  initial begin\n");
    s.push_str("    $dumpfile(\"sim.vcd\");\n");
    s.push_str("    $dumpvars(0, dut);\n\n");

    // Default init for all inputs.
    for p in ports.iter().filter(|p| p.direction == "input" && Some(p.name.as_str()) != clk.map(|c| c.name.as_str())) {
        if rst.map(|r| r.name == p.name).unwrap_or(false) {
            // Assert reset
            if rst_active_low {
                s.push_str(&format!("    {} = 1'b0;\n", p.name));
            } else {
                s.push_str(&format!("    {} = 1'b1;\n", p.name));
            }
        } else if p.width == 1 {
            s.push_str(&format!("    {} = 1'b0;\n", p.name));
        } else if p.width > 1 {
            s.push_str(&format!("    {} = {}'d0;\n", p.name, p.width));
        } else {
            s.push_str(&format!("    {} = 0;\n", p.name));
        }
    }
    s.push_str("\n");

    // Deassert reset after a few clocks.
    if let Some(r) = rst {
        s.push_str("    // Deassert reset after 10 ns\n");
        s.push_str("    #20;\n");
        if rst_active_low {
            s.push_str(&format!("    {} = 1'b1;\n\n", r.name));
        } else {
            s.push_str(&format!("    {} = 1'b0;\n\n", r.name));
        }
    }

    s.push_str("    // TODO: drive inputs and check expected outputs here.\n");
    s.push_str("    //   $display(\"value = %0d\", observed);\n");
    s.push_str("    //   if (observed !== expected) begin\n");
    s.push_str("    //     $display(\"FAIL: expected %0d got %0d\", expected, observed);\n");
    s.push_str("    //     $fatal;\n");
    s.push_str("    //   end\n\n");
    s.push_str("    #1000;\n");
    s.push_str("    $display(\"PASS\");\n");
    s.push_str("    $finish;\n");
    s.push_str("  end\n\n");
    s.push_str("endmodule\n");
    s
}

pub fn generate_cocotb_testbench(top_module: &str, ports: &[TopPort]) -> (String, String) {
    let clk = ports.iter().find(|p| p.direction == "input" && p.width == 1 && p.name.to_lowercase().contains("clk"));
    let rst = ports.iter().find(|p| p.direction == "input" && p.width == 1
        && (p.name.to_lowercase().contains("rst") || p.name.to_lowercase().contains("reset")));
    let rst_active_low = rst.map(|r| r.name.to_lowercase().ends_with("_n") || r.name.to_lowercase().contains("n_")).unwrap_or(false);

    let mut py = String::new();
    py.push_str(&format!("\"\"\"Cocotb testbench for {top_module} (auto-generated by CovertEDA).\"\"\"\n\n"));
    py.push_str("import cocotb\n");
    py.push_str("from cocotb.clock import Clock\n");
    py.push_str("from cocotb.triggers import RisingEdge, Timer\n\n\n");
    py.push_str(&format!("async def reset_dut(dut):\n"));
    if let Some(r) = rst {
        let init = if rst_active_low { 0 } else { 1 };
        let released = if rst_active_low { 1 } else { 0 };
        py.push_str(&format!("    dut.{}.value = {init}\n", r.name));
        py.push_str("    await Timer(50, units=\"ns\")\n");
        py.push_str(&format!("    dut.{}.value = {released}\n", r.name));
        py.push_str("    await Timer(10, units=\"ns\")\n\n\n");
    } else {
        py.push_str("    await Timer(10, units=\"ns\")\n\n\n");
    }

    py.push_str("@cocotb.test()\n");
    py.push_str(&format!("async def test_{top_module}_basic(dut):\n"));
    py.push_str(&format!("    \"\"\"Basic smoke test for {top_module}.\"\"\"\n"));
    if let Some(c) = clk {
        py.push_str(&format!("    cocotb.start_soon(Clock(dut.{}, 10, units=\"ns\").start())\n", c.name));
    }
    py.push_str("    await reset_dut(dut)\n");

    // Default all other inputs to 0.
    for p in ports.iter().filter(|p| p.direction == "input"
            && Some(p.name.as_str()) != clk.map(|c| c.name.as_str())
            && Some(p.name.as_str()) != rst.map(|r| r.name.as_str())) {
        py.push_str(&format!("    dut.{}.value = 0\n", p.name));
    }

    if clk.is_some() {
        py.push_str(&format!("    await RisingEdge(dut.{})\n", clk.unwrap().name));
    } else {
        py.push_str("    await Timer(100, units=\"ns\")\n");
    }

    py.push_str("\n    # TODO: drive inputs and assert outputs here.\n");
    py.push_str("    # e.g.  assert int(dut.some_output.value) == expected\n\n");

    if clk.is_some() {
        py.push_str("    for _ in range(100):\n");
        py.push_str(&format!("        await RisingEdge(dut.{})\n", clk.unwrap().name));
    } else {
        py.push_str("    await Timer(1000, units=\"ns\")\n");
    }
    py.push_str("\n    dut._log.info(\"test completed\")\n");

    let mf = format!(
        "# Cocotb Makefile auto-generated by CovertEDA\n\
         SIM ?= icarus\n\
         TOPLEVEL_LANG ?= verilog\n\
         VERILOG_SOURCES = $(shell find ../../src -name '*.v' -o -name '*.sv' 2>/dev/null)\n\
         TOPLEVEL = {top_module}\n\
         MODULE = test_{top_module}\n\
         include $(shell cocotb-config --makefiles)/Makefile.sim\n"
    );
    (py, mf)
}

pub fn generate_sim_script(
    simulator: &str,
    sources: &[String],
    testbench: &str,
    top_module: &str,
    sim_time: &str,
    timescale: &str,
) -> String {
    match simulator {
        "icarus" => {
            let mut s = String::new();
            s.push_str("#!/usr/bin/env bash\n");
            s.push_str(&format!("# Icarus Verilog sim for {top_module}\n\n"));
            s.push_str("set -e\n");
            s.push_str(&format!("iverilog -g2012 -o sim.out \\\n"));
            for src in sources {
                s.push_str(&format!("    {src} \\\n"));
            }
            s.push_str(&format!("    {testbench}\n"));
            s.push_str("vvp sim.out\n");
            s
        }
        "verilator" => {
            let joined_src = sources.iter().chain(std::iter::once(&testbench.to_string())).cloned().collect::<Vec<_>>().join(" \\\n    ");
            format!(
                "#!/usr/bin/env bash\n\
                 # Verilator sim for {top_module}\n\n\
                 set -e\n\
                 verilator --binary --timing --top-module tb_{top_module} \\\n    {joined_src}\n\
                 ./obj_dir/Vtb_{top_module}\n"
            )
        }
        "modelsim" | "active_hdl" | _ => {
            let mut s = String::new();
            s.push_str(&format!("# {} simulation script for {}\n", simulator.to_uppercase(), top_module));
            s.push_str(&format!("vlib work\nvmap work work\n\n"));
            s.push_str(&format!("# Timescale: {}\n", timescale));
            for src in sources {
                s.push_str(&format!("vlog -sv {src}\n"));
            }
            s.push_str(&format!("vlog -sv {testbench}\n\n"));
            s.push_str(&format!("vsim -c tb_{top_module}\n"));
            s.push_str("add wave -r /*\n");
            s.push_str(&format!("run {sim_time}\n"));
            s.push_str("quit -f\n");
            s
        }
    }
}

/// Convenience: read every source under `<project>/src/` and return a list
/// of paths relative to `<project>`. Used by the UI to prefill the script.
pub fn project_sources(project_dir: &Path) -> Vec<String> {
    let src_dir = project_dir.join("src");
    let mut out = Vec::new();
    collect(&src_dir, project_dir, &mut out);
    out.sort();
    out
}

fn collect(dir: &Path, base: &Path, out: &mut Vec<String>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            collect(&p, base, out);
        } else if matches!(p.extension().and_then(|e| e.to_str()), Some("v") | Some("sv")) {
            if let Ok(rel) = p.strip_prefix(base) {
                out.push(rel.display().to_string().replace('\\', "/"));
            }
        }
    }
}
