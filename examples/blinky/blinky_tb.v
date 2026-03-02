// Testbench for LED blinker
// Uses a faster clock for simulation

`timescale 1ns / 1ps

module blinky_tb;
    reg  clk;
    reg  rst_n;
    wire led;

    // Use small counter for simulation (10 cycles = 1 toggle)
    blinky #(.CLK_FREQ(20)) uut (
        .clk   (clk),
        .rst_n (rst_n),
        .led   (led)
    );

    initial clk = 0;
    always #5 clk = ~clk;

    initial begin
        rst_n = 0;
        #20;
        rst_n = 1;
        #500;

        // LED should have toggled multiple times
        $display("Simulation complete. LED state: %b", led);
        $finish;
    end
endmodule
