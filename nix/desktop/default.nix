#
# GUI, graphics, and desktop libraries.
# Required for Slint / Winit / Wayland / X11 — local dev only.
# Never pulled into CI.
{pkgs, ...}: let
  libs = with pkgs; [
    alsa-lib
    freetype
    fontconfig
    libGL
    mesa
    wayland
    vulkan-loader
    udev
    libxkbcommon
    xorg.libX11
    xorg.libXcursor
    xorg.libXrandr
    xorg.libXrender
    xorg.libxcb
    xorg.libXi
    xorg.libXext
    xorg.libXfixes
    xorg.libxkbfile
  ];
in {
  deps =
    libs
    ++ (with pkgs; [
      slint-lsp
      jq
      mkcert
      sqlite
    ]);

  # Everything that needs to be on LD_LIBRARY_PATH for dynamic linking
  ldLibs = libs;

  env = {
    WINIT_UNIX_BACKEND = "x11";
  };
}
