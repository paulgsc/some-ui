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

## What the app carries: a Home and its daily tools

The phone opens on its own **Home** (`/today`): what each daily tool needs
from me right now, and what today has held so far. The tools hang off it,
one tab each in the bar along the bottom:

- **Study**: sessions - the list, the composer and the player;
- **Bites**: the soundbites (below);
- **aph**: logging aph and reconciling it (below).

The + in the middle of the bar is a shortcut into those same tools ("Talk
now", aph's mine or theirs, a new session), never a place of its own.
Nothing else www routes to is here: the landing page, the web's Home, the
résumé, jobs, profile, the extensions tour and the LAN tools are the web
app's.
**Settings** stays, behind the gear in the header, because on the phone it
is the phone's own page: the sync from home, study reminders and the voice.

How that is enforced (www `src/lib/app-surface`):

- `build:web` selects the `mobile` profile (`apps/www/build.profiles.ts`),
  which sets `MOBILE_APP` in the bundle.
- `MOBILE_SURFACE` is an **allowlist**: `/today`, `/sessions`, `/soundbites`,
  `/aph` and `/settings`, typed against the route tree. (Also `/auth`, which the phone never shows since it
  is always signed in: should a device route ever answer 401, the account
  banner links there, and in this build it offers a reload, not a sign-in.) The root route redirects any other path to
  `/today` before its own guards run, so the app opens on Home,
  and a page added to www later stays off the phone until someone lists it.
- There is no sidebar: the bottom bar (`src/components/mobile-shell`) links
  the tools, and steps aside on the two bounded screens (the player and the
  composer). "Start something new" goes to the composer rather than the web
  Home's launcher.
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
  same process. So sessions, the shelf, the TOPIK catalogue and Leetype rounds
  all take their normal server-mode code paths, unchanged.
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

| Served on the device                                      | From                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------- |
| `/sessions*`                                              | the `sessions` table                                       |
| `/shelf/:activity[/:key]`                                 | `learner_shelf` (keep a pasted lesson or your own round)   |
| `/curriculum/manifest[.json]`, `/curriculum/:key`         | `curriculum`, filled by a sync from home                   |
| `/leetype/rounds`, `/:id`, `/:id/runs`                    | `leetype_round*`, seeded from `packages/ui/leetype/corpus` |
| `/auth/session`, `/signals`, `/presence/lease`, `/push/*` | see above                                                  |

Anything else answers `file_host`'s plain-text `404`, which is what a server
too old to have that route would answer.

### What the phone keeps

The app's database and WebView storage together stay under Android's
[25 MB backup quota](https://developer.android.com/identity/data/autobackup),
past which Android stops backing the app up without saying so, and that
backup is the only other copy of the phone's history (`device-backend/storage`).
There is no size per table. Only the database is checked, against the quota
less what soundbites can hold at most (their own cap, from
`@some-ui/soundbites/contract`, which their store refuses to pass), so WebView
growth never refuses a session. The WebView's other storage (preferences and
small capped stores) is not counted.

A restore has to be able to open what it brings back. The SQLite plugin's
default (`androidIsEncryption: true`) kept an encrypted preferences file keyed
in the Android Keystore; Auto Backup restores the file after an uninstall but
never the key, so the reinstalled plugin failed to load and the app could
read none of the history it had just restored (2026-10-07; clearing the
app's data was the only way out, and it deleted that history).
`capacitor.config.ts` turns the setting off, and the review fails an APK
whose shipped config does not (`review/policy.json`, `pluginConfig`).

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
  removes it only if the person agrees. Sessions sync nowhere yet, so a
  removed one is gone: that it hurts is the signal sessions need a server.
- **Published content follows its source.** A sync deletes the lessons and
  rounds home stopped listing, records a retired bundled round so the next
  start does not restore it, and skips what would not fit. The seed deletes
  bundled rounds the app no longer ships. All of it is reported. If home's
  corpus is older than the app's, a sync also drops the newer bundled rounds
  home does not list, until home lists them.
- **Presence leases** are trimmed to the server's own 16.

The database runs with `auto_vacuum = FULL`, so deleted rows leave the file
Android backs up.

### What content is on the phone

- **Leetype:** the bundled corpus (`packages/ui/leetype/corpus`), seeded on
  every start, together with its recorded runs. The raw files hash to the same
  content hashes their runs were recorded against, so the runs show offline.
- **TOPIK:** lessons are not in either repository. They exist only in the home
  server's database, so the phone gets them by a **sync from home** (below).
  Before the first sync, TOPIK offers the bundled read-aloud decks, plus any
  lesson you paste and keep on the shelf.

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
- `dev:web` sets `SOME_UI_DEV_HTTP=1`. With mkcert certs in `certs/`, `vite`
  otherwise serves https, and the WebView does not trust mkcert's CA and
  Capacitor does nothing with a certificate error: a blank screen.
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

`.github/workflows/mobile-apk.yml` builds it on every push to `main` that
touches what it is built from, and on nothing else (pull requests do not).
Open the run in the repository's **Actions** tab and download the
`some-ui-apk-<sha>` artifact. It is a zip holding `some-ui-<sha7>.apk`, the
**release** build (R8-shrunk, not debuggable). Install that on the phone
(allow installs from your browser or file manager). It is signed with the
repository's key ("Signing", below), so it installs as an update over any
earlier CI build, debug ones included.
The debug APK is still built, for the review only (`mobile-review-<sha>`).

**Launch test.** Before a run counts as green, its release APK is installed
and started in an API 36 emulator, then driven by a short seeded monkey run
(`launch/launch-test.sh`). A dead process, a crash, an ANR or a monkey run
that did not finish fails the run, and the older APK is then kept. Since the
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
  artifact, so GitHub holds about 10 MB, not 10 MB per push. A failed or
  cancelled run deletes nothing, so the previous APK stays in place.
- **30-day expiry.** `retention-days: 30` bounds the newest one too.
- **arm64 only.** SQLCipher, which the SQLite plugin brings, ships a native
  library per ABI. `abiFilters` keeps only `arm64-v8a` (5.2 MB of the four's
  roughly 19 MB). To run the APK in an emulator, build it with
  `SOME_UI_EXTRA_ABI=x86_64`, as the launch test does.
- **`versionCode` is the run number**, so each APK is an update of the last,
  and Settings → Apps → Some UI shows which build is installed.

### Play readiness

The app is sideloaded and there is no plan to publish it. But if it ever goes
through Google Play, that should be an increment, not an overhaul. So every
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

| ID  | Departure                                                   | Why                                                                                                                         | Undo before Play                                                |
| --- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| PD1 | _Retired 2026-09-30:_ the phone installs the release build. | Was: the phone installed the debuggable debug build.                                                                        | Done.                                                           |
| PD2 | `usesCleartextTraffic="true"`                               | The sync from home is plain http to a LAN address the person types. A network security config cannot name it ahead of time. | Sync over https, or a network security config naming the host.  |
| PD3 | `allowBackup="true"`, with no backup rules                  | Backup is how the phone's history would survive a new phone.                                                                | Add `dataExtractionRules` saying what is backed up.             |
| PD4 | _Retired 2026-09-30:_ `targetSdk` 36, on Capacitor 8.       | Was: `targetSdk` 35 on Capacitor 7, below Play's 36.                                                                        | Done. `minSdk` is now 24 (Android 7).                           |
| PD5 | arm64 only (`abiFilters`)                                   | Keeps SQLCipher's other ABIs out of a sideloaded APK.                                                                       | Nothing for Play itself; 32-bit phones would not be offered it. |

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
>   `@capacitor/local-notifications` and
>   `@capacitor-community/speech-recognition` (`apps/mobile/package.json`,
>   and their `pnpm-lock.yaml` entries); `androidx.core` (`androidxCoreVersion`) and
>   `androidx.profileinstaller`, which arrives through `androidx.appcompat`
>   (`androidxAppCompatVersion`), both in `android/variables.gradle`. A
>   replacement can supply the same entry for another reason. The app
>   features, and their code: soundbites (`RECORD_AUDIO`,
>   `MODIFY_AUDIO_SETTINGS`), `packages/ui/soundbites/src/lib/recorder.ts`
>   and its page `apps/www/src/routes/_dashboard/_apk/soundbites.tsx`;
>   LeetType's spoken margin notes (`RECORD_AUDIO`),
>   `apps/www/src/lib/dictation/` and the composer in
>   `packages/ui/leetype/src/lib/leetype/notes/`; the
>   sync from home (`INTERNET`, `usesCleartextTraffic`),
>   `apps/www/src/lib/device-backend/home-sync/` and its Settings entry
>   `apps/www/src/components/settings/device-section.tsx`; study nudges
>   (`POST_NOTIFICATIONS`), `apps/www/src/lib/study-nudge/native.ts`; the
>   phone's SQLite history (`allowBackup`),
>   `apps/www/src/lib/device-backend/capacitor-sqlite/`; the launcher
>   activity (`MainActivity`), `MainActivity.java` and its launcher
>   intent-filter in `android/app/src/main/AndroidManifest.xml`.
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
seven-cell honeycomb in its honey pair, on the dark of www's `manifest.json`
(`#101010`, `values/ic_launcher_background.xml`).

- **Android 8+:** an adaptive icon whose foreground is a vector,
  `drawable/ic_launcher_foreground.xml`, with the favicon's geometry, plus a
  `monochrome` layer for Android 13's themed icons.
- **Android 7:** `mipmap-*/ic_launcher{,_round}.png`, rendered from the same
  geometry. Re-render them if the mark changes.
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

The Claude Code sandbox cannot install it (`dl.google.com` is outside its
egress policy), which is why CI builds the APK.

## Sync from home

**Settings → This phone** has one field and one button. The field takes the
home server's address, for example `192.168.1.10:3000`. **Sync lessons from
home**, pressed while on the home network, copies two things into the
phone's database:

- every listed TOPIK lesson;
- any Leetype round whose content hash differs from the one the phone holds,
  together with its runs.

A lesson or round home no longer lists is deleted. A lesson that merely
failed to download is kept, and one that would not fit is skipped. Only published content
moves, and only home → phone. Sessions and the shelf stay where they were
made.

The sync goes through Capacitor's native HTTP (`device-backend/native-http`).
The app's page is `https://localhost`, so a browser `fetch` to
`http://<lan-ip>:3000` is blocked as mixed content, and the server's CORS
allowlist would also have to name that origin. Two consequences:

- `AndroidManifest.xml` sets `usesCleartextTraffic`. Android refuses
  plain-HTTP connections otherwise, and a network security config cannot
  scope that to "private addresses".
- Native HTTP parses JSON, so the bytes change. A synced Leetype round is
  therefore stored against the hash the server's manifest attests, which is
  the hash its runs were recorded against, not the hash of the re-serialized
  bytes.

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

## A session ends by winding down, not by stopping

A session's length is the person's budget, and it holds, but the end is
announced, not sprung:

- **The last two minutes** (a quarter of a session under eight): a pill
  appears in the strip above the activity, never over it, with a ring running
  down, **+5 min** and **Wrap up**. Ignored, the session ends on time. +5
  min is the orchestrator's `Extend` command, which lengthens whichever scene
  ends last.
- **The wrap** replaces the bare timing summary: the time played, planned
  and added; "How did it go?" (worth it, pace, energy: optional, one tap
  each, the latest 20 sessions' answers kept on this phone,
  `lib/session-reflection`); **Say what stuck**, a soundbite (`say=wrap`);
  and **Done**, back to Home. Wrapping up inside the last minutes counts as
  complete, not "stopped early".
- **Home** then says **Studied today** ("15 min · Korean", or "2 sessions ·
  33 min") in the success colour and offers **Another round**; "Not today?
  Say why" steps aside. A session still open keeps **Resume** first.

Not yet: LeetType runs its own session clock from its mount, which +5 min
does not reach, so a LeetType session extended past its planned end shows
LeetType's own "Session complete" inside the activity until the session ends.

## A session cut short still closes

Real life interrupts, and often there is no time to say so. Stopping never
asks anything; the reason is optional, can come later, and may never come.
Each stop is one record (the newest 20 kept on this phone) so that what keeps
cutting study short can be read over time.

- **Got to go** sits in the strip above the activity (until the wind-down's
  **Wrap up** takes over). One tap pauses the session and keeps the stop,
  with six optional reasons, **Go**, and **Oops, keep going**, which forgets
  a mis-tap.
- **Leaving the app** mid-session is a stop too, with nothing to tap. Back
  within a minute it was a glance, and is forgotten.
- **Within 30 minutes** of the stop the person can **Pick up where you left
  off** (exactly, in the player they left; at the start of the stopped scene
  once reopened) or **Call it done**.
- **Past 30 minutes**, whether the stop screen is still up, the app is
  reopened or Home is, the session closes as it stood, dated when it
  stopped, and counts toward **Studied today**; a close whose write failed is
  retried. Home asks once, optionally, why the latest finished session was
  cut short, and its wrap reads "12 min, banked".

A record keeps when it stopped, how far in and in which scene, a tap or
leaving, the reason and where it was given (the stop, the return, the wrap or
Home), how it ended (picked up, called done or lapsed) and when, which says
how long the person was away. The policy is one pure `step` in
`apps/www/src/lib/session-stop`, run by `./runtime`; the player only forwards
taps and `visibilitychange`. The records never leave the phone yet: reading
them across devices needs them on the session record, a server migration.

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
draw it), routed under `_dashboard/_apk/aph`. **Not stored yet:** entries
live in memory, starting from the paper notes they replace
(`lib/seed.ts`), and a reload starts over. Storage comes once the screens
have settled.

## Soundbites: saying why a session did not happen

The phone's answer to "why didn't I study?", asked in the one way that costs
nothing: out loud, with no form. Each soundbite is a data point in a
longitudinal record of what gets in the way, for an agent (or a person) to
make sense of later. Engagement should never be the reason a lesson did not
happen; these recordings are how the app finds out when it was.

**Getting there is one tap, and the tap starts listening.**

- **Home → Study → Not today? Say why** (the screen the app opens on).
- A study reminder's **Not today: say why** button. A reminder that is not
  going to be followed is when the reason is freshest, so the answer is one
  tap from the notification instead of a dismissal.

Both land on `/soundbites?say=…`, which opens the microphone on arrival.
Tap again to keep it. There is nothing to type, choose or confirm, and a
row of sentence starters ("Too tired", "No time today", "The app got in the
way" …) is there for the moment the mind goes blank.

**Talk now** in the + sheet opens it listening too, for a comment rather
than a reason (`say=capture`), and so does a finished session's **Say what
stuck**, for a summary (`say=wrap`). **Bites** in the bottom bar opens the same
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

**Spoken margin notes in LeetType use the phone's recognizer, not the
WebView's.** A note on a round (canon Rem. 3.7) can be spoken as well as
typed. An Android WebView has no Web Speech recognizer, so the app passes
LeetType the phone's own `SpeechRecognizer` through
`@capacitor-community/speech-recognition` (`apps/www/src/lib/dictation/`).
Only the transcript is kept; no audio is written. The plugin needs
`RECORD_AUDIO`, the permission soundbites already holds, and its manifest
adds a `<queries>` entry for `android.speech.RecognitionService`, which is
package visibility for that one intent, not a permission. Soundbites itself
does not transcribe: it keeps recording audio through the WebView, and two
recorders cannot reliably share the microphone on Android.

**Not done yet: getting soundbites off the phone.** Today they can be played
back and deleted on the phone, and nothing more. Delivery (a file to share,
or the home server, for an agent to read), then clearing what was
delivered, is the next step. A WebView cannot download a blob, so on the
phone a file needs `@capacitor/filesystem` and `@capacitor/share` (neither
adds a permission or an exported component: their manifests are empty,
checked 2026-10-01 at 8.1.3 and 8.0.2), and the home server needs a route to
receive them.

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

## Not done yet

- **Nothing syncs back.** A session recorded on the phone stays on the
  phone. Two histories of one person's sessions need a merge rule first.
- **Nothing here has run on a phone yet.** CI proves the APK builds. Every
  test runs the backend's SQL in Node's SQLite, not through the native bridge.
