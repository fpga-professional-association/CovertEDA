// Testbench for 8-Bit Counter
`timescale 1ns / 1ps

module counter_tb;

    reg        clk;
    reg        rst;
    wire [7:0] count;
    wire [7:0] led;

    counter uut (
        .clk   (clk),
        .rst   (rst),
        .count (count),
        .led   (led)
    );

    // 50 MHz clock (20 ns period)
    initial clk = 0;
    always #10 clk = ~clk;

    initial begin
        $dumpfile("counter_tb.vcd");
        $dumpvars(0, counter_tb);

        rst = 1;
        #50;
        rst = 0;

        // Run for 256 clock cycles to see full rollover
        repeat (256) @(posedge clk);

        if (count !== 8'd0)
            $display("WARN: expected rollover to 0, got %d", count);
        else
            $display("PASS: counter rolled over correctly");

        $finish;
    end

endmodule
