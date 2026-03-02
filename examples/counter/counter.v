// 8-bit Counter — CovertEDA Example Design
// Increments on every rising clock edge, drives 8 LEDs.
// Reset is active-low.

module counter (
    input  wire       clk,
    input  wire       rst_n,
    output reg  [7:0] led
);

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)
            led <= 8'b0;
        else
            led <= led + 1'b1;
    end

endmodule
