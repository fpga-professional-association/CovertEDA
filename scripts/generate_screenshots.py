#!/usr/bin/env python3
"""Generate professional screenshots of CovertEDA UI using Pillow."""

from PIL import Image, ImageDraw, ImageFont
import os

OUT = "/sessions/dreamy-sharp-gauss/CovertEDA/docs/screenshots"
os.makedirs(OUT, exist_ok=True)

W, H = 1400, 900

# Colors (dark theme)
BG_DARKEST = (10, 10, 15)
BG_PANEL = (18, 18, 26)
BG_CARD = (26, 26, 46)
BG_SIDEBAR = (14, 14, 22)
BG_HEADER = (16, 16, 28)
TEXT_PRIMARY = (224, 224, 224)
TEXT_SECONDARY = (136, 136, 136)
TEXT_DIM = (80, 80, 100)
ACCENT = (0, 212, 255)
GREEN = (0, 255, 136)
YELLOW = (255, 170, 0)
RED = (255, 68, 68)
BORDER = (42, 42, 62)
BLUE = (60, 120, 255)

try:
    FONT = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 13)
    FONT_SM = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 11)
    FONT_LG = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 16)
    FONT_XL = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 22)
    FONT_TITLE = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 28)
    FONT_HEADING = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 16)
    FONT_BTN = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 13)
except:
    FONT = ImageFont.load_default()
    FONT_SM = FONT
    FONT_LG = FONT
    FONT_XL = FONT
    FONT_TITLE = FONT
    FONT_HEADING = FONT
    FONT_BTN = FONT


def rounded_rect(draw, xy, fill, radius=6, outline=None):
    x0, y0, x1, y1 = xy
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline)


def draw_sidebar(draw, active_idx=0):
    """Draw left sidebar with nav icons."""
    draw.rectangle([0, 0, 50, H], fill=BG_SIDEBAR)
    icons = ["▶", "📊", "⌨", "📌", "⚡", "📜", "🔧", "💾", "🔬", "📚", "🤖"]
    labels = ["Build", "Reports", "Console", "Pins", "Power", "History", "IP", "Git", "Debug", "Docs", "AI"]
    for i, (icon, label) in enumerate(zip(icons, labels)):
        y = 60 + i * 48
        if i == active_idx:
            draw.rectangle([0, y-2, 50, y+38], fill=(30, 30, 55))
            draw.rectangle([0, y-2, 3, y+38], fill=ACCENT)
        draw.text((18, y+8), icon[0] if len(icon) > 1 else icon, fill=ACCENT if i == active_idx else TEXT_SECONDARY, font=FONT)


def draw_topbar(draw, title="CovertEDA", subtitle=""):
    """Draw top bar."""
    draw.rectangle([0, 0, W, 40], fill=BG_HEADER)
    draw.line([0, 40, W, 40], fill=BORDER)
    draw.text((60, 10), f"CovertEDA  |  {title}", fill=TEXT_PRIMARY, font=FONT_LG)
    if subtitle:
        draw.text((W-300, 14), subtitle, fill=TEXT_SECONDARY, font=FONT_SM)


def draw_status_pill(draw, x, y, text, color):
    """Draw a status pill/badge."""
    tw = len(text) * 8 + 16
    rounded_rect(draw, [x, y, x+tw, y+22], fill=(*color, 30) if len(color) == 3 else color, radius=11)
    draw.text((x+8, y+4), text, fill=color, font=FONT_SM)
    return tw


