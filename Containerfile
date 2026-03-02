# CovertEDA Build Container
# Produces: .rpm, .deb, .AppImage (Tauri 2 desktop app)
#
# Target compatibility: Fedora 37+, Ubuntu 22.04+
# NOTE: RHEL 8 and RHEL 9 cannot be targeted — webkit2gtk-4.1 is unavailable.
#       See docs/INSTALL.md for details.
#
# Usage:
#   podman build -t coverteda-builder -f Containerfile .
#   podman run --rm -v $(pwd):/src:Z coverteda-builder bash -c "npm ci && npx tauri build"
#   # Artifacts: src-tauri/target/release/bundle/

ARG FEDORA_VERSION=39
FROM fedora:${FEDORA_VERSION}

# ── System dependencies for Tauri 2 ──
RUN dnf groupinstall -y "C Development Tools and Libraries" && \
    dnf install -y \
        webkit2gtk4.1-devel \
        openssl-devel \
        gtk3-devel \
        libappindicator-gtk3-devel \
        librsvg2-devel \
        curl wget file findutils \
        cmake \
        squashfs-tools \
        rpm-build \
        patchelf \
    && dnf clean all

# ── Node.js 20 ──
ARG NODE_VERSION=20
RUN curl -fsSL https://rpm.nodesource.com/setup_${NODE_VERSION}.x | bash - && \
    dnf install -y nodejs && \
    dnf clean all

# ── Non-root build user ──
RUN useradd -m -u 1000 builder
USER builder
ENV HOME=/home/builder

# ── Rust toolchain ──
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="${HOME}/.cargo/bin:${PATH}"

# ── Tauri CLI 2 ──
RUN cargo install tauri-cli --version "^2"

WORKDIR /src
CMD ["/bin/bash"]
