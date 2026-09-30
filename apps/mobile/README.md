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

## What the app carries: sessions

The phone gets **sessions** - the list, the composer and the player - and
nothing else www routes to. The landing page, Home, the résumé, jobs, profile,
the extensions tour and the LAN tools are the web app's; the Storybook is a
separate site that was never in www's bundle. **Settings** stays, because on
the phone it is the phone's own page: the sync from home, study reminders and
the voice.

How that is enforced (www `src/lib/app-surface`):

- `build:web` selects the `mobile` profile (`apps/www/build.profiles.ts`),
  which sets `MOBILE_APP` in the bundle.
- `MOBILE_SURFACE` is an **allowlist**: `/sessions` and `/settings`, typed
  against the route tree. (Also `/auth`, which the phone never shows since it
  is always signed in, so that the sign-in guard and this one cannot redirect
  each other in a loop.) The root route redirects any other path to
  `/sessions` before its own guards run, so the app opens on the sessions list,
  and a page added to www later stays off the phone until someone lists it.
- The sidebar shows only the listed pages, and "Start something new" goes to
  the composer rather than Home's launcher.
- The build leaves out the résumé's PDFs and its `/resume/` document.

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

| Served on the device                                      | From                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------- |
| `/sessions*`                                              | the `sessions` table                                       |
| `/shelf/:activity[/:key]`                                 | `learner_shelf` (keep a pasted lesson or your own round)   |
| `/curriculum/manifest[.json]`, `/curriculum/:key`         | `curriculum`, filled by a sync from home                   |
| `/leetype/rounds`, `/:id`, `/:id/runs`                    | `leetype_round*`, seeded from `packages/ui/leetype/corpus` |
| `/auth/session`, `/signals`, `/presence/lease`, `/push/*` | see above                                                  |

Anything else answers `file_host`'s plain-text `404`, which is what a server
too old to have that route would answer.

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
- `SOME_UI_PROFILE=mobile`: sessions only (above); like `pages`, it also
  leaves out the LAN-only operator CRMs. Inherit `pages` or `lan` instead and
  the phone gets the whole web app.

turbo passes each one through: it infers `VITE_*` for this workspace, and
`SOME_UI_PROFILE` is declared in `turbo.json`.

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
>   permission, exported component or flag.
> - _Falsified by_ a hunk that adds or rewords an entry whose reason does not
>   name a feature of this app or the library that brings it.
> - _Scope:_ `apps/mobile/review/policy.json`.
> - _Why not enforced:_ the review enforces that a reason exists. Whether it
>   is true needs a person to read it.

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

Gradle needs the Android SDK (`compileSdkVersion 35`,
`android/variables.gradle`):

```sh
export ANDROID_HOME="$HOME/Android/Sdk"
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
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

A lesson home no longer lists is retired (unlisted, still loadable by key).
A lesson that merely failed to download is kept. Only published content
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

## Not done yet

- **Nothing syncs back.** A session recorded on the phone stays on the
  phone. Two histories of one person's sessions need a merge rule first.
- **Speech.** The device build asks for the platform voice, as the static
  build does. Whether Android's WebView offers `speechSynthesis` needs checking
  on a real phone. If it does not, speech needs a native text-to-speech
  adapter, which `@some-ui/speech`'s adapter registry already has a seam for.
- **Nothing here has run on a phone yet.** CI proves the APK builds. Every
  test runs the backend's SQL in Node's SQLite, not through the native bridge.
