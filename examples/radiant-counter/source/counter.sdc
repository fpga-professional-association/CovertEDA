# Timing constraints for 8-Bit Counter
# 50 MHz clock (20 ns period)

create_clock -name {clk} -period 20.0 [get_ports {clk}]
