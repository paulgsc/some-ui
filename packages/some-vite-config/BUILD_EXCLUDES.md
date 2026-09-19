# Build excludes: the single source of truth

This package (`@some-ui/vite-config`) owns which modules get **excluded from a
library's build output** — tests, stories, data/demo fixtures, cross-package
`assets/` and shared-content sources. The goal is to kill the whack-a-mole where
every new workspace (or every new shared-content package) has to _remember_ to
add the same excludes in its own config, and the first time you forget, those
modules leak into `dist/`.

## One pass, not two

Every `packages/ui/*` build script is:

```jsonc
"build": "vite build"
```

Until #1447 this was **two independent compiler passes** —
`tsc -p tsconfig.build.json && vite build` — each with its own exclude list
that had to be kept in sync by hand:

|                      | Pass 1 — `tsc -p tsconfig.build.json` (removed)                       | Pass 2 — `vite build` → `vite-plugin-dts`                          |
| -------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| What it did / does   | Type-checked the build surface (`noEmit: true` — **emitted nothing**) | Bundles JS from the entry graph **and emits `.d.ts` into `dist/`** |
| Governed by          | that package's `tsconfig.build.json` `include`/`exclude`              | previously: only `dtsOptions.exclude` in `vite.config.ts`          |
| If a glob is missing | slow / failing typecheck of files that aren't yours                   | **stray `.d.ts` for that module ships in `dist/`**                 |

`vite-plugin-dts` builds its own TypeScript program from the same
`tsconfig.build.json` to emit declarations, and that program computes the
same semantic/syntactic/declaration diagnostics pass 1 did — confirmed by
deliberately introducing a type error, an unused local and a missing return
and observing all three reported. It just didn't fail the build on them by
default. `createPlugins` now wires `afterDiagnostic` (see `plugins.ts`) to
throw when there are any, which is what let pass 1 be deleted instead of
merely made redundant: removing it earlier would have silently dropped type
checking from every one of these builds. See #1447.

### Why "forgetting some-content-registry in dtsOptions eagerly transpiles it"

`vite-plugin-dts` does not know about `tsconfig.build.json` on its own. With no
`tsconfigPath`, it falls back to the package's `tsconfig.json`, whose `include`
is something like:

```jsonc
"include": ["src", "../../some-content-registry/src/**/*"]
```

So the plugin pulls the **entire** registry source tree in as declaration
candidates. The only thing that stopped it emitting them was the hand-written
`dtsOptions.exclude` list — a second copy of the excludes, drifting from
`tsconfig.build.json`. Miss the registry there and it lands in `dist/`.

## What changed

1. **`createPlugins` points `vite-plugin-dts` at `tsconfig.build.json`** (when it
   exists), so declaration emit and type-checking (via `afterDiagnostic`, since
   #1447) both read the **same include/exclude**. `tsconfig.build.json` is the
   single source of truth; there is no separate dts-only list to keep in sync.

2. **The centralized exclude list lives in `createPlugins`, not in each
   `vite.config.ts`.** It always applies:

   - universal: `**/*.test.*`, `**/*.spec.*`, `**/*.stories.*`,
     `**/__tests__/**`, `**/__mocks__/**`, `**/stories/**`
   - content packages (`contentPackage: true`): `**/demo/**`, `**/data/**`
     (override via `contentPackageDataExclude`), `../../../assets/**`,
     `../../some-content/src/**`, `../../some-content-registry/src/**`

   Adding a **new** shared-content workspace is now a one-line edit here — every
   consumer inherits it. You never touch N workspaces again.

3. **An ESLint rule enforces the invariant.**
   `build-hygiene/no-manual-build-exclude` (in `@some-ui/eslint-kit`) flags any
   `dtsOptions.exclude` glob in a `vite.config.ts` that belongs to a centralized
   category, and autofixes it away. Genuinely package-specific globs
   (`**/obs-monitor/**`, `**/recap/**`) are left alone.

## FAQ

**Should the lint cover `dtsOptions`?** Yes — that's exactly what
`no-manual-build-exclude` does. It's the enforcement half of centralizing the
excludes; without it, nothing stops someone re-introducing a per-workspace copy.

**Should every `vite.config.ts` set `dtsOptions`?** No — the opposite. The ideal
`vite.config.ts` sets **no** `dtsOptions.exclude` at all; the centralized list
covers the shared categories. Reach for `dtsOptions.exclude` only for a glob
that is genuinely unique to that one package.

**`dtsOptions.exclude` vs `tsconfig.build.json` — which do I edit?** For anything
shared, neither: add it to `createPlugins` here. For a one-off exclude that
should apply to **both** type-checking and emit, put it in that package's
`tsconfig.build.json` — that's the single source the one remaining pass
honors for both. Use `dtsOptions.exclude` only when you want to affect the
emit pass alone.
