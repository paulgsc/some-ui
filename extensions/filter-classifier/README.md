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
(`adapter/swatches/index.ts`) — against a small, human-labeled fixture corpus. None
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
- **`sampleBodyComfort()`** — `Φ_comfort` (`adapter/swatches/index.ts`), generalized
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

Nine fixtures span the grammar the classifier needs to bucket correctly.
Every color in every fixture was checked against the actual comfort math
(relative luminance, WCAG contrast ratio, HSL saturation) before being
labeled — see the file's own `note` field per fixture for the numbers.

| id                           | grammar                              | label         | alreadyDark | comfortable |
| ---------------------------- | ------------------------------------ | ------------- | ----------- | ----------- |
| `plain-light-card`           | unthemed-light-canvas                | needs-theming | false       | n/a         |
| `default-swatch-rendered`    | comfortable-dark-default             | comfortable   | true        | true        |
| `default-swatch-legacy-text` | frozen-hostile-legacy-default-text   | **hostile**   | true        | **false**   |
| `muted-warm-dark`            | comfortable-dark-muted               | comfortable   | true        | true        |
| `sun-glare-badges`           | harsh-saturated-badges-on-void       | **hostile**   | true        | **false**   |
| `cool-blue-preserve-band`    | comfortable-dark-alt-swatch          | comfortable   | true        | true        |
| `borderline-mid-gray`        | achromatic-borderline-threshold      | borderline    | true        | false       |
| `neon-text-moderate-surface` | bright-text-on-moderate-dark-surface | **hostile**   | true        | **false**   |
| `transparent-ambiguous`      | transparent-unknown-fallback         | ambiguous     | false       | n/a         |

`neon-text-moderate-surface` (#735) is the counterpoint `sun-glare-badges`
can't isolate on its own: its background is an ordinary moderate-dark
surface, not a black void, and its contrast (15.97) sits comfortably inside
the comfort band — a contrast-or-blackness-only check would pass it through.
Only saturated near-yellow body copy (textLuminance 0.937, just over the
0.92 ceiling) fails. The point: bright _text_ is the hostile signal, not a
bright _background_ — a bright background is trivial to catch on luminance
alone.

`sun-glare-badges` is the corpus's centerpiece: it is the direct fixture form
of #722's annotated screenshot (a dark dashboard carrying fully-saturated
accent badges — literally captioned "the sun" by a human looking at it).

