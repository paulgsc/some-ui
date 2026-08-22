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

## Pipeline

```
src/data/resume.typ      (evidence distilled from paulgsc/{server,some-ui})
src/data/personal.typ    (facts that exist outside those repos — see below)
              ↓ imported by
src/main.typ  --variant/--template/--theme/--font-->
              documents/resume-{backend,systems,learning}[-{classic,compact}].{pdf,svg}
```

`src/main.typ` is the only entry point. Everything about a rendered document is
a typst `--input`, not a source edit:

| input      | values                           |
| ---------- | -------------------------------- |
| `variant`  | `backend`, `systems`, `learning` |
| `template` | `rail`, `classic`, `compact`     |
| `theme`    | `teal`, `slate`, `ink`           |
| `font`     | `lato`, `pt-serif`               |

Those four are the same knobs a server-side renderer would take per request,
which is the point: the static build and a dynamic renderer can share one
template set rather than diverging.

### Templates

- **`rail`** — the reference layout: wide narrative column, coloured
  information rail, portrait well. The default; its output claims the
  unsuffixed filenames `apps/www` serves.
- **`classic`** — one column, one colour, no rail, no portrait. Multi-column
  PDFs are where applicant tracking systems most often interleave columns and
  destroy reading order, so this is the one to send when the posting routes
  through an unknown ATS.
- **`compact`** — rail moved left, portrait dropped, denser main column and
  more bullets per entry.

`rail` and `compact` are two configurations of one engine (`src/lib/two-column.typ`),
not two copies of it.

### One page, and a full one

A fixed type size can satisfy "never spills to page two" or "doesn't leave the
bottom third empty", but not both for a given body of content. So the size is
solved for rather than chosen: every length in the templates is expressed in
`em`, `src/lib/fit.typ` walks a ladder of scales and takes the largest one whose
laid-out height fits the column, and whatever slack the discrete ladder leaves
is then spent as extra space between sections rather than pooled at the bottom.

Nothing is clipped to achieve this. If even the tightest scale overflows, the
content runs onto a second page and the page-count assertion fails the build —
a fixed-height box that swallowed the overflow would let a broken résumé pass
as a one-page document.

### `src/data/personal.typ`

`src/data/resume.typ` is distilled from the two repositories, and every claim in
it traces to code (`src/canon/resume.meta.typ` records the trace). Degrees,
spoken languages, certifications, and non-engineering roles cannot be derived
that way, so they live in `personal.typ` and ship **empty**. A résumé makes
hiring claims about a real person; an invented certification is not a
placeholder but a false statement waiting to be sent to an employer.

Templates render a section only when its list is non-empty, and the fitting pass
redistributes the space, so filling these in later costs nothing structurally.

### ATS checking

`pnpm build` compiles all nine (variant × template) documents and then runs
`scripts/check-ats.mjs`, which asserts against the **rendered PDFs** rather than
against the source data. A source-level assertion can only prove a string exists
in `src/data` — not that any template put it on the page — so a term dropped by
a layout, pushed to a second page, or emitted as an unmappable glyph would still
pass. Each PDF is read back with Poppler's `pdftotext` and must expose:

- the candidate name and contact details;
- `SUMMARY`, `SKILLS`, and `EXPERIENCE` as headings, in that order;
- the variant's own focus label;
- the shared qualification seam (TypeScript, data modeling, production,
  distributed, asynchronous, event-driven, Docker, testing);
- at least 180 words, and no Unicode replacement glyphs.

The seam is a guard against a targeted variant becoming so concise that it stops
exposing qualifications the underlying work genuinely supports. It does not
invent tenure, Kubernetes, scale, or employment history.

`documents/resume-<stem>.ats.txt` is written for each document — roughly what a
text-oriented parser receives. `pnpm check:ats` re-runs the check against
already-compiled PDFs.

### The web reading view

`apps/www` renders the résumé two ways, because a PDF only works one of them.

On desktop the `/resume` route embeds the PDF. On mobile it cannot: **no mobile
browser renders a PDF inside an `<iframe>`** — Android Chrome hands the URL to
the download manager and iOS Safari shows a dead, non-scrollable first page.
That is a browser capability, not a header; nothing about `Content-Disposition`
changes it.