# ─── 1. Start Screen ───
def create_start_screen():
    img = Image.new("RGB", (W, H), BG_DARKEST)
    draw = ImageDraw.Draw(img)

    # Header
    draw.rectangle([0, 0, W, 50], fill=BG_HEADER)
    draw.text((30, 12), "CovertEDA", fill=ACCENT, font=FONT_TITLE)
    draw.text((250, 22), "v0.4.0  |  FPGA Development Environment", fill=TEXT_SECONDARY, font=FONT)

    # Left panel - Recent Projects
    rounded_rect(draw, [30, 70, 480, 500], fill=BG_PANEL, radius=8, outline=BORDER)
    draw.text((50, 85), "Recent Projects", fill=TEXT_PRIMARY, font=FONT_HEADING)
    draw.line([50, 110, 460, 110], fill=BORDER)

    projects = [
        ("uart_controller", "Radiant 2024.1", "LIFCL-40", "2 hours ago", GREEN),
        ("pcie_bridge", "Vivado 2024.1", "XC7A200T", "Yesterday", ACCENT),
        ("ddr3_interface", "Quartus 23.1", "EP4CE115", "3 days ago", YELLOW),
        ("spi_flash_ctrl", "Diamond 3.13", "LFE5U-85F", "1 week ago", TEXT_SECONDARY),
        ("zynq_base_system", "Libero 2024.1", "PolarFire", "2 weeks ago", TEXT_SECONDARY),
    ]
    for i, (name, tool, device, time, color) in enumerate(projects):
        y = 125 + i * 72
        rounded_rect(draw, [45, y, 465, y+60], fill=BG_CARD, radius=6)
        draw.text((60, y+8), name, fill=TEXT_PRIMARY, font=FONT_LG)
        draw.text((60, y+32), f"{tool}  •  {device}", fill=TEXT_SECONDARY, font=FONT_SM)
        draw.text((350, y+32), time, fill=TEXT_DIM, font=FONT_SM)
        draw.ellipse([60-10, y+12, 60-4, y+18], fill=color)

    # Right panel - Backend Detection
    rounded_rect(draw, [510, 70, 1370, 340], fill=BG_PANEL, radius=8, outline=BORDER)
    draw.text((530, 85), "Detected Toolchains", fill=TEXT_PRIMARY, font=FONT_HEADING)
    draw.line([530, 110, 1350, 110], fill=BORDER)

    tools = [
        ("Lattice Radiant", "2024.1", True, "/opt/lscc/radiant/2024.1"),
        ("Lattice Diamond", "3.13", True, "/opt/lscc/diamond/3.13"),
        ("Intel Quartus", "23.1 Pro", True, "/opt/intelFPGA/23.1"),
        ("AMD Vivado", "2024.1", True, "/tools/Xilinx/Vivado/2024.1"),
        ("Microchip Libero", "2024.1", True, "/opt/microsemi/Libero"),
        ("Achronix ACE", "9.2", True, "/opt/achronix/ace/9.2"),
        ("OSS (yosys+nextpnr)", "0.42+0.7", True, "/usr/local/bin"),
    ]
    for i, (name, ver, found, path) in enumerate(tools):
        y = 120 + i * 30
        color = GREEN if found else RED
        draw.text((530, y), "●", fill=color, font=FONT)
        draw.text((550, y), name, fill=TEXT_PRIMARY, font=FONT)
        draw.text((750, y), f"v{ver}", fill=ACCENT, font=FONT)
        draw.text((850, y), path, fill=TEXT_DIM, font=FONT_SM)

    # Buttons
    rounded_rect(draw, [510, 360, 680, 400], fill=ACCENT, radius=6)
    draw.text((545, 370), "New Project", fill=BG_DARKEST, font=FONT_BTN)
    rounded_rect(draw, [700, 360, 870, 400], fill=BG_CARD, radius=6, outline=ACCENT)
    draw.text((730, 370), "Open Project", fill=ACCENT, font=FONT_BTN)

    # System Status panel
    rounded_rect(draw, [510, 430, 1370, 600], fill=BG_PANEL, radius=8, outline=BORDER)
    draw.text((530, 445), "System Status", fill=TEXT_PRIMARY, font=FONT_HEADING)
    draw.line([530, 470, 1350, 470], fill=BORDER)
    stats = [
        ("License Server", "node-locked (valid)", GREEN),
        ("Git", "v2.43.0 - configured", GREEN),
        ("SSH Remote Build", "Not configured", YELLOW),
        ("AI Assistant", "Claude API - connected", GREEN),
    ]
    for i, (label, val, color) in enumerate(stats):
        y = 485 + i * 28
        draw.text((530, y), label + ":", fill=TEXT_SECONDARY, font=FONT)
        draw.text((750, y), val, fill=color, font=FONT)

    # Footer
    draw.rectangle([0, H-30, W, H], fill=BG_HEADER)
    draw.text((30, H-22), "Ready  |  7 backends detected  |  All licenses valid", fill=GREEN, font=FONT_SM)

    img.save(f"{OUT}/01_start_screen.png")
    print("  ✓ Start screen")


