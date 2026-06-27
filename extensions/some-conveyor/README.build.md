# Build Instructions — @some-extension/conveyor

These instructions allow an AMO reviewer to reproduce the exact `dist/` output
from this source archive on a clean machine using only public package registries.

## Archive Layout

```
/
├── extensions/
│   ├── common/          # shared extension utilities
│   └── some-conveyor/          # this extension (source + README.build.md)
├── packages/
│   ├── eslint/          # shared ESLint config (workspace devDep)
│   └── tsconfig/        # shared TypeScript config (workspace devDep)
├── package.json         # root workspace manifest
├── pnpm-workspace.yaml  # monorepo workspace layout
├── pnpm-lock.yaml       # pinned dependency versions
├── tsconfig.json
└── tsconfig.build.json
```

## Prerequisites

| Tool    | Version |
|---------|---------|
| Node.js | ≥ 20 (LTS) |
| pnpm    | ≥ 9 |

Install pnpm if not present:

```sh
npm install -g pnpm
```

## Steps

```sh
# 1. Install all dependencies (pinned by pnpm-lock.yaml)
#    Resolves workspace packages from the archive; no private registries used.
pnpm install --frozen-lockfile

# 2. Build the extension
pnpm --filter "@some-extension/conveyor" build
```

The `dist/` directory produced by step 2 corresponds exactly to the
`dist/` submitted with this version.

## Verification

```sh
# Compare checksums of the build output against the submitted dist/:
find dist -type f | sort | xargs sha256sum
```

## Notes

- All dependencies are resolved from the public npm registry via pnpm.
- `pnpm-lock.yaml` pins exact dependency versions for reproducibility.
- No private registries, local file paths outside this archive, or git
  dependencies are used.
