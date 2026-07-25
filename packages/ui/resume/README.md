# @some-ui/resume

`resume.typ` is the source of truth for Paul Gathondu's résumé — a
[Typst](https://typst.app) document, distilled from this repository itself.
The content is a STAR-shaped summary of what `some-ui` actually is: an
adaptive learning product, a browser extension suite, and the CI/CD and
release machinery holding both together for a solo developer.

## Pipeline (MVP)

```
resume.typ  --typst compile-->  dist/resume.pdf
```

`pnpm build` (`scripts/compile.mjs`) compiles the document to
`dist/resume.pdf`. There's no browser-side WASM compiler and no server in
this first cut — that's a deliberate MVP cut, not an oversight: static
precompilation is the cheapest thing that actually proves the concept
(source-controlled `.typ` in, previewable/downloadable `PDF` out), and it's
the one option that doesn't ship a multi-megabyte compiler to every visitor
of `apps/www` just to render one page. See the option comparison this
decision was made against for the fuller tradeoff.

`apps/www`'s `/resume` route serves the compiled PDF for inline preview and
download — see its README for how the two are wired together.

### No system `typst` dependency

`scripts/compile.mjs` resolves a `typst` binary in order:

1. Already on `PATH` (respects a dev's own install, e.g. via `cargo install
typst-cli` or a system package manager).
2. Already cached at `node_modules/.cache/typst-bin/<version>/typst` from a
   previous run.
3. Otherwise, downloads the pinned version's release binary straight from
   [typst/typst releases](https://github.com/typst/typst/releases) for the
   current platform and caches it.

The auto-download path currently covers Linux and macOS (`x64`/`arm64`) via
`tar`. Windows isn't wired up for the auto-fetch fallback yet — install
`typst` yourself and make sure it's on `PATH`.

`pnpm watch` runs `typst watch` for live recompilation while editing.

## What's out of scope for this MVP

- In-browser (WASM) compilation / live preview without a rebuild.
- Multiple resume variants generated from shared content (the "targets"
  idea - `rust.pdf`, `frontend.pdf`, etc.) - one document is enough to prove
  the pipeline; splitting content only pays off once there's a second
  variant that actually needs it.