# ─── 2. Build Pipeline ───
def create_build_pipeline():
    img = Image.new("RGB", (W, H), BG_DARKEST)
    draw = ImageDraw.Draw(img)
    draw_topbar(draw, "Build Pipeline", "uart_controller  •  Radiant 2024.1")
    draw_sidebar(draw, active_idx=0)

    # Pipeline stages
    stages = [
        ("Synthesis", "LSE", GREEN, "✓ 2.3s"),
        ("Map", "Mapper", GREEN, "✓ 1.8s"),
        ("Place & Route", "PAR", YELLOW, "● 42%"),
        ("Bitstream", "BitGen", TEXT_DIM, "Pending"),
        ("Timing", "Analysis", TEXT_DIM, "Pending"),
    ]

    # Draw pipeline flow
    for i, (name, engine, color, status) in enumerate(stages):
        x = 80 + i * 260
        y = 60
        rounded_rect(draw, [x, y, x+240, y+90], fill=BG_CARD, radius=8, outline=color if color != TEXT_DIM else BORDER)
        draw.text((x+15, y+10), name, fill=TEXT_PRIMARY, font=FONT_HEADING)
        draw.text((x+15, y+35), f"Engine: {engine}", fill=TEXT_SECONDARY, font=FONT_SM)
        draw.text((x+15, y+55), status, fill=color, font=FONT)
        if i < len(stages) - 1:
            draw.text((x+248, y+35), "→", fill=ACCENT, font=FONT_LG)

    # Progress bar
    draw.rectangle([80, 165, 1350, 175], fill=BG_CARD)
    draw.rectangle([80, 165, 80 + int(1270 * 0.52), 175], fill=ACCENT)
    draw.text((80, 180), "Overall: 52%  •  Elapsed: 4.1s  •  ETA: ~3.8s", fill=TEXT_SECONDARY, font=FONT_SM)

    # Stage configuration panel
    rounded_rect(draw, [80, 210, 650, 550], fill=BG_PANEL, radius=8, outline=BORDER)
    draw.text((100, 225), "Place & Route Configuration", fill=TEXT_PRIMARY, font=FONT_HEADING)
    draw.line([100, 250, 630, 250], fill=BORDER)

    config = [
        ("PAR Effort", "High"),
        ("Timing Driven", "On"),
        ("Max Iterations", "10"),
        ("Placement Seed", "1"),
        ("Router Effort", "Level 5"),
        ("Multi-Pass", "3 passes"),
        ("Block Placement", "Timing-Driven"),
    ]
    for i, (key, val) in enumerate(config):
        y = 265 + i * 35
        draw.text((100, y), key, fill=TEXT_SECONDARY, font=FONT)
        rounded_rect(draw, [350, y-2, 630, y+22], fill=BG_CARD, radius=4)
        draw.text((360, y), val, fill=ACCENT, font=FONT)

    # Build log
    rounded_rect(draw, [670, 210, 1350, 550], fill=BG_PANEL, radius=8, outline=BORDER)
    draw.text((690, 225), "Build Log", fill=TEXT_PRIMARY, font=FONT_HEADING)
    draw.line([690, 250, 1330, 250], fill=BORDER)

    logs = [
        ("[INFO]  Starting synthesis with LSE engine...", ACCENT),
        ("[INFO]  Parsing design files: uart_top.v, uart_rx.v, uart_tx.v", TEXT_SECONDARY),
        ("[OK]    Synthesis completed in 2.3s - 1,247 LUTs inferred", GREEN),
        ("[INFO]  Starting technology mapping...", ACCENT),
        ("[WARN]  Clock domain crossing detected: clk_uart -> clk_sys", YELLOW),
        ("[OK]    Map completed in 1.8s - 1,189 LUTs mapped", GREEN),
        ("[INFO]  Starting Place & Route...", ACCENT),
        ("[INFO]  Placement phase 1/3: Global placement...", TEXT_SECONDARY),
        ("[INFO]  Placement phase 2/3: Detailed placement...", TEXT_SECONDARY),
        ("[INFO]  Routing phase: 42% nets routed...", ACCENT),
    ]
    for i, (line, color) in enumerate(logs):
        y = 260 + i * 26
        draw.text((690, y), line[:80], fill=color, font=FONT_SM)

    # Bottom controls
    rounded_rect(draw, [80, 570, 200, 610], fill=RED, radius=6)
    draw.text((105, 580), "Cancel Build", fill=TEXT_PRIMARY, font=FONT_SM)
    rounded_rect(draw, [220, 570, 380, 610], fill=BG_CARD, radius=6, outline=BORDER)
    draw.text((245, 580), "View Full Log", fill=TEXT_SECONDARY, font=FONT_SM)

    # Footer
    draw.rectangle([0, H-30, W, H], fill=BG_HEADER)
    draw.text((60, H-22), "Building...  Place & Route in progress  •  42% complete", fill=YELLOW, font=FONT_SM)

    img.save(f"{OUT}/02_build_pipeline.png")
    print("  ✓ Build pipeline")


