# @some-ui/video-render

The one renderer for my videos: Studio's (epic #2248, story ST1 #2249) and
Game Week Bites' shorts (#2074), run in a session today and on home by
GWB10's worker (#2084) later. A cut list goes in, an MP4 and the time of
every scene come out, and the same cut list, files and ffmpeg give the same
bytes every time.

The renderer applies no judgement. Every duration is a number someone wrote,
every look is a plan or an override, and a file it reads is checked first:
missing, too short or changed since it was chosen, and nothing is rendered.

## What is here

- `src/vocabulary.ts`: everything the renderer can draw (transitions, picture
  motion, sound cues, the music bed, backgrounds). Each union is matched by an
  exhaustive switch in `plan.ts`, so a member it can't draw doesn't type-check,
  and the phone's menus read the same lists.
- `src/plans.ts` and `src/words.ts`: the Look plans (Plain, Calm, Lively) and
  Voice plans (Ad-lib, Read, Mixed), each a fixed bundle, with the words their
  cards show on the phone.
- `src/cut-list.ts`: cut list v2, the file the phone, home and Claude edit.
- `src/series.ts`: a series (ST11), what every video in a set shares, and
  `src/sample/build-journal-short.json`. Its music and sound kit live in
  Drive (`Build Journal/template/`), named here by checksum.
- `src/resolve.ts`: each lever from the lowest layer that sets it: the
  scene's override, its look, the video's look.
- `src/timing.ts`: scene lengths fitted to their takes, and where each scene
  lands, in whole frames.
- `src/plan.ts`: the ffmpeg calls, as data.
- `src/render.ts`: the runtime, over ports; `src/node.ts` gives it ffmpeg and
  the file system.
- `src/timeline-v1.ts`: today's shorts (the build-journal skill's
  `timeline.json`) as cut list v2.

## Rendering

```sh
pnpm --filter @some-ui/video-render render <video folder> --series <series.json>
```

reads `<video folder>/cut-list.json` and writes `outputs/video.mp4` and
`outputs/shot-times.json`. A short made with the skill's `render.py` converts
first:

```sh
pnpm --filter @some-ui/video-render render from-timeline <short folder> --series <series.json>
```

Needs `ffmpeg` and `ffprobe` on `PATH`. The repo's nix shells carry them
(`nix/video`); so does `apt-get install -y ffmpeg`.

## How it draws

1. Each scene becomes a segment, picture only, exactly its number of frames:
   the capture trimmed and timed, framed in the series' window, moved, over
   its background.
2. The takes go on one track, each at its scene's start, high-passed, then
   brought to -16 LUFS in two passes, as `render.py` did.
3. One assembly joins the segments with their transitions, lays the burn-ins
   over them, and mixes voice, music bed (lowered under the voice) and sound
   cues.

Every output is written with ffmpeg's bit-exact flags, and every transition
and layer is placed at an exact frame time, never a rounded millisecond: a
time even a fraction of a frame off lets ffmpeg pick either neighbouring
frame, which changes the bytes from run to run. The test renders a fixture
using every vocabulary member twice and compares the bytes.

## Not yet

- **Burn-ins** (headlines, captions, cards, the authorship mark) are drawn by
  STUDIO ST15's workspace (#2273); the renderer asks for each through
  `Ports.recordBurnIn` and lays it on. Until that lands a render refuses a
  cut list with burn-ins, or, with `--without-burn-ins`, lists what it left
  out. So a short converted from `render.py` renders without its headline and
  card text for now, and the skill's `render.py` stays until ST15.
- **`fromRenderPack`**, GWB9's render pack (#2083) as a cut list, waits on
  that pack's shape, and with it B-roll by library id (GWB12, #2086).
- **Intro and outro scenes** in a series are ST11's (#2259).
