# @some-ui/video-render

The one renderer for my videos: Studio's (epic #2248, story ST1 #2249) and
Game Week Bites' shorts (#2074), run in a session today and on home by
GWB10's worker (#2084) later. A cut list goes in; an MP4 and the time of
every scene come out, the same bytes each time for the same inputs and
ffmpeg.

It applies no judgement: every duration is a number someone wrote, every
look is a plan or an override. Before ffmpeg runs, it refuses a cut list
with every reason it can't be drawn as written: a file missing or too
short, or a background, music bed or sound that changed since it was
chosen.

## What is here

Each module's header says why it is the way it is.

- `src/vocabulary.ts`: everything the renderer can draw, as schemas.
- `src/plans.ts`, `src/words.ts`: the Look and Voice plans, and every word
  the phone shows for them.
- `src/cut-list.ts`, `src/series.ts`: cut list v2, and a series (ST11): a
  folder of versions, `v1.json`, `v2.json`, …, which a video pins one of and
  which names the design each burn-in kind is drawn in. The first three are
  sampled in `src/sample/series/` (a Build Journal short, a Playoff Delta
  week, a long episode); their real content stays in Drive.
- `src/resolve.ts`, `src/timing.ts`: each lever from the layer that sets
  it; each scene placed in whole frames.
- `src/plan.ts`: the ffmpeg calls, as data. `src/render.ts` runs them over
  ports; `src/node.ts` gives it ffmpeg and the file system.
- `src/steps.ts`: who owns each step of making a video, now and by when
  (ST10, #2258); its test holds the rules for moving one.
- `src/authorship.ts`: whose idea and whose hands each scene shows (ST16,
  #2274), read from each scene's `idea`, its voice and the step table. A
  video carries the mark as a video-wide `authorship` burn-in with no
  params, between a bare card first and last; the renderer writes its
  params from the scenes.
- `src/timeline-v1.ts`: the build-journal skill's `timeline.json` shorts as
  cut list v2.
- `src/cli.ts`: the command, and its usage:

```sh
pnpm --filter @some-ui/video-render render <video folder> --series <series folder>
```

Needs `ffmpeg` and `ffprobe` on `PATH`; the repo's nix shells carry them
(`nix/video`).

## Not yet

- **Burn-ins** (headlines, captions, cards, the authorship mark) are drawn
  by `@some-ui/burn-ins` (ST15, #2273) and recorded through
  `Ports.recordBurnIn`, which `apps/www`'s `record:short` fills from the
  built app (`pnpm --filter www record:short <folder> --series <folder>`).
  This package's own CLI has no browser, so it still renders burn-ins only
  left out (`--without-burn-ins`).
- **`fromRenderPack`**, GWB9's render pack (#2083) as a cut list, waits on
  that pack's shape, and with it B-roll by library id (GWB12, #2086).
- **Intro and outro scenes** in a series are ST11's (#2259).
