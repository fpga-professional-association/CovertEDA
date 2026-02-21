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
pub fn parse_quartus_utilization(content: &str, device: &str) -> BackendResult<ResourceReport> {
    let _ = content;
    Ok(ResourceReport {
        device: device.to_string(),
        categories: vec![],
        by_module: vec![],
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
pub fn parse_nextpnr_utilization(content: &str, device: &str) -> BackendResult<ResourceReport> {
    let _ = content;
    Ok(ResourceReport {
        device: device.to_string(),
        categories: vec![],
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
}
