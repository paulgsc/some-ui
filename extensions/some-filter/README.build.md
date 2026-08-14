# Build Instructions — @some-extension/filter

These instructions allow an AMO reviewer to reproduce the exact `dist/` output
from this source archive on a clean machine using only public package registries.

## Archive Layout

```
/
├── extensions/
│   ├── common/          # shared extension utilities
│   ├── docs/            # AMO reviewer gateway and compliance notes
│   └── some-filter/          # this extension (source + README.build.md)
├── packages/
│   ├── eslint/          # shared ESLint config (workspace devDep)
│   └── tsconfig/        # shared TypeScript config (workspace devDep)
├── package.json         # root workspace manifest
├── pnpm-workspace.yaml  # monorepo workspace layout
├── pnpm-lock.yaml       # pinned dependency versions
├── tsconfig.json
└── tsconfig.build.json
```

## AMO Reviewer Notes

Permission justifications, data-collection declarations, and host-permission
rationale for this extension are in the reviewer gateway:

→ [`extensions/docs/REVIEWER.md`](../docs/REVIEWER.md)

That document is the canonical entry point. It links to each extension's own
`amo-notes.md` for deeper per-extension detail.

## Prerequisites

| Tool      | Version    |
| --------- | ---------- |
| Node.js   | ≥ 20 (LTS) |
| pnpm      | ≥ 9        |
| Rust      | stable     |
| wasm-pack | ≥ 0.13     |

Install pnpm if not present:

```sh
npm install -g pnpm
```

## Steps

```sh
# 1. Install all dependencies (pinned by pnpm-lock.yaml)
#    Resolves workspace packages from the archive; no private registries used.
pnpm install --frozen-lockfile

# 2. Install the WebAssembly compilation target
rustup target add wasm32-unknown-unknown

# 3. Build the extension (also compiles the Rust state-machine crate)
pnpm --filter "@some-extension/filter" build
```

The `dist/` directory produced by step 3 corresponds exactly to the
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
