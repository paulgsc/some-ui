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
  week, a long episode); their real content stays in Drive. A version may
  carry an `intro` and an `outro` (a card or a checked still, with its
  burn-ins), which the renderer adds to every video pinning it
  (`withSeries`): just inside the authorship mark's bare cards, so the mark
  still opens and closes the video and its record counts them as an
  agent's, drawn by code. `review.json` lists only the video's own scenes,
  so no note is pinned to the series'.
- `src/format.ts`, `src/episode.ts`: a show (SHOW, #2525) is a series plus
  a format, the ordered scenes every episode has (name, picture source,
  hold, when left out), versioned as a series is (`readFormat`). An episode
  is a format applied to one period's data by a pure function (`episodeOf`):
  a primer version 2 the phone's Studio opens, the episode's pins (its
  show's name, format, period, the data's sum) and a cut list whose pictures
  are the recorded clips. `parseEpisode` reads an episode file back, as
  Studio does to open it as an episode (SH3), and refuses one whose cut
  list's scenes are not its cuts. Playoff Delta's formats and episodes come
  from its own workspace (`packages/ui/playoff-delta/src/lib/show.ts`).
- `src/call.ts`: the weekly call (ST29's first template): the agents'
  stand-up for the owner, the same sections every week (the week, the
  ledger's board, where each epic is, what landed in batches, gray-area
  calls, calls made without the owner, what waits on the owner, the close),
  filled from one week's data (`CallWeekSchema`). Its format repeats a
  scene once per item, which a format now may (`repeat`), and is pinned
  under `src/templates/conference-call/`, beside its sample week; its
  series is sampled in `src/sample/series/conference-call/`. `callScenes`
  gives the scenes in order, each ask with the id a reply names.
- `src/clip.ts`: clips (SFEED7), what a user-facing change built, kept in
  `paulgsc/testing`'s `clips/` and listed for Studio's Library. A walked side
  is `motion walk`'s own folder. `render clip-check <folder>` checks it
  before it is pushed.
- `src/templates.ts`: every template Studio lists (SFEED1, #2731), each
  the newest version pinned under `src/templates/<id>/`, Playoff Delta's
  included.
- `src/synth.ts`, `src/music-bed.ts`: the sounds we make ourselves
  (#2673); `render music-bed --out <file>.wav` writes the music bed.
- `src/resolve.ts`, `src/timing.ts`: each lever from the layer that sets
  it; each scene placed in whole frames.
- `src/plan.ts`: the ffmpeg calls, as data. `src/render.ts` runs them over
  ports; `src/node.ts` gives it ffmpeg and the file system.
- `src/steps.ts`: who owns each step of making a video, now and by when
  (ST10, #2258); its test holds the rules for moving one.
- `src/take-check.ts`, `src/hearings.ts`: does a take say what its cut
  asks (ST21, #2321), and its two hearings lined up (ST25, #2323).
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

## A mark's theme sent from Studio

The phone's Studio shows a template's mark in every theme of the app's on that template's page
and sends the one chosen as a new GitHub issue holding it in one ` ```json mark-theme ` block
(SFEED14, #2766; www's `lib/mark-theme`). A template's shape is built in code, and its pinned
file is held equal to what the code builds, so a session lands it:

1. In the code that builds the template's shape (`shapeOf` in `src/call.ts`, or in
   `packages/ui/playoff-delta/src/lib/show.ts`), make the next version set `brand.theme` to the
   theme, keeping the scenes' `theme` as it was (`inTheme` sets both). Leave every earlier
   version as it builds now: videos already made pin it.
2. Move the template to that version (`CALL_VERSION`, or `FORMAT_VERSION`), pin it as the code
   builds it (`src/templates/<id>/v<n+1>.json`; each one's test fails until the two agree), and
   move `src/templates.ts`'s import to it. The call then refuses a folder whose newest week was
   written for the old version until a week is written for the new one, as every version did.
3. Close the issue with the PR.

## Compositions, a scene's picture

A scene's picture may be a HyperFrames composition (HYPER2, #2725): `{ kind:
"composition", ref, variables, files }`, one of `@some-ui/video-motion`'s by its folder's
name, its inputs, and the files in the video's folder it reads. The renderer draws it
through the `compositions` port, just before the scene's segment, and lays the scene's
captions over it; `@some-ui/video-motion`'s `motion video` fills the port.

## Captions, a scene at a time

A video asks for captions with one burn-in over the whole video, kind
`captions` and nothing written for it (SFEED11, #2707): the renderer draws
each scene's from the words heard in its take, in the look the video or its
series names (`designs.captions`). Each scene's captions are recorded as
their own burn-in, as long as the scene shows before the next starts, kept
in the step cache under what they draw (the look, the words and their
times, the frames and the frame: `withCachedBurnIns`), and laid over that
scene's segment before the join (`planSegment`). No step holds more than
one scene's frames, so a long video costs more time, never more memory, and
a retry records only the scenes whose words changed.

## Not yet

- **Burn-ins** (headlines, captions, cards, the authorship mark) are drawn
  by `@some-ui/burn-ins` (ST15, #2273) and recorded through
  `Ports.recordBurnIn`, which `apps/www`'s `record:short` fills from the
  built app (`pnpm --filter www record:short <folder> --series <folder>`).
  This package's own CLI has no browser, so it still renders burn-ins only
  left out (`--without-burn-ins`).
- **`fromRenderPack`**, GWB9's render pack (#2083) as a cut list, waits on
  that pack's shape, and with it B-roll by library id (GWB12, #2086).
