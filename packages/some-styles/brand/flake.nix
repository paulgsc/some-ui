{
  description = "Some UI brand mark: the one favicon every repo pins";

  # Only needed for rsvg-convert and imagemagick. Consumers should
  # `inputs.brand.inputs.nixpkgs.follows = "nixpkgs"` so this does not add a
  # second nixpkgs to their lock; see README.md.
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = {
    self,
    nixpkgs,
  }: let
    systems = ["x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin"];
    forAllSystems = nixpkgs.lib.genAttrs systems;
  in {
    packages = forAllSystems (system: let
      pkgs = nixpkgs.legacyPackages.${system};
      # builtins.path copies just this file, so the output below changes when the
      # mark does and not on every other commit to some-ui. A bare ./favicon.svg
      # is only that stable on newer Nix; on older ones it points into the whole
      # repo's source path.
      favicon = builtins.path {
        path = ./favicon.svg;
        name = "favicon.svg";
      };
    in {
      # favicon.svg is the only committed asset. Everything else is rendered
      # from it here, so a consumer can never hold a raster that disagrees with
      # the mark, and this directory never grows a second copy to keep in step.
      default =
        pkgs.runCommand "some-ui-brand" {
          nativeBuildInputs = [pkgs.librsvg pkgs.imagemagick pkgs.icoutils];
        } ''
          mkdir -p $out
          cp ${favicon} $out/favicon.svg

          # Transparent icons: the sizes the extension manifests (16/48/128),
          # the web manifest (192/512) and a browser tab (32) ask for.
          for size in 16 32 48 128 192 512; do
            rsvg-convert --width $size --height $size \
              ${favicon} --output $out/icon-$size.png
          done

          # --raw keeps each PNG as it is. Without it icotool, like ImageMagick,
          # re-encodes the frames as BMP: 7x the size for the same three frames.
          icotool --create --output $out/favicon.ico \
            --raw=$out/icon-16.png --raw=$out/icon-32.png --raw=$out/icon-48.png

          # ImageMagick stamps date:create/date:modify into every PNG it writes,
          # which would make this output differ build to build.
          #
          # iOS fills transparency with black and rounds the corners itself, so
          # the touch icon is opaque. #101010 is the web manifest's
          # background_color; the 128px mark leaves it the margin iOS crops.
          magick -background '#101010' $out/icon-128.png \
            -gravity center -extent 180x180 -alpha remove -alpha off \
            +set date:create +set date:modify $out/apple-touch-icon.png

          # A wrong size here would only show up as a blurry tab icon in some
          # other repo, so fail the build instead.
          expect() {
            actual=$(identify -format '%wx%h\n' "$out/$1" | tr '\n' ' ')
            [ "$actual" = "$2 " ] || {
              echo "$1: expected $2, got $actual" >&2
              exit 1
            }
          }
          for size in 16 32 48 128 192 512; do
            expect icon-$size.png ''${size}x$size
          done
          expect favicon.ico "16x16 32x32 48x48"
          expect apple-touch-icon.png 180x180
        '';
    });
  };
}