# ─── 3. Reports - Timing ───
def create_reports_timing():
    img = Image.new("RGB", (W, H), BG_DARKEST)
    draw = ImageDraw.Draw(img)
    draw_topbar(draw, "Timing Report", "uart_controller  •  Post-PAR")
    draw_sidebar(draw, active_idx=1)

    # Tab bar
    tabs = ["Timing", "Utilization", "Power", "DRC", "I/O"]
    for i, tab in enumerate(tabs):
        x = 70 + i * 130
        color = ACCENT if i == 0 else TEXT_SECONDARY
        draw.text((x+20, 52), tab, fill=color, font=FONT)
        if i == 0:
            draw.line([x+10, 70, x+110, 70], fill=ACCENT, width=2)
    draw.line([70, 72, 1370, 72], fill=BORDER)

    # KPI Cards
    kpis = [
        ("Fmax", "125.4 MHz", "100% of target", GREEN),
        ("WNS", "+1.87 ns", "Timing met", GREEN),
        ("TNS", "+0.00 ns", "No violations", GREEN),
        ("Hold Slack", "+0.42 ns", "Met", GREEN),
    ]
    for i, (label, value, detail, color) in enumerate(kpis):
        x = 70 + i * 320
        rounded_rect(draw, [x, 85, x+300, 170], fill=BG_PANEL, radius=8, outline=BORDER)
        draw.text((x+15, 95), label, fill=TEXT_SECONDARY, font=FONT_SM)
        draw.text((x+15, 115), value, fill=color, font=FONT_XL)
        draw.text((x+15, 145), detail, fill=color, font=FONT_SM)

    # Fmax gauge (simplified circle)
    cx, cy, r = 200, 290, 70
    # Draw arc background
    for angle in range(0, 360, 2):
        import math
        rad = math.radians(angle - 90)
        x1 = int(cx + (r-5) * math.cos(rad))
        y1 = int(cy + (r-5) * math.sin(rad))
        x2 = int(cx + r * math.cos(rad))
        y2 = int(cy + r * math.sin(rad))
        color_arc = GREEN if angle < 360 else BG_CARD
        draw.line([x1, y1, x2, y2], fill=color_arc, width=2)
    draw.text((cx-40, cy-10), "125.4", fill=GREEN, font=FONT_XL)
    draw.text((cx-18, cy+18), "MHz", fill=TEXT_SECONDARY, font=FONT_SM)
    draw.text((cx-55, cy+50), "Target: 125.0 MHz", fill=TEXT_DIM, font=FONT_SM)

    # Clock domains
    rounded_rect(draw, [320, 195, 700, 380], fill=BG_PANEL, radius=8, outline=BORDER)
    draw.text((340, 210), "Clock Domains", fill=TEXT_PRIMARY, font=FONT_HEADING)
    draw.line([340, 235, 680, 235], fill=BORDER)
    domains = [
        ("sys_clk", "125.0 MHz", "8.0 ns", GREEN),
        ("uart_clk", "115.2 KHz", "8680 ns", GREEN),
        ("spi_clk", "50.0 MHz", "20.0 ns", GREEN),
    ]
    for i, (name, freq, period, color) in enumerate(domains):
        y = 245 + i * 40
        draw.text((340, y), name, fill=TEXT_PRIMARY, font=FONT)
        draw.text((500, y), freq, fill=ACCENT, font=FONT)
        draw.text((620, y), period, fill=TEXT_SECONDARY, font=FONT_SM)

    # Critical paths table
    rounded_rect(draw, [70, 400, 1370, 860], fill=BG_PANEL, radius=8, outline=BORDER)
    draw.text((90, 415), "Critical Paths", fill=TEXT_PRIMARY, font=FONT_HEADING)
    draw.line([90, 440, 1350, 440], fill=BORDER)

    # Table header
    headers = [("Path", 90), ("Source", 280), ("Destination", 550), ("Slack", 820), ("Delay", 920), ("Clock", 1020), ("Status", 1200)]
    for name, x in headers:
        draw.text((x, 448), name, fill=TEXT_SECONDARY, font=FONT_SM)
    draw.line([90, 468, 1350, 468], fill=BORDER)

    paths = [
        ("1", "uart_rx/bit_cnt[3]", "uart_rx/data_reg[7]", "+1.87", "6.13ns", "sys_clk", "MET"),
        ("2", "spi_ctrl/state[1]", "spi_ctrl/mosi_reg", "+2.01", "5.99ns", "sys_clk", "MET"),
        ("3", "fifo/wr_ptr[4]", "fifo/mem[15][7]", "+2.15", "5.85ns", "sys_clk", "MET"),
        ("4", "clk_div/counter[7]", "clk_div/clk_out", "+2.34", "5.66ns", "sys_clk", "MET"),
        ("5", "uart_tx/shift_reg[0]", "uart_tx/tx_out", "+2.89", "5.11ns", "sys_clk", "MET"),
        ("6", "ctrl/state_reg[2]", "ctrl/addr_out[15]", "+3.12", "4.88ns", "sys_clk", "MET"),
        ("7", "baud_gen/count[12]", "baud_gen/tick", "+3.45", "4.55ns", "uart_clk", "MET"),
        ("8", "gpio/dir_reg[7]", "gpio/pad_out[7]", "+3.67", "4.33ns", "sys_clk", "MET"),
    ]
    for i, (num, src, dst, slack, delay, clk, status) in enumerate(paths):
        y = 478 + i * 46
        if i % 2 == 0:
            draw.rectangle([85, y-3, 1355, y+38], fill=(20, 20, 35))
        draw.text((90, y+5), num, fill=TEXT_DIM, font=FONT_SM)
        draw.text((280, y+5), src, fill=TEXT_PRIMARY, font=FONT_SM)
        draw.text((550, y+5), dst, fill=TEXT_PRIMARY, font=FONT_SM)
        draw.text((820, y+5), slack, fill=GREEN, font=FONT)
        draw.text((920, y+5), delay, fill=ACCENT, font=FONT_SM)
        draw.text((1020, y+5), clk, fill=TEXT_SECONDARY, font=FONT_SM)
        draw.text((1200, y+5), status, fill=GREEN, font=FONT_SM)

    # Footer
    draw.rectangle([0, H-30, W, H], fill=BG_HEADER)
    draw.text((60, H-22), "Timing Analysis Complete  •  All constraints met  •  0 violations", fill=GREEN, font=FONT_SM)

    img.save(f"{OUT}/03_reports_timing.png")
    print("  ✓ Reports - Timing")


