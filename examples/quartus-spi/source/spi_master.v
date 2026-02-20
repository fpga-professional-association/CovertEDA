// SPI Master Controller — Mode 0 (CPOL=0, CPHA=0)
// Target: Intel Cyclone V (5CSEMA5F31C6)

module spi_master #(
    parameter CLK_DIV = 4   // SCLK = clk / (2 * CLK_DIV)
)(
    input  wire       clk,
    input  wire       rst_n,
    // Control
    input  wire       start,
    input  wire [7:0] tx_data,
    output reg  [7:0] rx_data,
    output reg        done,
    output reg        busy,
    // SPI bus
    output reg        sclk,
    output reg        mosi,
    input  wire       miso,
    output reg        cs_n
);

    localparam IDLE     = 2'd0;
    localparam TRANSFER = 2'd1;
    localparam DONE_ST  = 2'd2;

    reg [1:0]  state;
    reg [7:0]  shift_out;
    reg [7:0]  shift_in;
    reg [2:0]  bit_cnt;
    reg [15:0] clk_cnt;
    reg        sclk_phase; // 0 = driving edge, 1 = sampling edge

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state     <= IDLE;
            sclk      <= 1'b0;
            mosi      <= 1'b0;
            cs_n      <= 1'b1;
            done      <= 1'b0;
            busy      <= 1'b0;
            rx_data   <= 8'd0;
            shift_out <= 8'd0;
            shift_in  <= 8'd0;
            bit_cnt   <= 3'd0;
            clk_cnt   <= 16'd0;
            sclk_phase <= 1'b0;
        end else begin
            done <= 1'b0;

            case (state)
                IDLE: begin
                    sclk <= 1'b0;
                    cs_n <= 1'b1;
                    busy <= 1'b0;
                    if (start) begin
                        shift_out  <= tx_data;
                        shift_in   <= 8'd0;
                        bit_cnt    <= 3'd0;
                        clk_cnt    <= 16'd0;
                        sclk_phase <= 1'b0;
                        cs_n       <= 1'b0;
                        busy       <= 1'b1;
                        mosi       <= tx_data[7]; // MSB first
                        state      <= TRANSFER;
                    end
                end

                TRANSFER: begin
                    if (clk_cnt == CLK_DIV - 1) begin
                        clk_cnt <= 16'd0;
                        if (!sclk_phase) begin
                            // Rising edge of SCLK — sample MISO
                            sclk       <= 1'b1;
                            sclk_phase <= 1'b1;
                            shift_in   <= {shift_in[6:0], miso};
                        end else begin
                            // Falling edge of SCLK — drive MOSI
                            sclk       <= 1'b0;
                            sclk_phase <= 1'b0;
                            if (bit_cnt == 3'd7) begin
                                state <= DONE_ST;
                            end else begin
                                bit_cnt   <= bit_cnt + 1'b1;
                                shift_out <= {shift_out[6:0], 1'b0};
                                mosi      <= shift_out[6];
                            end
                        end
                    end else begin
                        clk_cnt <= clk_cnt + 1'b1;
                    end
                end

                DONE_ST: begin
                    cs_n    <= 1'b1;
                    sclk    <= 1'b0;
                    rx_data <= shift_in;
                    done    <= 1'b1;
                    state   <= IDLE;
                end
            endcase
        end
    end

endmodule
