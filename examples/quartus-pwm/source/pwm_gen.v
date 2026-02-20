// PWM Generator — Counter-based with adjustable duty cycle
// Target: Intel Cyclone V (5CSEMA5F31C6)

module pwm_gen #(
    parameter N = 8   // counter bit-width (PWM resolution)
)(
    input  wire         clk,
    input  wire         rst_n,
    input  wire [N-1:0] duty_cycle,
    output reg          pwm_out
);

    reg [N-1:0] counter;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)
            counter <= {N{1'b0}};
        else
            counter <= counter + 1'b1;
    end

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)
            pwm_out <= 1'b0;
        else
            pwm_out <= (counter < duty_cycle) ? 1'b1 : 1'b0;
    end

endmodule
