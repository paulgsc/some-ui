# @some-extension/filter-classifier

A standalone Playwright corpus for training and verifying `some-filter`'s DOM
comfort/theme classifier — [#721](https://github.com/paulgsc/some-ui/issues/721)
(visual comfort metric epic) and its motivating sub-issue
[#722](https://github.com/paulgsc/some-ui/issues/722).

## Why this is its own workspace

`some-filter`'s own e2e suite (`extensions/some-filter/tests/e2e`) proves the
**extension** wires the classifier correctly end to end — it loads the built
extension into Chromium via `--load-extension`, which requires
`pnpm build:chromium` first and (on NixOS) the Nix-patched Chromium binary at
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

This suite tests the **classifier itself** — `classifyPage`/`detect`
(`theme-detector.ts`) and `comfortReport`/`satisfiesComfort`
(`adapter/swatches.ts`) — against a small, human-labeled fixture corpus. None
of that needs an extension: a plain Chromium page gives real
`getComputedStyle`/rendering behavior (which is the entire reason this is
Playwright and not a jsdom unit test), with no build step and no `--load-extension`
prerequisite. Run it with:

```sh
pnpm test:e2e
```

No `nix develop`, no `build:chromium`, no extension packing.

## What's actually under test

The harness (`tests/e2e/harness/entry.ts`) imports the real, shipped modules
directly from `@some-extension/filter`'s source (via that package's `./*`
export) and bundles them with esbuild — the same "harness wires the real
modules into a real page" pattern `extensions/transport`'s own conformance
suite uses. Nothing here is a reimplementation of the classifier; a fix
landed in `some-filter` is exercised by this suite on the next run with no
change needed here.

Two independent verdicts are exposed, kept deliberately separate:

- **`detect()` / `classify()`** — the existing page-level light/dark
  heuristic: is this page unthemed (needs our dark theme), or already dark
  enough that we should restore native styling? Luminance-only.
- **`sampleBodyComfort()`** — `Φ_comfort` (`adapter/swatches.ts`), generalized
  by this PR from "a registry `Swatch`'s hex tokens" to any observed
  `(bg, text)` sample, so it can run over a live `getComputedStyle` read
  instead of only static swatch data.

**The gap these two verdicts expose is the point of #722.** A page can read
as `alreadyDark=true` (dark by luminance) while still failing `Φ_comfort` —
a `#fff`-on-`#000` surface is exactly this: dark by any luminance measure,
and simultaneously the "sun" pattern #722's screenshot names (maximum
contrast, achromatic, text as bright as the eye can register). Today's
production `detect()` cannot tell these apart; this corpus makes that gap a
checked, falsifiable property of the repo instead of an anecdote.

## The corpus (`tests/e2e/fixtures/corpus.ts`)

Seven fixtures span the grammar the classifier needs to bucket correctly.
Every color in every fixture was checked against the actual comfort math
(relative luminance, WCAG contrast ratio, HSL saturation) before being
labeled — see the file's own `note` field per fixture for the numbers.

| id                        | grammar                         | label         | alreadyDark | comfortable |
| ------------------------- | ------------------------------- | ------------- | ----------- | ----------- |
| `plain-light-card`        | unthemed-light-canvas           | needs-theming | false       | n/a         |
| `default-swatch-rendered` | comfortable-dark-default        | comfortable   | true        | true        |
| `muted-warm-dark`         | comfortable-dark-muted          | comfortable   | true        | true        |
| `sun-glare-badges`        | harsh-saturated-badges-on-void  | **hostile**   | true        | **false**   |
| `cool-blue-preserve-band` | comfortable-dark-alt-swatch     | comfortable   | true        | true        |
| `borderline-mid-gray`     | achromatic-borderline-threshold | borderline    | true        | false       |
| `transparent-ambiguous`   | transparent-unknown-fallback    | ambiguous     | false       | n/a         |

`sun-glare-badges` is the corpus's centerpiece: it is the direct fixture form
of #722's annotated screenshot (a dark dashboard carrying fully-saturated
accent badges — literally captioned "the sun" by a human looking at it).

## Adding a fixture

This file _is_ the human-verification record #721 Story 5 asks for — kept
in-repo and diffable rather than behind a live review UI, which is out of
scope for this first pass. Found a real page (or a false positive/negative)
worth adding?

1. Add an entry to `CORPUS` in `tests/e2e/fixtures/corpus.ts` with the
   rendered `(bg, text)` pair you observed.
2. Verify your expected `expectAlreadyDark`/`expectComfortable` against the
   actual predicate (not by eyeballing the RGB values) — the simplest way is
   a scratch script reimplementing `relativeLuminance`/`contrastRatio`/HSL
   saturation, or temporarily logging `comfortReport`'s output from a unit
   test in `some-filter`.
3. Write the `note` as the reasoning a reviewer would need to agree or
   disagree with the label — cite the actual numbers, not just "looks dark."
