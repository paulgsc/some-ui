# The layout table

`generated/youtube-layout.ts` is a checked-in description of how YouTube's
card DOM is shaped on each surface: which catalogue tags (`../selectors.ts`)
appear, how they nest (`ytd-rich-item-renderer > yt-lockup-view-model`, the
fact #1426 turns on), and which of the extension's own extraction selectors
(`fields.ts`) they satisfy. It is the **Layout** universe of the Boundary
Contract (#1433): compile-time known, versioned, and _observed_ rather than
derived — a heuristic with a shelf life.

The Sensor (#1435) classifies a freshly observed node against this table
(`lookup.ts`'s `classifyShape`) instead of discovering its structure at
runtime. When the table has no answer, the Sensor emits `UnknownShape` — a
state, not an error (B4) — and counts it. That counter is this table's
staleness signal.

## Never edit it by hand

A hand-written shape can describe a DOM the vendor does not serve, and the
Sensor would then classify against a fiction. Regenerate it:

```bash
# from extensions/some-censor
pnpm layout:crawl              # the e2e fixtures — offline, deterministic
pnpm layout:crawl -- --live    # youtube.com, one page per surface
```

The instrument is `fingerprint.ts`'s `fingerprintSurface()`, run by
Playwright inside each page. `layout.test.ts` runs the very same function over
the same fixtures under jsdom and fails if the checked-in table has drifted
from what a fixture crawl would produce, so a fixture change and a table
regeneration land together or not at all.

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` selects the browser; unset, Playwright's
own Chromium is used.

## Reading a regeneration diff

A crawl of an unchanged page produces an identical table except for
`generatedAt`, which is the one field that legitimately differs. Everything
else in the diff is a claim about the vendor's DOM: read it as such before
committing.

- A shape gaining or losing `outer` entries is a nesting change — the class
  of drift that produced #1426.
- A `fields` list shrinking means an extraction selector stopped matching on
  that surface; the extractor in `../extract/` will start returning `null`
  there.
- A new tag appearing in the crawl but absent from the table means the
  catalogue is missing it — that is `../selectors.ts`'s change to make first,
  since the occluder derives from the catalogue (#973).

## When to recrawl

The `UnknownShape` counter the Sensor keeps (`layout.unknown_shape`, per
session, with the `reason` from `lookup.ts` as the subject) is the trigger.
Its baseline on a current table is zero on every crawled surface.

| Signal                                                       | Action                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| `unknown_shape` rises above zero on a crawled surface        | Recrawl live; the vendor shipped a shape the table lacks |
| `unknown_shape` with reason `surface-uncrawled` / `fallback` | The `"*"` union is standing in; crawl that surface       |
| A card is reported stranded by `OccluderReleases` (#1425)    | Check `unknown_shape` first — drift is the likely cause  |
| Quarterly, regardless                                        | A live recrawl; diff should be `generatedAt` only        |

Until #1435 lands, the counter does not exist and the cadence is the last row.

## Sources

`source: "fixtures"` means the table came from `tests/e2e/fixtures/*.html`.
Those pages are YouTube-shaped by construction — each documents the real
markup it mirrors — and they are the only pages reachable from an offline
environment, which is why the first checked-in table is built from them.
A `source: "live"` table supersedes a fixture one; the fixture crawl then
remains the determinism check, not the production input. Surfaces the fixtures
do not cover (search, shorts, playlist, channel, subscriptions) are served by
the `"*"` union until a live crawl visits them.

## Schema

`schema.ts` — `LAYOUT_SCHEMA_VERSION` is bumped when the file's _shape_
changes in a way an older reader could not parse. `lookup.ts`'s
`tableStatus()` distinguishes "a schema I do not understand" from "a table
that is merely stale"; the Sensor must treat the former as having no table at
all, never as a partial one.
