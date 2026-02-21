# Timing constraints for 8-Bit Counter
# Nexys A7 board — 100 MHz clock (10 ns period)

create_clock -name sys_clk -period 10.0 [get_ports {clk}]

# Clock — Nexys A7 100 MHz oscillator
set_property PACKAGE_PIN E3 [get_ports {clk}]
set_property IOSTANDARD LVCMOS33 [get_ports {clk}]

# Reset — center pushbutton
set_property PACKAGE_PIN N17 [get_ports {rst}]
set_property IOSTANDARD LVCMOS33 [get_ports {rst}]

# LEDs
set_property PACKAGE_PIN H17 [get_ports {led[0]}]
set_property PACKAGE_PIN K15 [get_ports {led[1]}]
set_property PACKAGE_PIN J13 [get_ports {led[2]}]
set_property PACKAGE_PIN N14 [get_ports {led[3]}]
set_property PACKAGE_PIN R18 [get_ports {led[4]}]
set_property PACKAGE_PIN V17 [get_ports {led[5]}]
set_property PACKAGE_PIN U17 [get_ports {led[6]}]
set_property PACKAGE_PIN U16 [get_ports {led[7]}]
set_property IOSTANDARD LVCMOS33 [get_ports {led[*]}]
