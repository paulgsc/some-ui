import { existsSync } from "node:fs"
import type { CapacitorConfig } from "@capacitor/cli"

/**
 * `pnpm dev:android` sets `SOME_UI_LIVE_RELOAD`. In that mode the WebView loads
 * the dev server, so a bundled web build is never shown, but `cap run` syncs
 * before it can point the app at the server, and a sync fails when `webDir` is
 * missing, which `../www/dist` is on a fresh checkout. So, only then, `webDir`
 * is `live-reload/`: a tracked stand-in that says what it is, so the sync has
 * something to copy and an APK built from it by mistake says so on screen. A
 * real build that is there is synced as always, and with the variable unset
 * (every build that ships) `webDir` is the real build, as before. The paths are
 * relative to the directory `cap` runs in, as `webDir` itself is.
 */
const useLiveReloadStandIn =
  process.env.SOME_UI_LIVE_RELOAD === "1" &&
  !existsSync("../www/dist/index.html")

/**
 * The Android shell around `apps/www`.
 *
 * This workspace holds no application code and is not a second client. It
 * packages www's own build, made with `VITE_DEVICE_BACKEND=true`, into a
 * WebView that serves it from inside the APK. In that build www answers its
 * own `file_host` requests in-process from an on-device SQLite database
 * (www `lib/device-backend`), so there is no server to reach and nothing to
 * host. All the UI, routing and state is www's; see this package's README.
 */
const config: CapacitorConfig = {
  appId: "dev.paulgsc.someui",
  appName: "Some UI",

  /**
   * `apps/www`'s Vite output, reached across the workspace. Nothing is built
   * here: `pnpm build:web` runs www's own build with `VITE_DEVICE_BACKEND=true`
   * (and `VITE_STATIC_DATA=false`, pinned for the reason below), and
   * `cap sync` copies whatever it left behind.
   *
   * www's `base` must be `/` for this, which is why `build:web` pins
   * `VITE_BASE_PATH=/` rather than leaving it unset. Unset is not the same
   * thing: `vite.config.ts` reads `process.env.VITE_BASE_PATH || "/"`, turbo
   * infers and forwards every `VITE_*`, and so a value left in the invoking
   * shell - from a session that was reproducing the Pages build, say -
   * would be inherited here and emit every asset under that prefix. The APK
   * serves from the root of `https://localhost` and would find none of
   * them: a blank app, with a correct-looking build log.
   *
   * `./` is not an alternative. Capacitor serves the bundle at the root, but
   * the document URL follows client-side routing, so from a deep route like
   * `/sessions/42` a relative base resolves assets against `/sessions/` and
   * 404s every one of them. Absolute is correct here; the Pages build's
   * `/some-ui/` prefix is not.
   */
  webDir: useLiveReloadStandIn ? "live-reload" : "../www/dist",

  server: {
    /**
     * Pinned rather than left to default to the same value, because two
     * things depend on it and neither fails loudly if it changes.
     *
     * 1. **A stable origin.** Every release build's origin is
     *    `https://localhost`, so web storage (localStorage, IndexedDB) and the
     *    file_host base `resolveFileHostBase` answers on an `https:` page (the
     *    same-origin `/api/file-host/api/v1`) never change under an update. A
     *    different scheme is a different origin, and a person's stored state
     *    would not follow them to it. The device backend would still answer on
     *    an `http:` page - boot wraps `fetch` for whatever base the page
     *    resolved, which `device-backend/__tests__/round-trip.test.ts` pins,
     *    and the dev loop in this package's README runs on
     *    `http://localhost:5173` - so this is about the stored state, not about
     *    the backend failing.
     *
     * 2. **`crypto.subtle`**, which the backend hashes content with, exists
     *    only in a secure context.
     *
     * Lives under `server`, not `android` - Capacitor accepts an unknown key
     * under `android` silently, so the misplaced version of this line parsed
     * fine and simply did not apply. `pnpm typecheck` in this workspace
     * exists mostly to keep that from happening again.
     */
    androidScheme: "https",
  },
}

export default config
