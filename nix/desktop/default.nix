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
    libx11
    libxcursor
    libxrandr
    libxrender
    libxcb
    libxi
    libxext
    libxfixes
    libxkbfile
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