# ─── 4. Reports - Utilization ───
def create_reports_utilization():
    img = Image.new("RGB", (W, H), BG_DARKEST)
    draw = ImageDraw.Draw(img)
    draw_topbar(draw, "Utilization Report", "uart_controller  •  LIFCL-40")
    draw_sidebar(draw, active_idx=1)

    # Tab bar
    tabs = ["Timing", "Utilization", "Power", "DRC", "I/O"]
    for i, tab in enumerate(tabs):
        x = 70 + i * 130
        color = ACCENT if i == 1 else TEXT_SECONDARY
        draw.text((x+20, 52), tab, fill=color, font=FONT)
        if i == 1:
            draw.line([x+10, 70, x+110, 70], fill=ACCENT, width=2)
    draw.line([70, 72, 1370, 72], fill=BORDER)

    # Resource bars
    resources = [
        ("Logic LUTs", 0.614, 24560, 40000, ACCENT),
        ("Flip-Flops", 0.321, 12840, 40000, BLUE),
        ("Block RAM", 0.670, 67, 100, YELLOW),
        ("DSP Blocks", 0.125, 10, 80, GREEN),
        ("I/O Pins", 0.782, 250, 320, RED),
        ("Clock Mgmt", 0.250, 2, 8, ACCENT),
    ]

    for i, (name, pct, used, total, color) in enumerate(resources):
        y = 90 + i * 75
        draw.text((80, y), name, fill=TEXT_PRIMARY, font=FONT)
        draw.text((80, y+22), f"{used:,} / {total:,}", fill=TEXT_SECONDARY, font=FONT_SM)

        # Bar background
        bar_x = 280
        bar_w = 800
        draw.rectangle([bar_x, y+5, bar_x+bar_w, y+30], fill=BG_CARD)
        # Bar fill
        fill_w = int(bar_w * pct)
        draw.rectangle([bar_x, y+5, bar_x+fill_w, y+30], fill=color)
        # Percentage
        draw.text((bar_x+bar_w+15, y+8), f"{pct*100:.1f}%", fill=color, font=FONT)

        # Status
        status = "OK" if pct < 0.7 else ("HIGH" if pct < 0.85 else "CRITICAL")
        status_color = GREEN if pct < 0.7 else (YELLOW if pct < 0.85 else RED)
        draw.text((bar_x+bar_w+80, y+8), status, fill=status_color, font=FONT_SM)

    # Device summary card
    rounded_rect(draw, [80, 560, 500, 720], fill=BG_PANEL, radius=8, outline=BORDER)
    draw.text((100, 575), "Device Summary", fill=TEXT_PRIMARY, font=FONT_HEADING)
    draw.line([100, 600, 480, 600], fill=BORDER)
    info = [
        ("Device", "LIFCL-40-7BG400I"),
        ("Package", "caBGA-400"),
        ("Speed Grade", "-7 (fastest)"),
        ("Architecture", "Nexus (28nm FD-SOI)"),
    ]
    for i, (k, v) in enumerate(info):
        y = 615 + i * 25
        draw.text((100, y), k + ":", fill=TEXT_SECONDARY, font=FONT)
        draw.text((280, y), v, fill=TEXT_PRIMARY, font=FONT)

    # Module breakdown table
    rounded_rect(draw, [520, 560, 1370, 860], fill=BG_PANEL, radius=8, outline=BORDER)
    draw.text((540, 575), "Resource Breakdown by Module", fill=TEXT_PRIMARY, font=FONT_HEADING)
    draw.line([540, 600, 1350, 600], fill=BORDER)

    headers = [("Module", 540), ("LUTs", 780), ("FFs", 880), ("BRAM", 960), ("%Total", 1060)]
    for name, x in headers:
        draw.text((x, 610), name, fill=TEXT_SECONDARY, font=FONT_SM)

    modules = [
        ("uart_rx", "487", "256", "2", "3.8%"),
        ("uart_tx", "412", "198", "2", "3.2%"),
        ("spi_controller", "1,890", "1,024", "8", "14.7%"),
        ("fifo_32x8", "2,340", "2,048", "16", "18.2%"),
        ("clock_manager", "156", "64", "0", "1.2%"),
        ("gpio_controller", "890", "512", "4", "6.9%"),
        ("top_interconnect", "3,456", "1,890", "12", "26.8%"),
    ]
    for i, (mod, luts, ffs, bram, pct) in enumerate(modules):
        y = 635 + i * 30
        if i % 2 == 0:
            draw.rectangle([535, y-3, 1355, y+24], fill=(20, 20, 35))
        draw.text((540, y), mod, fill=TEXT_PRIMARY, font=FONT_SM)
        draw.text((780, y), luts, fill=ACCENT, font=FONT_SM)
        draw.text((880, y), ffs, fill=BLUE, font=FONT_SM)
        draw.text((960, y), bram, fill=YELLOW, font=FONT_SM)
        draw.text((1060, y), pct, fill=TEXT_SECONDARY, font=FONT_SM)

    # Footer
    draw.rectangle([0, H-30, W, H], fill=BG_HEADER)
    draw.text((60, H-22), "Device 52% utilized  •  I/O: 78% (consider larger package)", fill=YELLOW, font=FONT_SM)

    img.save(f"{OUT}/04_reports_utilization.png")
    print("  ✓ Reports - Utilization")


