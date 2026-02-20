# CovertEDA — Radiant Build Script
# Device: LIFCL-40-7BG400I
# Top: counter

prj_open "//wsl.localhost/Ubuntu-24.04/home/tcovert/projects/CovertEDA/examples/radiant-counter/counter.rdf"
prj_set_strategy_value -strategy Strategy1 {SYN_Tool=LSE}
prj_save
prj_run_synthesis
prj_run_map
prj_run_par
prj_run_bitstream
prj_close
