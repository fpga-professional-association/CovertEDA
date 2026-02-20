// Testbench for UART Transmitter
`timescale 1ns / 1ps

module uart_tx_tb;

    parameter CLK_FREQ  = 50_000_000;
    parameter BAUD_RATE = 115_200;
    localparam CLKS_PER_BIT = CLK_FREQ / BAUD_RATE;
    localparam BIT_PERIOD   = CLKS_PER_BIT * 20; // ns (20 ns clock period)

    reg        clk;
    reg        rst;
    reg        start;
    reg  [7:0] data;
    wire       tx;
    wire       busy;

    uart_tx #(
        .CLK_FREQ  (CLK_FREQ),
        .BAUD_RATE (BAUD_RATE)
    ) uut (
        .clk   (clk),
        .rst   (rst),
        .start (start),
        .data  (data),
        .tx    (tx),
        .busy  (busy)
    );

    // 50 MHz clock
    initial clk = 0;
    always #10 clk = ~clk;

    task send_byte(input [7:0] byte_val);
        begin
            @(posedge clk);
            data  = byte_val;
            start = 1;
            @(posedge clk);
            start = 0;
            // Wait for transmission to complete
            wait (!busy);
            @(posedge clk);
        end
    endtask

    // Capture received bits
    reg [7:0] rx_data;
    integer i;

    task capture_uart_frame;
        begin
            // Wait for start bit (tx goes low)
            @(negedge tx);
            // Sample in the middle of each bit
            #(BIT_PERIOD / 2); // middle of start bit
            #BIT_PERIOD;       // skip start bit, now at middle of bit 0
            for (i = 0; i < 8; i = i + 1) begin
                rx_data[i] = tx;
                #BIT_PERIOD;
            end
            // Verify stop bit
            if (tx !== 1'b1)
                $display("ERROR: stop bit not high");
        end
    endtask

    initial begin
        $dumpfile("uart_tx_tb.vcd");
        $dumpvars(0, uart_tx_tb);

        rst   = 1;
        start = 0;
        data  = 8'h00;
        #100;
        rst = 0;
        #100;

        // Transmit 0x55 ('U') — alternating bits pattern
        fork
            send_byte(8'h55);
            capture_uart_frame;
        join

        if (rx_data === 8'h55)
            $display("PASS: received 0x%02h", rx_data);
        else
            $display("FAIL: expected 0x55, got 0x%02h", rx_data);

        #1000;
        $finish;
    end

endmodule
