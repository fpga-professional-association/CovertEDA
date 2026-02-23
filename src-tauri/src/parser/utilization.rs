use crate::backend::BackendResult;
use crate::types::*;
use regex::Regex;

/// Parse Diamond .mrp utilization report
pub fn parse_diamond_utilization(content: &str, device: &str) -> BackendResult<ResourceReport> {
    // Diamond and Radiant share similar .mrp format
    parse_lattice_mrp(content, device)
}

/// Parse Radiant .mrp utilization report
pub fn parse_radiant_utilization(content: &str, device: &str) -> BackendResult<ResourceReport> {
    parse_lattice_mrp(content, device)
}

/// Shared parser for Lattice .mrp files (Diamond and Radiant use same format)
fn parse_lattice_mrp(content: &str, device: &str) -> BackendResult<ResourceReport> {
    let resource_re = Regex::new(
        r"Number of (\w[\w\s/()-]*?):\s+(\d+)\s+out of\s+(\d+)"
    ).unwrap();

    let mut logic_items = vec![];
    let mut io_items = vec![];
    let mut memory_items = vec![];
    let mut dsp_items = vec![];
    let mut clock_items = vec![];
    let mut other_items = vec![];

    for cap in resource_re.captures_iter(content) {
        let name = cap[1].trim().to_string();
        let used: u64 = cap[2].parse().unwrap_or(0);
        let total: u64 = cap[3].parse().unwrap_or(0);

        let item = ResourceItem {
            resource: name.clone(),
            used,
            total,
            detail: None,
        };

        let name_lower = name.to_lowercase();
        if name_lower.contains("register")
            || name_lower.contains("lut")
            || name_lower.contains("slice")
        {
            logic_items.push(item);
        } else if name_lower.contains("pio")
            || name_lower.contains("io")
            || name_lower.contains("ddr")
        {
            io_items.push(item);
        } else if name_lower.contains("ram") {
            memory_items.push(item);
        } else if name_lower.contains("dsp")
            || name_lower.contains("mult")
            || name_lower.contains("add")
            || name_lower.contains("acc")
        {
            dsp_items.push(item);
        } else if name_lower.contains("pll")
            || name_lower.contains("dll")
            || name_lower.contains("dcc")
            || name_lower.contains("clk")
            || name_lower.contains("osc")
        {
            clock_items.push(item);
        } else {
            other_items.push(item);
        }
    }

    // Also parse the SLICE utilization from .par report format if present
    let slice_re = Regex::new(r"SLICE\s+(\d+)/(\d+)").unwrap();
    if let Some(cap) = slice_re.captures(content) {
        let used: u64 = cap[1].parse().unwrap_or(0);
        let total: u64 = cap[2].parse().unwrap_or(0);
        // Only add if not already captured
        if !logic_items.iter().any(|i| i.resource.contains("SLICE")) {
            logic_items.insert(
                0,
                ResourceItem {
                    resource: "SLICEs".into(),
                    used,
                    total,
                    detail: None,
                },
            );
        }
    }

    let mut categories = vec![];
    if !logic_items.is_empty() {
        categories.push(ResourceCategory {
            name: "Logic".into(),
            items: logic_items,
        });
    }
    if !io_items.is_empty() {
        categories.push(ResourceCategory {
            name: "I/O".into(),
            items: io_items,
        });
    }
    if !memory_items.is_empty() {
        categories.push(ResourceCategory {
            name: "Memory".into(),
            items: memory_items,
        });
    }
    if !dsp_items.is_empty() {
        categories.push(ResourceCategory {
            name: "DSP".into(),
            items: dsp_items,
        });
    }
    if !clock_items.is_empty() {
        categories.push(ResourceCategory {
            name: "Clocking".into(),
            items: clock_items,
        });
    }
    if !other_items.is_empty() {
        categories.push(ResourceCategory {
            name: "Other".into(),
            items: other_items,
        });
    }

    Ok(ResourceReport {
        device: device.to_string(),
        categories,
        by_module: vec![],
    })
}

