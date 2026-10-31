# `@some-ui/mobile`

A sideloadable Android APK of `apps/www` that needs no network. It keeps its
own SQLite database on the phone, and answers the app's `file_host` requests
from it in-process.

There is no application code here. This workspace is a **packaging** step: it
runs www's own Vite build with `VITE_DEVICE_BACKEND=true` and hands the output
to Capacitor, which copies it into an Android project. Every screen, route and
handler is www's, and so is the backend (`apps/www/src/lib/device-backend`).

> Status: **beta, on `main`.** It grew on a mobile staging branch until the
> release APK had been used on a phone, then landed; iteration continues here.

## What the app carries: a foyer and its wings

The app is several visits, not one: studying, my own tracking, making the
Build Journal, and applying for jobs. Each is a **wing** (www `src/lib/wings`): its own Home, its
own rooms and settings, and nothing of another wing's on the screen.

- The plain app icon opens the **foyer** (`/foyer`), "Where to?": each
  wing's name and what it is for, and nothing of what is inside. No "due",
  no counts, no "missed": a status line primes the visit with what was not
  done before it starts.
- Each wing also has **its own launcher icon** (an `<activity-alias>` per
  wing, below), which skips the foyer. Drag the icons into one home-screen
  folder for one tap per wing; Android lets no app make the folder itself,
  and a widget cannot go in one.
- A long-press on the app's icon or Studio's offers **New idea**, a launcher
  shortcut (`res/xml/shortcuts.xml`) straight to Studio's idea capture
  (`/journal/idea`, below), mapped from a fixed action as icons are
  (`MainActivity.shortcutRoot`).

The wings:

- **Practice** (`/practice`): what is open or was finished today, and "Not
  today? Say why". Its bar holds **Home**, **Study** (sessions: the list, the
  composer and the player) and **Bites** (the soundbites, below). Its gear
  opens its own settings (`/practice/settings`): the voice and the study
  reminders.
- **Self** (`/aph`): logging aph and reconciling it (below). One room, so no
  bar: aph's own strip (Log, History, Trend, Settings) is its navigation.
- **Studio** (`/journal`): the Build Journal's voice takes, and **Game
  day** (`/game-week`): a bite said while a game is on, kept on the phone
  until home holds it. Its bar holds **Journal** and **Game day**.
- **Jobs** (`/jobs`): the morning run's picks from Drive, worked through
  step by step (review, decide, résumé, apply, debrief), my own finds, and
  the record of each application. One room, so no bar: its strip (Today,
  Scout, Record) is its navigation. The résumé is built in the phone's
  browser on the home network, never in the app (www `src/lib/jobs`,
  `packages/job-desk`).

Outside every wing is the **front desk** (`/settings`, the gear on the
foyer): this phone (the sync from home, pairing, storage) and the theme.
Nothing else www routes to is here: the landing page, the web's Home, the
résumé, profile, the extensions tour and the LAN tools are the web app's.

How that is enforced (www `src/lib/app-surface`, `src/lib/wings`):

- `build:web` selects the `mobile` profile (`apps/www/build.profiles.ts`),
  which sets `MOBILE_APP` in the bundle.
- `MOBILE_SURFACE` is an **allowlist**: `/foyer`, `/practice`, `/sessions`,
  `/soundbites`, `/aph`, `/journal`, `/game-week`, `/jobs` and `/settings`, typed against the route
  tree. (Also `/auth`, which the phone never shows since it is always signed
  in: should a device route ever answer 401, the account banner links there,
  and in this build it offers a reload, not a sign-in.) The root route
  redirects any other path to the foyer before its own guards run, and a
  page added to www later stays off the phone until someone lists it.
- Every route belongs to exactly one wing's room, the foyer or the front
  desk (`routes/__tests__/wings.test.ts` checks the real route tree), and
  the bar shows only the current wing's rooms.
- There is no sidebar. The header names the wing and leads to the foyer;
  on the two bounded screens (the player and the composer), where the bar
  steps aside, it leads back to the wing's Home instead.
