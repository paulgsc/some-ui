#
# ffmpeg for @some-ui/video-render, the one renderer for Studio and Game Week
# Bites (paulgsc/some-ui#2249).
#
# Its tests render real video with ffmpeg and check that two renders of the
# same cut list are the same bytes, so ffmpeg is a test input, pinned by
# flake.lock like everything else here. `-headless` is the variant without
# display and capture libraries; it carries libx264, the encoder the
# renderer writes with.
{pkgs, ...}: {
  deps = with pkgs; [
    ffmpeg-headless
  ];
}