/// Parse Quartus .fit.rpt utilization report
///
/// Quartus fitter reports contain a Resource Usage Summary table:
///   ; Resource                                  ; Used   ; Total  ; % Used   ;
///   ; Logic utilization (ALMs needed / total)   ; 45     ; 32070  ; < 1 %    ;
///   ; Total I/O Pins                            ; 18     ; 480    ; 4 %      ;
///
/// And a per-entity hierarchy table:
///   ; |top                      ; 45   ; 80   ; 18   ; 2    ; 0            ;
///   ;    |counter               ; 12   ; 16   ; 0    ; 0    ; 0            ;
pub fn parse_quartus_utilization(content: &str, device: &str) -> BackendResult<ResourceReport> {
    // Parse the Resource Usage Summary table
    // Format: ; <resource name> ; <used> ; <total> ; <% used> ;
    let row_re = Regex::new(
        r"(?m);\s*([\w\s/()\-]+?)\s*;\s*(\d+)\s*;\s*(\d+)\s*;\s*"
    ).unwrap();

    let mut logic_items = vec![];
    let mut io_items = vec![];
    let mut memory_items = vec![];
    let mut dsp_items = vec![];
    let mut clock_items = vec![];
    let mut other_items = vec![];

    for cap in row_re.captures_iter(content) {
        let name = cap[1].trim().to_string();
        let used: u64 = cap[2].parse().unwrap_or(0);
        let total: u64 = cap[3].parse().unwrap_or(0);

        if total == 0 {
            continue;
        }

        // Skip summary/header rows
        if name == "Resource" || name.contains("Compilation Hierarchy") || name.contains("Node") {
            continue;
        }

        let item = ResourceItem {
            resource: name.clone(),
            used,
            total,
            detail: None,
        };

        let n = name.to_lowercase();
        if n.contains("alm") || n.contains("alut") || n.contains("register")
            || n.contains("lab") || n.contains("logic") || n.contains("lut")
            || n.contains("le ")
        {
            logic_items.push(item);
        } else if n.contains("i/o") || n.contains("pin") || n.contains("gpio") {
            io_items.push(item);
        } else if n.contains("m10k") || n.contains("m20k") || n.contains("m9k")
            || n.contains("mlab") || n.contains("memory") || n.contains("ram")
            || n.contains("block mem")
        {
            memory_items.push(item);
        } else if n.contains("dsp") || n.contains("mult") {
            dsp_items.push(item);
        } else if n.contains("pll") || n.contains("dll") || n.contains("clk")
            || n.contains("clock")
        {
            clock_items.push(item);
        } else {
            other_items.push(item);
        }
    }

    let mut categories = vec![];
    if !logic_items.is_empty() {
        categories.push(ResourceCategory { name: "Logic".into(), items: logic_items });
    }
    if !io_items.is_empty() {
        categories.push(ResourceCategory { name: "I/O".into(), items: io_items });
    }
    if !memory_items.is_empty() {
        categories.push(ResourceCategory { name: "Memory".into(), items: memory_items });
    }
    if !dsp_items.is_empty() {
        categories.push(ResourceCategory { name: "DSP".into(), items: dsp_items });
    }
    if !clock_items.is_empty() {
        categories.push(ResourceCategory { name: "Clocking".into(), items: clock_items });
    }
    if !other_items.is_empty() {
        categories.push(ResourceCategory { name: "Other".into(), items: other_items });
    }

    // Parse per-entity hierarchy table
    // Format: ; |top  ; 45 ; 80 ; 18 ; 2 ; 0 ;
    //         ;    |counter ; 12 ; 16 ; 0 ; 0 ; 0 ;
    let entity_re = Regex::new(
        r"(?m);\s*\|(\w+)\s*;\s*(\d+)\s*;\s*(\d+)\s*;\s*(\d+)\s*;\s*(\d+)\s*;\s*(\d+)\s*;"
    ).unwrap();

    let mut by_module = vec![];
    for cap in entity_re.captures_iter(content) {
        let module = cap[1].to_string();
        let alms: u64 = cap[2].parse().unwrap_or(0);
        let regs: u64 = cap[3].parse().unwrap_or(0);
        let _pins: u64 = cap[4].parse().unwrap_or(0);
        let m10k: u64 = cap[5].parse().unwrap_or(0);
        let _dsp: u64 = cap[6].parse().unwrap_or(0);

        // Calculate percentage based on top-level ALMs
        let top_alms = categories.iter()
            .find(|c| c.name == "Logic")
            .and_then(|c| c.items.first())
            .map(|i| i.total)
            .unwrap_or(1);
        let pct = if top_alms > 0 { (alms as f64 / top_alms as f64) * 100.0 } else { 0.0 };

        by_module.push(ModuleUtilization {
            module,
            lut: alms,
            ff: regs,
            ebr: m10k,
            percentage: pct,
        });
    }

    Ok(ResourceReport {
        device: device.to_string(),
        categories,
        by_module,
    })
}

