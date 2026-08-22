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
    flake-utils.lib.eachDefaultSystem (system: let
      pkgs = import nixpkgs {
        inherit system;
        overlays = [rust-overlay.overlays.default];
      };

      # ── Load concern modules ──────────────────────────────────────────────
      # Each module is a plain attrset — no mkShell inside, just deps/env/ldLibs.
      # Composition happens here in flake.nix.
      rust = import ./nix/rust {inherit pkgs;};
      desktop = import ./nix/desktop {inherit pkgs;};
      node = import ./nix/node {inherit pkgs;};
      playwright = import ./nix/playwright {inherit pkgs;};
      deny = import ./nix/deny {inherit pkgs;};
      pdf = import ./nix/pdf {inherit pkgs;};

      # ── Helpers ───────────────────────────────────────────────────────────
      mkLdPath = libs: pkgs.lib.makeLibraryPath libs;
    in {
      devShells = {
        # ── default: full local dev ───────────────────────────────────────
        # Rust + wasm + desktop GUI + dev ergonomics.
        # Does NOT include Playwright — use .#playwright for E2E runs.
        default = pkgs.mkShell {
          buildInputs =
            rust.deps
            ++ rust.devDeps
            ++ desktop.deps
            ++ pdf.deps;

          LD_LIBRARY_PATH = mkLdPath desktop.ldLibs;

          shellHook = ''
            export RUST_BACKTRACE=${rust.env.RUST_BACKTRACE}
            export RUST_LOG=${rust.env.RUST_LOG}
            export WINIT_UNIX_BACKEND=${desktop.env.WINIT_UNIX_BACKEND}
            echo "🛠️  Dev shell ready (full)"
          '';
        };

        # ── ci: lean CI shell ─────────────────────────────────────────────
        # Rust compile + pnpm workspace + web-ext + poppler.
        # No GUI libs, no dev ergonomics, no Playwright, no audit tools.
        # Audit tools live in .#deny to keep this closure small.
        # poppler is here rather than in a shell of its own because
        # @some-ui/resume's build fails without pdftotext - see nix/pdf.
        ci = pkgs.mkShell {
          buildInputs =
            rust.deps
            ++ node.deps
            ++ pdf.deps
            ++ [pkgs.nodePackages.web-ext];

          shellHook = ''
            export RUST_BACKTRACE=${rust.ciEnv.RUST_BACKTRACE}
            export RUST_LOG=${rust.ciEnv.RUST_LOG}
          '';
        };

        # ── deny: cargo-deny + license audit ─────────────────────────────
        # Minimal shell for dependency auditing in CI.
        # Keeps cargo-deny out of the main ci shell closure.
        deny = pkgs.mkShell {
          buildInputs =
            rust.deps
            ++ node.deps
            ++ deny.deps;

          shellHook = ''
            export RUST_BACKTRACE=${rust.ciEnv.RUST_BACKTRACE}
          '';
        };

        # ── extension: browser extension dev ─────────────────────────────
        # Node + pnpm only. For working on extensions without the full
        # Rust toolchain or GUI libs.
        extension = pkgs.mkShell {
          buildInputs = node.deps;

          shellHook = ''
            echo "🧩 Extension dev shell ready (Node + pnpm)"
          '';
        };

        # ── playwright: E2E test runner ───────────────────────────────────
        # Node + pnpm + Playwright + Nix-patched Chromium.
        # Headed Chromium is required for extension testing — extensions
        # do not load in headless mode.
        #
        # Usage:
        #   nix develop .#playwright
        #   pnpm exec playwright test --config=playwright.config.ts
        playwright = pkgs.mkShell {
          buildInputs = playwright.deps;

          LD_LIBRARY_PATH = mkLdPath playwright.ldLibs;

          shellHook = ''
            export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='${playwright.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}'
            export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD='${playwright.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD}'
            export PLAYWRIGHT_BROWSERS_PATH='${playwright.env.PLAYWRIGHT_BROWSERS_PATH}'
            echo "🎭 Playwright shell ready (Chromium)"
            echo "   CHROMIUM: $PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"
          '';
        };

        ci-playwright = pkgs.mkShell {
          buildInputs =
            node.deps
            ++ [pkgs.nodePackages.web-ext]
            ++ playwright.deps;

          LD_LIBRARY_PATH = mkLdPath playwright.ldLibs;

          shellHook = ''
            export RUST_BACKTRACE=${rust.ciEnv.RUST_BACKTRACE}
            export RUST_LOG=${rust.ciEnv.RUST_LOG}

            export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='${playwright.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}'
            export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD='${playwright.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD}'
            export PLAYWRIGHT_BROWSERS_PATH='${playwright.env.PLAYWRIGHT_BROWSERS_PATH}'
          '';
        };
      };
    });
}
