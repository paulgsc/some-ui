# @some-ui/burn-ins

What code draws into every video (STUDIO ST15, #2273): the subtitles, the
Build Journal shorts' headline and card, and next the authorship mark
(ST16). A video's takes, footage and backgrounds are throwaway and stay in
Drive or on home; these are generic, drawn the same way into every video,
and only their data changes per video. Web only (`someUi.audience: "web"`);
`apps/www` serves the preview at `/burn-ins` (and `/captions`, its old
address) through the web surface's door.

## What it is

A burn-in is a **kind** (`captions`, `headline`, `card`), a named, frozen
**design** of how it looks, and **params**, one video's data for it, which
the cut list carries (`@some-ui/video-render`'s `BurnInSchema`). A design a
published video used is never edited; a change is a new design.

`prepare` checks the params against the kind's schema once, with every
reason they can't be drawn (text that doesn't fit is refused, never cut).
`frameAt(prepared, t)` is what is on screen `t` ms after the burn-in starts,
pure, so the preview, the recorder and a test agree at every moment.

Placement is the class's: each kind draws only in its regions (`header`,
`body`, `lower-third` in `src/lib/geometry.ts`), the regions never overlap,
and a test checks every kind's sample stays inside them at every moment.
Only a scene's headline and its card share a region, and a scene has one or
the other.

Each module's header says why it is the way it is:

- `src/lib/burn-in.ts`: the contract: kinds, designs, `prepare`, `frameAt`.
- `src/lib/geometry.ts`: the frame, the safe area clear of YouTube's
  controls, the regions.
- `src/lib/lines.ts`, `src/lib/text.ts`: breaking text into rows under a
  character-count width model, and setting it in a box.
- `src/lib/captions/`: the subtitles (GWB11, #2085): timed words to
  captions, their looks (Gridiron, Broadcast, Chalk), the frame, the plain
  `.srt` file, and sample lines with made-up timings.
- `src/lib/journal.ts`: the headline and card in design `v1`, the layout
  and colours of the build-journal skill's `render.py`.
- `src/lib/samples.ts`, `src/lib/words.ts`: the preview's sample data and
  its words.
- `src/lib/clock.ts`, `src/runtime/clock.ts`,
  `src/hooks/use-preview-clock.ts`: the preview's play, pause and scrub.
- `src/runtime/record.ts`, `src/components/record`: the recording protocol
  and the page the recorder captures.
- `src/components/stage`: draws one moment; `src/components/preview`: the
  preview page.

## Recording

`apps/www/tests/record/burn-ins.ts` fills the renderer's `recordBurnIn`
port: it opens `/burn-ins?record` in a headless browser at 1080x1920, and
for each frame seeks to its exact time and captures the picture with
transparency, only when it changed, into a lossless `.mov` the renderer
lays over the video. With it, a video renders with its burn-ins:

```sh
pnpm --filter www build
pnpm --filter www record:short <video folder> --series <series.json>
```

The font is Barlow Condensed (SIL Open Font License 1.1), free to embed in
video, which the host page loads in the weights 600 and 800.

## Word timings

Real subtitles need each word's start and end, from home's transcriber
(whisper.cpp's per-word times). The owner approved keeping them
(2026-10-26, confirmed 2026-10-29; the shape is on GWB11, #2085). Until that
server change lands, subtitles run on the sample.
