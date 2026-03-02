// Testbench for 8-bit counter

`timescale 1ns / 1ps

module counter_tb;
    reg        clk;
    reg        rst_n;
    wire [7:0] led;

    counter uut (
        .clk   (clk),
        .rst_n (rst_n),
        .led   (led)
    );

    initial clk = 0;
    always #5 clk = ~clk;  // 100 MHz

    initial begin
        rst_n = 0;
        #20;
        rst_n = 1;
        #5000;
        if (led !== 8'd0)
            $display("PASS: counter incremented to %d", led);
        else
            $display("FAIL: counter stuck at 0");
        $finish;
    end
endmodule
