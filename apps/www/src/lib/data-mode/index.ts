import type { RuntimeMode } from "@some-ui/fetch-kit"

/**
 * Where this build's companion data comes from, decided once at build time.
 *
 * Every locally-generated content file (`/hangul/words/*.json` and the
 * curated `sfx` tree) lives in `packages/some-content/public`, reachable over
 * HTTP wherever `public/` is actually served; topik lessons come from
 * `file_host` instead (see `lib/topik-content`). So the question each data
 * shim has to answer is exactly one bit - *fetch, or fall back to the bundled
 * demo seed* - and this is that bit:
 *
 * - **`"static"`** - the GitHub Pages build. No companion data is deployed
 *   with it by design (pages.yml copies only `sfx`), so no
 *   request is ever issued and every shim falls back to its package's own
 *   bundled demo seed.
 * - **`"server"`** - `vite dev`, `vite preview`, and the Docker/nginx image.
 *   All three serve `public/` and proxy `file_host`, so all three fetch.
 *
 * `resolveRuntimeMode`'s hostname heuristic is deliberately not used. Its own
 * doc comment says a caller with a reliable build-time signal should pass
 * `mode` explicitly instead, and this app has one - the heuristic could only
 * ever guess, and it guessed wrong for the LAN mDNS host and for a production
 * preview served from localhost.
 *
 * `import.meta.env.PROD` would also be wrong here, and not subtly: the Docker
 * image is built with `pnpm turbo build` (see apps/www/Dockerfile) exactly as
 * the Pages build is, so `PROD` is true for both and cannot separate them.
 * `VITE_STATIC_DATA` is set only by the Pages workflow, alongside the
 * `VITE_BASE_PATH` that has always been that build's other distinguishing
 * flag - which makes "unset" mean "this build serves public/", the safe
 * default for every other way of running the app.
 */
export const DATA_MODE: RuntimeMode =
  import.meta.env.VITE_STATIC_DATA === "true" ? "static" : "server"

/** True when this build fetches its content rather than using bundled seeds. */
export const FETCHES_CONTENT = DATA_MODE === "server"

/**
 * True in the Android app's build, where `file_host` is not a server but an
 * in-process one over on-device SQLite (see `lib/device-backend`).
 *
 * `DATA_MODE` stays `"server"` there, and that is the point rather than an
 * oversight: the question it answers is "is there a backend here at all",
 * and on the device there is - it simply lives in the same process. Every
 * `DATA_MODE` consumer (sessions, shelf, curriculum, leetype rounds,
 * signals, presence) therefore takes its server path unchanged.
 *
 * This bit is only for the few places where "a backend" and "a network"
 * part ways: what the device has no service for (a TTS server) and what it
 * delivers differently (a nudge is a native local notification, not a web
 * push). Keep that list short; a new consumer here is a place the device
 * build diverges from the LAN build, and each one wants a reason.
 */
export const DEVICE_BACKEND = import.meta.env.VITE_DEVICE_BACKEND === "true"
