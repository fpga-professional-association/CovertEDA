if {[catch {

# define run engine funtion
source [file join {C:/lscc/radiant/2025.2} scripts tcl flow run_engine.tcl]
# define global variables
global para
set para(gui_mode) "0"
set para(prj_dir) "C:/coverteda_builds/counter_e3e7c6c0"
if {![file exists {C:/coverteda_builds/counter_e3e7c6c0/impl1}]} {
  file mkdir {C:/coverteda_builds/counter_e3e7c6c0/impl1}
}
cd {C:/coverteda_builds/counter_e3e7c6c0/impl1}
# synthesize IPs
# synthesize VMs
# synthesize top design
file delete -force -- counter_impl1.vm counter_impl1.ldc
::radiant::runengine::run_engine_newmsg synthesis -f "C:/coverteda_builds/counter_e3e7c6c0/impl1/counter_impl1_lattice.synproj" -logfile "counter_impl1_lattice.srp"
::radiant::runengine::run_postsyn [list -a LIFCL -p LIFCL-40 -t CABGA400 -sp 7_High-Performance_1.0V -oc Industrial -top -w -o counter_impl1_syn.udb counter_impl1.vm] [list counter_impl1.ldc]

} out]} {
   ::radiant::runengine::runtime_log $out
   exit 1
}
