// UART Transmitter — CovertEDA Example Design
// 8N1 serial transmitter with configurable baud rate.
// Sends a repeating "Hello\r\n" message.

module uart_tx #(
    parameter CLK_FREQ  = 100_000_000,
    parameter BAUD_RATE = 115200
) (
    input  wire clk,
    input  wire rst_n,
    output reg  tx
);

    // Baud rate generator
    localparam BAUD_DIV = CLK_FREQ / BAUD_RATE;
    localparam DIV_W    = $clog2(BAUD_DIV + 1);

    reg [DIV_W-1:0] baud_ctr;
    reg              baud_tick;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            baud_ctr  <= 0;
            baud_tick <= 1'b0;
        end else if (baud_ctr >= BAUD_DIV - 1) begin
            baud_ctr  <= 0;
            baud_tick <= 1'b1;
        end else begin
            baud_ctr  <= baud_ctr + 1'b1;
            baud_tick <= 1'b0;
        end
    end

    // Transmit state machine
    localparam IDLE  = 2'd0;
    localparam START = 2'd1;
    localparam DATA  = 2'd2;
    localparam STOP  = 2'd3;

    reg [1:0]  state;
    reg [2:0]  bit_idx;
    reg [7:0]  tx_data;

    // Message: "Hello\r\n"
    reg [2:0]  msg_idx;
    wire [7:0] message [0:6];
    assign message[0] = 8'h48;  // H
    assign message[1] = 8'h65;  // e
    assign message[2] = 8'h6C;  // l
    assign message[3] = 8'h6C;  // l
    assign message[4] = 8'h6F;  // o
    assign message[5] = 8'h0D;  // \r
    assign message[6] = 8'h0A;  // \n

    // Inter-message delay
    localparam DELAY_TICKS = CLK_FREQ / 2;  // 0.5 sec between messages
    localparam DELAY_W     = $clog2(DELAY_TICKS + 1);
    reg [DELAY_W-1:0] delay_ctr;
    reg                delaying;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state     <= IDLE;
            bit_idx   <= 0;
            tx_data   <= 8'hFF;
            tx        <= 1'b1;
            msg_idx   <= 0;
            delay_ctr <= 0;
            delaying  <= 1'b0;
        end else begin
            case (state)
                IDLE: begin
                    tx <= 1'b1;
                    if (delaying) begin
                        if (delay_ctr >= DELAY_TICKS - 1) begin
                            delaying  <= 1'b0;
                            delay_ctr <= 0;
                        end else begin
                            delay_ctr <= delay_ctr + 1'b1;
                        end
                    end else begin
                        tx_data <= message[msg_idx];
                        state   <= START;
                    end
                end

                START: begin
                    if (baud_tick) begin
                        tx      <= 1'b0;  // Start bit
                        bit_idx <= 0;
                        state   <= DATA;
                    end
                end

                DATA: begin
                    if (baud_tick) begin
                        tx <= tx_data[bit_idx];
                        if (bit_idx == 7)
                            state <= STOP;
                        else
                            bit_idx <= bit_idx + 1'b1;
                    end
                end

                STOP: begin
                    if (baud_tick) begin
                        tx    <= 1'b1;  // Stop bit
                        state <= IDLE;
                        if (msg_idx >= 6) begin
                            msg_idx  <= 0;
                            delaying <= 1'b1;
                        end else begin
                            msg_idx <= msg_idx + 1'b1;
                        end
                    end
                end
            endcase
        end
    end

endmodule