**`default-swatch-rendered` / `default-swatch-legacy-text` (#735)** are a
deliberate pair, not a duplicate. The first real Comfort Lab eye score
against the _shipped default swatch's own_ `(bg0, text0)` pair came back
hostile (overall 19, "the text is basically the sun") despite passing the
original predicate — `text0`'s original `#e2e8f0` produced contrast 15.35,
inside the old `[7.5, 16]` band but right at the ceiling. `CONTRAST_BAND_MAX`
in `swatches.ts` tightened from 16 to 14, and `text0` moved (first to
`#cfdae8`, then to `#8699b1` — a genuinely desaturated "reading gray"). The
argument behind the second move: most dark themes optimize for maximum
perceived contrast while staying dark; sustained reading comfort is better
served by minimizing luminance _transitions_ over a session instead. That
argument applies to `bg0` too — `#0d1117` is darker than VS Code, Tokyo
Night, Catppuccin, or Gruvbox, none of which go near-black, because it
maximizes the adaptation distance to anything brighter. `bg0` moved to
`#171c25` (lands almost exactly on Tokyo Night's own background), with
`bg1`/`bg2`/`bg3`/`surface`/`inputBg` shifted to preserve the original
luminance gaps between tiers rather than colliding with them. Together these
land contrast at 5.86, below the old `CONTRAST_BAND_MIN` of 7.5 — a floor
that had only ever been tightened from above, never re-examined from below.
It moves to 5.5. `some-filter`'s own `swatches.test.ts` enforces the whole
predicate with **zero exceptions** — "every registry entry satisfies
Φ_comfort" runs over the whole registry, `default` included, so a hostile
swatch fails the build instead of silently reaching users.

That fix exposed a coupling bug in the fixture itself: every other entry in
this file hardcodes its colors, which is correct for a fixed regression case
but was wrong here, where the `note` claimed to test "the shipped default
swatch's own tokens" while the `html()` held a hardcoded copy that would
silently stop matching the registry the next time someone edited `text0`.
The fix splits it in two:

- **`default-swatch-rendered`** reads `SWATCHES[DEFAULT_SWATCH_ID].bg0`/
  `.text0` live (imported from `@some-extension/filter/adapter/swatches`,
  the same package path `harness/entry.ts` already uses) — it answers "does
  today's shipped default satisfy Φ_comfort," and tracks the registry
  automatically. `expectComfortable: true` here isn't a snapshot of a
  specific pair; it's the actual invariant this fixture exists to enforce.
- **`default-swatch-legacy-text`** hardcodes the _original_ `#0d1117`/
  `#e2e8f0` pair forever, independent of whatever `default.text0` becomes
  next — permanent regression evidence that this exact pair must never
  reclassify as comfortable, even if `CONTRAST_BAND_MAX` is ever loosened
  back toward 16.

## Adding a fixture (#731 — the full loop)

This file and `eye-scores.json` together _are_ the
human-verification record #721 Story 5 / #726 Story 5 ask for — kept in-repo
and diffable rather than behind a live review UI. Found a real page (or a
false positive/negative) worth adding? The full loop, in order:

0. Decide which of two things this fixture is (#735): a **regression
   case** — a specific `(bg, text)` pair that must always classify the same
   way — should hardcode its colors, the same way every fixture except
   `default-swatch-rendered` does. A fixture that's meant to track **the
   current value of a registry swatch** should read from `SWATCHES` instead
   (see `default-swatch-rendered`/`default-swatch-legacy-text` above for
   the split and why conflating them is a real bug, not a style choice) —
   otherwise its `note` will describe "the shipped X" while its `html()`
   quietly stops being that the next time the registry changes.
1. Add an entry to `CORPUS` in `tests/e2e/fixtures/corpus.ts` with the
   rendered `(bg, text)` pair you observed.
2. Verify your expected `expectAlreadyDark`/`expectComfortable` against the
   actual predicate (not by eyeballing the RGB values) — the simplest way is
   a scratch script reimplementing `relativeLuminance`/`contrastRatio`/HSL
   saturation, or temporarily logging `comfortReport`'s output from a unit
   test in `some-filter`.
3. Write the `note` as the reasoning a reviewer would need to agree or
   disagree with the label — cite the actual numbers, not just "looks dark."
4. Score it yourself, blind, **before** looking at what you wrote in
   step 2, and record it as a `<fixture-id>.eyescore.json` in the schema
   below (see "Comfort Lab" for why there is no scoring UI right now).
5. `pnpm eye-score:merge <file>` to commit the score.
6. Run `pnpm test:e2e`. A mismatch anywhere — the classifier's own verdict
   or the oracle regression — is a finding about the classifier or your
   label, not license to change either side just to force a pass.

**Worked example**, done for real during development for `plain-light-card`
(then reverted before committing — see the oracle regression section below):
scored it `overall: 60` without re-deriving what the classifier would
actually say for a plain white card with dark text, merged it, ran the
suite — it failed, because `satisfiesComfort` correctly rejects the pair's
~17.7:1 contrast (above the 16 ceiling) regardless of luminance, and a `60`
(reads as "comfortable") doesn't survive contact with that. The failure
message named the fixture, the score, and the classifier's real verdict.
That is Comfort Lab working as designed, not a bug in the fixture or the
classifier — it's why step 4 says score _before_ checking step 2's numbers.

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
second, independent oracle: a human looks at the _exact same rendered
fixture_ Playwright renders and records a richer subjective score — not a
replacement for `satisfiesComfort` or the corpus's own labels, a second
check against them.

```
DOM fixture → Playwright renders it → classifier regression test   (above)
DOM fixture → a human looks at it   → human eye-score              (this section, #726)
```

### No scoring UI right now

The scoring UI (a blind-mode panel beside each fixture rendered in an
`<iframe srcDoc>`) lived in Storybook, and was removed with it (#1687). It belongs in some-filter itself, as a popover, if this
story continues. Until then a score is written by hand in the schema below
and merged with `pnpm eye-score:merge`. Score blind: render the fixture's
`html()` and judge it before reading its `note` or expected labels.

One thing about rendering a fixture to score it (#735):

- **The fixture's own colors** can be repainted by the
  _browser itself_: Chromium's forced/auto-dark rendering detects an
  "unprepared" page (one with authored `background-color`/`color` and no
  `color-scheme` declaration) and repaints it toward a dark-mode-appropriate
  palette when the OS/browser prefers dark — a pure paint-time transform, so
  `getComputedStyle` (and therefore the classifier and Playwright) never see
  it, but a reviewer's eyes do. Every fixture with explicit colors now
  declares `<meta name="color-scheme" content="light dark">` to opt out.
  `transparent-ambiguous` — the one fixture with no explicit colors — was
  never affected, which is what pointed at this rather than an extension or
  a whole-page filter.

The fix is not visible in the fixture's own colors — it makes sure the
browser never substitutes its own judgment for the literal, ground-truth
pixels a reviewer is supposed to be scoring.

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

### Persistence (`tests/e2e/fixtures/eye-scores.json`, #729)

Fold a `<fixture-id>.eyescore.json` holding one `EyeScore` into the
committed map with:

```sh
pnpm eye-score:merge ~/sun-glare-badges.eyescore.json
```

`scripts/merge-eye-score.mjs` overwrites just that one fixture's entry and
re-sorts keys, so a re-score produces a one-entry diff, never a full-file
rewrite or a duplicate/orphaned key. It's deliberately dependency-free
(plain Node `fs`/`path`, no TypeScript import), so it does not validate.
`corpus.spec.ts`'s "every committed eye score is valid for its fixture"
does, over the whole committed map: a known fixture id, every score in
0–100, `overall` equal to `computeOverall` of the four, a reviewer, an ISO
`scoredAt`, and notes wherever `validateEyeScore` requires them.

`eye-scores.json` holds only real human scores. Populating it is the point
of scoring fixtures yourself, not something to fake to make the file look
populated.

### The oracle regression (`tests/e2e/specs/eye-score-oracle.spec.ts`, #730)

For every fixture id present in `eye-scores.json`, this spec renders the
fixture (no extension, same as every other spec here), runs the real
`sampleBodyComfort()` through the harness, and asserts the classifier's
`comfortable` boolean agrees with the human's `eyeScoreVerdict` —
`checkOracleAgreement` (`eye-score.ts`) exempts the declared borderline band
(41–59) rather than treating it as a forced tie-break. A disagreement fails
with the fixture id, the recorded score, and the classifier's actual verdict
in the message — not a bare `toBe` mismatch.

Because `eye-scores.json` is empty today, this suite currently reports one
skipped placeholder test rather than silence — it activates automatically,
with zero code changes, the moment a real score is merged in. The mechanism
itself is proven correct independent of real data:
`eye-score.spec.ts`'s `checkOracleAgreement` cases exercise the boundary
with synthetic values (including a smoke test run manually against a real,
then-reverted, fake entry during development — a disagreement was
correctly caught and failed the suite, then the fixture was reverted to
`{}` before committing, since fabricated scores must never be presented as
real human judgment).

### Unscored fixtures (#731)

- **A missing `eye-scores.json` entry** — requires an actual human to look at
  the fixture (#726's whole point); it can't be forced or faked. **One
  `test.skip` per unscored fixture**, each naming exactly which fixture,
  so the gap stays visible in the report (matching #730's own empty-file
  placeholder) without turning the suite red for something only a human
  can supply.
