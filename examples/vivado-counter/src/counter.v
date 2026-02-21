// 8-Bit Counter with Sync Reset
// Target: AMD/Xilinx Artix-7 (xc7a100tcsg324-1)

module counter (
    input  wire       clk,
    input  wire       rst,
    output reg  [7:0] count,
    output wire [7:0] led
);

    assign led = count;

    always @(posedge clk) begin
        if (rst)
            count <= 8'b0;
        else
            count <= count + 1'b1;
    end

endmodule
