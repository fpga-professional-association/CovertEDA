import { ProjectTemplate } from "../types";

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    name: "Blinky LED",
    description: "Classic starter: toggle an LED at 1 Hz using a counter divider",
    category: "Basic",
    backendId: "radiant",
    device: "LIFCL-40-7BG400I",
    topModule: "blinky",
    files: [
      {
        name: "blinky.v",
        content: `module blinky (
    input  wire clk,
    input  wire rst_n,
    output reg  led
);

// Assuming 12 MHz oscillator
localparam CLK_FREQ = 12_000_000;
localparam HALF_SEC = CLK_FREQ / 2;

reg [23:0] counter;

always @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        counter <= 24'd0;
        led     <= 1'b0;
    end else if (counter == HALF_SEC - 1) begin
        counter <= 24'd0;
        led     <= ~led;
    end else begin
        counter <= counter + 1'b1;
    end
end

endmodule`,
      },
    ],
  },
  {
    name: "8-Bit Counter",
    description: "Simple 8-bit up counter with async reset and LED output",
    category: "Basic",
    backendId: "radiant",
    device: "LIFCL-40-7BG400I",
    topModule: "counter8",
    files: [
      {
        name: "counter8.v",
        content: `module counter8 (
    input  wire       clk,
    input  wire       rst_n,
    output reg  [7:0] count,
    output wire [7:0] led
);

assign led = count;

always @(posedge clk or negedge rst_n) begin
    if (!rst_n)
        count <= 8'd0;
    else
        count <= count + 1'b1;
end

endmodule`,
      },
    ],
  },
  {
    name: "PWM Generator",
    description: "Configurable-width PWM output with duty cycle control",
    category: "Basic",
    backendId: "radiant",
    device: "LIFCL-40-7BG400I",
    topModule: "pwm_gen",
    files: [
      {
        name: "pwm_gen.v",
        content: `module pwm_gen #(
    parameter WIDTH = 8
)(
    input  wire             clk,
    input  wire             rst_n,
    input  wire [WIDTH-1:0] duty,
    output reg              pwm_out
);

reg [WIDTH-1:0] counter;

always @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        counter <= 0;
        pwm_out <= 1'b0;
    end else begin
        counter <= counter + 1'b1;
        pwm_out <= (counter < duty) ? 1'b1 : 1'b0;
    end
end

endmodule`,
      },
    ],
  },
  {
    name: "UART Loopback",
    description: "UART RX/TX at configurable baud with loopback for testing",
    category: "Interface",
    backendId: "radiant",
    device: "LIFCL-40-7BG400I",
    topModule: "uart_loopback",
    files: [
      {
        name: "uart_loopback.v",
        content: `module uart_loopback #(
    parameter CLK_FREQ  = 12_000_000,
    parameter BAUD_RATE = 115200
)(
    input  wire clk,
    input  wire rst_n,
    input  wire rx,
    output wire tx
);

localparam BAUD_DIV = CLK_FREQ / BAUD_RATE;

// RX state machine
reg [3:0]  rx_bit_cnt;
reg [15:0] rx_clk_cnt;
reg [7:0]  rx_shift;
reg [7:0]  rx_data;
reg        rx_busy, rx_done;

always @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        rx_busy    <= 0;
        rx_done    <= 0;
        rx_bit_cnt <= 0;
        rx_clk_cnt <= 0;
    end else if (!rx_busy && !rx) begin
        rx_busy    <= 1;
        rx_clk_cnt <= BAUD_DIV / 2;
        rx_bit_cnt <= 0;
        rx_done    <= 0;
    end else if (rx_busy) begin
        if (rx_clk_cnt == 0) begin
            rx_clk_cnt <= BAUD_DIV - 1;
            if (rx_bit_cnt == 8) begin
                rx_busy <= 0;
                rx_done <= 1;
                rx_data <= rx_shift;
            end else begin
                rx_shift <= {rx, rx_shift[7:1]};
                rx_bit_cnt <= rx_bit_cnt + 1;
            end
        end else begin
            rx_clk_cnt <= rx_clk_cnt - 1;
        end
    end else begin
        rx_done <= 0;
    end
end

// TX state machine — loopback
reg [3:0]  tx_bit_cnt;
reg [15:0] tx_clk_cnt;
reg [9:0]  tx_shift;
reg        tx_busy;

assign tx = tx_busy ? tx_shift[0] : 1'b1;

always @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        tx_busy    <= 0;
        tx_bit_cnt <= 0;
        tx_clk_cnt <= 0;
    end else if (!tx_busy && rx_done) begin
        tx_busy    <= 1;
        tx_shift   <= {1'b1, rx_data, 1'b0};
        tx_bit_cnt <= 0;
        tx_clk_cnt <= BAUD_DIV - 1;
    end else if (tx_busy) begin
        if (tx_clk_cnt == 0) begin
            tx_clk_cnt <= BAUD_DIV - 1;
            if (tx_bit_cnt == 9) begin
                tx_busy <= 0;
            end else begin
                tx_shift   <= {1'b1, tx_shift[9:1]};
                tx_bit_cnt <= tx_bit_cnt + 1;
            end
        end else begin
            tx_clk_cnt <= tx_clk_cnt - 1;
        end
    end
end

endmodule`,
      },
    ],
  },
  {
    name: "SPI Controller",
    description: "SPI master with configurable clock divider and CPOL/CPHA",
    category: "Interface",
    backendId: "radiant",
    device: "LIFCL-40-7BG400I",
    topModule: "spi_master",
    files: [
      {
        name: "spi_master.v",
        content: `module spi_master #(
    parameter CLK_DIV = 4
)(
    input  wire       clk,
    input  wire       rst_n,
    input  wire       start,
    input  wire [7:0] tx_data,
    output reg  [7:0] rx_data,
    output reg        done,
    output wire       sclk,
    output wire       mosi,
    input  wire       miso,
    output reg        cs_n
);

reg [7:0] clk_cnt;
reg [3:0] bit_cnt;
reg [7:0] shift_out;
reg [7:0] shift_in;
reg       running;
reg       sclk_reg;

assign sclk = sclk_reg;
assign mosi = shift_out[7];

always @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        running   <= 0;
        done      <= 0;
        cs_n      <= 1;
        sclk_reg  <= 0;
        clk_cnt   <= 0;
        bit_cnt   <= 0;
    end else if (!running && start) begin
        running   <= 1;
        done      <= 0;
        cs_n      <= 0;
        shift_out <= tx_data;
        bit_cnt   <= 0;
        clk_cnt   <= 0;
        sclk_reg  <= 0;
    end else if (running) begin
        if (clk_cnt == CLK_DIV - 1) begin
            clk_cnt  <= 0;
            sclk_reg <= ~sclk_reg;
            if (sclk_reg) begin
                shift_in  <= {shift_in[6:0], miso};
                shift_out <= {shift_out[6:0], 1'b0};
                if (bit_cnt == 7) begin
                    running <= 0;
                    done    <= 1;
                    cs_n    <= 1;
                    rx_data <= {shift_in[6:0], miso};
                end else begin
                    bit_cnt <= bit_cnt + 1;
                end
            end
        end else begin
            clk_cnt <= clk_cnt + 1;
        end
    end else begin
        done <= 0;
    end
end

endmodule`,
      },
    ],
  },
  {
    name: "FIR Filter (4-tap)",
    description: "Simple 4-tap FIR filter with configurable coefficients",
    category: "DSP",
    backendId: "radiant",
    device: "LIFCL-40-7BG400I",
    topModule: "fir4",
    files: [
      {
        name: "fir4.v",
        content: `module fir4 #(
    parameter DW = 16,
    parameter CW = 16
)(
    input  wire                clk,
    input  wire                rst_n,
    input  wire signed [DW-1:0] din,
    input  wire                din_valid,
    output reg  signed [DW+CW:0] dout,
    output reg                 dout_valid
);

// Fixed coefficients (symmetric low-pass)
wire signed [CW-1:0] coeff [0:3];
assign coeff[0] = 16'sd1024;
assign coeff[1] = 16'sd3072;
assign coeff[2] = 16'sd3072;
assign coeff[3] = 16'sd1024;

reg signed [DW-1:0] delay [0:3];
integer i;

always @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        for (i = 0; i < 4; i = i + 1)
            delay[i] <= 0;
        dout       <= 0;
        dout_valid <= 0;
    end else if (din_valid) begin
        delay[0] <= din;
        for (i = 1; i < 4; i = i + 1)
            delay[i] <= delay[i-1];
        dout <= delay[0] * coeff[0]
              + delay[1] * coeff[1]
              + delay[2] * coeff[2]
              + delay[3] * coeff[3];
        dout_valid <= 1;
    end else begin
        dout_valid <= 0;
    end
end

endmodule`,
      },
    ],
  },
  {
    name: "Dual-Port RAM",
    description: "Inferred true dual-port RAM with independent read/write",
    category: "Memory",
    backendId: "radiant",
    device: "LIFCL-40-7BG400I",
    topModule: "dp_ram",
    files: [
      {
        name: "dp_ram.v",
        content: `module dp_ram #(
    parameter DW    = 8,
    parameter DEPTH = 1024,
    parameter AW    = $clog2(DEPTH)
)(
    // Port A
    input  wire          clk_a,
    input  wire          we_a,
    input  wire [AW-1:0] addr_a,
    input  wire [DW-1:0] din_a,
    output reg  [DW-1:0] dout_a,
    // Port B
    input  wire          clk_b,
    input  wire          we_b,
    input  wire [AW-1:0] addr_b,
    input  wire [DW-1:0] din_b,
    output reg  [DW-1:0] dout_b
);

reg [DW-1:0] mem [0:DEPTH-1];

// Port A
always @(posedge clk_a) begin
    if (we_a)
        mem[addr_a] <= din_a;
    dout_a <= mem[addr_a];
end

// Port B
always @(posedge clk_b) begin
    if (we_b)
        mem[addr_b] <= din_b;
    dout_b <= mem[addr_b];
end

endmodule`,
      },
    ],
  },
  {
    name: "Quartus Blinky",
    description: "LED blinker for Intel FPGA boards (Cyclone 10 GX)",
    category: "Basic",
    backendId: "quartus",
    device: "10CX220YF780I5G",
    topModule: "blinky",
    files: [
      {
        name: "blinky.v",
        content: `module blinky (
    input  wire clk,
    input  wire rst_n,
    output reg  led
);

// Assuming 50 MHz oscillator
localparam CLK_FREQ = 50_000_000;
localparam HALF_SEC = CLK_FREQ / 2;

reg [25:0] counter;

always @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        counter <= 26'd0;
        led     <= 1'b0;
    end else if (counter == HALF_SEC - 1) begin
        counter <= 26'd0;
        led     <= ~led;
    end else begin
        counter <= counter + 1'b1;
    end
end

endmodule`,
      },
    ],
  },
];

export const TEMPLATE_CATEGORIES = ["Basic", "Interface", "DSP", "Memory", "SoC"] as const;
