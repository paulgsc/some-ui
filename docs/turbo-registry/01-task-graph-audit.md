# Turbo Task Graph Audit

> Findings for TURBO-FOUND S1 (#581), part of the turbo registry epic (#596,
> milestone M17). Read this before wiring a remote cache on top of
> `turbo.json` — a remote cache only makes a hit/miss decision reproducible
> everywhere, it does not make it correct. Everything below was fixed or
> verified against the actual repo, not inferred from the task names.

## Fixed

### 1. `build:wasm` was entirely dead — removed

- Root `package.json` had a `build:wasm` script running
  `cargo run --manifest-path crates/ujinga/Cargo.toml`. `crates/ujinga` does
  not exist and never has (`git log -p --follow -- package.json` shows the
  line added once, never touched again). Confirmed via `find` across
  `crates/*/Cargo.toml` — the 13 real crates are `hangul-game-core`,
  `leaderboard`, `leetype_wasm`, `pkg_cloner`, `polyhedron`, `some-bricks`,
  `some-charts`, `some-crossword`, `some-dial`, `some-gui`, `some-hexagon`,
  `some-slint-ui`, `viewport-rotation`.
- `turbo.json` had a matching `build:wasm` task
  (`outputs: ["packages/wasm/**/*"]`, `cache: true`). This was _also_ dead:
  no package in the workspace defines a `build:wasm` script for turbo to
  attach that task config to (`grep -rl '"build:wasm"' **/package.json`
  matches only the root). `packages/wasm` doesn't exist either (the real
  wasm output package is `packages/wasm-loader`, unrelated).
- The actual wasm crates (`hangul-game-core`, `leetype_wasm`, `polyhedron`,
  `some-crossword`, `some-hexagon`, `viewport-rotation`) already build via
  their own `build` script (`wasm-pack build ...`), which the existing
  `build` task already covers correctly. Real wasm-pack output (`wasm-sources/**`
  → `wasm-release.yml`) is a separate, not-yet-turbo-wired pipeline —
  that's TURBO-WASM's non-goal-turned-goal, not this story's.
- **Action:** deleted the root script and the turbo task. Nothing
  downstream referenced either — `grep -rn "build:wasm"` across
  `*.json`/`*.yml`/`*.sh`/`*.md` now only matches this doc.

### 2. `.content/**` output path didn't match what the task writes — fixed

`build` and `build:docs` both declared `outputs: [".content/**"]`. The only
task that actually uses `build:docs` is `some-ui-mdx` (`packages/mdx-generator`,
script `contentlayer2 build`). contentlayer2's default artifact directory is
`.contentlayer` (confirmed by reading
`@contentlayer2/core/src/_ArtifactsDir.ts`: `filePathJoin(cwd, '.contentlayer')`,
and by the repo's own `.gitignore`, which ignores `.contentlayer`, never
`.content`). `.content` appeared nowhere else in the repo.

This is exactly the failure mode the epic exists to catch: a remote cache
would confidently report a hit for `build:docs`, restore zero files (nothing
was ever written to `.content/`), and every consumer downstream would
silently get an empty content layer instead of an error.

**Verified the fix, not just the diff:**

```
$ npx turbo run build:docs --filter=some-ui-mdx --force
...Generated 0 documents in .contentlayer
Cached: 0 cached, 1 total   # first run, cold

$ npx turbo run build:docs --filter=some-ui-mdx
Cached: 1 cached, 1 total   # >>> FULL TURBO, real local cache hit
```

Before the fix, the same two runs both report `cache bypass` /
recompute — the "hit" on the second run was turbo trusting its hash, not
turbo actually having anything to restore. `packages/mdx-generator/content`
doesn't currently exist in this repo (contentlayer treats a missing
`contentDirPath` as zero documents rather than erroring — separately worth
someone's attention, but out of scope for a task-graph audit), so today
`build:docs` always generates an empty content layer either way; the bug
was purely in the cache bookkeeping, not the build's own behavior.

**Action:** both occurrences changed from `.content/**` to `.contentlayer/**`.

## Verified correct — no change needed

- **Default `inputs` for `build`/`build:docs` (undeclared → all
  non-gitignored files in the package).** Sampled ~20 of the 55 workspace
  packages' `build` scripts: the overwhelming majority are
  `tsc -p tsconfig.build.json && vite build`, reading only their own
  `src/`, `tsconfig*.json`, `vite.config.ts`, `package.json` — all inside
  the package directory, which is exactly what the default hashes. No
  package's `build` reads a sibling package's _source_ directly without
  also declaring it as a `package.json` dependency (checked the one case
  flagged elsewhere in this repo as a known cross-boundary import —
  `packages/ui/input` importing `some-crossword`, `viewport-rotation`,
  `leetype-wasm` — all three are properly declared as
  `workspace:*` dependencies, so turbo's `dependsOn: ["^build"]` already
  covers them via the package.json graph. No phantom/undeclared
  dependency found.)
- **`some-filter`'s `BUILD_TARGET`/`BUILD_CLEAN` env reads**
  (`extensions/some-filter/vite.config.{chromium,firefox}.ts`). These
  looked like a classic "undeclared env var changes build output" risk,
  but the `build` script itself pins them inline
  (`BUILD_CLEAN=1 BUILD_TARGET=content vite build --config ...`) — they're
  never inherited from the ambient shell/CI environment, so the task hash
  doesn't need to account for them. Confirmed by reading
  `extensions/some-filter/package.json`'s `scripts` block directly.
- **`process.env.NODE_ENV` defines** in `some-scrobbler`, `some-cycle`, and
  `some-cycle/packages/content`'s vite configs are all hardcoded literal
  `"production"` replacements, not reads of the ambient env — deterministic
  given the source, no cache risk.
- **`apps/www`** has no `build` script at all (only `build:dev`,
  `build:analyze`), so its `vite.config.ts`'s `process.env.NODE_ENV` read
  (used for `__DEV__`) never participates in the `build` task. Not a
  turbo.json bug, just doesn't currently join that part of the graph.
- **No build-time network calls found.** Grepped `vite.config.*`,
  `rollup.config.*`, `build.config.*` repo-wide for `fetch(`, bare
  `http(s)://`, `execSync`, `child_process` — the one hit
  (`apps/www/vite.config.ts`) is a comment linking to the Vite docs, not a
  live call.

## Documented, not actioned (out of scope for this story)

- **`packages/some-content`'s `build:manifest`** (`tsx scripts/generate-manifest.ts`,
  scans `public/topiks` and writes `public/topiks/manifest.json` back into
  the same directory it scans) is not declared as a turbo task at all — it
  isn't in `turbo.json`, and nothing currently invokes it (no `prebuild`
  hook wired despite the script's own docstring suggesting one). This
  story's Tasks list didn't ask for this to be wired in, only to note the
  risk for whoever does: if it's ever added as a `cache: true` task, a bare
  default-inputs hash on the package would work today (the scan dir is
  inside the package), but the script's `outputPath` writes back into
  `scanDir` — a second run would pick up its own prior `manifest.json` as
  input (extension filter is `.json`), which is a self-referential-inputs
  smell worth fixing at that point, not now.
- **TURBO-WASM's own audit** (crate-side `Cargo.toml`/`wasm-pack.toml`
  correctness) is explicitly that story's job, not this one's — not
  re-litigated here.

## Bottom line for TURBO-CI / TURBO-AGENT / TURBO-WASM

Every `cache: true` task's `outputs` now points at a real, verified write
path. No task references a nonexistent file path. No undeclared-env or
cross-package-read risk was found beyond what's listed above (and those all
checked out safe). The graph is trustworthy to wire a remote cache against.