# ─── 5. Constraint Editor ───
def create_constraint_editor():
    img = Image.new("RGB", (W, H), BG_DARKEST)
    draw = ImageDraw.Draw(img)
    draw_topbar(draw, "Constraint Editor", "uart_controller.lpf")
    draw_sidebar(draw, active_idx=3)

    # Tab bar
    tabs = ["Pin Assignments", "Timing", "I/O Banks", "Package Browser"]
    for i, tab in enumerate(tabs):
        x = 70 + i * 180
        color = ACCENT if i == 0 else TEXT_SECONDARY
        draw.text((x+20, 52), tab, fill=color, font=FONT)
        if i == 0:
            draw.line([x+10, 70, x+140, 70], fill=ACCENT, width=2)
    draw.line([70, 72, 1370, 72], fill=BORDER)

    # Pin assignment table
    rounded_rect(draw, [70, 85, 1000, 850], fill=BG_PANEL, radius=8, outline=BORDER)
    draw.text((90, 100), "Pin Assignments", fill=TEXT_PRIMARY, font=FONT_HEADING)

    # Table header
    cols = [("Pin", 90), ("Net", 200), ("Dir", 400), ("I/O Standard", 490), ("Bank", 660), ("Drive", 730), ("🔒", 810)]
    for name, x in cols:
        draw.text((x, 130), name, fill=TEXT_SECONDARY, font=FONT_SM)
    draw.line([90, 150, 980, 150], fill=BORDER)

    pins = [
        ("A14", "clk_25mhz", "IN", "LVCMOS33", "0", "8mA", True),
        ("B15", "rst_n", "IN", "LVCMOS33", "0", "8mA", True),
        ("C12", "uart_tx", "OUT", "LVCMOS33", "1", "12mA", True),
        ("D11", "uart_rx", "IN", "LVCMOS33", "1", "8mA", True),
        ("E10", "spi_clk", "OUT", "LVCMOS33", "1", "12mA", False),
        ("F9", "spi_mosi", "OUT", "LVCMOS33", "1", "12mA", False),
        ("G8", "spi_miso", "IN", "LVCMOS33", "1", "8mA", False),
        ("H7", "spi_cs_n", "OUT", "LVCMOS33", "1", "12mA", False),
        ("J6", "i2c_sda", "BIDIR", "LVCMOS33", "2", "4mA", True),
        ("K5", "i2c_scl", "OUT", "LVCMOS33", "2", "4mA", True),
        ("L4", "led[0]", "OUT", "LVCMOS33", "3", "8mA", False),
        ("M3", "led[1]", "OUT", "LVCMOS33", "3", "8mA", False),
        ("N2", "led[2]", "OUT", "LVCMOS33", "3", "8mA", False),
        ("P1", "led[3]", "OUT", "LVCMOS33", "3", "8mA", False),
        ("R1", "gpio[0]", "BIDIR", "LVCMOS25", "4", "8mA", False),
        ("T2", "gpio[1]", "BIDIR", "LVCMOS25", "4", "8mA", False),
    ]
    for i, (pin, net, dir_, std, bank, drive, locked) in enumerate(pins):
        y = 158 + i * 42
        if i % 2 == 0:
            draw.rectangle([85, y-2, 985, y+36], fill=(20, 20, 35))
        dir_color = ACCENT if dir_ == "IN" else (GREEN if dir_ == "OUT" else YELLOW)
        draw.text((90, y+8), pin, fill=ACCENT, font=FONT)
        draw.text((200, y+8), net, fill=TEXT_PRIMARY, font=FONT)
        draw.text((400, y+8), dir_, fill=dir_color, font=FONT_SM)
        draw.text((490, y+8), std, fill=TEXT_SECONDARY, font=FONT)
        draw.text((660, y+8), bank, fill=TEXT_DIM, font=FONT)
        draw.text((730, y+8), drive, fill=TEXT_DIM, font=FONT_SM)
        lock_color = GREEN if locked else TEXT_DIM
        draw.text((815, y+8), "🔒" if locked else "·", fill=lock_color, font=FONT_SM)

    # Right panel - Timing Constraints
    rounded_rect(draw, [1020, 85, 1370, 500], fill=BG_PANEL, radius=8, outline=BORDER)
    draw.text((1040, 100), "Timing Constraints", fill=TEXT_PRIMARY, font=FONT_HEADING)
    draw.line([1040, 125, 1350, 125], fill=BORDER)

    timing = [
        ("Clock: sys_clk", "Period: 8.0 ns", "125 MHz"),
        ("Clock: uart_clk", "Period: 8680 ns", "115.2 KHz"),
        ("", "", ""),
        ("Setup margin", "+1.87 ns", "MET"),
        ("Hold margin", "+0.42 ns", "MET"),
        ("", "", ""),
        ("False paths", "2 defined", ""),
        ("Multicycle", "1 defined", ""),
        ("Max delay", "3 defined", ""),
    ]
    for i, (l1, l2, l3) in enumerate(timing):
        y = 140 + i * 35
        draw.text((1040, y), l1, fill=TEXT_PRIMARY if l1 else TEXT_DIM, font=FONT_SM)
        draw.text((1040, y+15), l2, fill=TEXT_SECONDARY, font=FONT_SM)
        if l3:
            color = GREEN if "MET" in l3 or "MHz" in l3 or "KHz" in l3 else TEXT_SECONDARY
            draw.text((1200, y+5), l3, fill=color, font=FONT_SM)

    # Footer
    draw.rectangle([0, H-30, W, H], fill=BG_HEADER)
    draw.text((60, H-22), "16 pin constraints  •  2 clocks  •  uart_controller.lpf", fill=TEXT_SECONDARY, font=FONT_SM)

    img.save(f"{OUT}/05_constraint_editor.png")
    print("  ✓ Constraint editor")


