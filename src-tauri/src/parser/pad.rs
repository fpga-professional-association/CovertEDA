use crate::types::{PadBankVccio, PadPinEntry, PadReport};

/// Parse a Lattice Radiant/Diamond `.pad` file.
///
/// Extracts two tables:
/// 1. **Pinout by Port Name** — per-signal pin assignments with buffer type, site, properties
/// 2. **Vccio by Bank** — VCCIO voltage per I/O bank
pub fn parse_radiant_pad(content: &str) -> Option<PadReport> {
    let mut assigned_pins = Vec::new();
    let mut vccio_banks = Vec::new();

    let mut in_port_table = false;
    let mut in_vccio_table = false;

    for line in content.lines() {
        let trimmed = line.trim();

        // Detect section headers
        if trimmed.starts_with("Pinout by Port Name:") {
            in_port_table = true;
            in_vccio_table = false;
            continue;
        }
        if trimmed.starts_with("Vccio by Bank:") {
            in_port_table = false;
            in_vccio_table = true;
            continue;
        }
        // Any other section header ends both tables
        if trimmed.starts_with("Vref by Bank:")
            || trimmed.starts_with("Pinout by Pin Number:")
            || trimmed.starts_with("sysCONFIG Pins:")
            || trimmed.starts_with("Locate Constraints")
        {
            in_port_table = false;
            in_vccio_table = false;
            continue;
        }

        // Skip separator/header lines
        if trimmed.starts_with('+') || trimmed.is_empty() {
            continue;
        }

        // Parse port name table rows: | Port Name | Pin/Bank | Buffer Type | Site | Properties |
        if in_port_table && trimmed.starts_with('|') {
            let cols: Vec<&str> = trimmed.split('|').map(|s| s.trim()).collect();
            // cols[0] is empty (before first |), cols[1..] are the fields
            if cols.len() < 6 {
                continue;
            }
            let port_name = cols[1];
            let pin_bank = cols[2];
            let buffer_type = cols[3];
            let site = cols[4];
            let properties = cols[5];

            // Skip header row
            if port_name == "Port Name" {
                continue;
            }
            if port_name.is_empty() {
                continue;
            }

            // Parse pin/bank: "M14/2" → pin="M14", bank="2"
            let (pin, bank) = if let Some(idx) = pin_bank.find('/') {
                (pin_bank[..idx].to_string(), pin_bank[idx + 1..].to_string())
            } else {
                (pin_bank.to_string(), String::new())
            };

            // Extract direction from buffer type suffix: _OUT, _IN, _BIDIR
            let direction = if buffer_type.ends_with("_OUT") {
                "OUT".to_string()
            } else if buffer_type.ends_with("_IN") {
                "IN".to_string()
            } else if buffer_type.ends_with("_BIDIR") {
                "BIDIR".to_string()
            } else {
                "UNKNOWN".to_string()
            };

            // Extract IO_TYPE and DRIVE from properties string
            let mut io_standard = String::new();
            let mut drive = String::new();
            for pair in properties.split_whitespace() {
                if let Some(val) = pair.strip_prefix("IO_TYPE:") {
                    io_standard = val.to_string();
                } else if let Some(val) = pair.strip_prefix("DRIVE:") {
                    if val != "NA" {
                        drive = val.to_string();
                    }
                }
            }

            assigned_pins.push(PadPinEntry {
                port_name: port_name.to_string(),
                pin,
                bank,
                buffer_type: buffer_type.to_string(),
                site: site.to_string(),
                io_standard,
                drive,
                direction,
            });
        }

        // Parse Vccio table rows: | Bank | Vccio |
        if in_vccio_table && trimmed.starts_with('|') {
            let cols: Vec<&str> = trimmed.split('|').map(|s| s.trim()).collect();
            if cols.len() < 3 {
                continue;
            }
            let bank = cols[1];
            let vccio = cols[2];
            // Skip header row
            if bank == "Bank" {
                continue;
            }
            vccio_banks.push(PadBankVccio {
                bank: bank.to_string(),
                vccio: vccio.to_string(),
            });
        }
    }

    if assigned_pins.is_empty() {
        return None;
    }

    Some(PadReport {
        assigned_pins,
        vccio_banks,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_radiant_pad() {
        let content = std::fs::read_to_string("tests/fixtures/radiant/pinout.pad")
            .expect("fixture missing");
        let report = parse_radiant_pad(&content).expect("parse failed");

        assert_eq!(report.assigned_pins.len(), 10);
        assert_eq!(report.vccio_banks.len(), 3);

        // Check first pin
        let p0 = &report.assigned_pins[0];
        assert_eq!(p0.port_name, "c[0]");
        assert_eq!(p0.pin, "M14");
        assert_eq!(p0.bank, "2");
        assert_eq!(p0.buffer_type, "LVCMOS33_OUT");
        assert_eq!(p0.site, "PR24B");
        assert_eq!(p0.io_standard, "LVCMOS33");
        assert_eq!(p0.drive, "8mA");
        assert_eq!(p0.direction, "OUT");

        // Check clock input
        let clk = report.assigned_pins.iter().find(|p| p.port_name == "clk").unwrap();
        assert_eq!(clk.pin, "E12");
        assert_eq!(clk.bank, "0");
        assert_eq!(clk.direction, "IN");
        assert_eq!(clk.io_standard, "LVCMOS33");
        assert_eq!(clk.drive, ""); // NA → empty

        // Check Vccio banks
        assert_eq!(report.vccio_banks[0].bank, "0");
        assert_eq!(report.vccio_banks[0].vccio, "3.3V");
        assert_eq!(report.vccio_banks[2].bank, "2");
    }
}
