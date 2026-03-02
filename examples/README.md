# Example Designs

Simple FPGA designs for testing CovertEDA with different vendor backends.

Each example includes:
- Verilog source (`.v`)
- Testbench (not required by CovertEDA but useful for verification)
- Constraint templates for multiple backends

## Designs

### 1. counter — 8-bit Counter
A simple 8-bit counter that increments on each clock edge and drives 8 LEDs.

**Resources:** ~10 LUTs, 8 FFs
**Useful for:** Basic build pipeline test, quick verification that a backend works.

### 2. blinky — LED Blinker with Prescaler
Blinks an LED at ~1 Hz using a clock prescaler. Parameterizable for different clock frequencies.

**Resources:** ~30 LUTs, 25+ FFs
**Useful for:** Testing with a real board, timing constraints verification.

### 3. uart_tx — UART Transmitter
A simple UART transmitter (8N1) that sends a repeating message. Includes a baud rate generator.

**Resources:** ~80 LUTs, 40+ FFs
**Useful for:** More complex design for report parsing verification, multi-file project test.

## Usage

```bash
# 1. Launch CovertEDA
npx tauri dev   # or npm run dev for browser mode

# 2. Create New Project
#    - Select your backend (Diamond, Radiant, Quartus, Vivado, etc.)
#    - Choose a target device
#    - Set top module to "counter" (or "blinky" or "uart_tx")
#    - Point to the example directory

# 3. Build
#    - Click Build or press Ctrl+B
#    - Watch the build pipeline progress
#    - View reports after completion
```

## Constraint Files

Each example includes constraint stubs. You'll need to update pin assignments for your specific board:

| Backend | File | Format |
|---------|------|--------|
| Diamond | `constraints.lpf` | Lattice LPF |
| Radiant | `constraints.pdc` | Lattice PDC |
| Quartus | `constraints.qsf` | Intel QSF |
| Vivado | `constraints.xdc` | AMD XDC |
| ACE | `constraints.pdc` | Achronix PDC |
| OSS | `constraints.pcf` | PCF |
