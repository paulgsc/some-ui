# `@some-ui/mobile`

A sideloadable Android APK that is `apps/www` with its backend removed, served
from inside the app by a WebView.

There is no application code here. This workspace is a **packaging** step: it
runs www's own Vite build with two flags that strip its server, then hands the
output to Capacitor, which copies it into an Android project. Every screen,
route and piece of state is www's.

## Why this exists rather than a native app

The affordance is "log things while out and about". That is a _hosting_
problem, not a client-platform problem — a React Native app on cellular cannot
reach a `file_host` on the LAN any better than a web page can. So the client
stays exactly as it is, and the APK simply stops expecting a server:

- **On the LAN**, use the web app as before. It reaches `file_host`, so
  sessions, mood events, push and the realtime socket all work.
- **Off the LAN**, use the APK. It has no backend by construction and never
  tries to reach one.

## Build

```sh
# 1. www's build, with its backend compiled out, into apps/www/dist
pnpm --filter @some-ui/mobile build:web

# 2. copy that into the Android project
pnpm --filter @some-ui/mobile sync

# both of the above (not named `build`: the root `turbo run build` would
# otherwise pick it up and re-run www's build nested inside its own)
pnpm --filter @some-ui/mobile bundle

# ... and then the APK itself (needs the Android SDK — see below)
pnpm --filter @some-ui/mobile apk
```

The APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`. A debug
APK is signed with the local debug key, which is all sideloading to your own
phone needs — there is no release-signing or Play Store step here, by design.

`build:web` goes through `turbo`, not `pnpm --filter www build`, so www's
workspace dependencies are built first — a fresh clone has no prebuilt `dist/`,
and www resolves `@some-ui/*` to `dist`, so building it alone against stale or
missing output is how you get an APK bundling last week's packages.

`VITE_STATIC_DATA` survives that hop despite `turbo.json`'s `build` task
declaring only `SOME_UI_PRUNED_WORKSPACE` under `env`: turbo detects Vite for
this workspace and _infers_ `VITE_*`, which puts the flag in the task hash and
passes it through under `envMode: strict`. Confirmed rather than assumed —
`turbo run build --filter=www --dry=json` lists it under
`environmentVariables.inferred`, and unset/`true`/`false` produce three
different task hashes. A non-`VITE_` variable would need declaring; that
inference is the whole reason this one does not.

### The Android SDK

Gradle needs a local SDK (`compileSdkVersion 35`, see `android/variables.gradle`)
and will not fetch one itself. Either install Android Studio, or the
command-line tools:

```sh
export ANDROID_HOME="$HOME/Android/Sdk"
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
```

Gradle finds it via `ANDROID_HOME`/`ANDROID_SDK_ROOT`, or via
`android/local.properties` (`sdk.dir=...`), which is machine-specific and
correctly gitignored.

## What "backendless" actually switches off

One build-time flag: **`VITE_STATIC_DATA=true`**, the same one
`.github/workflows/pages.yml` sets. In www that single bit answers "is there a
backend here at all", and every consumer is already gated on it:

| Consumer                                | Behaviour under `DATA_MODE === "static"`                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `lib/tenant/sessions-backend`           | `localStorage` **is** the sessions store — not a fallback. `createFileHostTransport` is never constructed. |
| `lib/study-nudge/{signals,presence}`    | Return before building a transport; no `/signals` or `/presence` calls.                                    |
| `lib/study-nudge/use-study-nudge`       | `clientOwnsNudgeDelivery()` is true, so nudges are raised client-side instead of by server push.           |
| `lib/topik-content`, `lib/hangul-vocab` | `FETCHES_CONTENT` is false; every shim uses its bundled seed.                                              |
| `providers/tts`                         | Resolves to the browser's own voice rather than the TTS service.                                           |

So there is no mobile-specific backend flag, and deliberately so — adding one
would be a second name for a question www already answers in one place.

The realtime socket is the one thing this flag does _not_ cover, because
`packages/ui/umag`'s socket components are not gated on `DATA_MODE` at all.
That is handled at the source instead: `resolveLanSocketUrl` (`@some-ui/ws`)
only builds a `ws://` URL for a plain-HTTP origin, so on the WebView's HTTPS
origin it returns `undefined` and `useWebSocket` stays deliberately
disconnected. See `capacitor.config.ts`'s note on `androidScheme`, which that
behaviour depends on.

## Where writes actually go

They persist. `localStorage`, in every case:

- **profile** and **settings** always use `browserLocalStorage`, in both modes.
- **sessions** use it because `DATA_MODE` is `"static"` here — see the table
  above.

Inside a Capacitor WebView that store lives in the app's own data directory,
so unlike a browser tab it is not subject to eviction under storage pressure
and needs no `navigator.storage.persist()` call. The APK is a read-_and_-write
offline build as it stands.

Two things it is not, worth knowing before relying on it:

- **`localStorage` is synchronous and capped** (a few MB, and the cap is on
  serialised strings). Fine for sessions, profile and settings; an
  ever-growing activity log would eventually want IndexedDB behind the same
  `StorageAdapter`/`SessionsStore` seam that already exists.
- **Nothing syncs back to `file_host`.** A session written on the phone stays
  on the phone; one written on the LAN stays on the LAN. `sessions-migration`
  does a one-time local-to-server upload in server mode, but there is no
  two-way sync, and `sessions-backend`'s header is explicit that a silent
  fallback between stores is the thing it refuses — two divergent histories
  with no way to tell which is which. Closing that gap is a real design
  decision, not a missing flag.
