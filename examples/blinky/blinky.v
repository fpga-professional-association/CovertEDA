// LED Blinker — CovertEDA Example Design
// Blinks an LED at approximately 1 Hz using a clock prescaler.
// Parameterizable for different clock frequencies.

module blinky #(
    parameter CLK_FREQ = 100_000_000  // Input clock frequency in Hz
) (
    input  wire clk,
    input  wire rst_n,
    output reg  led
);

    // Calculate counter width needed for 0.5 second toggle
    localparam HALF_SEC = CLK_FREQ / 2;
    localparam CTR_W    = $clog2(HALF_SEC + 1);

    reg [CTR_W-1:0] counter;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            counter <= 0;
            led     <= 1'b0;
        end else if (counter >= HALF_SEC - 1) begin
            counter <= 0;
            led     <= ~led;
        end else begin
            counter <= counter + 1'b1;
        end
    end

endmodule
