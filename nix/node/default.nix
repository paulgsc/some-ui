#
# Node.js + pnpm workspace toolchain.
# Shared between CI and the extension dev shell.
{pkgs, ...}: {
  deps = with pkgs; [
    nodejs_latest
    nodePackages.pnpm
  ];
}
