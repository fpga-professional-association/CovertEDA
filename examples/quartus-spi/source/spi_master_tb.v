// Testbench for SPI Master — loopback (MOSI -> MISO)
`timescale 1ns / 1ps

module spi_master_tb;

    parameter CLK_DIV = 4;

    reg        clk;
    reg        rst_n;
    reg        start;
    reg  [7:0] tx_data;
    wire [7:0] rx_data;
    wire       done;
    wire       busy;
    wire       sclk;
    wire       mosi;
    wire       cs_n;

    // Loopback: MOSI feeds directly back to MISO
    wire miso = mosi;

    spi_master #(.CLK_DIV(CLK_DIV)) uut (
        .clk     (clk),
        .rst_n   (rst_n),
        .start   (start),
        .tx_data (tx_data),
        .rx_data (rx_data),
        .done    (done),
        .busy    (busy),
        .sclk    (sclk),
        .mosi    (mosi),
        .miso    (miso),
        .cs_n    (cs_n)
    );

    // 50 MHz clock
    initial clk = 0;
    always #10 clk = ~clk;

    task spi_transfer(input [7:0] send_val);
        begin
            @(posedge clk);
            tx_data = send_val;
            start   = 1;
            @(posedge clk);
            start = 0;
            // Wait for done
            wait (done);
            @(posedge clk);
        end
    endtask

    initial begin
        $dumpfile("spi_master_tb.vcd");
        $dumpvars(0, spi_master_tb);

        rst_n   = 0;
        start   = 0;
        tx_data = 8'h00;
        #100;
        rst_n = 1;
        #100;

        // Test 1: Send 0xA5, expect loopback echo
        spi_transfer(8'hA5);
        if (rx_data === 8'hA5)
            $display("PASS: loopback 0xA5 -> 0x%02h", rx_data);
        else
            $display("FAIL: expected 0xA5, got 0x%02h", rx_data);

        #200;

        // Test 2: Send 0x3C
        spi_transfer(8'h3C);
        if (rx_data === 8'h3C)
            $display("PASS: loopback 0x3C -> 0x%02h", rx_data);
        else
            $display("FAIL: expected 0x3C, got 0x%02h", rx_data);

        #200;
        $finish;
    end

endmodule
