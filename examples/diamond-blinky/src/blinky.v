// LED Blinker with Prescaler
// Target: Lattice MachXO3LF (LCMXO3LF-6900C-5BG256C)

module blinky #(
    parameter CLK_FREQ = 12_000_000,  // 12 MHz internal oscillator
    parameter BLINK_HZ = 1            // 1 Hz blink rate
)(
    input  wire clk,
    input  wire rst_n,
    output reg  [7:0] led
);

    localparam MAX_COUNT = CLK_FREQ / (2 * BLINK_HZ) - 1;
    localparam CNT_W = $clog2(MAX_COUNT + 1);

    reg [CNT_W-1:0] prescaler;
    reg              tick;

    // Prescaler: divide clock down to 2x blink rate
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            prescaler <= {CNT_W{1'b0}};
            tick      <= 1'b0;
        end else if (prescaler == MAX_COUNT[CNT_W-1:0]) begin
            prescaler <= {CNT_W{1'b0}};
            tick      <= 1'b1;
        end else begin
            prescaler <= prescaler + 1'b1;
            tick      <= 1'b0;
        end
    end

    // Shift register pattern on LEDs
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)
            led <= 8'b0000_0001;
        else if (tick)
            led <= {led[6:0], led[7]};
    end

endmodule
