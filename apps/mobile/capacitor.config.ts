import type { CapacitorConfig } from "@capacitor/cli"

/**
 * The Android shell around `apps/www`.
 *
 * This workspace holds no application code and is not a second client. It
 * packages the *existing* backendless www build - the same shape of artifact
 * `.github/workflows/pages.yml` deploys - into a WebView that serves it from
 * inside the APK, so there is no server to reach and nothing to host. All
 * the UI, routing and state is www's; see this package's README for the
 * build flow and for what "backendless" costs.
 */
const config: CapacitorConfig = {
  appId: "dev.paulgsc.someui",
  appName: "Some UI",

  /**
   * `apps/www`'s Vite output, reached across the workspace. Nothing is built
   * here: `pnpm build:web` runs www's own build with `VITE_STATIC_DATA=true`,
   * the flag that already means "no backend behind this build" everywhere in
   * www, and `cap sync` copies whatever it left behind.
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
  webDir: "../www/dist",

  server: {
    /**
     * Pinned rather than left to default to the same value, because
     * something now depends on it.
     *
     * Capacitor serves the bundle from `https://localhost` under this
     * scheme. `resolveLanSocketUrl` (@some-ui/ws) treats any non-`http:`
     * origin as "no LAN companion server behind this page" and declines to
     * build a socket URL - which is what keeps `NowPlayingCard` and
     * `PromptDox` from dialing `ws://localhost:3000/ws`, a port on the
     * phone itself, and retrying on a timer forever.
     *
     * Switching this to `"http"` would make that heuristic answer the other
     * way and quietly restore exactly that drain, with no build or test
     * failure to say so. If it ever has to change, give those call sites an
     * explicit URL instead of relying on the scheme.
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
