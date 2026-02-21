# CovertEDA — Radiant Build Script
# Device: LIFCL-40-7BG400I
# Top: counter

prj_open "/home/tcovert/FPGA_Projects/CovertEDA/examples/radiant-counter/counter.rdf"
set _strat [lindex [prj_get_strategy_list] 0]
prj_save
prj_run_synthesis
prj_run_map
prj_run_par
prj_run_bitstream
prj_close
