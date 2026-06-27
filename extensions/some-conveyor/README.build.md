# Build Instructions — @some-extension/conveyor

These instructions allow an AMO reviewer to reproduce the exact `dist/` output
from this source archive on a clean machine using only public package registries.

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20 (LTS) |
| pnpm | ≥ 9 |

Install pnpm if not present:

```sh
npm install -g pnpm
```

## Steps

```sh
# 1. Install all dependencies (pinned by pnpm-lock.yaml in the archive root)
pnpm install --frozen-lockfile

# 2. Build the extension
pnpm --filter "@some-extension/conveyor" build
```

The `dist/` directory produced by step 2 corresponds exactly to the
`dist/` submitted with this version.

## Verification

```sh
# Confirm the build output matches the submitted dist/ by comparing checksums:
find dist -type f | sort | xargs sha256sum
```

## Notes

- All dependencies are resolved from the public npm registry via pnpm.
- The archive includes `pnpm-lock.yaml` from the repository root to pin
  exact dependency versions.
- No private registries, local paths, or git dependencies are used.
