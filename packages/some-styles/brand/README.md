# Brand mark

The Some UI mark: a seven-cell honeycomb. `favicon.svg` is the only committed
asset here. This directory is also a Nix flake that renders every other size
from it, so a repo outside some-ui pins one mark instead of keeping a copy of
its own.

## What the flake outputs

`packages.<system>.default` is a directory:

| File                              | Size       | Use                                               |
| --------------------------------- | ---------- | ------------------------------------------------- |
| `favicon.svg`                     | any        | `<link rel="icon" type="image/svg+xml">`          |
| `favicon.ico`                     | 16, 32, 48 | the `/favicon.ico` fallback                       |
| `icon-{16,32,48,128,192,512}.png` | as named   | transparent; extension and web manifest icons     |
| `apple-touch-icon.png`            | 180        | opaque on `#101010`, because iOS fills with black |

The PNGs and the ICO are rendered in the SVG's default palette, not its
light-scheme override. The build fails if any file comes out the wrong size, and
a second build produces identical bytes.

## Using it from another repo

```nix
inputs = {
  nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  brand = {
    url = "github:paulgsc/some-ui?dir=packages/some-styles/brand";
    inputs.nixpkgs.follows = "nixpkgs";
  };
};
```

Without `follows`, the consumer's `flake.lock` gains a second nixpkgs just for
this flake.

Then hand the directory to whatever needs it. In a dev shell or a package build:

```nix
BRAND_DIR = "${inputs.brand.packages.${system}.default}";
```

```rust
const FAVICON: &[u8] = include_bytes!(concat!(env!("BRAND_DIR"), "/favicon.ico"));
```

The consumer's `flake.lock` pins the revision, so a repo changes its icon only
when you run `nix flake update brand` there, and rolling the lock back reverts
it.

## Changing the mark

1. Edit `favicon.svg`, and keep `apps/www/public/favicon.svg` identical to it
   (`apps/www/src/lib/brand/favicon.test.ts` fails otherwise).
2. Merge to `main`.
3. In each repo that uses it, run `nix flake update brand`.

To look at the output locally, run `nix build ./packages/some-styles/brand` from
the repo root. Nix only sees git-tracked files.

## Things to know

- `?dir=` makes Nix fetch all of some-ui on each update (a tree of about
  19 MB when this was written). The output only changes when `favicon.svg` does,
  because the SVG is added with `builtins.path`, so bumping the lock for any
  other commit rebuilds nothing downstream. If the fetch becomes the annoyance,
  move this directory to its own repo; `flake.nix` does not change.
- `flake.lock` here pins the same nixpkgs as the root `flake.lock`. It matters
  only when someone builds this flake directly, since consumers following their
  own nixpkgs never read it.
- Inside some-ui, `extensions/common/brand/icon-*.png` and
  `apps/www/public/{favicon.ico,logo192.png,logo512.png}` are still committed
  rasters of this SVG. Nothing ties them to it, and the flake does not replace
  them yet.