The previous fallback was the compiled SVG shown as an `<img>`. Typst's SVG
export contains **no text at all** — every glyph is a `<path>`, ~3,900 `<use>`
references per document — so it was a 1.1 MB _picture_ of a résumé, marked
`aria-hidden`, with a hand-written transcript in `apps/www` beside it for
anyone who could not see it. That transcript was a second copy of the content
and had already drifted from this package.

So the text is derived instead. `src/main.typ` attaches the composition to the
document it just laid out as `<resume-export>` metadata; `scripts/export-data.mjs`
reads it back with `typst query` and writes `src/react/generated/data.ts`
(~7 KB per variant), which `src/react/resume-document.tsx` renders as ordinary
semantic HTML. Run `pnpm export:data` after changing content; `pnpm build` does
it automatically.

`tsc` checks the generated data against `src/react/types.ts`, so reshaping
`src/data/resume.typ` fails the build rather than blanking a section.

The reading view is **not** a reproduction of the print templates and should not
become one — two-column layouts read badly on a phone, and mirroring the rail
would mean making every template and theme change twice with nothing able to
assert the two agree. The PDF stays the canonical artefact; this is how it is
read without downloading it.

Typst's own HTML export was evaluated and rejected: it is gated behind
`--features html`, documented as "do not rely on this feature for production
use cases", and errors on these templates (`page configuration is not allowed
inside of containers`).

### Typography checking

`pnpm build` also runs `scripts/check-layout.mjs` (or `pnpm check:layout` on
already-compiled PDFs), which asserts that no two adjacent lines are set tighter
than ordinary body leading.

This exists because of a real failure. Several templates stack a title over a
subtitle — name over role, project over stack, rail heading over its blurb — and
Typst's `#v(.., weak: true)` collapses against an adjoining block. Those gaps
silently went to zero and the subtitles' line boxes rode up into the lines above
them. The source looked fine, the one-page assertion passed, and the ATS text
check passed: all the text was present and in order, just overlapping. Only
looking at the PDF caught it.

So it is measured. `pdftotext -bbox-layout` gives a bounding box per rendered
line; for each pair of vertically adjacent lines sharing a column, the check
takes `(next.yMin - current.yMax)` normalised by the shorter line's height,
which makes it independent of the type scale the fitting pass solves for. The
zero point is not "touching" — a text box spans the font's full ascent and
descent, so normal leading measures slightly positive and a negative value means
the boxes genuinely overlap.

Measured across all nine documents: Lato body leading sits at `+0.030`, PT Serif
at `+0.042`, the worst legitimate pair at `-0.009`, and the defects this was
built from at `-0.120` through `-0.517`. The floor is `-0.05`.

PT Serif's ascent and descent run taller than Lato's at the same nominal size,
so `STACK-GAP` and `HEADING-GAP` in `src/lib/parts.typ` are set for the serif —
sizing them for the sans is how the overlap happened in the first place.

It is a floor, not a designer: it catches cramming and collision, not whether
spacing looks good. Gaps that are too _wide_ remain a judgement call.

`pdftotext` is a build input, not a convenience: it comes from the repo's nix
shells (`nix/pdf`). Outside nix, install `poppler-utils` or point
`PDFTOTEXT_BIN` at a compatible executable.

`apps/www`'s `/resume` route uses the compiled SVG on narrow viewports so mobile
web views render the document as ordinary web content instead of handing the
PDF off to a download flow. Desktop retains the browser's full PDF viewer, and
the explicit PDF download remains available on every viewport.

### No system `typst` dependency, and no system fonts

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

Fonts are resolved the same way by `scripts/fonts.mjs` and passed as
`--font-path`, with system fonts **ignored**. Typst silently falls back to
whatever the host has installed when a family isn't found, which means different
glyphs, different line breaks, and therefore a different page budget on a laptop
than in CI — and everything above (the one-page solve, the ATS text check) is
only meaningful if the font set is fixed. Faces are pinned by SHA-256 rather
than by upstream revision, so a reissue fails the build loudly instead of
silently re-flowing the page.

`pnpm watch` runs `typst watch` on the default composition for live
recompilation while editing.

## Out of scope for now

- In-browser (WASM) compilation / live preview without a rebuild.
- Arbitrary bullet-level mixing. The selectable unit is intentionally a complete
  composition so every PDF remains a coherent argument.
- Client-side selection of template/theme/font against a live renderer. The four
  inputs above are the seam that work will attach to; today they are resolved at
  build time.
