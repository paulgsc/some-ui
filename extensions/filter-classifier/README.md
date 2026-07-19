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