/// Parse Vivado utilization report
pub fn parse_vivado_utilization(content: &str, device: &str) -> BackendResult<ResourceReport> {
    let _ = content;
    Ok(ResourceReport {
        device: device.to_string(),
        categories: vec![],
        by_module: vec![],
    })
}

/// Parse Achronix ACE *_utilization.rpt resource report.
///
/// ACE utilization reports list resources in a table:
///   Resource                Used   Total   Utilization
///   -------                ----   -----   -----------
///   ALMs                    124   251680         0.05%
///   Registers               212   503360         0.04%
///   MLABs                     2    31460         0.01%
///   M20Ks                     0    2131          0.00%
///   DSP Blocks                0     768          0.00%
///   PLLs                      0      32          0.00%
///   I/O Pins                 12     480          2.50%
pub fn parse_ace_utilization(content: &str, device: &str) -> BackendResult<ResourceReport> {
    use regex::Regex;

    // Generic table row: "<resource name>   <used>   <total>"
    let row_re = Regex::new(
        r"(?m)^\s*([\w /()-]+?)\s{2,}(\d+)\s+(\d+)\s"
    ).unwrap();

    let mut logic_items = vec![];
    let mut io_items = vec![];
    let mut memory_items = vec![];
    let mut dsp_items = vec![];
    let mut clock_items = vec![];
    let mut other_items = vec![];

    for cap in row_re.captures_iter(content) {
        let name = cap[1].trim().to_string();
        let used: u64 = cap[2].parse().unwrap_or(0);
        let total: u64 = cap[3].parse().unwrap_or(0);
        if total == 0 {
            continue;
        }

        let item = ResourceItem {
            resource: name.clone(),
            used,
            total,
            detail: None,
        };

        let n = name.to_lowercase();
        if n.contains("alm") || n.contains("lut") || n.contains("register") || n.contains("mlab") {
            logic_items.push(item);
        } else if n.contains("i/o") || n.contains("pin") || n.contains("gpio") {
            io_items.push(item);
        } else if n.contains("m20k") || n.contains("ram") || n.contains("memory") || n.contains("bram") {
            memory_items.push(item);
        } else if n.contains("dsp") || n.contains("mult") {
            dsp_items.push(item);
        } else if n.contains("pll") || n.contains("clk") || n.contains("clock") {
            clock_items.push(item);
        } else {
            other_items.push(item);
        }
    }

    let mut categories = vec![];
    if !logic_items.is_empty() {
        categories.push(ResourceCategory { name: "Logic".into(), items: logic_items });
    }
    if !io_items.is_empty() {
        categories.push(ResourceCategory { name: "I/O".into(), items: io_items });
    }
    if !memory_items.is_empty() {
        categories.push(ResourceCategory { name: "Memory".into(), items: memory_items });
    }
    if !dsp_items.is_empty() {
        categories.push(ResourceCategory { name: "DSP".into(), items: dsp_items });
    }
    if !clock_items.is_empty() {
        categories.push(ResourceCategory { name: "Clocking".into(), items: clock_items });
    }
    if !other_items.is_empty() {
        categories.push(ResourceCategory { name: "Other".into(), items: other_items });
    }

    Ok(ResourceReport {
        device: device.to_string(),
        categories,
        by_module: vec![],
    })
}

