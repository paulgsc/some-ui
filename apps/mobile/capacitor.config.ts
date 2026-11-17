import { existsSync } from "node:fs"
import type { CapacitorConfig } from "@capacitor/cli"

/**
 * `pnpm dev:android` sets `SOME_UI_LIVE_RELOAD`: the WebView loads the dev
 * server, but `cap run` syncs first and a sync fails when `webDir` is missing
 * (`../www/dist` on a fresh checkout). Only then is `webDir` `live-reload/`, a
 * tracked stand-in that says what it is on screen. Paths are relative to
 * where `cap` runs, as `webDir` is.
 */
const useLiveReloadStandIn =
  process.env.SOME_UI_LIVE_RELOAD === "1" &&
  !existsSync("../www/dist/index.html")

/**
 * The Android shell around `apps/www`: no application code of its own. It
 * packages www's build made with `VITE_DEVICE_BACKEND=true`, which answers
 * its own `file_host` requests in-process from on-device SQLite (www
 * `lib/device-backend`). See this package's README.
 */
const config: CapacitorConfig = {
  appId: "dev.paulgsc.someui",
  appName: "Some UI",

  /**
   * `apps/www`'s Vite output; `pnpm build:web` builds it (with
   * `VITE_DEVICE_BACKEND=true`, `VITE_STATIC_DATA=false`) and `cap sync`
   * copies it.
   *
   * `build:web` pins `VITE_BASE_PATH=/`: turbo forwards every `VITE_*`, so a
   * prefix left in the invoking shell would emit assets the APK (served from
   * the root of `https://localhost`) cannot find, a blank app with a clean
   * build log. Not `./` either: from a deep route like `/sessions/42` a
   * relative base resolves assets against `/sessions/`.
   */
  webDir: useLiveReloadStandIn ? "live-reload" : "../www/dist",

  server: {
    /**
     * Pinned, because neither dependent fails loudly if it changes:
     *
     * 1. **A stable origin.** `https://localhost` keeps web storage
     *    (localStorage, IndexedDB) under the same origin across updates; a
     *    different scheme is a different origin, and stored state would not
     *    follow. (The device backend would still answer on `http:`; see
     *    `device-backend/__tests__/round-trip.test.ts`.)
     *
     * 2. **`crypto.subtle`**, which the backend hashes content with, exists
     *    only in a secure context.
     *
     * Under `server`, not `android`: Capacitor silently ignores an unknown
     * key under `android`. `pnpm typecheck` here guards that.
     */
    androidScheme: "https",

    /**
     * What Capacitor loads instead of the app when the installed WebView is
     * older than `android.minWebViewVersion`: www's page saying to update it
     * from the Play Store (www `src/lib/old-webview`, phone build only).
     * Without it the app opens on a blank white page.
     */
    errorPath: "webview-too-old.html",
  },

  android: {
    /**
     * The oldest WebView the bundle runs on: Vite's default target,
     * `baseline-widely-available`, is `chrome111`. Raise it with that
     * target. Capacitor's own default is 60. On Android 7 it reads Chrome's
     * version, which is the WebView there.
     */
    minWebViewVersion: 111,
  },

  plugins: {
    /**
     * Off, though the database was never encrypted: the plugin's own
     * default is `true` (`SqliteConfig.java`), and with it every launch
     * makes an Android Keystore key and an EncryptedSharedPreferences file
     * (`sqlite_encrypted_shared_prefs`) that nothing here uses. Auto Backup
     * restores that file after an uninstall, but a Keystore key is never
     * backed up, so the reinstalled plugin cannot open it, fails to load,
     * and answers every call with "CapacitorSQLitePlugin: null": the app
     * starts with its history restored and cannot read any of it. Off, the
     * plugin never touches the Keystore. The review holds the APK to this
     * (`review/policy.json`, `pluginConfig`).
     */
    CapacitorSQLite: { androidIsEncryption: false },
  },
}

export default config
