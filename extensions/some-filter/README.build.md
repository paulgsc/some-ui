# Build Instructions — @some-extension/filter

These instructions reproduce the submitted `dist/` from this source archive on a
clean machine, using only the public npm registry. The archive is
`git archive` of the release commit (its id is the zip comment), assembled by
`extensions/scripts/package-source.sh`.

## Archive Layout

```
/
├── extensions/
│   ├── some-filter/        # this extension: source, README.build.md, amo-notes.md
│   └── docs/               # AMO reviewer gateway and compliance notes
├── extensions/…, packages/… # every workspace package this extension depends
│                           # on, directly or transitively, at its repo path
├── package.json            # root workspace manifest, pruned to this archive
├── pnpm-workspace.yaml     # monorepo workspace layout
├── pnpm-lock.yaml          # pinned dependency versions, pruned to match
├── .npmrc                  # pnpm install settings
├── .nvmrc                  # the Node.js version the submitted build used
├── postcss.config.mjs      # PostCSS config Vite applies to the extension's CSS
└── tsconfig.json
```

`unzip -l` on the archive lists exactly what it holds.

## Reviewer notes

Permission justifications, data-collection declarations, and host-permission
rationale for this extension are in the reviewer gateway:

→ [`extensions/docs/REVIEWER.md`](../docs/REVIEWER.md)

That document is the canonical entry point. It links to each extension's own
`amo-notes.md` for deeper per-extension detail.

## Prerequisites

| Tool    | Version                                                |
| ------- | ------------------------------------------------------ |
| Node.js | the version in `.nvmrc` (`nvm install` reads it)       |
| pnpm    | the version in `package.json`'s `packageManager` field |

From the archive root:

```sh
nvm install
npm install -g "pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")"
```

## Steps

```sh
# 1. Install all dependencies (pinned by pnpm-lock.yaml)
#    Resolves workspace packages from the archive; no private registries used.
pnpm install --frozen-lockfile

# 2. Build the extension
pnpm --filter "@some-extension/filter" build
```

`extensions/some-filter/dist/` is then the submitted build, byte for byte.

## Verification

```sh
cd extensions/some-filter/dist
find . -type f | sort | xargs sha256sum
```

Each hash should equal the SHA-256 of the same file in the submitted package.
CI checks this on every pull request that changes the extension: it builds
this archive by following the Steps above
(`extensions/scripts/verify-source-archive.sh`) and fails unless the result
matches the extension's own build file for file.

## Notes

- All dependencies are resolved from the public npm registry via pnpm.
- `pnpm-lock.yaml` pins exact dependency versions for reproducibility.
- No private registries, local file paths outside this archive, or git
  dependencies are used.
