{
  description = "My first Rust nixos dev env";

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
    rust-overlay,
    nixpkgs,
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
      in {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            rustToolchain
            wasm-pack

            # Build essentials
            pkg-config
            openssl
            openssl.dev
            # cmake
            # gcc
            # libiconv

            # Dev Tools
            rust-analyzer
            cargo-audit
            cargo-edit
            cargo-watch
            cargo-expand
            cargo-flamegraph
            sqlx-cli
            jq
            # cargo-tarpaulin

            # DB
            sqlite
            # postgresql

            # Audio
            alsa-lib

            # Slint
            slint-lsp

            xorg.libX11 # core X11 support
            xorg.libXcursor # cursors
            xorg.libXrandr # resizing
            xorg.libXrender # drawing enhancements
            xorg.libxcb # modern X11 protocol
            xorg.libXi # input devices
            xorg.libXext # extensions
            freetype # font rendering
            fontconfig # font lookup
            libGL # OpenGL API
            mesa # software renderer for OpenGL

            # XKB dependencies
            libxkbcommon
            xorg.libxkbfile
          ];

          # Required for Slint/Winit to dynamically load libraries at runtime
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
            wayland # For potential Wayland support

            vulkan-loader # For Iced's wgpu backend
            alsa-lib # For audio support if needed
            udev # For input device detection
          ]);

          shellHook = ''
            export RUST_BACKTRACE=1
            export RUST_LOG=debug
            # export DATABASE_URL=""

            # X11 forwarding check
              if [ -n "$DISPLAY" ]; then
                  echo "✅ X11 forwarding detected: $DISPLAY"
                    else
                  echo "❌ No X11 forwarding - set DISPLAY manually if needed"
                          fi

                            # Force X11 backend (disable Wayland if auto-detected)
                              export WINIT_UNIX_BACKEND=x11

                                echo "✅ Rust env with X11 + GL is ready"

          '';

          RUST_BACKTRACE = 1;
          RUST_LOG = "debug";
        };
      }
    );
}
