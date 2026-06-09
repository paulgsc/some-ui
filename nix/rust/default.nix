#
# Rust toolchain + core Rust build dependencies.
# Consumed by every shell that touches Rust or wasm.
#
# Note: cargo-deny and cargo-audit live in nix/deny — kept out of here
# so the ci shell closure stays small on pure Rust build jobs.
{pkgs, ...}: let
  rustToolchain = pkgs.rust-bin.stable.latest.default.override {
    extensions = [
      "rust-src"
      "rust-analyzer"
      "clippy"
    ];
    targets = [
      "x86_64-unknown-linux-gnu"
      "wasm32-unknown-unknown"
    ];
  };
in {
  inherit rustToolchain;

  # Packages needed at compile time in every shell that touches Rust
  deps = with pkgs; [
    rustToolchain
    wasm-pack
    pkg-config
    openssl
    openssl.dev
  ];

  # Extra ergonomics — local dev only, not in CI
  devDeps = with pkgs; [
    rust-analyzer
    cargo-edit
    cargo-watch
    cargo-expand
    cargo-flamegraph
    sqlx-cli
  ];

  env = {
    RUST_BACKTRACE = "1";
    RUST_LOG = "debug";
  };

  ciEnv = {
    RUST_BACKTRACE = "1";
    RUST_LOG = "info";
  };
}