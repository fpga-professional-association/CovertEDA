# Timing constraints for PWM Generator
# 50 MHz clock (20 ns period)

create_clock -name {clk} -period 20.0 [get_ports {clk}]

derive_pll_clocks
derive_clock_uncertainty
