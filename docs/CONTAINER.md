# Container Build Guide (Podman / Docker)

CovertEDA provides a `Containerfile` at the repository root for building distributable packages in an isolated, reproducible environment. This is useful for CI/CD pipelines, cross-distro builds, and ensuring clean builds without polluting your host system.

## Quick Start

```bash
# Build the container image (one-time, ~10 minutes)
podman build -t coverteda-builder -f Containerfile .

# Build CovertEDA inside the container
podman run --rm \
    -v $(pwd):/src:Z \
    coverteda-builder \
    bash -c "npm ci && npx tauri build"

# Artifacts appear in your local filesystem:
ls src-tauri/target/release/bundle/
#   rpm/       → .rpm package (Fedora/RHEL)
#   deb/       → .deb package (Ubuntu/Debian)
#   appimage/  → .AppImage (portable Linux)
```

## Detailed Usage

### Building the Container Image

```bash
# Default: Fedora 39 base
podman build -t coverteda-builder -f Containerfile .

# Use a specific Fedora version
podman build -t coverteda-builder --build-arg FEDORA_VERSION=40 -f Containerfile .

# Use a specific Node.js version
podman build -t coverteda-builder --build-arg NODE_VERSION=22 -f Containerfile .
```

The image includes:
- Fedora 39 base with all Tauri 2 system dependencies
- Node.js 20
- Rust stable toolchain
- Tauri CLI 2.x
- Build tools (gcc, cmake, patchelf, squashfs-tools, rpm-build)

### Running Builds

```bash
# Full build (production)
podman run --rm -v $(pwd):/src:Z coverteda-builder \
    bash -c "npm ci && npx tauri build"

# Development build (faster, no bundling)
podman run --rm -v $(pwd):/src:Z coverteda-builder \
    bash -c "npm ci && cargo build --manifest-path src-tauri/Cargo.toml"

# Run tests only
podman run --rm -v $(pwd):/src:Z coverteda-builder \
    bash -c "npm ci && npx tsc --noEmit && npx vitest run && cargo test --manifest-path src-tauri/Cargo.toml"

# Interactive shell for debugging
podman run -it --rm -v $(pwd):/src:Z coverteda-builder
```

### Build Artifacts

After `npx tauri build`, artifacts are at:

```
src-tauri/target/release/bundle/
├── appimage/
│   └── CovertEDA_0.1.0_amd64.AppImage     # Portable, no install needed
├── deb/
│   └── covert-eda_0.1.0_amd64.deb         # Ubuntu/Debian package
└── rpm/
    └── CovertEDA-0.1.0-1.x86_64.rpm        # Fedora/RHEL package
```

### Caching for Faster Rebuilds

Mount named volumes for Cargo and npm caches to avoid re-downloading dependencies:

```bash
podman run --rm \
    -v $(pwd):/src:Z \
    -v coverteda-cargo-registry:/home/builder/.cargo/registry \
    -v coverteda-cargo-target:/src/src-tauri/target \
    -v coverteda-node-modules:/src/node_modules \
    coverteda-builder \
    bash -c "npm ci && npx tauri build"
```

## Docker Users

Replace `podman` with `docker` in all commands. The `:Z` SELinux label is only needed with Podman on SELinux-enabled hosts (Fedora, RHEL). Omit it on Docker or non-SELinux systems:

```bash
docker build -t coverteda-builder -f Containerfile .
docker run --rm -v $(pwd):/src coverteda-builder bash -c "npm ci && npx tauri build"
```

## CI/CD Integration

### GitHub Actions

The repository includes CI workflows (`.github/workflows/`) that build on `ubuntu-22.04`. For Fedora-based RPM builds, use the container:

```yaml
jobs:
  build-rpm:
    runs-on: ubuntu-latest
    container:
      image: ghcr.io/fpga-professional-association/coverteda-builder:latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npx tauri build
      - uses: actions/upload-artifact@v4
        with:
          name: rpm-package
          path: src-tauri/target/release/bundle/rpm/
```

### GitLab CI

```yaml
build:
  image: coverteda-builder:latest
  script:
    - npm ci
    - npx tauri build
  artifacts:
    paths:
      - src-tauri/target/release/bundle/
```

## Platform Compatibility

Binaries built in this container are compatible with:

| Format | Compatible Distros |
|--------|-------------------|
| `.AppImage` | Fedora 37+, Ubuntu 22.04+, Arch, openSUSE Tumbleweed |
| `.rpm` | Fedora 37+, RHEL 10+ |
| `.deb` | Ubuntu 22.04+, Debian 12+ |

**Not compatible with:** RHEL 8, RHEL 9, CentOS 8/9, Ubuntu 20.04 (glibc and webkit2gtk-4.1 mismatch). See [INSTALL.md](INSTALL.md#rhel-89-workarounds) for alternatives.

## Troubleshooting

### "Permission denied" on mounted files
If using Podman with rootless containers and SELinux:
```bash
# Use :Z label (container-private)
podman run --rm -v $(pwd):/src:Z coverteda-builder ...

# Or temporarily disable SELinux for testing
podman run --rm --security-opt label=disable -v $(pwd):/src coverteda-builder ...
```

### Build artifacts owned by root
Pass your user/group ID:
```bash
podman run --rm \
    -v $(pwd):/src:Z \
    -u $(id -u):$(id -g) \
    coverteda-builder \
    bash -c "npm ci && npx tauri build"
```

### Slow first build
The first build compiles all Rust dependencies (~5-10 minutes). Use volume caching (see above) for subsequent builds.
