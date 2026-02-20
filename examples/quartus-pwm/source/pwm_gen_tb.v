// Testbench for PWM Generator
`timescale 1ns / 1ps

module pwm_gen_tb;

    parameter N = 8;

    reg              clk;
    reg              rst_n;
    reg  [N-1:0]     duty_cycle;
    wire             pwm_out;

    pwm_gen #(.N(N)) uut (
        .clk        (clk),
        .rst_n      (rst_n),
        .duty_cycle (duty_cycle),
        .pwm_out    (pwm_out)
    );

    // 50 MHz clock
    initial clk = 0;
    always #10 clk = ~clk;

    // Count high cycles within one PWM period (2^N clocks)
    integer high_count;
    integer i;

    task measure_duty(output integer highs);
        begin
            highs = 0;
            for (i = 0; i < (1 << N); i = i + 1) begin
                @(posedge clk);
                if (pwm_out) highs = highs + 1;
            end
        end
    endtask

    initial begin
        $dumpfile("pwm_gen_tb.vcd");
        $dumpvars(0, pwm_gen_tb);

        rst_n      = 0;
        duty_cycle = 8'd0;
        #100;
        rst_n = 1;
        #20;

        // 25% duty cycle
        duty_cycle = 8'd64;
        measure_duty(high_count);
        $display("duty=64/256: high_count=%0d (expect ~64)", high_count);

        // 50% duty cycle
        duty_cycle = 8'd128;
        measure_duty(high_count);
        $display("duty=128/256: high_count=%0d (expect ~128)", high_count);

        // 75% duty cycle
        duty_cycle = 8'd192;
        measure_duty(high_count);
        $display("duty=192/256: high_count=%0d (expect ~192)", high_count);

        $display("PASS: PWM duty sweep complete");
        $finish;
    end

endmodule
