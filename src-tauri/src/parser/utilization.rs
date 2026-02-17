use crate::backend::BackendResult;
use crate::types::*;

/// Parse Diamond .mrp utilization report
pub fn parse_diamond_utilization(content: &str, device: &str) -> BackendResult<ResourceReport> {
    let _ = content; // TODO: implement regex-based parsing
    Ok(ResourceReport {
        device: device.to_string(),
        categories: vec![],
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

/// Parse nextpnr JSON utilization
pub fn parse_nextpnr_utilization(content: &str, device: &str) -> BackendResult<ResourceReport> {
    let _ = content;
    Ok(ResourceReport {
        device: device.to_string(),
        categories: vec![],
        by_module: vec![],
    })
}
