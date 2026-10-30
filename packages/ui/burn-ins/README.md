# @some-ui/burn-ins

What code draws into every video (STUDIO ST15, #2273): the subtitles, the
Build Journal shorts' headline and card, and the authorship mark (ST16,
#2274). A video's takes, footage and backgrounds are throwaway and stay in
Drive or on home; these are generic, drawn the same way into every video,
and only their data changes per video. Web only (`someUi.audience: "web"`);
`apps/www` serves the preview at `/burn-ins` (and `/captions`, its old
address) through the web surface's door.

## What it is

A burn-in is a kind (`captions`, `headline`, `card`, `authorship`), a named design and
one video's params, which the cut list carries. `src/lib/burn-in.ts` holds
the contract and says why it is the way it is; each module's header does
the same for its part:

- `src/lib/geometry.ts`: the frame, the safe area, the regions.
- `src/lib/text.ts`, `src/lib/advances.ts`: text set by the font's own
  advance widths, subtitles' lines included.
- `src/lib/captions/`: the subtitles (GWB11, #2085).
- `src/lib/journal.ts`: the Build Journal headline and card, design `v1`.
- `src/lib/authorship.ts`: whose idea and whose hands, design `cells-v1`:
  an intro and an end card over the bare cards that open and close the
  video, and the mark in the gutter beside the picture between them. Its
  params come only from `@some-ui/video-render`'s `authorshipParams`.
- `src/lib/authorship-link.ts`, `src/components/authorship-record`: the link
  the end card prints, one character a scene, and the page it opens,
  `/authorship?r=…`, which draws the mark's key and that video's record from
  the link alone and keeps nothing.
- `src/runtime/record.ts`, `src/components/record`: the recording protocol.
- `src/components/preview`, `src/components/stage`: the preview page.

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