/// Parse nextpnr JSON utilization
///
/// nextpnr report.json contains a `utilisation` object mapping resource type
/// names (e.g. "TRELLIS_SLICE", "TRELLIS_IO", "DP16KD") to
/// `{"available": N, "used": N}`.
pub fn parse_nextpnr_utilization(content: &str, device: &str) -> BackendResult<ResourceReport> {
    use crate::backend::BackendError;

    let json: serde_json::Value = serde_json::from_str(content)
        .map_err(|e| BackendError::ParseError(format!("Invalid nextpnr JSON: {}", e)))?;

    // nextpnr uses British spelling "utilisation"
    let util_obj = json
        .pointer("/utilisation")
        .or_else(|| json.pointer("/utilization"))
        .and_then(|v| v.as_object());

    let mut logic_items = vec![];
    let mut io_items = vec![];
    let mut memory_items = vec![];
    let mut dsp_items = vec![];
    let mut clock_items = vec![];
    let mut other_items = vec![];

    if let Some(resources) = util_obj {
        for (name, data) in resources {
            let used = data.get("used").and_then(|v| v.as_u64()).unwrap_or(0);
            let available = data.get("available").and_then(|v| v.as_u64()).unwrap_or(0);

            let item = ResourceItem {
                resource: name.clone(),
                used,
                total: available,
                detail: None,
            };

            let n = name.to_uppercase();
            if n.contains("SLICE") || n.contains("LUT") || n.contains("CCU2") {
                logic_items.push(item);
            } else if n.contains("IO") {
                io_items.push(item);
            } else if n.contains("DP16K") || n.contains("PDPW16K") || n.contains("RAM")
                || n.contains("BRAM") || n.contains("EBR")
            {
                memory_items.push(item);
            } else if n.contains("MULT") || n.contains("ALU54") || n.contains("DSP") {
                dsp_items.push(item);
            } else if n.contains("PLL") || n.contains("DCC") || n.contains("ECLK")
                || n.contains("OSC") || n.contains("CLKDIV")
            {
                clock_items.push(item);
            } else {
                other_items.push(item);
            }
        }
    }

    let mut categories = vec![];
    if !logic_items.is_empty() {
        categories.push(ResourceCategory { name: "Logic".into(), items: logic_items });
    }
    if !io_items.is_empty() {
        categories.push(ResourceCategory { name: "I/O".into(), items: io_items });
    }
    if !memory_items.is_empty() {
        categories.push(ResourceCategory { name: "Memory".into(), items: memory_items });
    }
    if !dsp_items.is_empty() {
        categories.push(ResourceCategory { name: "DSP".into(), items: dsp_items });
    }
    if !clock_items.is_empty() {
        categories.push(ResourceCategory { name: "Clocking".into(), items: clock_items });
    }
    if !other_items.is_empty() {
        categories.push(ResourceCategory { name: "Other".into(), items: other_items });
    }

    Ok(ResourceReport {
        device: device.to_string(),
        categories,
        by_module: vec![],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_lattice_mrp_with_fixture() {
        let content = include_str!("../../tests/fixtures/radiant/utilization.mrp");
        let report = parse_radiant_utilization(content, "LIFCL-40-7BG400I").unwrap();
        assert_eq!(report.device, "LIFCL-40-7BG400I");
        // Should have at least some categories parsed
        assert!(!report.categories.is_empty());
    }

    #[test]
    fn test_parse_lattice_mrp_categorizes_registers_as_logic() {
        let content = "Number of registers: 80 out of 38400\n";
        let report = parse_lattice_mrp(content, "test").unwrap();
        let logic = report.categories.iter().find(|c| c.name == "Logic");
        assert!(logic.is_some());
        let items = &logic.unwrap().items;
        assert!(items.iter().any(|i| i.resource.contains("register")));
    }

    #[test]
    fn test_parse_lattice_mrp_categorizes_pio_as_io() {
        let content = "Number of PIO sites: 18 out of 204\n";
        let report = parse_lattice_mrp(content, "test").unwrap();
        let io = report.categories.iter().find(|c| c.name == "I/O");
        assert!(io.is_some());
    }

    #[test]
    fn test_parse_lattice_mrp_categorizes_ram_as_memory() {
        let content = "Number of block RAM: 2 out of 108\n";
        let report = parse_lattice_mrp(content, "test").unwrap();
        let mem = report.categories.iter().find(|c| c.name == "Memory");
        assert!(mem.is_some());
    }

    #[test]
    fn test_parse_lattice_mrp_categorizes_dsp() {
        let content = "Number of DSP blocks: 1 out of 56\n";
        let report = parse_lattice_mrp(content, "test").unwrap();
        let dsp = report.categories.iter().find(|c| c.name == "DSP");
        assert!(dsp.is_some());
    }

    #[test]
    fn test_parse_lattice_mrp_categorizes_pll_as_clocking() {
        let content = "Number of PLL sites: 1 out of 4\n";
        let report = parse_lattice_mrp(content, "test").unwrap();
        let clk = report.categories.iter().find(|c| c.name == "Clocking");
        assert!(clk.is_some());
    }

    #[test]
    fn test_parse_lattice_mrp_empty_input() {
        let report = parse_lattice_mrp("", "test").unwrap();
        assert!(report.categories.is_empty());
        assert!(report.by_module.is_empty());
    }

    #[test]
    fn test_parse_diamond_utilization_with_fixture() {
        let content = include_str!("../../tests/fixtures/diamond/utilization.mrp");
        let report = parse_diamond_utilization(content, "LCMXO3LF-6900C").unwrap();
        assert!(!report.categories.is_empty(), "should have categories");
        // Verify registers were found
        let has_logic = report.categories.iter().any(|c| c.name == "Logic");
        assert!(has_logic, "should have Logic category");
    }

    #[test]
    fn test_parse_ace_utilization_with_fixture() {
        let content = include_str!("../../tests/fixtures/ace/utilization.rpt");
        let report = parse_ace_utilization(content, "AC7t1500ES0HIIC80").unwrap();
        assert_eq!(report.device, "AC7t1500ES0HIIC80");
        assert!(!report.categories.is_empty(), "should have categories");
        let has_logic = report.categories.iter().any(|c| c.name == "Logic");
        assert!(has_logic, "should have Logic category with ALMs/Registers");
    }

    #[test]
    fn test_parse_ace_utilization_categorizes_alms_as_logic() {
        let content = "ALMs                      12  251680         0.00%\n";
        let report = parse_ace_utilization(content, "test").unwrap();
        let logic = report.categories.iter().find(|c| c.name == "Logic");
        assert!(logic.is_some(), "ALMs should be Logic");
        assert_eq!(logic.unwrap().items[0].used, 12);
        assert_eq!(logic.unwrap().items[0].total, 251680);
    }

    #[test]
    fn test_parse_ace_utilization_categorizes_m20k_as_memory() {
        let content = "M20Ks                      4    2131         0.19%\n";
        let report = parse_ace_utilization(content, "test").unwrap();
        let mem = report.categories.iter().find(|c| c.name == "Memory");
        assert!(mem.is_some(), "M20Ks should be Memory");
    }

    #[test]
    fn test_parse_ace_utilization_empty_input() {
        let report = parse_ace_utilization("", "test").unwrap();
        assert!(report.categories.is_empty());
    }

    // ── Quartus utilization tests ──

    #[test]
    fn test_parse_quartus_utilization_with_fixture() {
        let content = include_str!("../../tests/fixtures/quartus/utilization.fit.rpt");
        let report = parse_quartus_utilization(content, "5CSEBA6U23I7").unwrap();
        assert_eq!(report.device, "5CSEBA6U23I7");
        assert!(!report.categories.is_empty(), "should have categories");

        let logic = report.categories.iter().find(|c| c.name == "Logic");
        assert!(logic.is_some(), "should have Logic category");
        let logic_items = &logic.unwrap().items;
        assert!(logic_items.iter().any(|i| i.resource.contains("ALM")), "should have ALMs");

        let io = report.categories.iter().find(|c| c.name == "I/O");
        assert!(io.is_some(), "should have I/O category");
        let io_item = io.unwrap().items.iter().find(|i| i.resource.contains("I/O Pin")).unwrap();
        assert_eq!(io_item.used, 18);
        assert_eq!(io_item.total, 480);

        let mem = report.categories.iter().find(|c| c.name == "Memory");
        assert!(mem.is_some(), "should have Memory category");

        let clk = report.categories.iter().find(|c| c.name == "Clocking");
        assert!(clk.is_some(), "should have Clocking category");

        // Per-module hierarchy
        assert!(!report.by_module.is_empty(), "should have module breakdown");
        assert_eq!(report.by_module[0].module, "top");
        assert_eq!(report.by_module[0].ff, 80);
    }

    #[test]
    fn test_parse_quartus_utilization_categorizes_alms() {
        let content = "; Total ALMs                                ; 45     ; 32070  ; < 1 %    ;\n";
        let report = parse_quartus_utilization(content, "test").unwrap();
        let logic = report.categories.iter().find(|c| c.name == "Logic");
        assert!(logic.is_some(), "ALMs should be Logic");
        assert_eq!(logic.unwrap().items[0].used, 45);
    }

    #[test]
    fn test_parse_quartus_utilization_categorizes_io() {
        let content = "; Total I/O Pins                            ; 18     ; 480    ; 4 %      ;\n";
        let report = parse_quartus_utilization(content, "test").unwrap();
        let io = report.categories.iter().find(|c| c.name == "I/O");
        assert!(io.is_some(), "I/O Pins should be I/O");
    }

    #[test]
    fn test_parse_quartus_utilization_categorizes_memory() {
        let content = "; Total M10K Memory Blocks                  ; 2      ; 397    ; < 1 %    ;\n";
        let report = parse_quartus_utilization(content, "test").unwrap();
        let mem = report.categories.iter().find(|c| c.name == "Memory");
        assert!(mem.is_some(), "M10K should be Memory");
    }

    #[test]
    fn test_parse_quartus_utilization_categorizes_dsp() {
        let content = "; Total DSP Blocks                          ; 4      ; 87     ; 5 %      ;\n";
        let report = parse_quartus_utilization(content, "test").unwrap();
        let dsp = report.categories.iter().find(|c| c.name == "DSP");
        assert!(dsp.is_some(), "DSP Blocks should be DSP");
    }

    #[test]
    fn test_parse_quartus_utilization_empty() {
        let report = parse_quartus_utilization("", "test").unwrap();
        assert!(report.categories.is_empty());
        assert!(report.by_module.is_empty());
    }

    // ── nextpnr (OSS) utilization tests ──

    #[test]
    fn test_parse_nextpnr_utilization_with_fixture() {
        let content = include_str!("../../tests/fixtures/oss/report.json");
        let report = parse_nextpnr_utilization(content, "LFE5U-85F-6BG381C").unwrap();
        assert_eq!(report.device, "LFE5U-85F-6BG381C");
        assert!(!report.categories.is_empty(), "should have categories");
        let has_logic = report.categories.iter().any(|c| c.name == "Logic");
        assert!(has_logic, "should have Logic category");
        let logic = report.categories.iter().find(|c| c.name == "Logic").unwrap();
        let slice = logic.items.iter().find(|i| i.resource == "TRELLIS_SLICE");
        assert!(slice.is_some(), "should have TRELLIS_SLICE");
        assert_eq!(slice.unwrap().used, 1890);
        assert_eq!(slice.unwrap().total, 41820);
    }

    #[test]
    fn test_parse_nextpnr_utilization_categorizes_io() {
        let content = r#"{"utilisation": {"TRELLIS_IO": {"available": 365, "used": 10}}}"#;
        let report = parse_nextpnr_utilization(content, "test").unwrap();
        let io = report.categories.iter().find(|c| c.name == "I/O");
        assert!(io.is_some(), "TRELLIS_IO should be I/O");
        assert_eq!(io.unwrap().items[0].used, 10);
    }

    #[test]
    fn test_parse_nextpnr_utilization_categorizes_memory() {
        let content = r#"{"utilisation": {"DP16KD": {"available": 208, "used": 24}}}"#;
        let report = parse_nextpnr_utilization(content, "test").unwrap();
        let mem = report.categories.iter().find(|c| c.name == "Memory");
        assert!(mem.is_some(), "DP16KD should be Memory");
    }

    #[test]
    fn test_parse_nextpnr_utilization_categorizes_dsp() {
        let content = r#"{"utilisation": {"MULT18X18D": {"available": 156, "used": 4}}}"#;
        let report = parse_nextpnr_utilization(content, "test").unwrap();
        let dsp = report.categories.iter().find(|c| c.name == "DSP");
        assert!(dsp.is_some(), "MULT18X18D should be DSP");
    }

    #[test]
    fn test_parse_nextpnr_utilization_categorizes_clocking() {
        let content = r#"{"utilisation": {"DCCA": {"available": 56, "used": 1}, "EHXPLLL": {"available": 4, "used": 1}}}"#;
        let report = parse_nextpnr_utilization(content, "test").unwrap();
        let clk = report.categories.iter().find(|c| c.name == "Clocking");
        assert!(clk.is_some(), "DCCA/EHXPLLL should be Clocking");
    }

    #[test]
    fn test_parse_nextpnr_utilization_empty_json() {
        let report = parse_nextpnr_utilization("{}", "test").unwrap();
        assert!(report.categories.is_empty());
    }

    #[test]
    fn test_parse_nextpnr_utilization_invalid_json() {
        let result = parse_nextpnr_utilization("not json", "test");
        assert!(result.is_err());
    }
}
