/**
 * The APK's snips (SNIPS1, `docs/snips.md`), on a freshly installed app
 * paired through its own screen with the stand-in home on sample data
 * (COMPAT's rig, `apps/mobile/compat`). Each picture is the emulator's
 * whole screen, its status bar in demo mode and its clock set to
 * `FROZEN_AT`.
 *
 * Run twice inside a booted emulator by `apps/mobile/snips/capture-apk.sh`,
 * once per build (`SNIPS_APK_BUILD`):
 *
 * - `release`: the app as it ships. Only its own navigation reaches a
 *   screen: each wing's icon and the tabs of its bar (`./release-walk`).
 * - `debug`: the same JavaScript in a WebView Playwright opens, for every
 *   route the build offers, its `$param`s filled from the screens' links,
 *   the page's clock frozen and motion reduced. The bundle keeps a debug
 *   picture only where no release picture shows the same screen.
 *
 * It skips unless `SNIPS_OUT` and `SNIPS_APK_BUILD` are set.
 *
 * No owner data can reach a picture: the app is a clean install whose only
 * home is the stand-in on the runner, and the emulator resolves no names, so
 * the live public data the app reads (`OFFLINE_BY_DESIGN`) cannot load on
 * either build. In the debug pass every request the page makes elsewhere is
 * refused, and any but those fails the capture.
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
import { releaseWalk } from "./release-walk"

const OUT = process.env["SNIPS_OUT"]
const BUILD = process.env["SNIPS_APK_BUILD"]
const PKG = "dev.paulgsc.someui"
/** Where Capacitor serves the app (`apps/mobile/capacitor.config.ts`). */
const APP = "https://localhost"
/** The stand-in home, as the emulator reaches the runner (`stub-home.mjs`). */
const HOME = "https://10.0.2.2:8787"
const WWW = join(import.meta.dirname, "../..")
/**
 * Public hosts the APK reads live data from. The capture keeps them
 * unreachable on both builds (snips-capture.yml gives the emulator no
 * DNS), so no live data reaches a picture and the two builds draw alike.
 */
const OFFLINE_BY_DESIGN = [
  "https://api.github.com/",
  "https://raw.githubusercontent.com/",
]

test.describe("snips: apk", () => {
  test.skip(
    !OUT || (BUILD !== "release" && BUILD !== "debug"),
    "SNIPS_OUT and SNIPS_APK_BUILD are not set: run by apps/mobile/snips/capture-apk.sh"
  )
  test.setTimeout(60 * 60_000)

  test("every screen the APK shows", async () => {
    const appVersion = appVersionOf(
      readFileSync(join(WWW, "package.json"), "utf8")
    )
    const device = (await android.devices()).at(0)
    if (!device) throw new Error("no device: the emulator is not up")

    if (BUILD === "release") {
      const part = await releaseWalk({
        device,
        pkg: PKG,
        viewport: APK_VIEWPORT,
        appVersion,
        out: OUT!,
      })
      expect(
        part.snips.length,
        "the release APK showed a screen"
      ).toBeGreaterThan(0)
      writePart(OUT!, part, "apk-release")
      await device.close()
      return
    }

    const routes = routesFor(
      "apk",
      parseRouteTree(readFileSync(join(WWW, "src/routeTree.gen.ts"), "utf8"))
    )
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
      // Refused as the release pass's emulator refuses it (no DNS), and
      // not counted: public reads the app makes by design, of live data
      // that is not a sample (Studio's asks, the clips index).
      if (!OFFLINE_BY_DESIGN.some((host) => url.startsWith(host))) {
        leaked.push(url)
      }
      await route.abort("internetdisconnected")
    })

    const part = await walk({
      surface: "apk",
      build: "debug",
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
    expect(part.snips.length, "the debug APK showed a screen").toBeGreaterThan(
      0
    )
    writePart(OUT!, part, "apk-debug")
    await device.close()
  })
})
