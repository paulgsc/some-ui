#
# Playwright + Chromium for E2E extension testing.
#
# NixOS specifics:
#   Playwright bundles its own Chromium binary by default, but that binary
#   is not patched for NixOS's non-FHS filesystem layout and will segfault.
#   The canonical NixOS solution is to use pkgs.playwright-driver, which
#   ships a Nix-patched Chromium, and point PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
#   at it so Playwright skips its own download.
#
#   PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 prevents `playwright install` from
#   pulling an unpatched binary on top of our Nix one.
#
#   playwright-driver.browsers exposes the pre-built browser set; we only
#   need chromium here because:
#     a) extensions require a persistent Chromium context
#     b) Firefox extension testing needs a separate geckodriver strategy
#
# Shell usage:
#   nix develop .#playwright
#
# Then run tests with:
#   pnpm exec playwright test --config=playwright.config.ts
{pkgs, ...}: let
  driver = pkgs.playwright-driver;
in {
  deps = with pkgs; [
    playwright-driver.browsers

    # System libs Chromium needs at runtime on NixOS
    alsa-lib
    at-spi2-atk
    cairo
    cups
    dbus
    expat
    glib
    gtk3
    libdrm
    libgbm
    libxkbcommon
    mesa
    nspr
    nss
    pango
    udev
    xorg.libX11
    xorg.libXcomposite
    xorg.libXcursor
    xorg.libXdamage
    xorg.libXext
    xorg.libXfixes
    xorg.libXi
    xorg.libXrandr
    xorg.libXrender
    xorg.libXScrnSaver
    xorg.libXtst
    xorg.libxcb
  ];

  env = {
    # Point Playwright at the Nix-patched binary
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = "${driver.browsers}/chromium-*/chrome-linux/chrome";

    # Prevent Playwright from downloading its own (unpatched) Chromium
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";

    # Playwright needs this to find its driver
    PLAYWRIGHT_BROWSERS_PATH = "${driver.browsers}";

    # Required for headed Chromium on Wayland/X11 in NixOS
    # Extensions do not work in headless mode — must be headed.
    DISPLAY = ":0";
  };

  # All libs Chromium dlopen()s — must be on LD_LIBRARY_PATH
  ldLibs = with pkgs; [
    alsa-lib
    at-spi2-atk
    cairo
    cups
    dbus
    expat
    glib
    gtk3
    libdrm
    libgbm
    libxkbcommon
    mesa
    nspr
    nss
    pango
    udev
    xorg.libX11
    xorg.libXcomposite
    xorg.libXcursor
    xorg.libXdamage
    xorg.libXext
    xorg.libXfixes
    xorg.libXi
    xorg.libXrandr
    xorg.libXrender
    xorg.libxcb
  ];
}
