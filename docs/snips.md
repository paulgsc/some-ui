# Snips: the bundle a capture hands to home

A snip is one picture of one screen of the app, taken on sample data, kept on
home and named by an essay that wants to show it (epic #3114). This file is
the contract between the capture (SNIPS1, `.github/workflows/snips-capture.yml`)
and home's pickup (SNIPS2, paulgsc/server). `apps/www/src/lib/snips` is its
one implementation on this side, and its tests hold the names below.

## What a capture is

`Snips Capture` runs only when the owner dispatches it. It never runs on a pull
request, and CI Gate does not need it. It photographs two surfaces:

- **`apk`:** the Android app on an emulator (API 34), installed clean and
  paired through its own screen with the stand-in home on the runner
  (`apps/mobile/compat/stub-home.mjs`, COMPAT's rig), at 1080×1920, density
  420, which the capture sets: the runner's default device draws 320×640. A
  bundle with an APK picture of another size is refused. Each
  picture is the whole screen, with the status bar in demo mode. The
  device's clock is set to `FROZEN_AT` before each release picture, and the
  debug pass freezes the page's clock there. `apps/mobile/snips/capture-apk.sh` sets it up
  and takes two builds in turn:

  - **release**, the app as it ships, reached only by its own taps
    (`apps/www/tests/snips/release-walk.ts`): each launcher icon's wing, then
    each tab of the bar along the bottom of its screen (`tabBar`: the lowest
    row of two or more labelled controls, with a tab selected or at the foot
    of what the app draws, C869);
  - **debug**, the same JavaScript in a WebView Playwright opens, for every
    route by address (`apps/www/tests/snips/apk.spec.ts`), with the page's
    clock frozen and motion reduced.

  A debug picture with the same pixels as a release one names it by route,
  and the release picture is kept. A release picture no debug one matches is
  named by where the taps reached it, such as `@studio/takes` (`wingPath`).
  Every record says which `build` drew it, and the editorial desk shows that.

  The emulator resolves no host names. The stand-in home is reached by IP,
  so the live public data the app reads by design (Studio's asks from
  GitHub, the clips index) never loads into a picture, on either build.

- **`web`:** the viewer's build, at `desktop` (1440×900) and `phone`
  (412×915 at 2×). `apps/www/tests/snips/web.spec.ts` walks it. It is the
  `snips` profile (`apps/www/build.profiles.ts`), built by this capture only
  and never deployed: the Pages build's environment and sample data, with
  every viewer route kept. The public site is pruned to a CV (C1055,
  #3401), and an essay names its web snips by these routes, so they stay here.

Every route the surface's build offers is visited, as the generated route
tree lists them (`routesFor`). Home's own pages (`_lan`) are never visited.
A `$param` route is filled from links found on the screens already taken, at
most three per route. A route that sends the visitor elsewhere, that the
build does not offer, or that no screen links to is listed under `unreached`
with why.

Each picture is taken with:

- sample data only;
- the page's clock frozen at `FROZEN_AT`;
- motion reduced;
- fixed sizes, and fonts from the nix shell.

The same commit gives the same pictures. If a screen still moved a second
after it settled, the snip also gets a short recording: an `mp4` from the
emulator or a `webm` from the browser.

## The bundle

The run's artifact `snips-bundle-<commit>`. It lives one day: home picks it
up within that day, and a missed one is a re-run of the same commit.

```
manifest.json
SHA256SUMS
apk/android/release-<slug>-<hash12>.png   (and .mp4 where it moved)
apk/android/debug-<slug>-<hash12>.png     (and .mp4 where it moved)
web/desktop/<slug>-<hash12>.png           (and .webm where it moved)
web/phone/<slug>-<hash12>.png
```

`SHA256SUMS` is in `sha256sum -c` form. It covers every file the manifest
names, and the manifest itself, and the bundle holds no other file: a debug
picture whose screen a release picture shows is dropped with its record.

`manifest.json`:

| Field           | What it is                                                         |
| --------------- | ------------------------------------------------------------------ |
| `schema`        | `some-ui.snips/1`. Home refuses any other.                         |
| `appVersion`    | www's version (`apps/www/package.json`), which the APK carries too |
| `commit`, `run` | The commit captured and the run's URL                              |
| `frozenAt`      | The clock every page read                                          |
| `data`          | Always `sample`                                                    |
| `snips[]`       | One record per snip (below), sorted by id                          |
| `unreached[]`   | `{surface, route, why}`, `why` in plain words                      |

A snip record:

| Field                 | What it is                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | `<surface>:<path>:<viewport>:<appVersion>:<hash12>`; `path` may be `@wing/tab`                                                |
| `surface`, `viewport` | Where, and at which named size                                                                                                |
| `width`, `height`     | The picture's own size, read from the PNG                                                                                     |
| `scale`               | Its pixels per CSS pixel: 2 for the web phone, 1 on the desktop; 1 by convention on the APK, whose device pixels it keeps     |
| `regions`             | Each part the page names (`data-region`), `{ref, box}`, the box in CSS pixels; none on the APK (below)                        |
| `build`               | `release` (the APK as it ships, or the viewer's web build) or `debug` (the APK's debug build, for a screen taps do not reach) |
| `route`               | The route, `$param`s and all, or a release screen's `@wing/tab`                                                               |
| `path`                | The address taken                                                                                                             |
| `module`              | The part of the app (`moduleOf`), for grouping on the desk                                                                    |
| `shows`               | The screen's own heading, or else its module                                                                                  |
| `description`         | One plain line: "Studio: Takes, on the Android app, with sample data."                                                        |
| `image`, `recording?` | `{name, kind, bytes, sha256}`                                                                                                 |

`regions` are measured on the web walk, where the picture is the page's own
window, and cut to it. A recording stage (`STAGE_ROUTES`: `/call`, `/essay`,
`/report`, `/rust-screen`, the routes whose search is `stageSearch`) is taken
as the whole page instead, with its parts measured from the page's top-left
(C867). A stage is drawn whole for a recorder, not scrolled by a person, and
a card's foot falls below a phone's fold, so a window would cut off parts
an essay zooms to. The APK's pictures are the device's whole screen,
which no page's layout maps onto, so its records name none.

The record's schema is `@some-ui/video-render`'s `SnipRecordSchema`
(`packages/video-render/src/snip.ts`), which the capture writes and the
renderer reads.

`hash12` is the first 12 hex digits of the PNG's SHA-256. A screen that
changes gets a new id. The same screen captured again keeps its id, so a
bundle delivered twice files nothing new.

## What home does with it (SNIPS2)

As the coordinator ruled for the owner (2026-11-17), the pickup rides
home's mailbox pass rather than a schedule of its own (home-compute
invariant 6). Each pass:

1. looks up, per commit, the newest successful `Snips Capture` run of each
   commit an essay waiting on home names. It looks up at most five commits a
   pass (commits never looked at first, commits marked gone last) and
   downloads at most one bundle. A run of a commit no essay names is never
   fetched.
2. downloads that run's `snips-bundle-<commit>` artifact, then checks the
   schema and `SHA256SUMS`. A mismatch refuses the whole bundle.
3. hands the pictures the essay names to the render, and keeps only the
   owner's own marks and which snip each essay used. Nothing CI can make
   again is kept twice: home keeps no picture library, and drops its copies
   once the video is made (owner, 2026-11-21).
4. puts the bundle's `manifest.json`, its records and never an image, in the
   mailbox's `snips` folder as `snips-<commit>-<run>.json`, without its
   whitespace (`apps/mailbox/README.md`, C946), so the routine can name a
   snip by its id and commit. The same run fetched again adds nothing, and a
   second capture of a commit has a list of its own. A run attempted again
   keeps its id, so if its list differs the mailbox keeps the first. The
   mailbox never archives a list: the commit's capture makes it again. Not
   yet: home's half is paulgsc/server#1082. As step 1 stands, home fetches
   only a commit an essay already names, so a capture no essay names leaves
   no list for the routine to choose from; which capture's list home also
   fetches (the newest, say) is #1082's to settle.

**When a bundle can't be had** (C875). A bundle lives one day. When a
commit has no successful run, its newest run's artifact has expired, or its
bundle was refused, home marks the commit gone and refuses the essay
(`snip-gone`). Studio › Renders then asks the owner to re-run that capture
(a newer attempt of the same run clears the mark) or to run one for the
commit the essay names, which Snips Capture takes by branch or tag. Home never starts a run itself: its token can only read. A
failure that may clear on its own (a timeout, home's drive) is only asked
again next pass. Home's side of this is paulgsc/server's `docs/snips.md`.

The token is `SNIPS_GITHUB_TOKEN`, a fine-grained token with Actions: read
on paulgsc/some-ui only, in home's encrypted settings. Making it is the
owner's one step. The workflow holds no mailbox secret.

## What later stories need

- **SNIPS3, the editorial desk**, groups by `module` and shows `image`
  (`recording` where present). The keep mark and note are home's own, keyed by
  `id`. They are not in this bundle.
- **SNIPS4, the snip scene** (C865, C866). A snip, a Clips Library frame
  and a `some-ui.screens/1` screen (RR31's phone cards) are one family: a
  picture of a screen of the app, its named parts boxed. A scene shows one
  by the cut list's picture `{"kind": "screen", "of": …}`, in a cards essay
  in place of a card, where `of` is
  `{"from": "snips", "id": "<id>", "commit": "<40 hex>", "at": ["<part>", …]}` or
  `{"from": "clips", "clip": "<clip>", "side": "after", "file": "<frame>.png"}`.
  Home hands what an essay names as it hands takes, each kind in its own
  folder beside `<key>.json`:

  - `<key>.snips/`: `snips.json`, which is
    `{ "schema": "some-ui.snips-given/1", "bundles": [{ "commit": "<40 hex>", "snips": [<record>, …] }, …] }`,
    one bundle per commit the essay names (C868), and
    each picture under its bundle name;
  - `<key>.clips/`: each frame at `<clip>/<side>/<file>`.

  `record:cards --snips <dir> --clips <dir>` checks each snip picture's hash
  and that each frame is a PNG. `resolveScreens` then draws each scene. With
  no `at`, it holds the whole screen as the owner chose (2026-11-21): never
  full-bleed, as large as fits above the captions, which sit below it and
  never over the app's own screen (`screen-zoom` with no stops, C869), on
  the ground the recorder's look gives, or the composition's own. With `at`, a
  snip zooms to those parts in turn, as the Rust essay's cards do. A scene
  naming a screen home didn't hand, a snip of another commit than its
  bundle, or a part its snip doesn't name is refused before anything is
  drawn, and a cut list still naming one is refused by the render: never a
  blank frame.

- **Public pages** (#3387). The third member of the family: a public page
  photographed logged out, such as a pull request's checks, a run's job
  graph or a page of GitHub's docs, for an essay whose subject lives outside
  the app. `pnpm --filter www record:pages --pages-file <list> --out <dir>`
  (`apps/www/tests/record/pages.ts`) opens each address in a browser with
  no sign-in, cookie or token, at one size (1440×900 at 2×, UTC, light,
  motion reduced), boxes the parts the list names by CSS selector, and
  writes `pages.json` (`some-ui.pages/1`, `@some-ui/video-render`'s
  `page.ts`) beside one `<slug>-<hash12>.png` per page. A scene shows one
  by `{"from": "pages", "url": "…", "capturedAt": "…", "file": "…", "at": [ … ]}`:
  the address and moment it was taken, the "as of" its viewer is told, and
  its file. The render takes the folder beside the essay as `<key>.pages/`,
  and `record:cards --pages <dir>` checks each picture's hash and size, and
  refuses a scene whose page was taken at another address or moment than it
  says. Nothing on a GitHub page holds still, so the same page taken twice
  is two pictures, each named by its own hash. paulgsc/testing's guard
  refuses every picture, so they reach home the snips' way (#3395), below.
  A scene also names `"run"`, the capture run whose bundle holds its
  picture, as a snip names its commit.

## How public pages reach home (#3395)

The same trip as a snip's, with the run in place of the commit, because a
page is live and a capture is never made again the same.

1. **The capture.** `Public Pages Capture`
   (`.github/workflows/public-pages-capture.yml`) runs only when dispatched.
   Its one input is the list `record:pages` takes. It photographs each page
   logged out, refusing what `record:pages` refuses (an address that isn't
   public https, a page that doesn't load, answers an error, sends the
   browser elsewhere or is titled as a sign-in page, a part not wholly on
   the window), and uploads `pages-bundle-<run>`:

   ```
   pages.json     some-ui.pages/1
   SHA256SUMS     sha256sum -c form, over pages.json and every picture
   <slug>-<hash12>.png
   ```

   and nothing else. The run's summary prints each page's scene reference,
   `{"from": "pages", "url", "capturedAt", "file", "run"}`, ready to paste
   into a cut list.

2. **The cut list** names, in each page scene, the run its picture came
   from. `cards-check` and `record:cards` refuse a page scene with no run.

3. **Home (paulgsc/server).** For an essay waiting on home that names page
   scenes, each mailbox pass:

   - fetches each run's `pages-bundle-<run>` the essay names, by the same
     read-only token as the snips (`SNIPS_GITHUB_TOKEN`, Actions: read),
     only from a run whose workflow file is
     `.github/workflows/public-pages-capture.yml`, dispatched on `main`, and
     successful, and checks `SHA256SUMS` and the schema: a mismatch refuses
     the whole bundle. A run attempted again keeps its id and uploads new
     pictures under the same name, and retention keeps only the newest
     attempt's; home takes the newest attempt's bundle itself, even while an older one is still listed, and the scene check below refuses an
     essay naming an earlier attempt's files;
   - checks that each scene's file is in its run's `pages.json`, with the
     scene's address and moment;
   - hands, beside `<key>.json`, `<key>.pages/` with one `pages.json`
     holding only the records the essay names, from every run it names, and
     each picture (the render's `--pages`);
   - keeps those pictures beside the essay until its video is made, then
     drops them, as it drops takes. Unlike a snip, a page can't be made again,
     so the copy is held for the essay's life on home, never longer.

   **When a bundle can't be had.** A bundle lives one day, each run its own
   (the name holds the run, so no later run supersedes it). An essay
   naming a run whose bundle has expired, or was refused, is refused
   (`page-gone`), naming the run. The recovery is a new
   dispatch of the same list and a cut list naming the new run's pictures:
   home never starts a run, and never hands a picture other than the one
   the scene names by its hash. Not yet: home's half is the server pair of
   #3395.

- The APK's screens show what a fresh install paired with the stub shows. The
  stub answers few routes (`compat/stub-routes.json`); the capture lays the
  snips' sample over them (`apps/mobile/snips/sample-routes.json`, #3476), a
  Monday at `FROZEN_AT`: Renders expecting the Rust Rounds essay today and
  the call on Friday, with an older cards essay held for a take; Takes and
  Needs your attention with last week's takes; and Rust Rounds' week that
  ended and week that opened. Its test reads each answer as the phone does
  (`apps/www/src/lib/snips/__tests__/stub-sample.test.ts`), through the one
  stand-in home the walks' test reads too. A screen the sample doesn't
  answer for shows what `{}` or an empty list gives it, an empty state or
  a read it couldn't make sense of; a screen an essay needs gets its answer
  here.

## How walks reach home (#3476)

A walk is a scripted journey through the app (WALK1, `packages/video-motion/src/walk`):
each step's screen and each tap, on the walk's own timeline, in `walk.json`
(`some-ui.walk/1`, `@some-ui/video-render`'s `walk.ts`). An essay plays one
as a screen in motion, so the owner sees the app used, not only its
pictures. The trip is the pages' one, keyed by the run.

1. **The capture.** Snips Capture's APK job walks each app with a walk
   (`apps/mobile/walk/walk-apk.sh`), and its dashboards job walks the
   server's dashboards an essay shows, `home-call` and `home-pipelines`,
   on a throwaway Grafana over the sample week, each screen banded as
   sample data (`packages/video-motion/scripts/dashboards-on-sample.sh`,
   C1481). Its bundle job writes
   `walks-bundle-<run>` (`apps/www/scripts/walks-bundle.ts`):

   ```
   walks.json     some-ui.walks/1: {schema, commit, run, walks: [{app, walk, pictures}]}
   SHA256SUMS     sha256sum -c form, over walks.json and every picture
   <app>/snips/<NN>.png
   ```

   and nothing else. A walk that failed in the run is left out, never
   listed half; with no walk made, there is no bundle. A bundle that can't
   be made is a warning: the run, and its snips, stand. It lives one day.

2. **The cut list** names, in a scene, the run, the app and, if not the
   whole walk, the steps it plays, from 1, both ends kept:
   `{"kind": "screen", "of": {"from": "walks", "run": "<digits>", "app": "rust-rounds", "steps": [2, 6]}}`.

3. **Home (paulgsc/server).** For an essay waiting on home that names walk
   scenes, each mailbox pass fetches each named run's `walks-bundle-<run>`
   by the read-only token the snips and pages use, only from a successful
   run of `.github/workflows/snips-capture.yml`, the newest attempt's, and
   checks `SHA256SUMS` and the schema: a mismatch refuses the whole bundle.
   It checks each scene's app is in the bundle and its steps within the
   walk, and hands, beside `<key>.json`, `<key>.walks/` holding
   `walks.json` (`some-ui.walks-given/1`: `{schema, runs: [{run, commit,
walks}]}`, only the walks the essay names) and each picture at
   `<run>/<app>/snips/<NN>.png`. It drops those copies once the video is
   made. `record:cards --walks <dir>` checks every picture by its sum, and
   `resolveScreens` plays the steps in the screen-zoom composition: the
   screen held whole above the captions, each step's picture in turn on the
   walk's timeline stretched or pressed to the scene, and a ring on each
   tap. It never plays faster than twice the walk's own speed (C1427): a
   part longer than that ends with the scene, its last steps not shown, so
   a scene names the steps its words have time for.

   **When a bundle can't be had:** `walk-gone` (the run isn't a successful
   Snips Capture run, its bundle expired or was refused, or a named app or
   step isn't in it) names the run; the recovery is a new dispatch and a cut
   list naming the new run. `walk-missing` (no token, or nothing fetched
   yet) is held and tried again next pass. Home never starts a run. Not
   yet: home's half is the server pair of #3476.
