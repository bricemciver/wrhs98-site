# Sourced helper: sha256 hex of stdin on Linux or macOS.
sha256_hex() { if command -v sha256sum >/dev/null; then sha256sum | cut -d' ' -f1; else shasum -a 256 | cut -d' ' -f1; fi; }
