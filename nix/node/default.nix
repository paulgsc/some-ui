#
# Node.js + pnpm workspace toolchain.
# Shared between CI and the extension dev shell.
#
# The nixpkgs pin in flake.lock is the single source of truth for which Node,
# npm and pnpm this repo runs. `versions` is what the flake publishes as
# `toolchain.<system>`, and scripts/sync-toolchain.ts copies it into the two
# files that have to spell a version out: `packageManager` in package.json and
# .nvmrc. npm has no entry of its own because it ships inside nodejs, so it
# moves with `node`.
{pkgs, ...}: let
  nodejs = pkgs.nodejs_latest;
  pnpm = pkgs.pnpm;
in {
  deps = [
    nodejs
    pnpm
  ];

  versions = {
    node = nodejs.version;
    pnpm = pnpm.version;
  };
}
