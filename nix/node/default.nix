#
# Node.js + pnpm workspace toolchain.
# Shared between CI and the extension dev shell.
#
# This is the one place the Node and pnpm versions are chosen. `.nvmrc`,
# `packageManager` in package.json and the www Dockerfile's base image are
# copies of `versions` below, written by scripts/sync-toolchain.sh and checked
# against it in CI, so a `nix flake update` that moves either one moves them.
# Edit the attribute names here (e.g. `pnpm_12`, `nodejs_24`) to pin a major
# instead of following nixpkgs' defaults; never edit the copies by hand.
{pkgs, ...}: let
  nodejs = pkgs.nodejs_latest;
  pnpm = pkgs.pnpm;
in {
  deps = [
    nodejs
    pnpm
  ];

  # Exposed as the flake's `toolchain` output for scripts/sync-toolchain.sh.
  versions = {
    node = nodejs.version;
    pnpm = pnpm.version;
  };
}
