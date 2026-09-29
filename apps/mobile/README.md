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
| `/curriculum/manifest[.json]`, `/curriculum/:key`         | `curriculum`, filled by a sync from home (not yet built)   |
| `/leetype/rounds`, `/:id`, `/:id/runs`                    | `leetype_round*`, seeded from `packages/ui/leetype/corpus` |
| `/auth/session`, `/signals`, `/presence/lease`, `/push/*` | see above                                                  |

Anything else answers `file_host`'s plain-text `404`, which is what a server
too old to have that route would answer.

### What content is on the phone

- **Leetype:** the bundled corpus (`packages/ui/leetype/corpus`), seeded on
  every start, together with its recorded runs. The raw files hash to the same
  content hashes their runs were recorded against, so the runs show offline.
- **TOPIK:** lessons are not in either repository. They exist only in the home
  server's database. The phone will get them by a **sync from home**, still to
  be built: on the LAN, the app copies the curriculum into its SQLite, and
  after that it works offline. Until then, TOPIK offers the bundled read-aloud
  decks, plus any lesson you paste and keep on the shelf.

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
- `SOME_UI_PROFILE=pages`: leaves out the LAN-only operator CRMs.

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

### Locally

Gradle needs the Android SDK (`compileSdkVersion 35`,
`android/variables.gradle`):

```sh
export ANDROID_HOME="$HOME/Android/Sdk"
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
```

The Claude Code sandbox cannot install it (`dl.google.com` is outside its
egress policy), which is why CI builds the APK.

## Not done yet

- **Sync from home.** Pull the curriculum (and newer Leetype rounds) from the
  LAN `file_host` while on the LAN. Nothing syncs _back_ yet. A session
  recorded on the phone stays on the phone.
- **Native notifications.** An Android WebView has no web `Notification`
  API, so study nudges need `@capacitor/local-notifications`.
- **Speech.** The device build asks for the platform voice, as the static
  build does. Whether Android's WebView offers `speechSynthesis` needs checking
  on a real phone. If it does not, speech needs a native text-to-speech
  adapter, which `@some-ui/speech`'s adapter registry already has a seam for.
- **Sign-out** has nothing to end on the device, and should be hidden there.