4. Run `pnpm test:e2e` and confirm the new fixture's spec passes. If it
   doesn't, that's either a wrong label or a real classifier gap — figure out
   which before changing either side to force a pass.

## Non-goals (this PR)

This corpus does **not** attempt the full `ComfortVector`/`ComfortScore`
scoring engine (#721 Stories 2–3), a calibration loop (Story 6), a CI gate
(Story 7), or comfort design tokens (Story 8). It is the foundation those
stories need: a small, falsifiable, human-verified ground truth, and a
standalone harness to check the shipped classifier against it without
needing to build or load an extension.

## Comfort Lab — an independent human "eye score" oracle (#726)

`corpus.ts`'s `expectAlreadyDark`/`expectComfortable` fields are still,
structurally, "a human typed a boolean into a TS file." **Comfort Lab** is a
second, independent oracle: a Storybook review surface where a human looks
at the _exact same rendered fixture_ Playwright renders and records a
richer subjective score — not a replacement for `satisfiesComfort` or the
corpus's own labels, a second check against them.

```
DOM fixture → Playwright renders it → classifier regression test   (above)
DOM fixture → Storybook renders it  → human eye-score              (this section, #726)
```

### Running it

```sh
STORYBOOK_WORKSPACE=filter-classifier pnpm storybook
```

from the repo root (there is exactly one Storybook instance for the whole
monorepo — `.storybook/main.ts` — scoped here via its `STORYBOOK_WORKSPACE`
env var so only this package's stories load). Open **Extensions › Filter
Classifier › Comfort Lab** — one story per `CORPUS` fixture
(`src/comfort-lab/ComfortFixture.stories.tsx`).

Each story renders the fixture in an isolated `<iframe srcDoc>` (not a
bridged component — there's no component here, only a raw HTML string, and
the iframe means the fixture's own explicit backgrounds render exactly as
Playwright sees them, with no Storybook theme/CSS bleeding in) alongside
`EyeScorePanel` (`src/comfort-lab/EyeScorePanel.tsx`): four sliders
(luminance / contrast / color tone / eye strain, each 0–100), notes, and a
reviewer field. **Blind mode**: the fixture's recorded label stays hidden
until "Reveal recorded label" is clicked, so you score what you actually
see, not what the corpus file already claims.

### The schema (`tests/e2e/fixtures/eye-score.ts`, #728)

```ts
type EyeScore = {
  luminanceComfort: number // 0-100
  contrastComfort: number // 0-100
  colorComfort: number // 0-100
  emotionalComfort: number // 0-100
  overall: number // derived: the rounded mean of the four sub-scores
  reviewer: string
  notes: string
  scoredAt: string // ISO timestamp
}
```

Worked example — `sun-glare-badges` (#722's own motivating fixture), scored
low across the board:

```ts
{
  luminanceComfort: 10,
  contrastComfort: 5,
  colorComfort: 20,
  emotionalComfort: 0,
  overall: 9, // computeOverall({...}) — mean of the four, rounded
}
```

`overall >= 60` reads as **comfortable**, `<= 40` as **hostile**, `41–59` is
a declared **borderline** band (see `eyeScoreVerdict`) — not a compromise
number to hit, but the boundary #730's Playwright oracle regression will
enforce the classifier against. A score that disagrees with the fixture's
own `expectComfortable` requires non-empty `notes` explaining why
(`requiresExplanation`/`validateEyeScore`) — forces the reviewer to justify
a disagreement rather than silently record one; a borderline verdict is
exempt (it's the acknowledged gray zone, not a disagreement).

### Persistence (#729 — not yet built)

"Download annotation" produces a standalone `<fixture-id>.eyescore.json` via
a plain browser download (`Blob` + `URL.createObjectURL`) — no server, no
change to the shared root `.storybook/main.ts`. Merging downloaded scores
into a single committed `eye-scores.json` (and the Playwright regression
that reads it) is #730; the CLI/workflow that makes merging painless is
#729. Until those land, a downloaded score is not yet enforced anywhere —
Comfort Lab today is the review surface, not yet the gate.

### Why explicit story exports, not one generated from `CORPUS`

Storybook's CSF3 indexer enumerates stories via static analysis of this
file's _named exports_ — every existing `*.stories.tsx` in this repo (e.g.
`extensions/some-filter/src/popup/components/action-bar/index.stories.tsx`)
uses explicit named exports for exactly this reason. A runtime-generated
`export const stories = Object.fromEntries(...)` was tried and confirmed
(via a real `storybook build`/`storybook dev` run) not to produce separate
sidebar entries. The practical consequence: adding a fixture to `CORPUS`
means adding its story export here too — not yet fully automatic. A
coverage check that fails loudly on a missing story, rather than this
silently drifting, is deferred to #731 (corpus expansion workflow).
