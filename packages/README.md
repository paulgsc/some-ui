# Leaf Workspace Scaffold Convention

> Canonical shape for a new `packages/` (or `packages/ui/`) leaf workspace.
> Written for UTL-FOUND S3 (#522) so every HOIST workspace this milestone
> stands up (core-utils, react-hooks, ws, speech, viewport, orchestrator,
> wasm-loader) is identically configured, instead of each split PR
> reinventing build config by copy-paste archaeology.
>
> This convention only defines _how_ a workspace is scaffolded. It moves no
> code — see [`SHARED_WORKSPACE_DOCTRINE.md`](./SHARED_WORKSPACE_DOCTRINE.md)
> for _whether_ an export belongs in a shared workspace at all.

Reference implementations: `packages/utils` (`some-ui-utils`) and
`packages/ui/shared` (`@some-ui/shared`). When in doubt, diff a new package
against these two rather than an arbitrary sibling — they're the two
workspaces this convention was extracted from.

## 1. `package.json`

- **Name:** `@some-ui/<x>` (scoped). `packages/ui/shared` was renamed
  `some-ui-shared` → `@some-ui/shared` to conform. The bare `some-ui-<x>`
  naming that remains on other older packages predates this convention and
  is renamed opportunistically — see Doctrine §2, this is a naming nit, not
  a de-hoist trigger.
- **`peerDependencies` vs `dependencies` discipline:** anything the
  _consumer's_ React tree must own a single copy of (react, react-dom,
  framer-motion-style animation libs, anything with module-level state) goes
  in `peerDependencies`. Anything the package fully owns and bundles goes in
  `dependencies`. Get this wrong and you get duplicate-React or
  duplicate-store bugs at the consumer, not at build time.
- **Scripts** (names matter — see §4 on turbo): `build`, `build:tsc-alias`,
  `watch:build`, `watch:lint`, `clean`, `clean:build`, `lint`, `lint:js`,
  `prettier`, `typecheck`. Add `test` if the package ships tests.
- **`sideEffects`:** `["*.css"]` if the package ships a stylesheet, `false`
  otherwise — required for consumers' bundlers to tree-shake the package.
- **`main` / `module` / `types` / `exports`:** point at `./dist/<pkg>.*`,
  mirroring the four-key `exports["."]` map (`types`/`import`/`require`/
  `default`) both reference packages use. Add an `./style.css` export entry
  only if the package ships one.
- **`files`:** `["dist"]` — never ship `src/` in the published tree.

## 2. TypeScript config

- `tsconfig.json` extends `@some-ui/tsconfig/rollupconfig.json`, sets
  `composite: true`, `rootDir: "./src"`, `outDir: "./dist"`,
  `declarationDir: "./"`, and declares the package's **own** internal path
  alias (e.g. `"@utils/*": ["./src/*"]`) for imports inside the package.
  `include: ["src"]`, `exclude: ["node_modules", "build", "dist"]`.
- `tsconfig.build.json` extends `./tsconfig.json`, adds `jsx: "react-jsx"`
  if the package has components/hooks, and excludes `**/*.test.ts` and
  `**/*.stories.tsx`.

## 3. Build (`@some-ui/vite-config`)

`vite.config.ts`:

```ts
import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "@some-ui/<x>",
  libraryName: "<PascalCaseLibraryName>",
  alias: { "@<x>": resolve(__dirname, "src") },
  tsConfigPaths: { projects: [resolve(__dirname, "tsconfig.build.json")] },
})
```

## 4. Barrel + turbo pipeline

- `src/index.ts` re-exports the package's public surface (typically
  `export * from "./lib"` plus a `./types` barrel — see
  `packages/utils/src/index.ts`). This barrel is also what the census (S2)
  treats as the source of truth for "what does this package export."
- **Turbo needs no per-package registration.** `turbo.json` at the repo
  root defines tasks by _name_ (`build`, `lint`, `typecheck`, `test`,
  `clean`, `watch:build`, `watch:lint`, ...) with `dependsOn: ["^build"]`
  graph edges. Any workspace that defines a same-named script in its
  `package.json` is automatically picked up — the scaffold only has to
  match the script names in §1, not touch `turbo.json` itself. Only add a
  new top-level task there if the workspace needs a genuinely new task
  _type_ turbo doesn't already know about.

## 5. Registration (the parts that don't auto-discover)

Three places list workspaces explicitly and do **not** pick up a new
package on their own — a new workspace is invisible to type-checking and
lint import-resolution until these are updated:

1. **`pnpm-workspace.yaml`** — already globs `packages/*`, `packages/ui/*`,
   `apps/*`, `extensions/**`, `crates/*`. No edit needed if the new package
   lives under one of those; only edit this if scaffolding a genuinely new
   top-level category.
2. **Root `tsconfig.json`** `compilerOptions.paths` — add
   `"@<x>/*": ["./packages/<path>/src/"]` so the rest of the monorepo can
   import the package by its short alias during type-checking. (This map
   had drifted — `@utils/*` pointed at the non-existent
   `packages/ui/utils/src/` instead of `packages/utils/src/`; fixed as part
   of landing this convention.)
3. **`packages/eslint/tsconfig.workspace-resolve.json`**
   `compilerOptions.paths` — add `"@some-ui/<x>": ["../<path>/src/index.ts"]`
   (keyed by the real package _name_, not the short alias) so ESLint's
   import resolver can follow imports of the bare package name to source
   instead of the built `dist/`.

## 6. Scaffolding it: `pnpm build:template`

`pnpm build:template` runs the `pkg_cloner` Rust binary
(`crates/pkg_cloner`), which automates the mechanical parts of §1–2: point
it at a workspaces directory, pick an existing package as a template, name
the new one, and it copies `tsconfig*.json`, `package.json` (rewriting the
`name` field), `*.config.{js,ts}`, lint/prettier/git/editorconfig dotfiles,
and `jest`/`vitest` configs into a freshly created `<new-package>/src/`
directory.

It does **not** touch §3–5 — the vite-config call, the barrel content, or
the three registration points above are still a manual step after running
it.

As part of this story, `pkg_cloner` was bolstered (it was "too happy
path" — see #522):

- `find_packages` used to treat _any_ directory under the workspaces path
  as a template candidate, including non-package directories like
  `.turbo` or a stray `dist/`. It now requires a `package.json` to be
  present.
- The CLI already accepted a `--similarity-threshold` flag and shipped a
  tested Levenshtein `find_closest_match` helper, but neither was ever
  wired into the actual run — so a near-duplicate package name (a
  plural/singular slip, a single-character typo) was accepted silently
  instead of being flagged. `get_new_package_name` now checks the chosen
  name against existing package names with `find_closest_match` and asks
  for confirmation before proceeding on a near-miss.

## Non-goals

This document scaffolds workspaces; it does not decide which concerns get
hoisted into them (Doctrine + S2 census) and it moves no production code.
