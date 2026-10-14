# Build Instructions — @some-extension/suspender-ledger

These instructions reproduce the submitted `dist/` from this source archive on a
clean machine, using only the public npm registry. The archive is
`git archive` of the release commit (its id is the zip comment), assembled by
`extensions/scripts/package-source.sh`.

## Archive Layout

```
/
├── extensions/
│   ├── suspender-ledger/   # this extension: source, README.build.md,
│   │                       # amo-notes.md, release/ (notes and file hashes)
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

What the extension does, and why it needs each permission, is in
[`amo-notes.md`](amo-notes.md) next to this file;
[`extensions/docs/REVIEWER.md`](../docs/REVIEWER.md) summarizes every extension
in the repository.

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
pnpm --filter "@some-extension/suspender-ledger" build
```

`extensions/suspender-ledger/dist/` is then the submitted build, byte for byte.

## Verification

`extensions/suspender-ledger/release/release.json` records the SHA-256 of every
file in the submitted `dist/` under `"files"`. Compare:

```sh
cd extensions/suspender-ledger/dist
find . -type f | sort | xargs sha256sum
```

Every hash should equal the one `release.json` gives for that path (without
the leading `./`). The release workflow refuses to submit a build for which
they differ, and CI builds this archive by following the Steps above
(`extensions/scripts/verify-source-archive.sh`) on every pull request that
changes the extension, failing unless the result matches the extension's own
build.

## Notes

- All dependencies are resolved from the public npm registry via pnpm.
- `pnpm-lock.yaml` pins exact dependency versions for reproducibility.
- No private registries, local file paths outside this archive, or git
  dependencies are used.
