// 8-Bit Counter with Async Reset
// Target: Lattice CertusPro-NX (LIFCL-40-7BG400I)

module counter (
    input  wire       clk,
    input  wire       rst,
    output reg  [7:0] count,
    output wire [7:0] led
);

    assign led = count;

    always @(posedge clk or posedge rst) begin
        if (rst)
            count <= 8'b0;
        else
            count <= count + 1'b1;
    end

endmodule
