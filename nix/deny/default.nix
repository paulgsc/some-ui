#
# Dependency auditing tools.
# Kept separate from ci to avoid inflating the CI shell closure when
# deny checks aren't needed (e.g. pure Node jobs).
# Used by the deny-checks reusable workflow via: nix develop .#deny
{pkgs, ...}: {
  deps = with pkgs; [
    cargo-deny
    cargo-audit
  ];
}
