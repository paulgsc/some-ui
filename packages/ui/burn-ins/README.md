# @some-ui/burn-ins

What code draws into every video (STUDIO ST15, #2273): the subtitles, the
Build Journal shorts' headline and card, the authorship mark (ST16, #2274),
and Game Week Bites' cards (GWB12, #2086). A video's takes, footage and
backgrounds are throwaway and stay in Drive or on home; these are generic,
drawn the same way into every video, and only their data changes per video. Web only (`someUi.audience: "web"`);
`apps/www` serves the preview at `/burn-ins` (and `/captions`, its old
address) through the web surface's door.

## What it is

A burn-in is a kind (`captions`, `headline`, `card`, `authorship`,
`game-card`, `preview-mark`, `status-badge`, `terminal`, `cheat-sheet`, `legend`, `rule`, `flow`), a named design and one video's params, which the cut list
carries. `src/lib/burn-in.ts` holds the contract and says why it is the way
it is; each module's header does the same for its part:

- `src/lib/geometry.ts`: the frames, and each one's safe area and regions.
  A burn-in is drawn into the 9:16 short (1080x1920: Playoff Delta, the
  Build Journal shorts) or the 16:9 video (1920x1080: the weekly call), and
  any other frame is refused (SFEED11, #2707). Each kind lays itself out from
  the regions of its frame. The 16:9 frame's body is shorter, so a card that
  fits the short can be refused there, with the reason.
- `src/lib/text.ts`, `src/lib/advances.ts`: text set by the font's own
  advance widths, subtitles' lines included.
- `src/lib/captions/`: the subtitles (GWB11, #2085), every feed's captions
  (SFEED11, #2707), and `captionSpace`, the band a stage leaves for them.
- `src/lib/journal.ts`: the Build Journal headline and card, design `v1`.
- `src/lib/authorship.ts`: whose idea and whose hands, design `cells-v1`:
  an intro and an end card over the bare cards that open and close the
  video, and the mark in the gutter beside the picture between them. Its
  params come only from `@some-ui/video-render`'s `authorshipParams`.
- `src/lib/authorship-link.ts`, `src/components/authorship-record`: the link
  the end card prints, one character a scene, and the page it opens,
  `/authorship?r=…`, which draws the mark's key and that video's record from
  the link alone and keeps nothing.
- `src/lib/game-card.ts`: Game Week Bites' cards (GWB12), design `gridiron-v1`.
- `src/lib/preview-mark.ts`: the mark on every frame of a template's preview
  (SFEED12, #2757), design `plate-v1`, in the frame's foot: under the band
  captions are drawn in, where a stage draws nothing. Only a preview's cut
  carries it (`@some-ui/video-render`'s `previewOf`), never an episode's.
- `src/lib/badge.ts`: the status badge (CARDS1, #2466), design `badge-v1`:
  five states of a claim on screen, each a glyph drawn from paths, which spells out its
  definition at its first appearance in a video. The first card kinds (epic
  CARDS, #2465) draw it beside their lines.
- `src/lib/cards.ts`: what the cards share: a kicker and title in the
  header, items that appear one at a time, each with its badge, the
  values rule, which refuses text that gives a name a value, and the stamp
  (CARDS4, #2469), `as of <repo>@<commit> · <date>` at the foot of every
  card's body, which the cut list writes once for every card.
- `src/lib/terminal.ts`: the terminal card (CARDS2, #2467), design
  `terminal-v1`: a window of lines in the cards' monospace
  (`src/lib/mono.ts`).
- `src/lib/cheat-sheet.ts`: the cheat-sheet card (CARDS3, #2468), design
  `sheet-v1`: a row per task with its badge, command and note; the task
  above the command where the two don't fit side by side.
- `src/lib/legend.ts`, `src/lib/rule.ts`: the legend card (`legend-v1`),
  the five badges beside what they mean, and the rule card (`rule-v1`),
  how far to trust a card as it ages, as three lines of algebra whose ∩
  and ⇒, which the monospace lacks, are drawn as shapes (CARDS4, #2469).
- `src/lib/flow.ts`: the flow card (CARDS5, #2470), design `flow-v1`: two
  to five steps joined by drawn arrows, side by side in the 16:9 video and
  stacked in the short.
- `src/runtime/record.ts`, `src/components/record`: the recording protocol.
- `src/components/preview`, `src/components/stage`: the preview page.

## Recording

`apps/www/tests/record/burn-ins.ts` fills the renderer's `recordBurnIn`
port: it opens `/burn-ins?record` in a headless browser at the size of the
video's frame, and for each frame seeks to its exact time and captures the
picture with transparency, only when it changed, into a lossless `.mov`
the renderer lays over the video. With it, a video renders with its burn-ins:

```sh
pnpm --filter www build
pnpm --filter www record:short <video folder> --series <series folder>
```

The font is Barlow Condensed (SIL Open Font License 1.1), free to embed in
video, which the host page loads in the weights 600 and 800, and the cards'
monospace is JetBrains Mono (the same licence) in weight 500.

## Word timings

Captions need each word's start and end. A voiced feed (the weekly call,
Playoff Delta) has them from home's speaker (`/timed`), and the renderer
(`@some-ui/video-render`) draws each scene's captions from its take's words,
a scene at a time. Words from my own takes need home's transcriber
(whisper.cpp's per-word times), which the owner approved keeping
(2026-10-26, confirmed 2026-10-29; the shape is on GWB11, #2085).

## A caption look sent from Studio

The phone's Studio sets a template's caption look on its Templates page and sends it as a new
GitHub issue holding the look in one ` ```json caption-look ` block (SFEED11, #2707; www's
`lib/caption-look`). The look is code, so a session lands it:

1. Add the block's look to `THEMES` (`src/lib/captions/theme.ts`) under a new id in
   `THEME_IDS`. Leave the look it changed from as it is: videos already made name it.
2. Pin a new version of the series that names the old look
   (`packages/video-render/src/sample/series/<series>/v<n+1>.json`), its `designs.captions`
   naming the new id, and move `packages/video-render/src/templates.ts`'s import of it to that
   version (its test fails until both agree). Check that the recorder for that feed writes the
   new series version into its cut list, so the next render draws it.
3. Close the issue with the PR.

Studio's preview is one still line drawn from the look's values. The first render on home in a
new look is the one to watch.
