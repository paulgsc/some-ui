# Build Instructions — @some-extension/drama

These instructions reproduce the submitted `dist/` from this source archive on a
clean machine, using only the public npm registry. The archive is
`git archive` of the release commit (its id is the zip comment), assembled by
`extensions/scripts/package-source.sh`.

## Archive Layout

```
/
├── extensions/
│   ├── some-drama/         # this extension: source, README.build.md
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

[`extensions/docs/REVIEWER.md`](../docs/REVIEWER.md) is the reviewer gateway
for every extension in the repository.

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
pnpm --filter "@some-extension/drama" build
```

`extensions/some-drama/dist/` is then the submitted build, byte for byte.

## Verification

```sh
cd extensions/some-drama/dist
find . -type f | sort | xargs sha256sum
```

Each hash should equal the SHA-256 of the same file in the submitted package.

## Notes

- All dependencies are resolved from the public npm registry via pnpm.
- `pnpm-lock.yaml` pins exact dependency versions for reproducibility.
- No private registries, local file paths outside this archive, or git
  dependencies are used.
