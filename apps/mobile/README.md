# `@some-ui/mobile`

A sideloadable Android APK of `apps/www` that needs no network. It keeps its
own SQLite database on the phone, and answers the app's `file_host` requests
from it in-process.

There is no application code here. This workspace is a **packaging** step: it
runs www's own Vite build with `VITE_DEVICE_BACKEND=true` and hands the output
to Capacitor, which copies it into an Android project. Every screen, route and
handler is www's, and so is the backend (`apps/www/src/lib/device-backend`).

> Status: **beta, on the mobile staging branch only.** Nothing here is on
> `main`, and the branch is not headed there until the on-device experience is
> settled.

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

`.github/workflows/mobile-apk.yml` builds it on every push to the mobile
staging branch, and on nothing else. Open the run in the repository's
**Actions** tab and download the `some-ui-apk-<sha>` artifact. It is a zip
holding `some-ui-<sha>-debug.apk`. Install that on the phone (allow installs
from your browser or file manager). The debug key signs it, which is all
sideloading needs.

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

- **One APK at a time.** Each successful run uploads its APK and then
  deletes every older `some-ui-apk-*` artifact, so GitHub holds about 10 MB,
  not 10 MB per push. The deletion runs after the upload, so a failed or
  cancelled build leaves the previous APK in place.
- **30-day expiry.** `retention-days: 30` bounds the newest one too.
- **arm64 only.** SQLCipher, which the SQLite plugin brings, ships a native
  library per ABI. `abiFilters` keeps only `arm64-v8a` (5.2 MB of the four's
  roughly 19 MB). Add `x86_64` to `abiFilters` in `app/build.gradle` to run
  the APK in an emulator.
- **`versionCode` is the run number**, so each APK is an update of the last,
  and Settings → Apps → Some UI shows which build is installed.

### Icon and splash

The launcher icon is the favicon's mark (`apps/www/public/favicon.svg`): the
seven-cell honeycomb in its honey pair, on the dark of www's `manifest.json`
(`#101010`, `values/ic_launcher_background.xml`).

- **Android 8+:** an adaptive icon whose foreground is a vector,
  `drawable/ic_launcher_foreground.xml`, with the favicon's geometry, plus a
  `monochrome` layer for Android 13's themed icons.
- **Android 6-7:** `mipmap-*/ic_launcher{,_round}.png`, rendered from the same
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

## Not done yet

- **Nothing syncs back.** A session recorded on the phone stays on the
  phone. Two histories of one person's sessions need a merge rule first.
- **Speech.** The device build asks for the platform voice, as the static
  build does. Whether Android's WebView offers `speechSynthesis` needs checking
  on a real phone. If it does not, speech needs a native text-to-speech
  adapter, which `@some-ui/speech`'s adapter registry already has a seam for.
- **Nothing here has run on a phone yet.** CI proves the APK builds. Every
  test runs the backend's SQL in Node's SQLite, not through the native bridge.