# ─── 6. IP Catalog ───
def create_ip_catalog():
    img = Image.new("RGB", (W, H), BG_DARKEST)
    draw = ImageDraw.Draw(img)
    draw_topbar(draw, "IP Catalog", "All Vendors")
    draw_sidebar(draw, active_idx=6)

    # Categories
    categories = ["Memory", "DSP & Math", "I/O & Clocking", "Communication"]
    for i, cat in enumerate(categories):
        x = 70 + i * 330
        color = ACCENT if i == 0 else TEXT_SECONDARY
        draw.text((x+20, 52), cat, fill=color, font=FONT)
        if i == 0:
            draw.line([x+10, 70, x+100, 70], fill=ACCENT, width=2)
    draw.line([70, 72, 1370, 72], fill=BORDER)

    # IP cards grid (3 columns)
    ips = [
        ("Block RAM (EBR)", "Single/Dual-port RAM\n1-512Kb configurable", ["Lattice", "Intel", "Xilinx"], ACCENT),
        ("FIFO Controller", "Sync/Async FIFO\nConfigurable depth & width", ["Lattice", "Intel", "Xilinx", "OSS"], BLUE),
        ("Distributed RAM", "LUT-based memory\nUltra-low latency", ["Xilinx", "Intel"], GREEN),
        ("DDR3 Memory Ctrl", "DDR3/DDR3L interface\n800 MT/s, x8/x16", ["Lattice", "Intel", "Xilinx"], YELLOW),
        ("ROM Generator", "Initialized read-only\nHex/MIF file support", ["All Vendors"], TEXT_SECONDARY),
        ("Dual-Clock FIFO", "CDC-safe FIFO\nGray-coded pointers", ["Lattice", "Intel"], ACCENT),
        ("ECC Memory", "Error correction\nSECDED protection", ["Xilinx", "Intel"], RED),
        ("Content-Addr Mem", "CAM/TCAM\nParallel lookup", ["Intel", "Xilinx"], BLUE),
        ("Shift Register", "Variable-length SRL\nLUT-optimized", ["Xilinx", "Lattice", "OSS"], GREEN),
    ]

    for i, (name, desc, vendors, color) in enumerate(ips):
        col = i % 3
        row = i // 3
        x = 70 + col * 435
        y = 85 + row * 260
        rounded_rect(draw, [x, y, x+420, y+245], fill=BG_PANEL, radius=8, outline=BORDER)

        # IP name and icon
        draw.text((x+15, y+12), name, fill=TEXT_PRIMARY, font=FONT_HEADING)

        # Description
        for j, line in enumerate(desc.split("\n")):
            draw.text((x+15, y+40+j*18), line, fill=TEXT_SECONDARY, font=FONT_SM)

        # Vendor badges
        vx = x + 15
        for vendor in vendors:
            badge_color = {
                "Lattice": ACCENT, "Intel": BLUE, "Xilinx": GREEN,
                "Microchip": YELLOW, "OSS": TEXT_SECONDARY, "All Vendors": ACCENT,
                "Efinix": RED,
            }.get(vendor, TEXT_SECONDARY)
            tw = len(vendor) * 7 + 12
            rounded_rect(draw, [vx, y+85, vx+tw, y+103], fill=(*badge_color[:3], 40) if isinstance(badge_color, tuple) else badge_color, radius=10)
            draw.text((vx+6, y+87), vendor, fill=badge_color, font=FONT_SM)
            vx += tw + 6

        # Config section
        draw.line([x+15, y+115, x+405, y+115], fill=BORDER)
        draw.text((x+15, y+125), "Configuration", fill=TEXT_DIM, font=FONT_SM)

        # Simplified config fields
        configs = [
            ("Width:", "36 bits"),
            ("Depth:", "4096"),
            ("Mode:", "Read-First"),
        ]
        for j, (k, v) in enumerate(configs):
            draw.text((x+15, y+145+j*22), k, fill=TEXT_SECONDARY, font=FONT_SM)
            draw.text((x+100, y+145+j*22), v, fill=ACCENT, font=FONT_SM)

        # Generate button
        rounded_rect(draw, [x+280, y+205, x+410, y+235], fill=BG_CARD, radius=4, outline=color)
        draw.text((x+300, y+212), "Generate", fill=color, font=FONT_SM)

    # Footer
    draw.rectangle([0, H-30, W, H], fill=BG_HEADER)
    draw.text((60, H-22), "IP Catalog  •  9 Memory IPs  •  Multi-vendor support", fill=TEXT_SECONDARY, font=FONT_SM)

    img.save(f"{OUT}/06_ip_catalog.png")
    print("  ✓ IP catalog")


if __name__ == "__main__":
    print("Generating CovertEDA screenshots...")
    create_start_screen()
    create_build_pipeline()
    create_reports_timing()
    create_reports_utilization()
    create_constraint_editor()
    create_ip_catalog()
    print(f"\nAll screenshots saved to {OUT}/")
