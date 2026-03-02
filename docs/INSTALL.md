# CovertEDA Installation Guide

## System Requirements

CovertEDA is a Tauri 2 desktop application with a Rust backend and React frontend. It requires:

- **Rust** stable toolchain (via [rustup](https://rustup.rs/))
- **Node.js** 18+ and npm (via [nvm](https://github.com/nvm-sh/nvm) or [NodeSource](https://github.com/nodesource/distributions))
- At least one supported FPGA toolchain installed (optional for browser dev mode)

---

## Windows Installation

### 1. Install Prerequisites

**Rust:**
```powershell
# Download and run rustup-init.exe from https://rustup.rs/
winget install Rustlang.Rustup
```

**Node.js:**
```powershell
winget install OpenJS.NodeJS.LTS
```

**Visual Studio Build Tools** (required for Rust compilation on Windows):
```powershell
winget install Microsoft.VisualStudio.2022.BuildTools
# During install, select "Desktop development with C++"
```

**WebView2** (ships with Windows 10 1803+ and Windows 11):
- Already included on modern Windows. If missing, download from [Microsoft](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

### 2. Clone and Build

```powershell
git clone https://github.com/fpga-professional-association/CovertEDA.git
cd CovertEDA

# Install frontend dependencies
npm install

# Run in browser (no Tauri, mock data)
npm run dev

# Build and run the full desktop app
npx tauri dev

# Create distributable installer (.msi)
npx tauri build
# Output: src-tauri\target\release\bundle\msi\CovertEDA_*.msi
```

### 3. Configure Vendor Tools

CovertEDA auto-detects vendor installations in standard locations:

| Vendor | Default Windows Path |
|--------|---------------------|
| Lattice Diamond | `C:\lscc\diamond\<version>` |
| Lattice Radiant | `C:\lscc\radiant\<version>` |
| Intel Quartus | `C:\intelFPGA\<version>`, `C:\intelFPGA_lite\<version>`, `C:\intelFPGA_pro\<version>` |
| AMD Vivado | `C:\Xilinx\Vivado\<version>` |
| Achronix ACE | `C:\achronix\ace\<version>` |

Custom paths can be set in **Settings** (gear icon on Start Screen or Cfg in sidebar).

---

## Linux Installation

### 1. Install System Dependencies

CovertEDA requires WebKitGTK 4.1 (the libsoup3 variant). This is available on modern distributions.

**Ubuntu 22.04+ / Debian 12+:**
```bash
sudo apt-get update
sudo apt-get install -y \
    libwebkit2gtk-4.1-dev \
    libsoup-3.0-dev \
    libjavascriptcoregtk-4.1-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    build-essential \
    curl wget file
```

**Fedora 37+:**
```bash
sudo dnf groupinstall -y "C Development Tools and Libraries"
sudo dnf install -y \
    webkit2gtk4.1-devel \
    openssl-devel \
    gtk3-devel \
    libappindicator-gtk3-devel \
    librsvg2-devel \
    curl wget file
```

**Arch Linux:**
```bash
sudo pacman -S --needed \
    webkit2gtk-4.1 \
    base-devel \
    curl wget file \
    openssl \
    gtk3 \
    libappindicator-gtk3 \
    librsvg
```

**openSUSE Tumbleweed:**
```bash
sudo zypper install \
    webkit2gtk3-soup2-devel \
    libopenssl-devel \
    gtk3-devel \
    libappindicator3-devel \
    librsvg-devel \
    gcc gcc-c++ make \
    curl wget file
```

### 2. Install Rust and Node.js

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Node.js (via nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
```

### 3. Clone and Build

```bash
git clone https://github.com/fpga-professional-association/CovertEDA.git
cd CovertEDA

npm install

# Browser dev mode (no Tauri needed)
npm run dev

# Full desktop app
npx tauri dev

# Create distributable packages (.deb, .AppImage, .rpm)
npx tauri build
# Output: src-tauri/target/release/bundle/
```

### 4. Configure Vendor Tools

Auto-detected Linux paths:

| Vendor | Default Linux Path |
|--------|-------------------|
| Lattice Diamond | `/usr/local/diamond/<version>`, `/opt/lscc/diamond/<version>`, `~/lscc/diamond/<version>` |
| Lattice Radiant | `/opt/lscc/radiant/<version>`, `~/lscc/radiant/<version>` |
| Intel Quartus | `/opt/intelFPGA/<version>`, `~/intelFPGA/<version>`, `~/intelFPGA_lite/<version>` |
| AMD Vivado | `/opt/Xilinx/Vivado/<version>`, `/tools/Xilinx/Vivado/<version>` |
| Achronix ACE | `/opt/achronix/ace/<version>` |
| OSS CAD Suite | On `$PATH` (`yosys`, `nextpnr-ecp5`) |

WSL users: CovertEDA also scans `/mnt/c/` and `/mnt/d/` for Windows installations and translates paths automatically.

---

## Supported Linux Distributions

Tauri 2 requires `webkit2gtk-4.1` with `libsoup3`, which limits supported distributions to those shipping GLib >= 2.70 and WebKitGTK with the 4.1 API.

### Fully Supported

| Distribution | Version | Status |
|-------------|---------|--------|
| **Ubuntu** | 22.04 LTS (Jammy) | Supported |
| **Ubuntu** | 23.04+ | Supported |
| **Ubuntu** | 24.04 LTS (Noble) | Supported |
| **Debian** | 12 (Bookworm) | Supported |
| **Fedora** | 37+ | Supported |
| **Fedora** | 39, 40, 41 | Supported |
| **Arch Linux** | Rolling | Supported |
| **openSUSE** | Tumbleweed | Supported |
| **Manjaro** | Rolling | Supported |
| **Linux Mint** | 21.2+ (based on Ubuntu 22.04) | Supported |
| **Pop!_OS** | 22.04+ | Supported |
| **Gentoo** | Rolling | Supported (with USE flags) |

### Not Supported

| Distribution | Version | Reason |
|-------------|---------|--------|
| **RHEL** | 8 | GLib 2.56 (need 2.70+), no libsoup3, no webkit2gtk-4.1 |
| **RHEL** | 9 | GLib 2.68 (marginal, need 2.70+) |
| **CentOS Stream** | 8 | Same as RHEL 8 |
| **CentOS Stream** | 9 | Same as RHEL 9 |
| **Rocky Linux** | 8, 9 | Same as RHEL 8/9 |
| **AlmaLinux** | 8, 9 | Same as RHEL 8/9 |
| **Ubuntu** | 20.04 LTS | No webkit2gtk-4.1 |
| **Debian** | 11 (Bullseye) | No webkit2gtk-4.1 |
| **openSUSE Leap** | 15.x | GLib too old |

### RHEL 8/9 Workarounds

RHEL 8 and RHEL 9 cannot build or run Tauri 2 natively because the required `webkit2gtk-4.1` and `libsoup3` packages are not available in any official repository.

**Options:**
1. **Flatpak** (recommended): Install via Flatpak with the GNOME 45+ runtime, which bundles the required libraries. Note: Flatpak sandboxing may require `--talk-name` permissions for vendor tool subprocess spawning.
2. **Container build**: Use the included `Containerfile` (Fedora 39-based) to build on RHEL 8 hosts, producing AppImage/RPM for Fedora targets.
3. **Browser mode**: Run `npm run dev` for the frontend-only browser mode (no vendor tool integration, mock data only). This works on any system with Node.js.
4. **Upgrade to RHEL 10**: RHEL 10 (expected 2025) should include sufficient GLib and WebKitGTK versions.

---

## WSL (Windows Subsystem for Linux)

CovertEDA works well under WSL 2 with a few considerations:

### Setup
```bash
# Install Ubuntu 22.04 in WSL
wsl --install -d Ubuntu-22.04

# Install system dependencies (same as Linux)
sudo apt-get install -y libwebkit2gtk-4.1-dev libsoup-3.0-dev ...

# Install a display server (for Tauri GUI)
# WSLg (Windows 11) provides this automatically
# Windows 10: install VcXsrv or similar X server
```

### Path Handling
CovertEDA automatically handles path translation:
- WSL paths (`/mnt/c/...`) are converted to Windows paths (`C:/...`) for vendor tools
- Native Linux paths are converted to UNC paths (`//wsl.localhost/<distro>/...`) when needed
- TCL scripts always use forward slashes to avoid escape character issues

### Vendor Tool Access
- Windows-installed vendor tools (Quartus, Vivado, Diamond, Radiant) are accessible from WSL via `/mnt/c/` paths
- CovertEDA auto-detects Windows installations when running under WSL
- FlexLM license files at Windows paths work transparently

---

## Browser Development Mode

For frontend development or evaluation without installing system dependencies:

```bash
git clone https://github.com/fpga-professional-association/CovertEDA.git
cd CovertEDA
npm install
npm run dev
# Opens http://localhost:1420
```

This runs the React frontend with comprehensive mock data covering all backends, reports (timing, utilization, power, DRC, I/O), build pipeline, and git integration. No Rust compilation, no system dependencies, no vendor tools needed.

---

## Troubleshooting

### "Could not find system library 'webkit2gtk-4.1'"
Your distribution does not provide `webkit2gtk-4.1-dev`. Check the [Supported Distributions](#supported-linux-distributions) table. If you're on RHEL/CentOS, see the workarounds section.

### "pkg-config: command not found"
```bash
# Ubuntu/Debian
sudo apt-get install pkg-config

# Fedora
sudo dnf install pkgconf-pkg-config
```

### Rust compilation errors
```bash
# Ensure you have the latest stable Rust
rustup update stable
```

### Build fails with linker errors
Ensure all system development libraries are installed. The most commonly missing packages are `libsoup-3.0-dev` and `libjavascriptcoregtk-4.1-dev` on Ubuntu.

### Vendor tool not detected
1. Open **Settings** on the Start Screen
2. Set the install path manually for your vendor tool
3. Click the refresh button next to "DETECTED TOOLS"
4. If the tool shows "FOUND", click to expand and verify the detected path

### WSL: "Failed to open display"
Ensure WSLg is working (Windows 11) or an X server is running (Windows 10):
```bash
# Test X11
echo $DISPLAY    # Should show something like :0 or :1
xeyes            # Should open a window (install with: sudo apt install x11-apps)
```
