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
  (`apps/mobile/compat/stub-home.mjs`, COMPAT's rig), at 1080×1920. Each
  picture is the whole screen, with the status bar in demo mode. The
  device's clock is set to `FROZEN_AT` before each release picture, and the
  debug pass freezes the page's clock there. `apps/mobile/snips/capture-apk.sh` sets it up
  and takes two builds in turn:

  - **release**, the app as it ships, reached only by its own taps
    (`apps/www/tests/snips/release-walk.ts`): each launcher icon's wing, then
    each tab of the bar along the bottom of its screen;
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

- **`web`:** the Pages build, the viewer's, at `desktop` (1440×900) and `phone`
  (412×915 at 2×). `apps/www/tests/snips/web.spec.ts` walks it.

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

| Field                 | What it is                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `id`                  | `<surface>:<path>:<viewport>:<appVersion>:<hash12>`; `path` may be `@wing/tab`                                        |
| `surface`, `viewport` | Where, and at which named size                                                                                        |
| `width`, `height`     | The picture's own size, read from the PNG                                                                             |
| `scale`               | Its pixels per CSS pixel: 2 for the web phone, 1 elsewhere                                                            |
| `regions`             | Each part the page names (`data-region`), `{ref, box}`, the box in CSS pixels; none on the APK (below)                |
| `build`               | `release` (the APK as it ships, or the Pages site) or `debug` (the APK's debug build, for a screen taps do not reach) |
| `route`               | The route, `$param`s and all, or a release screen's `@wing/tab`                                                       |
| `path`                | The address taken                                                                                                     |
| `module`              | The part of the app (`moduleOf`), for grouping on the desk                                                            |
| `shows`               | The screen's own heading, or else its module                                                                          |
| `description`         | One plain line: "Studio: Takes, on the Android app, with sample data."                                                |
| `image`, `recording?` | `{name, kind, bytes, sha256}`                                                                                         |

`regions` are measured on the web walk, where the picture is the page's own
window, and cut to it. The APK's pictures are the device's whole screen,
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

1. asks GitHub for successful `Snips Capture` runs newer than a cursor. This
   is one cheap list call, and the number of bundles taken per pass is
   bounded.
2. downloads the `snips-bundle-<commit>` artifact, then checks the schema and
   `SHA256SUMS`. A mismatch refuses the whole bundle.
3. files each snip by id, per app version, never deleting one an essay
   names. A bundle delivered twice files nothing new.
4. puts each record, never an image, in the mailbox.

The token is `SNIPS_GITHUB_TOKEN`, a fine-grained token with Actions: read
on paulgsc/some-ui only, in home's encrypted settings. Making it is the
owner's one step. The workflow holds no mailbox secret.

## What later stories need

- **SNIPS3, the editorial desk**, groups by `module` and shows `image`
  (`recording` where present). The keep mark and note are home's own, keyed by
  `id`. They are not in this bundle.
- **SNIPS4, the snip scene** (C865, C866). A snip and a `some-ui.screens/1`
  screen (RR31's phone cards) are one family: a photographed screen with
  its named parts boxed. A scene shows one by the cut list's picture
  `{"kind": "snip", "id": "<id>", "at": ["<part>", …]}`, in a cards essay
  in place of a card. Beside an essay that names snips, home hands their
  records as `snips/snips.json`:

  ```json
  { "schema": "some-ui.snips-given/1", "snips": [<record>, …] }
  ```

  Each picture comes with it under its bundle name. `record:cards --snips
  <dir>` checks each picture's hash, and `resolveSnips` draws each scene. With
  no `at`, it shows the whole screen as a still. With `at`, it zooms to those
  parts in turn, as the Rust essay's cards do (`screen-zoom`). A scene naming
  a snip home didn't hand, or a part its snip doesn't name, is refused before
  anything is drawn. A cut list still naming a snip is refused by the render.
  Never a blank frame. Phone shots are 1080×1920 (APK) or 824×1830 (web
  phone, drawn at 2×), both portrait, and drawn today as any still is,
  fitted into the frame. The owner chooses between a device frame and a
  full-bleed 9:16 once they see them.

- The APK's screens show what a fresh install paired with the stub shows. The
  stub answers few routes (`compat/stub-routes.json`), so many screens are
  their empty state. Richer sample fixtures for the stub are a follow-up.
