// Testbench for UART transmitter

`timescale 1ns / 1ps

module uart_tx_tb;
    reg  clk;
    wire tx;
    reg  rst_n;

    // Fast parameters for simulation
    uart_tx #(
        .CLK_FREQ(1000),
        .BAUD_RATE(100)
    ) uut (
        .clk   (clk),
        .rst_n (rst_n),
        .tx    (tx)
    );

    initial clk = 0;
    always #5 clk = ~clk;  // 100 MHz sim clock

    // UART receiver for verification
    reg [7:0] rx_byte;
    integer   rx_count;

    task automatic receive_byte;
        integer i;
        begin
            // Wait for start bit
            @(negedge tx);
            #50;  // Half bit period (1000/100/2 = 5 clocks = 50ns)

            for (i = 0; i < 8; i = i + 1) begin
                #100;  // Full bit period
                rx_byte[i] = tx;
            end

            #100;  // Stop bit
            rx_count = rx_count + 1;
            $display("Received byte %0d: 0x%02h ('%c')", rx_count, rx_byte,
                     (rx_byte >= 8'h20 && rx_byte < 8'h7F) ? rx_byte : 8'h2E);
        end
    endtask

    initial begin
        rst_n    = 0;
        rx_count = 0;
        #20;
        rst_n = 1;

        // Receive "Hello\r\n" (7 bytes)
        repeat (7) receive_byte();

        $display("PASS: Received %0d bytes", rx_count);
        $finish;
    end

    // Timeout
    initial begin
        #1000000;
        $display("TIMEOUT after receiving %0d bytes", rx_count);
        $finish;
    end
endmodule
