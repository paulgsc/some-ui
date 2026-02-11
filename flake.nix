{
  description = "Rust + wasm + pnpm workspace (dev + CI)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    rust-overlay,
    flake-utils,
    ...
  }:
    flake-utils.lib.eachDefaultSystem (
      system: let
        overlays = [rust-overlay.overlays.default];
        pkgs = import nixpkgs {
          inherit system overlays;
        };

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

        commonRustDeps = with pkgs; [
          rustToolchain
          wasm-pack
          pkg-config
          openssl
          openssl.dev
        ];
      in {
        devShells = {
          # -------------------------
          # Full local dev environment
          # -------------------------
          default = pkgs.mkShell {
            buildInputs =
              commonRustDeps
              ++ (with pkgs; [
                # Dev tooling
                rust-analyzer
                cargo-audit
                cargo-edit
                cargo-watch
                cargo-expand
                cargo-flamegraph
                sqlx-cli
                jq
                mkcert

                # DB
                sqlite

                # UI / Desktop / Slint / Winit
                alsa-lib
                slint-lsp
                freetype
                fontconfig
                libGL
                mesa
                wayland
                vulkan-loader
                udev

                xorg.libX11
                xorg.libXcursor
                xorg.libXrandr
                xorg.libXrender
                xorg.libxcb
                xorg.libXi
                xorg.libXext
                xorg.libXfixes
                libxkbcommon
                xorg.libxkbfile
              ]);

            LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath (with pkgs; [
              xorg.libX11
              xorg.libXcursor
              xorg.libXrandr
              xorg.libXrender
              xorg.libxcb
              xorg.libXi
              xorg.libXext
              xorg.libXfixes
              freetype
              fontconfig
              libGL
              mesa
              libxkbcommon
              xorg.libxkbfile
              wayland
              vulkan-loader
              alsa-lib
              udev
            ]);

            shellHook = ''
              export RUST_BACKTRACE=1
              export RUST_LOG=debug
              export WINIT_UNIX_BACKEND=x11
              echo "🛠️  Dev shell ready (full)"
            '';
          };

          # -------------------------
          # CI shell (lean + fast)
          # -------------------------
          ci = pkgs.mkShell {
            buildInputs = commonRustDeps ++ [pkgs.nodejs_latest pkgs.nodePackages.pnpm];

            shellHook = ''
              export RUST_BACKTRACE=1
              export RUST_LOG=info
            '';
          };
        };
      }
    );
}
