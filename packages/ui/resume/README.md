# @some-ui/resume

`src/data/resume.typ` is the granular résumé-data source of truth for Paul
Gathondu. `src/template/resume.typ` is the presentation-only, one-page
[Typst](https://typst.app) renderer for that catalogue.

It's written in STAR grammar, told project-first. Each entry opens with the
premise the project exists to answer — a browser is an operating system and
tabs are its processes; exposure should be opt-in; visual comfort is
measurable; a curriculum should adapt to the learner — and then cashes that
premise out in the mechanism implementing it: the state machine, the
invariant, the build constraint, the test corpus. The rule the document is
held to is that **a premise earns its place only if the next line cashes it
out in a mechanism**; motivation without mechanism doesn't belong on the
page.

Every rendered variant has a compact technical-capabilities line, but its terms
are selected with — and supported by — that composition's project evidence.

The long-form provenance, posting-specific analysis, and omitted evidence stay
in `src/canon/resume.meta.typ`. The renderer imports only identity facts and
complete audience-specific compositions from `src/data/resume.typ`. Pruning for one page therefore never
erases the underlying work or creates a random assortment of bullets.

> Claims in the exported compositions are load-bearing: if one stops being
> true, cut it rather than re-justifying it, and update its provenance in §2. The workspace counts in particular are
> derived, not remembered — see that section's _Counts_ note.

## Pipeline (MVP)

```
src/data/resume.typ (identity + granular compositions)
              ↓ imported by
src/template/resume.typ (layout/template) --variant--> dist/resume-{backend,systems,learning}.{pdf,svg}
```

`pnpm build` (`scripts/compile.mjs`) compiles all named one-page compositions
to PDF downloads and SVG web previews.
The backend variant is also copied to `dist/resume.pdf` for compatibility. A Typst layout assertion fails the build if any composition exceeds one page. After compilation, `scripts/check-ats.mjs` uses Poppler's `pdftotext` to verify that every PDF exposes the candidate name and contact details, expected section landmarks, variant label, at least 180 words, valid Unicode, and the primary sections in reading order. It also writes `dist/resume-<variant>.ats.txt` for human inspection. There's no browser-side WASM compiler and no server in
this first cut — that's a deliberate MVP cut, not an oversight: static
precompilation is the cheapest thing that actually proves the concept
(source-controlled `.typ` in, previewable/downloadable `PDF` out), and it's
the one option that doesn't ship a multi-megabyte compiler to every visitor
of `apps/www` just to render one page. See the option comparison this
decision was made against for the fuller tradeoff.

The renderer also asserts a shared ATS seam in every composition: TypeScript,
data modeling, production services, distributed/asynchronous event-driven
systems, Docker/cloud infrastructure, and testing. This is a source-level
guard against a targeted variant becoming so concise that it stops exposing
qualifications the underlying work genuinely supports; it does not invent
unsupported tenure, Kubernetes, scale, or employment history.

`apps/www`'s `/resume` route uses the compiled SVG on narrow viewports so mobile
web views render the document as ordinary web content instead of handing the
PDF off to a download flow. Desktop retains the browser's full PDF viewer, and
the explicit PDF download remains available on every viewport.

### ATS smoke-test methodology

`pnpm check:ats` checks already-compiled PDFs; `pnpm build` runs the same check
automatically. Install Poppler (`poppler-utils` on Debian/Ubuntu) so
`pdftotext` is on `PATH`, or point `PDFTOTEXT_BIN` at a compatible executable.
The check is intentionally described as a smoke test, not ATS certification:
proprietary applicant-tracking systems differ, but an image-only PDF, missing
contact data, broken glyph mapping, implausibly sparse extraction, or scrambled
main-section order now fails before publishing. Review the emitted `.ats.txt`
files to see approximately what a text-oriented parser receives.

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
- Arbitrary bullet-level mixing. The selectable unit is intentionally a complete
  composition so every PDF remains a coherent argument.