- Android's back (the button or the edge swipe) walks the app's history, and
  **ends where you entered**: it leaves the app from the root you came in by
  (a wing's Home, through its icon, or the foyer, through the plain icon), or
  from a page with nothing behind it (`MainActivity`). The app does not carry
  `@capacitor/app`, without which back would close it from any page.
- A wing's icon tapped while the app is open sends `someui:wing` to the page,
  which navigates (www `lib/wings/entry.ts`) rather than reloading, so a
  recording or a database write in flight is not cut off. The plain icon
  tapped while open resumes where you were. The icon-to-root table is
  `MainActivity`'s, fixed, never read from the intent;
  `routes/__tests__/mobile-surface.test.ts` checks it, the manifest's aliases
  and `policy.json` against www on every PR.
- The build leaves out the résumé's PDFs and its `/resume/` document, and the
  web-push service worker `sw.js` (www `build.paths.ts`, `offPathPublicFiles`).

What that does not do: the other pages' code is still in the bundle, as
unreachable lazy chunks. The route tree is the same in every build (that is
what keeps typed links honest), so stubbing those pages out would take a new
build audience; `routes/__tests__/mobile-surface.test.ts` shows none of them
can be reached.

## Why

TOPIK and Leetype sessions are meant to fit a commute or a 30-minute break,
which is exactly when the home `file_host` (on the LAN) is out of reach. A
client on cellular cannot reach a LAN server any better than a web page can,
so the phone carries its own backend instead.

## How the device backend works

www reaches `file_host` in one way everywhere: a `fetch` of
`<base>/api/v1/<route>`. In the device build, `main.tsx` wraps `fetch` once
(`bootDeviceBackend`). Requests under the `file_host` base are answered by
www's in-process route table, over `@capacitor-community/sqlite`. Every other
request goes to the real network.

- **`DATA_MODE` stays `"server"`.** There _is_ a backend; it just lives in the
  same process. So sessions, the shelf and the TOPIK catalogue all take
  their normal server-mode code paths, unchanged.
- **It answers like the server.** The routes, status codes, error envelope and
  JSON shapes are copied from paulgsc/server. The schema is the server's
  migrations, column for column, subject column included. A test runs every
  `@some-ui/contract-harness` contract for a route the device serves against
  it (`device-backend/__tests__/conformance.test.ts`). It also checks that the
  device serves no route the server does not.
- **It differs from the server on purpose in three places** (named in that
  test):

  - `/auth/session` is always signed in. There is one person, and the phone's
    lock screen is the lock.
  - `/push/*` answers `503 feature_not_configured`. There is no VAPID identity
    on a phone.
  - The server's engagement fold behind `/signals` is not ported.

  And in two that no contract exercises, both from the storage budget below:
  a session save or shelf keep past it is refused with
  `400 max_record_limit_exceeded`; and a lesson home stopped listing is
  deleted, so `GET /curriculum/:key` answers `404` for it
  where the server would still serve it. Nothing on the phone loads a lesson
  by a key it saved: a session stores a level.

| Served on the device                                      | From                                                     |
| --------------------------------------------------------- | -------------------------------------------------------- |
| `/sessions*`                                              | the `sessions` table                                     |
| `/shelf/:activity[/:key]`                                 | `learner_shelf` (keep a pasted lesson or your own round) |
| `/curriculum/manifest[.json]`, `/curriculum/:key`         | `curriculum`, filled by a sync from home                 |
| `/auth/session`, `/signals`, `/presence/lease`, `/push/*` | see above                                                |

Anything else answers `file_host`'s plain-text `404`, which is what a server
too old to have that route would answer.

### What the phone keeps

The app's database and WebView storage together stay under Android's
[25 MB backup quota](https://developer.android.com/identity/data/autobackup),
past which Android stops backing the app up without saying so, and that
backup is the only other copy of the phone's history (`device-backend/storage`).
It is one budget, measured, never reserved: the database plus everything
the WebView holds (`navigator.storage.estimate()`: soundbites, voice
reflections, scene notes, journal takes, grammar-lens takes, LeetType's
spoken answers and its session log, and any audio store added later),
each counted as it is. A database save that would take the total past the
quota is refused (`budgeted`), and so is an audio write: every audio store
writes inside `withRoom` (`@some-ui/voice-capture`, installed at boot by
`roomOn`), which claims the write's growth until it settles, so two saves at
once cannot both pass on one measurement. A store keeps its
own cap besides, which is its own rule: no store keeps space free for
itself, so a new one costs nothing until it holds something. The caps add
up to more than the budget (2.17 times it; `voice-home` alone is 24 MB of its
25 MiB), which is safe only because a save past the budget is refused, and
game bites have no cap yet (#2264). There is no
size per table. LeetType's session files, picked from storage, count toward
it too, and nothing lets them go yet (#1921); each stays where it was picked
from.

A restore has to be able to open what it brings back, which is why the SQLite
plugin's unused encryption is off (`capacitor.config.ts` says why; the review
holds the APK to it).

### Diagnostics

A release WebView's console reaches nothing: Capacitor forwards it to logcat
only in debug builds, and enabling that for release would also log every
plugin call's arguments. The app's own log does reach it, in every build:

```sh
adb logcat -s SomeUI
```

It carries each failure the app reported through `callForeign`
(`foreign-failure [<port>] <kind>: <summary> (<cause>)`) and
`device storage: opened` once the database is open, and nothing a person
wrote. The launch test fails a run without that line, or with a device
storage failure (`launch/launch-test.sh`).

- **Nothing the person made is deleted without their yes.** A session save
  or shelf keep that would cross the budget is refused. The app then names
  the oldest finished session (never today's or an unfinished one) and
  removes it only if the person agrees. Unless it was copied home or
  archived, a removed one is gone.
- **Sending is how the phone makes room, and it is always the person's
  act.** The app is client first: nothing leaves the phone by default, and
  nothing requires a server. What sending buys is that the phone can let
  go. A finished session (completed, not today's: `mayLeavePhone`) leaves
  the phone once a destination holds it: home, when **Send to host** reads
  it back and finds it as the phone has it; an archive, when the person
  says the file arrived (the phone cannot look inside Drive). Unfinished
  sessions and today's always stay, since the study card and the nudge read
  them.
- **Sending is archiving.** A finished session's record is context for an
  agent shaping the next lesson, not something the person reads back: the
  app is for studying, not a dashboard of it. So nothing that left the
  phone is listed, fetched or restored here. Reflections are meant to be
  made during a session and shared soon after, while the session is still
  on the phone.
- **Published content follows its source.** A sync deletes the lessons home
  stopped listing, and skips what would not fit. All of it is reported.
- **Presence leases** are trimmed to the server's own 16.

The database runs with `auto_vacuum = FULL`, so deleted rows leave the file
Android backs up.

### What content is on the phone

- **Leetype:** the session files picked from storage, kept in the content
  store. The app bundles no rounds, and a sync from home brings none.
- **TOPIK:** lessons are not in either repository. They exist only in the home
  server's database, so the phone gets them by a **sync from home** (below).
  Before the first sync, TOPIK offers any lesson you paste and keep on the
  shelf. Read-aloud ships no words: it reads the word sets you add from
  storage (`packages/some-content/prompts/read-aloud-generator`).

## Build

```sh
# www's build in device mode, into apps/www/dist
pnpm --filter @some-ui/mobile build:web

# copy that, and the native plugins, into the Android project
pnpm --filter @some-ui/mobile sync

# both
pnpm --filter @some-ui/mobile bundle

# ... and the APK itself (needs the Android SDK)
pnpm --filter @some-ui/mobile apk
```

`build:web` pins four variables, each for a reason that fails silently:

- `VITE_DEVICE_BACKEND=true`: without it, the APK has no backend.
- `VITE_STATIC_DATA=false`: an inherited `true` would select the old
  localStorage-only paths.
- `VITE_BASE_PATH=/`: an inherited Pages prefix gives a blank app.
- `SOME_UI_PROFILE=mobile`: sessions only (above), plus the `apk`-audience
  workspaces no other build carries (the soundbites); like `pages`, it also
  leaves out the LAN-only operator CRMs. Inherit `pages` or `lan` instead and
  the phone gets the whole web app, without the soundbites.

turbo passes each one through: it infers `VITE_*` for this workspace, and
`SOME_UI_PROFILE` is declared in `turbo.json`.

### Develop against a dev server (hot reload on a device)

The web app's phone-sized view is not the APK: the APK is Android's WebView
with Capacitor's native bridge around it (the SQLite device backend, local
notifications, the microphone permission, the back button, safe areas). To see
those quirks while you edit, install a **debug** APK whose WebView loads www
from a dev server on your machine instead of from its own bundle:

```sh
# terminal 1: www's dev server, built as the APK is (device backend, mobile profile)
pnpm --filter @some-ui/mobile dev:web

# terminal 2: install a debug APK pointed at it, on the emulator or phone
pnpm --filter @some-ui/mobile dev:android
pnpm --filter @some-ui/mobile dev:android --target <id>   # pick one (cap run android --list)
```

Leave terminal 2 running; Ctrl-C puts the app's config back. Edits under
`apps/www` then hot-reload on the device. Anything native (the manifest, a
plugin, `capacitor.config.ts`) needs `dev:android` run again.

On a fresh checkout there is no web build (`apps/www/dist`), and `cap run` syncs
before it can point the app at the dev server, so with no build present
`dev:android` syncs `live-reload/` instead, a tracked stand-in page
(`SOME_UI_LIVE_RELOAD=1` in `capacitor.config.ts`). The WebView never shows it in
this mode. It stays in `android/app/src/main/assets/public` afterwards, so build
an APK with `pnpm --filter @some-ui/mobile apk` (or `bundle` first), never from
that directory as it is; an APK built from the stand-in says so on screen.

You need the Android SDK (platform 36 and platform-tools), JDK 21, `ANDROID_HOME`
set, and a device that `adb devices` lists: an emulator, or a phone with USB or
wireless debugging. The repo's flake has no Android shell yet.

How it works, and why each piece is there:

- `cap run --live-reload` writes `server.url` into
  `android/app/src/main/assets/capacitor.config.json`, which is gitignored and
  regenerated by every `cap sync`, so the dev URL cannot reach a CI build.
- The URL is `http://localhost:5173` and `--forwardPorts` is `adb reverse`, so
  the device's `localhost` is your machine. Not the LAN address: that is not a
  secure context, and the device backend hashes with `crypto.subtle`, which needs
  one. `localhost` is one even over plain http.
- `dev:web` pins the same four variables as `build:web` (above), so the dev
  server and the APK agree on the backend, the profile and the base path.

What is different from the release APK, so a fix is not done until the CI APK
agrees:

- It is a debug build: debuggable, no R8.
- Its origin is `http://localhost:5173`, not `https://localhost`. Web storage
  (localStorage, IndexedDB) starts empty; the SQLite file is the same app-private
  one. www's `file_host` base takes its http branch (`lib/file-host-config`),
  which the device backend still answers in-process, since it and its callers
  resolve the same base (`device-backend/__tests__/round-trip.test.ts` pins
  that). If sessions look empty or `file_host` is unreachable, look there
  first.
- It is signed with your own debug key, so it cannot install over a CI APK, and
  uninstalling one deletes its database (see Signing). Use an emulator or a spare
  phone.

To inspect the WebView, open `chrome://inspect` in Chrome on the same machine and
choose the Some UI page: the console, network and elements of the real WebView.
Only a debug build offers it.

### In CI (how to get the APK onto a phone)

`.github/workflows/mobile-apk.yml` builds it from a push to `main` that
touches what it is built from, once you approve that run, and on nothing
else (pull requests do not). Each such push starts a run that waits on the
`mobile-release` environment: GitHub notifies its required reviewer, and
**Review deployments** on the run approves it. A newer push cancels a run
still waiting, so the one waiting is always `main`'s newest; an unapproved
run fails on its own after 30 days. Once the approved run finishes, open it
in the repository's **Actions** tab and download the
`some-ui-apk-<sha>` artifact. It is a zip holding `some-ui-<sha7>.apk`, the
**release** build (R8-shrunk, not debuggable). Install that on the phone
(allow installs from your browser or file manager). It is signed with the
repository's key ("Signing", below), so it installs as an update over any
earlier CI build, debug ones included.
The debug APK is still built, for the review only (`mobile-review-<sha>`).

**Launch test.** Before a run counts as green, its release APK is installed
and started in an API 36 emulator, then driven by a short seeded monkey run
(`launch/launch-test.sh`). It starts the plain icon, then each wing's icon
(found from the installed package, and each must log `wing entered: <id>`),
and presses back at a wing entered by its icon, which must leave the app. A
dead process, a crash, an ANR, a missing wing line, a back that does not
leave or a monkey run that did not finish fails the run, and the older APK is
then kept. Since the
release build is R8-shrunk, this is what catches a class it stripped that
something needed by name. It cannot see a WebView that loads blank, which
does not crash: `launched.png` in the `mobile-launch-<sha>` artifact is the
only evidence the page rendered (the first run, 2026-09-30, shows the
sessions list's empty state). The emulator is x86_64, so it runs the same
build with `x86_64` added (`SOME_UI_EXTRA_ABI`): the dex and resources are
byte-identical to the phone's (checked 2026-09-30).

The workflow also fails if the device backend is missing from the bundle.
That is not hypothetical: www's build drops any import it considers
side-effect-free, and the first version of the boot hook was dropped that way,
with a clean build log.

### Signing (one-time setup)

Every CI build is signed with one key, kept in two repository secrets. The
workflow fails without them rather than signing with a throwaway key. Android
installs an update only over an app with the same signature. With a new key
per build, each APK would refuse to install over the last, and the only way
out would be an uninstall, which deletes the phone's database.

Make the key once, on your own machine (any JDK has `keytool`):

```sh
keytool -genkeypair -keystore some-ui.keystore -storetype PKCS12 \
  -alias some-ui -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=some-ui"            # prompts for a password: remember it
base64 -w0 some-ui.keystore      # macOS: base64 -i some-ui.keystore
```

Then, under **Settings → Secrets and variables → Actions → New repository
secret**, add:

- `ANDROID_KEYSTORE_BASE64`: the `base64` output;
- `ANDROID_KEYSTORE_PASSWORD`: the password.

Keep `some-ui.keystore` somewhere safe outside the repository. Lose it, and the
next key is a different signature, which means one uninstall. The alias
defaults to `some-ui`, and the key's password is the keystore's password.

`app/build.gradle` uses this key only when `SOME_UI_KEYSTORE` is set. A local
build without it falls back to your own debug key, and that build cannot
install over a CI build, or the other way round.

### Artifacts on GitHub

- **One APK at a time.** Each run uploads its APK, and a run that also
  passes the review (below) and the launch test then deletes every older `some-ui-apk-*`
  artifact, so GitHub holds about 10 MB, not 10 MB per build. A failed or
  cancelled run deletes nothing, so the previous APK stays in place.
- **30-day expiry.** `retention-days: 30` bounds the newest one too.
- **arm64 only.** SQLCipher, which the SQLite plugin brings, ships a native
  library per ABI. `abiFilters` keeps only `arm64-v8a` (5.2 MB of the four's
  roughly 19 MB). To run the APK in an emulator, build it with
  `SOME_UI_EXTRA_ABI=x86_64`, as the launch test does.
- **`versionCode` is the run number**, so each APK is an update of the last,
  and Settings → Apps → Some UI shows which build is installed.

### Play readiness

The app is sideloaded today, and headed for Google Play as a free personal
hobby app. The listing should be an increment, not an overhaul. So every
run builds what Play would take, a **release** APK (the one the phone
installs) and **app bundle** (R8-shrunk, not debuggable, same key), and
`.github/workflows/_mobile-review.yml` reviews the build against Google's
guidance. The rules are `review/checks.mjs`; the values they hold the build
to, each with its reason, are `review/policy.json`.

Fails the run:

- **Identity.** `applicationId` stays `dev.paulgsc.someui`, and both builds
  are signed by the pinned certificate. Play treats a new applicationId as a
  different app, and an update needs the same key
  ([source](https://developer.android.com/build/configure-app-module#set-application-id)).
- **The key is the future upload key.** Under Play App Signing, the key CI
  signs with is what an upload would be signed with
  ([source](https://developer.android.com/studio/publish/app-signing)). Do
  not rotate the `ANDROID_KEYSTORE_*` secrets casually. A new key fails the
  review, and it would also stop the phone taking updates.
- **versionCode only rises.** It must be above every retained APK's (Play's
  ceiling is 2,100,000,000,
  [source](https://developer.android.com/studio/publish/versioning)). It is
  the run number, which resets if `mobile-apk.yml` is renamed. This check
  catches that.
- **Target API level.** Play's dated schedule is in `policy.json`
  ([source](https://developer.android.com/google/play/requirements/target-sdk)).
  Inside Google's extension window a shortfall is a warning; after it, an
  error. A schedule a year stale is itself an error.
- **16 KB page size.** Every 64-bit native library has LOAD segments aligned
  to 16 KB and is stored uncompressed at a 16 KB boundary, in the APKs
  (also `zipalign -c -P 16`) and in the bundle
  ([source](https://developer.android.com/guide/practices/page-sizes)).
  SQLCipher complies: 4.10.0 measured by hand (every segment 0x4000), and
  4.17.0 (with Capacitor 8) by the review, both 2026-09-30.
- **Permissions and exported components.** Every permission in the _merged_
  manifest, and every exported component, is listed with a reason. A new
  one from a plugin fails, and so does a listed one that is gone. Play's
  restricted permissions (exact alarms, full-screen intents, and so on) also
  need the declaration they would take. `USE_BIOMETRIC` and `USE_FINGERPRINT`,
  which `androidx.biometric` brings with the SQLite plugin, are removed in
  `AndroidManifest.xml` rather than listed: the app never turns on the
  plugin's biometric unlock.
- **The release build.** It is not debuggable, R8 ran (a non-empty
  `mapping.txt`), and it builds.

Reported only: size, with a per-directory breakdown (warns over 25 MiB), and
Android Lint (gated once `policy.json` sets `lint.gate`).

#### Departures from Google's guidance

Where the app knowingly differs from what Play would expect. A future
submission starts from this list, not from an audit.

| ID  | Departure                                                   | Why                                                                                                                                                                                                                                                                | Undo before Play                                                   |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| PD1 | _Retired 2026-09-30:_ the phone installs the release build. | Was: the phone installed the debuggable debug build.                                                                                                                                                                                                               | Done.                                                              |
| PD2 | `usesCleartextTraffic="true"`                               | The unpaired sync from home is plain http to a LAN address the person types (published content, no credential). A network security config cannot name it ahead of time. Anything carrying the pairing's credential is https only, refused in code (`native-http`). | Pair, so the sync reads the paired https host; then drop the flag. |
| PD3 | `allowBackup="true"`; the rules exclude only the pairing    | Backup is how the phone's history would survive a new phone. `backup_rules.xml` and `data_extraction_rules.xml` keep the home-server pairing out of backups and device transfer.                                                                                   | Decide what else is backed up, in those two files.                 |
| PD4 | _Retired 2026-09-30:_ `targetSdk` 36, on Capacitor 8.       | Was: `targetSdk` 35 on Capacitor 7, below Play's 36.                                                                                                                                                                                                               | Done. `minSdk` is now 24 (Android 7).                              |
| PD5 | arm64 only (`abiFilters`)                                   | Keeps SQLCipher's other ABIs out of a sideloaded APK.                                                                                                                                                                                                              | Nothing for Play itself; 32-bit phones would not be offered it.    |

`policy.json` records PD2 and PD3 as the flags' expected values, so changing
either fails the review until the entry changes too.

#### Invariants the review cannot check

In the `CLAUDE.md` "Gray-area invariants" shape.

> **P1: The pinned identity never changes.**
>
> - _Claim:_ once set, `identity.applicationId` and
>   `identity.signingCertSha256` in `review/policy.json` keep their values.
> - _Falsified by_ a hunk that changes, removes or moves either value, or
>   that deletes or renames `policy.json`, or that stops `review.mjs`
>   calling `reviewSigner` or `reviewManifest`.
> - _Scope:_ `apps/mobile/review/`.
> - _Why not enforced:_ the review enforces the build against these values,
>   but the values sit in the same repository. A diff that changes both the
>   build and the pin passes, and only a person can tell a deliberate reset
>   (before any Play upload) from drift.

> **P2: Every allowlist reason is true.**
>
> - _Claim:_ each `reason` in `policy.json` names why this app needs the
>   permission, exported component or flag: a feature of this app that is
>   still in it, or the library that brings the entry.
> - _Falsified by_ a hunk that adds or rewords an entry whose reason does not
>   name such a feature or library; that names a new app feature without
>   adding its code to the list below; that deletes, renames or moves the
>   code of a feature an unchanged reason names; or that changes, replaces
>   or removes the declaration of a library an unchanged reason names:
>   `@capacitor/local-notifications` (`apps/mobile/package.json`, and its
>   `pnpm-lock.yaml` entry); `androidx.core` (`androidxCoreVersion`) and
>   `androidx.profileinstaller`, which arrives through `androidx.appcompat`
>   (`androidxAppCompatVersion`), both in `android/variables.gradle`. A
>   replacement can supply the same entry for another reason. The app
>   features, and their code: soundbites and voice reflections
>   (`RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`), the recorder they share in
>   `packages/voice-capture/src/lib/recorder.ts`, the soundbites page
>   `apps/www/src/routes/_dashboard/_apk/soundbites.tsx`, the Build Journal
>   `apps/www/src/routes/_dashboard/_apk/journal.tsx` and
>   `apps/www/src/lib/reflection-voice/`; the
>   sync from home, the home-server pairing and the send to home
>   (`INTERNET`,
>   `usesCleartextTraffic`), `apps/www/src/lib/device-backend/home-sync/`,
>   `apps/www/src/lib/home-link/` and their Settings block
>   `apps/www/src/components/settings/device-section.tsx`; study nudges
>   (`POST_NOTIFICATIONS`), `apps/www/src/lib/study-nudge/native.ts`; the
>   phone's SQLite history (`allowBackup`),
>   `apps/www/src/lib/device-backend/capacitor-sqlite/`; the launcher
>   activity (`MainActivity`), `MainActivity.java` and its launcher
>   intent-filter in `android/app/src/main/AndroidManifest.xml`; the wings'
>   launcher icons (`WingPractice`, `WingSelf`, `WingStudio`, `WingJobs`), their
>   `<activity-alias>` entries in that manifest, `MainActivity`'s wing table
>   and `apps/www/src/lib/wings/`.
> - _Scope:_ `apps/mobile/review/policy.json`, the code listed above, and
>   those library declarations.
> - _Why not enforced:_ the review enforces that a reason exists, and that
>   a library's entries go when the library does (they leave the merged
>   manifest, and an allowlist entry the build no longer has fails). An app
>   feature's removal is not caught: `INTERNET` and the two flags are the
>   app's own manifest's, and stay after the code that used them is gone.
>   Whether a reason's words are true needs a person to read it.

### Icon and splash

The launcher icon is the favicon's mark (`apps/www/public/favicon.svg`): the
honey mochi, on Mochi's cream (`#FFF5E7`, `values/ic_launcher_background.xml`,
also www's `manifest.json` `theme_color`).

- **Android 8+:** an adaptive icon whose foreground is a vector,
  `drawable/ic_launcher_foreground.xml`, drawing the same body and face paths
  as `BrandMark` in `@some-ui/shared` (`apps/www/src/lib/brand/favicon.test.ts`
  checks them), plus a `monochrome` layer for Android 13's themed icons that
  cuts the face out of the body.
- **Android 7:** `mipmap-*/ic_launcher{,_round}.png`, rendered from the same
  geometry. Re-render them if the mark changes.
- **Wings:** each wing's icon is the same mark on its own colour
  (`values/wings.xml`; `mipmap-anydpi-v26/ic_wing_*.xml`, with the same
  monochrome layer). Android 7 shows the plain icon for each.
- **Splash:** the same background and mark, as `drawable/splash.xml` before
  Android 12 and through the `windowSplashScreen*` items in
  `values/styles.xml` from 12 on. Capacitor's stock splash images are gone.

### Locally

Gradle needs the Android SDK (`compileSdkVersion 36`,
`android/variables.gradle`):

```sh
export ANDROID_HOME="$HOME/Android/Sdk"
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

The Claude Code sandbox can: `dl.google.com` is reachable, so the repo's
CLAUDE.md recipe (`commandlinetools` into a scratch directory, then
`sdkmanager`) builds and lints the release APK before a push. Nothing on a PR
builds it.

## Sync from home, and pairing

**Settings → This phone → Home server** is the one place on the phone that
sends anything to the home server, and only on a tap there
(`docs/learner-data-authority.md`, LA8). Opening Settings, resuming the app or
being paired sends nothing; there is no retry and no background work.

Unpaired, it has an address field (for example `192.168.1.10:3000`) and
**Sync lessons from home**. Paired, it shows **Paired · host** with **Unpair**,
and the sync reads from the paired host. **Sync lessons from home**, pressed
while on the home network, copies every listed TOPIK lesson and every
served drama into the phone's database.

A lesson home no longer lists is deleted. A lesson that merely
failed to download is kept, and one that would not fit is skipped. Only published content
moves, and only home → phone, with no credential. **Stop** ends a running sync
after the request in flight, and so does the app going to the background;
what was copied stays. Sessions and the shelf stay where they were made.

Each lesson is asked for with the `ETag` the phone kept from the last read
(`device_home_answer`), while the phone still holds the bytes that tag named,
so what home has not changed comes back without a body; the two listings are
read whole, and the number of requests is the same. Home answering **429** (it allows 60 requests a minute per client)
ends the sync there, said as "Home is busy right now", with what came before
it kept and nothing retried. Each tap starts from the listings again, so a
catalogue of more than about 55 lessons ends busy at the same
place every time, and what is listed after it does not arrive.

**Update the phone before home.** A sync fails whole when a route it reads is
gone from home. So when a change retires a route the sync reads, install the
APK built from it on the phone first, then pull home's `file_host` image. For
example, an APK built before some-ui#2341 reads `/leetype/rounds` before any
lesson, so it fails every sync from home once home runs paulgsc/server#584.

**Pairing** lets the phone act for the person's account on the home server,
which it cannot do with a passkey (its page is `https://localhost`, another
site). On the computer, **Settings → Account → Pair a phone** shows a code
(8 characters, once, for 10 minutes) and the address to type with it. On the
phone, **Pair...** takes that `https://` address (never `http://`) and the
code; the button names the host, and the tap sends only the code. Home answers
with a session token, which the app's own `HomeCredential` plugin seals with
an Android Keystore key and keeps out of every backup and device transfer
(`res/xml/backup_rules.xml`, `res/xml/data_extraction_rules.xml`). **Unpair**
asks once more, tells home if it can, and forgets the token on the phone
either way. Signing out everywhere on the computer ends a phone's session too.
The server side is `paulgsc/server` `docs/identity.md`, "Pairing a phone".

**Send to host...**, once paired, counts what this phone would send: its
sessions and the items kept on its shelf (reading only the phone). The
confirm names those counts and the host, and only its **Send** sends. One
run, so one **Stop** (or the app going to the background) ends all of it
before the next request; nothing is retried.

- **Sessions** go as their records (plan, status and times); their
  reflections, stops and soundbites stay on the phone
  (`docs/learner-data-authority.md`, LA7). Each is created on home once, and
  the phone keeps a receipt of what home made. A session that moved on since
  its copy (planned when copied, finished later; renamed) has home's copy
  patched to match. Then each finished session (`mayLeavePhone`) is read
  back from home (`confirmHeld`), and those home holds exactly as the phone
  does leave the phone: sending is archiving. Nothing on home is deleted.
- **Kept items** go one PUT each, their bytes as kept; one with the same
  name there is replaced. Only those home doesn't hold as they are now go
  (the phone remembers each one home answered for by its bytes' digest),
  and the confirm counts only those; one home refused is offered again.
  An item removed on home is not sent again until its bytes change on the
  phone. They stay on the
  phone: they are for studying again. A full shelf there, or a refused item,
  is counted and said.

Home no longer knowing the phone, or no answer, ends the send there.

**Choices are told to home.** Each time I keep a record on home or stop
it, home is told which record and that sharing began or stopped, never
the words I agreed to (`lib/home-link/told.ts`; paulgsc/server#433 keeps
when it heard each one). Once home has heard a stop, it refuses aph and
Jobs writes from this phone, and a record goes to home only once home has
heard its choices. A choice is told first in the record's next run, and a
stop right after its second press; a stop the link was too busy for then
is told when a wing's mark next finds the link free, and one home did not
answer is told on the next run of a record still kept. aph's way back asks
for its record even when home could not hear the stop. Each session's
create also names its id, so a create whose answer was lost makes one
session on a home from paulgsc/server#432 on. An older home, once it has
said twice that it keeps no choices, is told nothing more until the app
starts again, and names its own ids.

**Archive finished sessions**, in the This phone block, is the way to
make room without a home server. It shares one file
(`sessions-<day>.json`, every finished session's full record) through
Android's share sheet, so the person picks where it goes (Drive, say:
`Study ledger › sessions`). Android says "shared" once an app is picked,
even if the person backs out, so the sessions leave the phone only once the
person says the file arrived, and only those unchanged since. Reflections
keep their own share (**Share with an agent**).

The sync goes through Capacitor's native HTTP (`device-backend/native-http`).
The app's page is `https://localhost`, so a browser `fetch` to
`http://<lan-ip>:3000` is blocked as mixed content, and the server's CORS
allowlist would also have to name that origin. Two consequences:

- `AndroidManifest.xml` sets `usesCleartextTraffic`. Android refuses
  plain-HTTP connections otherwise, and a network security config cannot
  scope that to "private addresses".
- Native HTTP parses JSON, so the bytes change: a synced lesson is the
  re-serialized bytes, not the ones home stored.

## Study nudges

An Android WebView has no web `Notification` API and no push. On the phone,
the client's own nudge policy decides (`clientOwnsNudgeDelivery`), and the
OS delivers the nudge as a **scheduled local notification**
(`@capacitor/local-notifications`), which fires with the app closed:

- **Leaving the screen:** `study-nudge/schedule` finds when `decideNudge`
  would next say "nudge", by stepping the same pure policy forward in time.
  That moment is scheduled, so quiet hours, "studied today" and the cooldown
  are all respected with no second copy of the rules.
- **Coming back:** a nudge whose time has passed becomes the cooldown, and a
  pending one is cancelled, because sessions or preferences may be about to
  change.
- **Tapping it:** the app opens the session it names.

The Android permission prompt comes from the reminders toggle under
**Settings → Study reminders**.

Nudges are **inexact** alarms: Android may deliver one a few minutes late,
which a study reminder can afford. `study-nudge/native.ts` schedules them
with `isExactNotification: false`, and the manifest removes the plugin's
`SCHEDULE_EXACT_ALARM`. Both halves matter: from plugin 8.3.0 the default is
exact, and without exact-alarm access (Android 14 denies it by default) each
`schedule()` would open the "Alarms & reminders" settings screen.

## The Jobs arrival notice

Home tells the phone when the morning run is in (RUN4 and RUN5, epic #2051):
the run picked something, picked nothing, or couldn't finish. It is the one
thing home pushes, so it comes by **Firebase Cloud Messaging**
(`@capacitor/push-notifications`), not a local notification. A phone that
asked home on a timer would break the rule that the phone asks only while
Jobs is open (LA10), and a fixed-time notification would be a reminder,
which Jobs does not have.

- **Turning it on:** Settings, the Jobs record's row, **Tell me when the
  morning run is in**, shown only while Jobs is kept on home. Android asks
  for notifications, the push service gives this install a token
  (`lib/jobs/notice-native.ts`), and the next exchange with home files it
  (`PUT /jobs/notice`). Off takes it back (`DELETE /jobs/notice`).
- **What it says:** fixed words from home, whether the picks are at home or
  the run couldn't finish. Google carries the text, so nothing of the picks
  goes in it. Tapping it opens Jobs, and on the home Wi‑Fi the card says the
  rest.
- **A build without Firebase:** the Gradle build applies Google's services
  plugin only when `android/app/google-services.json` exists. Without it,
  `register()` would throw, and Capacitor turns that into a crash, so
  `patches/@capacitor__push-notifications@8.1.3.patch` makes it answer
  `UNAVAILABLE`, and the control is not shown.
- **Nothing reaches Google until it is on:** the manifest turns off
  Firebase Messaging's start-up token
  (`firebase_messaging_auto_init_enabled`), so an install with Firebase
  configured gets a token only when the person turns the notice on.
  Firebase still adds its receiver for Google Play services' messages
  (`review/policy.json`).
- **To turn it on for real:** a Firebase project with the Android app
  `dev.paulgsc.someui`, its `google-services.json` in `android/app/` (it is
  configuration, not a secret), and on the box the service account
  `FCM_SERVICE_ACCOUNT_FILE` names (paulgsc/server `example.env`).
- **Play:** the data-safety form gains a device identifier (the FCM token),
  sent to the owner's own server, for app functionality.

## A session ends by winding down, not by stopping

A session's length is the person's budget, and it holds, but the end is
announced, not sprung:

- **The last two minutes** (a quarter of a session under eight): a pill
  appears in the strip above the activity, never over it, with a ring running
  down, **+5 min** and **Wrap up**. Ignored, the session ends on time. +5
  min is the orchestrator's `Extend` command, which lengthens whichever scene
  ends last.
- **The wrap** replaces the bare timing summary: the time played, planned
  and added; "How did it go?", the session's reflections (below); and
  **Done**, back to Practice's Home. Wrapping up inside the last minutes counts as
  complete, not "stopped early".
- **Practice's Home** then says **Studied today** ("15 min · Korean", or "2 sessions ·
  33 min") in the success colour and offers **Another round**; "Not today?
  Say why" steps aside. A session still open keeps **Resume** first.

Not yet: LeetType runs its own session clock from its mount, which +5 min
does not reach, so a LeetType session extended past its planned end shows
LeetType's own "Session complete" inside the activity until the session ends.

## Reflections: said while fresh, handed off, not kept

A reflection is one thing said about a session while it is fresh: a voice
note (**Talk**), a typed line, or the one-tap answers (worth it, pace,
energy: one set per session, changed in place). **Reflect** sits in the
strip above the activity for the whole session (beside the controls on a wide
screen), and the wrap offers the same panel; each reflection carries its
session's ID and how far into it it was said. The session keeps running
while the sheet is open, and a take in progress when it closes is kept.

They are for the next session, not an archive. The phone keeps at most 20
across every session (`REFLECTION_LIMIT`, `lib/session-reflection`); nothing
is dropped to make room, so at 20 the panel offers only the way out. One
older than a week reads as **stale**. The study list says how many slots are
taken and how long the oldest has waited ("To hand off"), and each session's
card says how many it has, how old, and **Share**. In the panel, each of the
session's reflections has its own share beside its let go, so one said
mid-session can go out at once. Sharing (one reflection, one session, or
all of them, through the share sheet: one file per session named for its date,
name and ID, each voice note beside it, with the session's stops and the
read-aloud practice record, `lib/agent-export`) then asks whether
they arrived: Android says "shared" as soon as an app is picked, even if the
person backs out of it. Yes takes them off the phone, so a reflection shared
mid-session is not in its session's file again at the end (both files carry
the session's name, so a folder can hold two of that name), and leaves
"Reflections shared" on the card; **Let go** removes them unshared. A voice reflection's audio is on a shelf of its own
(`lib/reflection-voice`), counted toward the 20 and never toward the
soundbites' six. Nothing about a reflection reaches the home server
(`docs/learner-data-authority.md`, LA7).

## A session cut short still closes

Real life interrupts, and often there is no time to say so. Stopping never
asks anything; the reason is optional, can come later, and may never come.
Each stop is one record (the newest 20 kept on this phone) so that what keeps
cutting study short can be read over time.

- **Got to go** sits in the strip above the activity (until the wind-down's
  **Wrap up** takes over). One tap pauses the session and keeps the stop,
  with six optional reasons, **Go**, and **Oops, keep going**, which forgets
  a mis-tap.
- **Leaving** mid-session is a stop too, with nothing to tap: the app going
  to the background, or Back or a link in the app closing the session's
  screen. Back within a minute it was a glance, and is forgotten, even after
  the screen closed: the session goes on from where it was (playing, even if
  it had been paused, once the screen had closed).
- **Within 30 minutes** of the stop the person can **Pick up where you left
  off** (exactly, in the player they left; once reopened, the clock goes on
  from where it stopped, so time played adds up, and the activity starts its
  content again) or **Call it done**.
- **Past 30 minutes**, whether the stop screen is still up, the app is
  reopened or Practice's Home is, the session closes as it stood, dated when it
  stopped, and counts toward **Studied today**; a close whose write failed is
  retried. Practice's Home asks once, optionally, why the latest finished session was
  cut short, and its wrap reads "12 min, banked".

A record keeps when it stopped, how far in and in which scene, a tap or
leaving, the reason and where it was given (the stop, the return, the wrap or
Practice's Home), how it ended (picked up, called done or lapsed) and when, which says
how long the person was away. Beside the records, each session counts what
they cannot show: how often its screen opened unfinished, the glances, the
taps taken back and the pick-ups (the 20 sessions counted most recently). A
departure the app cannot see, such as a crash while on screen, leaves no stop
and only one more open, and the session starts again from the beginning when
reopened. A finished session played again keeps no stop on Back. The policy is
one pure `step` in `apps/www/src/lib/session-stop`, run by `./runtime`; the
player only forwards taps, `visibilitychange` and its own closing. The app
sends them, and the counts, nowhere: they leave the
phone in what the person shares (both shares in `lib/agent-export` carry
them) and, as WebView storage, in Android's backup ("What the phone keeps",
PD3), and they never reach the home server: reading them across devices
needs them on the session record, a server migration.

## aph: my figure, their figure, and the goal

A reconciliation, the way a ledger is reconciled against a bank statement.
For each day and time of day (the checkpoints, 7:00 and 12:00) there are
three figures: **mine**, observed and usually rough ("~4,300"); **theirs**,
reported later by the side I do not control; and the **goal** it should be.
Defined **labels** ("no-bs", "w/o office" …) and a short note say what was
different that day.

- **Reconciled** (green check): mine and theirs within the tolerance (±100
  by default), settled without me.
- **Your call** (amber): further apart, or theirs with no figure of mine.
  It waits until I **agree** with theirs (green, double check) or **flag**
  it (red flag, the only red).
- **Awaiting theirs** (grey, dashed): their figure has not come in.

The delta is the standing figure (theirs once reported, else mine) against
the goal the entry was made under, so changing a goal never rewrites the
past. Colours are theme tokens (`--success`, `--warning`, `--destructive`,
`--chart-*`), so every theme restyles it.

Code: `packages/ui/aph` (`lib/model.ts` decides everything; the screens
draw it), routed under `_dashboard/_apk/aph`.

- **Kept on the phone** (`lib/stored.ts`), until I choose otherwise: entries
  and settings live in one `localStorage` key under the pinned
  `https://localhost` origin, so they survive a reload, a restart and an
  update installed over the app, and go into Android's backup with the
  WebView's storage. The first launch starts from the paper notes they
  replace (`lib/seed.ts`) and keeps them. A change the phone refuses to keep
  is refused on screen too ("Not saved"), and a record that cannot be read is
  moved aside, never written over. Uninstalling the app, or clearing its
  data, still deletes it, which is what the strip above aph's views says.
- **Kept on home**, once I press "Keep on home" twice in that strip (the
  first press names the host and how many entries go; the phone must be
  paired). From then on the home server is the record (paulgsc/server
  `routes/aph.rs`, append-only: every revision is kept and nothing is
  deleted), and the phone keeps only the settings and what home hasn't
  confirmed (`lib/home.ts`). While aph is open with the app in front, it
  syncs on its own: when aph opens, after each change, when the app comes back
  or the network does (`lib/home-link/aph.ts` in www; LA9 in
  `docs/learner-data-authority.md`). A change leaves the phone only once home
  answers with the same entry. Off the home network, changes wait on the
  phone, and the strip says how many; until home is reached, History shows
  only what the phone hasn't sent. An entry home refuses (a second plain
  figure at a checkpoint home already holds, say) stays on the phone with
  why, until it is changed. There is no way back to the phone only yet.
- **A day I missed** can still be logged, up to two weeks back
  (`loggableDays`): the logger steps back a day at a time, and History's
  "not logged" rows open it on that day. A figure off the checkpoints on a
  past day keeps no clock time, since the time was never written down.

## Soundbites: saying why a session did not happen

The phone's answer to "why didn't I study?", asked in the one way that costs
nothing: out loud, with no form. Each soundbite is a data point in a
longitudinal record of what gets in the way, for an agent (or a person) to
make sense of later. Engagement should never be the reason a lesson did not
happen; these recordings are how the app finds out when it was.

**Getting there is one tap, and the tap starts listening.**

- **Practice → Not today? Say why** (Practice's Home).
- A study reminder's **Not today: say why** button. A reminder that is not
  going to be followed is when the reason is freshest, so the answer is one
  tap from the notification instead of a dismissal.

Both land on `/soundbites?say=…`, which opens the microphone on arrival.
Tap again to keep it. There is nothing to type, choose or confirm, and a
row of sentence starters ("Too tired", "No time today", "The app got in the
way" …) is there for the moment the mind goes blank.

**Bites** in Practice's bar opens the same
page without listening: the way to play back or delete what is kept, with
no live microphone.

**What the app notes by itself**, beside each recording: when it was made
(with the phone's time zone), how it was reached (the list, a reminder, or
the page), when a session was last touched, and how many are open. The
person only ever supplies the why.

**Bounded, never blocking** (`packages/ui/soundbites/src/lib/policy.ts`):

- A take stops itself, and is kept, at **one minute**. The ring around the
  button shows the minute running out, amber for the last ten seconds.
  Under a second is a stray tap, and not kept.
- The phone keeps **six**. A seventh never waits on a decision: it replaces
  the oldest, unless the person marked another to replace instead (before,
  during or never). The cap is enforced in the same IndexedDB transaction
  as the write.
- A take cut short from outside (the screen off, the app backgrounded, the
  page left) is kept up to that point, not lost.

**Where they live:** the WebView's IndexedDB (`some-ui.soundbites`), on the
phone only, as Opus in WebM at 32 kbps (at most 4 KB a second, about a quarter
of a megabyte for a full minute). Not the device backend's SQLite: they are
not `file_host` data and no server route exists for them.

**Only the APK carries it.** `@some-ui/soundbites` is the first workspace of
the `apk` build audience (`packages/some-vite-config/AUDIENCES.md`): only the
`mobile` profile bundles it, every other build stubs it, and its page sits
under `_dashboard/_apk/`, whose layout answers not-found anywhere else. To
try it in a desktop browser, run `SOME_UI_PROFILE=mobile pnpm dev` in
`apps/www`.

**Microphone permission:** the first tap to talk shows Android's prompt
(`RECORD_AUDIO`, requested by Capacitor's `BridgeWebChromeClient` for the
WebView). Refused, the page says where in Android Settings to turn it back
on.

**Getting them off the phone: "Share with an agent".** Below the list, one
button writes a `context.json` (sessions, each with its reflections, stop
reasons, each soundbite's metadata, the read-aloud practice record, and a
note saying what an agent should
use them for: shaping the next lesson, and finding where the app gets in the
way) plus each soundbite's and voice reflection's audio to the app's cache,
then opens Android's share sheet, where the person picks where they go
(Drive, say). Once the person says they arrived, the reflections and
soundbites shared leave the phone, reflections as above; a soundbite recorded
since stays.
`apps/www/src/lib/agent-export`. A WebView cannot download a blob, so this
goes through `@capacitor/filesystem` and `@capacitor/share`: neither adds a
permission or an exported component (their manifests are empty, checked
2026-10-07 at 8.1.4 and 8.0.3), and the share plugin hands files out through
the template's `FileProvider`, already in `AndroidManifest.xml`. Not done:
the home server receiving soundbites itself.

## Speech

Android System WebView has no working `speechSynthesis`: it is missing, or a
stub with no voices that never speaks. So the phone speaks with Android's
own **text-to-speech engine** (`@capacitor-community/text-to-speech`),
offline, in any language whose voice data is installed (#1625):

- **Wiring:** in the device build, `providers/tts.tsx` hands the speech
  session `deviceSpeechBackend()` (`apps/www/src/lib/device-speech`) as its
  `native` voice. Everything that speaks through the session gets it: TOPIK
  (in Korean) and Honeycomb's word prompts. The plugin loads with the
  session, which asks for the phone's voices and probes for Korean up front.
- **Cold start:** Android binds its text-to-speech service after the plugin
  loads, and until then the plugin answers wrongly instead of waiting (no
  voices, no Korean, `speak` unavailable). `native.ts` makes every call wait
  for a voice list to come back first, for up to ten seconds.
- **Korean has to be installed.** Speech Services by Google ships Korean as
  a download (Settings → Accessibility → Text-to-speech → the engine's gear
  → Install voice data). Until it is there, the first line a lesson tries
  raises one toast with an **Install** button, and **Settings → Voice** says
  the same and offers the same button. The button goes through the app's
  own plugin, `VoiceDataPlugin.java` (registered in `MainActivity`), which
  launches the engine's installer (`ACTION_INSTALL_TTS_DATA`), or the
  system's text-to-speech settings when the engine has none. The TTS
  plugin's own `openInstall` launches the voice-data _check_, which can
  return without offering a download. The new plugin adds nothing to the
  manifest.
- **Settings → Voice** lists the phone's Korean voices, offline ones first,
  with a sample to play. The sample is a line through the speech session
  (`useVoicePreview`), so it honors mute and the lesson it interrupts is
  said again after it. The web builds' provider and voice fields, which
  choose a hosted voice, are hidden on the phone (#1628).
- **Manifest:** the plugin adds one `<queries>` entry for
  `android.intent.action.TTS_SERVICE`, so the app can see the installed
  engines. It adds no permission and no exported component, and the review
  does not audit `<queries>`; the restricted kind, `QUERY_ALL_PACKAGES`,
  stays in `restrictedPermissions`.
- **R8:** Capacitor's consumer rules keep every `@CapacitorPlugin` class,
  the app's own included, so `proguard-rules.pro` needs nothing.
- **CI** checks the plugin reached the bundle (`mobile-apk.yml`), since it
  arrives through a dynamic import behind `VITE_DEVICE_BACKEND`. It cannot
  hear anything: whether a lesson actually speaks is checked on the phone.

## Hearing an idea: speech to text, offline

Studio's **New idea** (`/journal/idea`, STUDIO ST18) asks what a video is,
one question at a time, and shows the words as they are spoken. It hears
them through the app's own plugin, `ListenPlugin.java` (registered in
`MainActivity`, reached from www's `src/lib/device-listen` through
`callForeign`):

- **Offline, and no sound kept.** It uses only Android's on-device
  recognizer (`createOnDeviceSpeechRecognizer`, Android 12 and later), with
  partial results: `EXTRA_PREFER_OFFLINE` alone may be ignored by a
  network-backed service, so it is never relied on. The recognizer takes
  the microphone and hands back text; nothing writes a file. Only the words
  the owner confirms are kept, as text in the page's storage
  (`some-ui:studio:ideas`).
- **Answered in human time (LS1, www's `lib/device-listen`).** The plugin
  says `asking` when the microphone prompt goes up and `ready` when the
  recognizer is listening, and www bounds reaching ready (5 s; 60 s while
  the prompt is up) and Done talking (5 s). The plugin's doc comment says
  why a stop before ready settles on its own.
- **Typed when it can't listen.** A phone with no on-device recognizer or
  without its offline English pack, or with the microphone refused,
  answers `UNAVAILABLE`, and the question
  takes typed words instead. "Type instead" is always there.
- **Manifest:** a `<queries>` entry for `android.speech.RecognitionService`,
  without which Android 11+ hides the recognizer from the app. The
  microphone is the `RECORD_AUDIO` the soundbites already declare; the
  plugin asks for it on the first tap to say an idea.
- **Nothing on a PR runs it.** Whether the phone actually hears is checked on
  the phone; www's tests cover what each of the plugin's answers becomes.

## Not done yet

- **Nothing syncs back, on purpose.** A session that left the phone is not
  brought back, and an archive is not imported: a finished session's record
  is for an agent to read when it shapes the next lesson, not for the phone
  to show again.
- **Nothing here has run on a phone yet.** CI builds and launches it in an
  emulator and checks native SQLite across activity recreation. The backend's
  route tests run its SQL in Node's SQLite.

### SQLite bridge lifetime

`patches/@capacitor-community__sqlite@8.1.1.patch` releases SQLite connections
when Capacitor destroys a bridge. Cleanup runs on the bridge's plugin worker,
where its transactions belong, and rolls back any transaction the destroyed
WebView left unfinished. The next bridge waits for cleanup before opening a
database. Without this, activity recreation during startup can leave the old
transaction holding the file locked (`PRAGMA journal_mode` on the next open).

`SQLiteLifecycleTest` recreates the activity with an unfinished transaction and
checks that the replacement bridge can reopen the file, preserving committed
rows and rolling back the unfinished row. The APK launch job runs it after
installing and exercising the release APK. Remove the patch when the upstream
plugin provides equivalent lifecycle cleanup.

For pre-merge Android validation, dispatch **Mobile APK** on the fix branch
(`gh workflow run mobile-apk.yml --ref <branch>`). Branch runs build, review,
and launch the APK and run the lifecycle regression, without publishing or
pruning the phone's retained APK.
