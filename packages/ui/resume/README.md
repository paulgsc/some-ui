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
src/resume.typ           (render-resume: the document as a function)
              ↓ called by
src/main.typ  --variant/--template/--theme/--font-->
              documents/resume-{backend,platform,fullstack}[-{classic,compact,vanilla,safe,conventional}].{pdf,svg}
```

`src/main.typ` is the public build's entry point, and the only one the build
and `typst watch` use. Everything about a public document is a typst `--input`,
not a source edit:

| input      | values                                                          |
| ---------- | --------------------------------------------------------------- |
| `variant`  | `backend`, `platform`, `fullstack`                              |
| `template` | `rail`, `classic`, `compact`, `vanilla`, `safe`, `conventional` |
| `theme`    | `teal`, `slate`, `ink`                                          |
| `font`     | `lato`, `pt-serif`                                              |

The static build and the LAN render service (below) share one template set
rather than diverging: both call `src/resume.typ`. The service takes a variant
and an ATS template, uses that template's own theme and font, and adds contact
details that are never committed, never as an input.

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
- **`vanilla`** — the plainest layout in the set: left-aligned header, no rule
  under section headings, no grid-based date alignment, no italicized project
  premise. For a posting that routes through a parser old or strict enough
  that even `classic`'s thin rule and two-cell date grid feel like a risk.
- **`safe`** — `classic`'s reading order with Education promoted to sit
  directly under Experience and the project premise dropped, for a submission
  artifact that spends its words on evidence rather than architecture prose.
- **`conventional`** — the traditional reverse-chronological format: no
  separate "Key achievements" or "Engineering practice" section (folded into
  Experience/Skills, the way a traditional résumé does it), Education grouped
  with Experience, no project premise.

`rail` and `compact` are two configurations of one engine (`src/lib/two-column.typ`),
not two copies of it. `vanilla`, `safe`, and `conventional` default to the
same monochrome `ink` theme `classic` does — none of the three ATS-safe
templates carry portfolio color by default — and share `classic`'s and
`rail`'s pinned fonts (`lato`/`pt-serif`) rather than introducing new ones.

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

### Contact details (PII) and the LAN render service

A phone number, a LinkedIn URL, a street address or a different email never
belong in this repository, so none is in `src/data`. `src/resume.typ`'s
`render-resume` takes them as a value, which `src/lib/pii.typ` checks against
`src/pii/envelope.json`: what each field may hold (length and pattern) and
which templates render them. Only the ATS templates (`classic`, `vanilla`,
`safe`, `conventional`) do; `rail` and `compact`, whose PDFs the website links,
refuse PII, and `<resume-export>` never carries it.

PII is never a typst `--input`. An input is a process argument, which anything
that can list processes can read. `src/main.typ`, the public build's entry,
passes none. `compileWithPii` (`scripts/typst.mjs`) is the one way in: it writes
the arguments into a two-line program as the bytes of their JSON, which typst
reads on stdin, and it takes the PDF back from typst's stdout. The checks hand
that PDF to `pdftotext` on stdin as well. No process argument, environment
variable or file ever holds a value.

The way in is the render service, `scripts/serve.mjs` (`pnpm serve`):
`POST /render` with `{ variant, template, pii }` returns the PDF. It runs the
same pinned typst and fonts as the build, and runs `check-ats.mjs` (requiring
every supplied field on the page) and `check-layout.mjs` on every render before
returning it. Nothing it logs or returns carries a value: the checks in
`pii.typ` name a field and its limit, not what was sent. Its container has no
writable path at all.

It is reachable from the home network only. `infra/compose/resume.yml` builds
this directory's `Dockerfile` on the box and publishes no port; `apps/www`'s
nginx proxies `/api/resume/` to it, and the LAN build's résumé builder page
(`apps/www/src/routes/_dashboard/_lan/`) is the form that calls it, through
`renderResume` (`src/pii/render-client.ts`). In `vite dev`, run `pnpm serve` on
the host instead.

`pnpm build` proves every layout the service can be asked for, with
worst-case faux PII (`verifyPii` in `scripts/compile.mjs`).

#### Scope and limits: one author's LAN tool, not a pattern

This is built for exactly one user, the author, on the home network. It has no
authentication, no rate limit and no isolation between requests. It writes a
typst program from request data and runs Poppler on the result before
answering. All of that is acceptable here and none of it is a design to copy:
a service with other users, or one reachable from the internet, would embed
typst as a library and need real auth. Do not cite this one as precedent.

What the PII handling protects is narrow. These details go out on every
application the résumé is sent with, into forms and systems we don't control
that may keep, share or sell them, so in practice they are public. The goal is
only that they never enter this repository, its public site or its static
build, and that the box keeps no copy (no argument, file or log). It is not
secrecy.

Two claims a review checks (`CLAUDE.md`, "Gray-area invariants"); both held
when declared:

> **RP1: PII reaches typst only through `compileWithPii`.**
>
> - _Claim:_ a PII value is never in a typst `--input`, a process argument, an
>   environment variable or a file. It is passed only as the stdin program
>   `compileWithPii` (`scripts/typst.mjs`) writes, and `src/main.typ` passes
>   `pii: none`.
> - _Falsified by_ a hunk in `scripts/` or `src/` that adds `pii` to
>   `inputArgs` or to any spawn's arguments or environment, writes a request
>   body or a PDF built with PII to disk, calls `render-resume` with PII from
>   anywhere else, or makes `main.typ` pass anything but `none`.
> - _Scope:_ `packages/ui/resume/scripts`, `packages/ui/resume/src`.
> - _Why not enforced:_ mechanical, not yet a rule. A test can record the
>   argv and environment of shimmed `typst`/`pdftotext` binaries during a
>   render (done by hand when RP1 was declared). It needs typst, fonts and
>   Poppler, and this package has no test runner.
>
> **RP2: the service logs no request text and returns none.**
>
> - _Claim:_ a render through `scripts/serve.mjs` logs only method, path,
>   status, time and the allow-listed variant and template; `assertAtsText`,
>   `checkDocument` and `pdftotext` write nothing to the console. A refusal's
>   message names fields, limits and allowed values, and never contains text
>   from the request, a key included.
> - _Falsified by_ a hunk in `serve.mjs` that logs the body, a `pii` value or
>   key, or typst's stderr; that builds a `Refusal` from request text; that
>   passes on a typst assertion or check message other than `pii.typ`'s, the
>   one-page check's and `assertAtsText`'s; or that deletes, weakens or moves
>   after the compile its unknown-key guard (`pii.typ` names an unknown key).
>   Or a hunk in `src/lib/pii.typ` or `scripts/check-ats.mjs` that adds,
>   edits or deletes any part of an assertion or `assertAtsText` message so it
>   can contain a value, including by dropping the field-name substitution for
>   a missing PII term; or one in `scripts/check-ats.mjs`,
>   `scripts/check-layout.mjs` or `scripts/pdftotext.mjs` that makes
>   `assertAtsText`, `checkDocument` or `pdftotext` write to the console.
> - _Scope:_ `scripts/serve.mjs`; the messages of `src/lib/pii.typ` and
>   `assertAtsText` that it passes on; and the check functions it calls.
> - _Why not enforced:_ whether a string derives from the request is
>   dataflow, which no lint here traces.

### ATS checking

`pnpm build` compiles all eighteen (variant × template) documents and then runs
`scripts/check-claims.mjs`, `scripts/check-ats.mjs`, and `scripts/check-layout.mjs`
in that order. `check-ats.mjs` asserts against the **rendered PDFs** rather than
against the source data. A source-level assertion can only prove a string exists
in `src/data` — not that any template put it on the page — so a term dropped by
a layout, pushed to a second page, or emitted as an unmappable glyph would still
pass. Each PDF is read back with Poppler's `pdftotext` and must expose:

- the candidate name and contact details;
- `SUMMARY`, `SKILLS`, and `EXPERIENCE` as headings, in that order;
- the variant's own focus label;
- a role-family qualification cluster, matched against the Summary+Skills
  text specifically (the part every template renders in full and never
  truncates) — `backend` requires Rust/REST/SQL/asynchronous/testing/CI/CD,
  `platform` requires GitHub Actions/CI/CD/Docker/contract/observability,
  `fullstack` requires React/web application/REST API/component/browser/testing;
- at least 180 words, and no Unicode replacement glyphs.

Each cluster is a guard against a targeted variant becoming so concise that it
stops exposing qualifications the underlying work genuinely supports. It does
not invent tenure, Kubernetes, scale, or employment history.

`scripts/check-claims.mjs` runs first and checks the _source_ rather than a
rendered PDF: it recomputes this repository's own workspace-package and
browser-extension counts and fails if `src/data/resume.typ`'s prose disagrees,
and it scans that same file for a small forbidden-term list (`Kubernetes`,
`Entity Framework`, `on-call`, `uptime`, ...) and for "production" used without
a qualifier. See that script's header comment for why `paulgsc/server`'s own
crate count is deliberately not one of the things it can check.

`documents/resume-<stem>.ats.txt` is written for each document — roughly what a
text-oriented parser receives. `pnpm check:ats` re-runs the check against
already-compiled PDFs.

### The web reading view

`apps/www` renders the résumé two ways, because a PDF only works one of them.

On desktop the `/resume` route embeds the PDF. On the phone it cannot: **Android
Chrome renders no PDF inside an `<iframe>`**, and hands the URL to the download
manager instead. That is a browser capability, not a header; nothing about
`Content-Disposition` changes it.

The previous fallback was the compiled SVG shown as an `<img>`. Typst's SVG
export contains **no text at all** — every glyph is a `<path>`, ~3,900 `<use>`
references per document — so it was a 1.1 MB _picture_ of a résumé, marked
`aria-hidden`, with a hand-written transcript in `apps/www` beside it for
anyone who could not see it. That transcript was a second copy of the content
and had already drifted from this package.

So the text is derived instead. `src/resume.typ` attaches the composition to the
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
`PDFTOTEXT_BIN` at a compatible executable. Where it is missing, a local build
still completes — with a warning, and with the ATS and layout checks skipped —
but a build with `CI` set fails instead, so CI stays the gate. Any failed build
removes `documents/` entirely rather than leaving unverified artifacts without
a manifest.

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

- In-browser (WASM) compilation / live preview without a rebuild. The LAN
  render service above compiles on demand instead, with the same typst and
  fonts as CI, which a browser build of typst could not promise.
- Arbitrary bullet-level mixing. The selectable unit is intentionally a complete
  composition so every PDF remains a coherent argument.
- Selecting theme and font against the live renderer. The service takes a
  variant and an ATS template, and uses that template's own theme and font.
