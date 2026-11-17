/**
 * The APK's snips (SNIPS1, `docs/snips.md`): every route the Android build
 * offers, on a freshly installed app paired through its own UI with the
 * stand-in home on sample data (COMPAT's rig, `apps/mobile/compat`), the
 * page's clock frozen at `FROZEN_AT` and motion reduced. Each picture is the
 * emulator's whole screen, the status bar in demo mode.
 *
 * Run inside a booted emulator by `apps/mobile/snips/capture-apk.sh`, which
 * installs the debug APK (the release build's JavaScript; only the debug
 * build opens its WebView to Playwright), pairs it and sets the screen up.
 * It skips unless `SNIPS_OUT` and `SNIPS_APK` are set.
 *
 * No owner data can reach a picture: the app is a clean install whose only
 * home is the stand-in on the runner, and every request the page makes to
 * anywhere but itself and that stand-in is refused and fails the capture.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { _android as android, expect, test } from "@playwright/test"

import {
  APK_VIEWPORT,
  appVersionOf,
  FROZEN_AT,
  parseRouteTree,
  routesFor,
} from "@/lib/snips"

import { walk, writePart } from "./capture"

const OUT = process.env["SNIPS_OUT"]
const PKG = "dev.paulgsc.someui"
/** Where Capacitor serves the app (`apps/mobile/capacitor.config.ts`). */
const APP = "https://localhost"
/** The stand-in home, as the emulator reaches the runner (`stub-home.mjs`). */
const HOME = "https://10.0.2.2:8787"
const WWW = join(import.meta.dirname, "../..")

test.describe("snips: apk", () => {
  test.skip(
    !OUT || !process.env["SNIPS_APK"],
    "SNIPS_OUT and SNIPS_APK are not set: run by apps/mobile/snips/capture-apk.sh"
  )
  test.setTimeout(60 * 60_000)

  test("every route the APK offers", async () => {
    const appVersion = appVersionOf(
      readFileSync(join(WWW, "package.json"), "utf8")
    )
    const routes = routesFor(
      "apk",
      parseRouteTree(readFileSync(join(WWW, "src/routeTree.gen.ts"), "utf8"))
    )
    const device = (await android.devices()).at(0)
    if (!device) throw new Error("no device: the emulator is not up")
    const webview = await device.webView({ pkg: PKG })
    const page = await webview.page()
    await page.clock.setFixedTime(new Date(FROZEN_AT))
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" })
    const leaked: Array<string> = []
    await page.route("**/*", async (route) => {
      const url = route.request().url()
      if (
        url.startsWith(APP) ||
        url.startsWith(HOME) ||
        /^(data|blob|capacitor):/.test(url)
      ) {
        await route.continue()
        return
      }
      leaked.push(url)
      await route.abort()
    })

    const part = await walk({
      surface: "apk",
      page,
      viewport: APK_VIEWPORT,
      appVersion,
      routes,
      out: OUT!,
      base: APP,
      open: async (path) => {
        await page.goto(`${APP}${path}`)
      },
      camera: {
        shoot: () => device.screenshot(),
        record: async () => {
          await device.shell("screenrecord --time-limit 4 /sdcard/snip.mp4")
          const bytes = await device.shell("cat /sdcard/snip.mp4")
          await device.shell("rm -f /sdcard/snip.mp4")
          return bytes.length > 0 ? { bytes, kind: "mp4" } : null
        },
      },
    })
    expect(
      leaked,
      "nothing left for anywhere but the app and the stand-in home"
    ).toEqual([])
    expect(
      part.snips.length,
      "the APK showed at least one screen"
    ).toBeGreaterThan(0)
    writePart(OUT!, part, "apk")
    await device.close()
  })
})
