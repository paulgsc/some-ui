/**
 * The APK stage (WALK1, #3282): the debug APK on a booted emulator, freshly
 * installed and paired with the stand-in home on the runner, which answers a
 * story sample (`apps/mobile/walk`). Playwright drives its WebView, as Snips
 * Capture's debug pass does (`apps/www/tests/snips/apk.spec.ts`), and each
 * snip is the emulator's whole screen, its status bar in demo mode: the app
 * as a person holding the phone sees it.
 *
 * Every request the page makes for anywhere but the app and the stand-in
 * home is refused, and any but the public reads the app makes by design
 * fails the walk, so no live data, and nothing of the owner's, can reach a
 * picture.
 */

import { writeFile } from "node:fs/promises"
import { _android as android } from "playwright-core"

import { heldStill } from "./held-still"
import type { Stage, WalkViewport } from "./run"
import { settlePage } from "./stage-sandbox"

/** Where Capacitor serves the app (`apps/mobile/capacitor.config.ts`). */
const APP = "https://localhost"

/**
 * Public hosts the APK reads live data from; refused (the emulator has no
 * DNS) and not counted, as Snips Capture does.
 */
const OFFLINE_BY_DESIGN = [
  "https://api.github.com/",
  "https://raw.githubusercontent.com/",
]

/** How many times a screen is taken, a second apart, waiting for it to hold still. */
const STILL_TRIES = 10

export type ApkStageSpec = {
  readonly kind: "apk"
  /** The app's package (`apps/mobile/capacitor.config.ts`). */
  readonly pkg: string
  /** The route the walk opens on. */
  readonly path: string
  /** The stand-in home, as the emulator reaches it. */
  readonly home: string
}

type Box = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * How the page's CSS px land on the device's screen: the WebView's bounds on
 * the screen (device px) and the page's width in CSS px give the scale. The
 * walk's viewport is the whole screen in CSS px at that scale, so the
 * composition that frames a snip (`promo-feature`) draws taps where they
 * landed.
 */
export function screenPlace(
  webview: Box,
  innerWidth: number,
  screen: { readonly width: number; readonly height: number }
): {
  readonly viewport: WalkViewport
  readonly place: (x: number, y: number) => { x: number; y: number }
} {
  if (innerWidth <= 0 || webview.width <= 0) {
    throw new Error("the WebView has no width")
  }
  const scale = webview.width / innerWidth
  return {
    viewport: {
      width: screen.width / scale,
      height: screen.height / scale,
      scale,
    },
    place: (x, y) => ({
      x: (webview.x + x * scale) / scale,
      y: (webview.y + y * scale) / scale,
    }),
  }
}

/** Where the app's WebView is on the screen, from a `uiautomator dump`, in device px. */
export function webviewBounds(xml: string, pkg: string): Box {
  for (const node of xml.match(/<node\b[^>]*>/g) ?? []) {
    const attr = (name: string): string =>
      new RegExp(`\\b${name}="([^"]*)"`).exec(node)?.[1] ?? ""
    if (attr("class") !== "android.webkit.WebView") continue
    if (attr("package") !== pkg) continue
    const [left, top, right, bottom] = (
      attr("bounds").match(/-?\d+/g) ?? []
    ).map(Number)
    if (
      left === undefined ||
      top === undefined ||
      right === undefined ||
      bottom === undefined
    ) {
      continue
    }
    return { x: left, y: top, width: right - left, height: bottom - top }
  }
  throw new Error("the app's WebView is not on screen")
}

/** The version the installed package says it is (`dumpsys package`). */
export function versionOf(dumpsys: string): string {
  const name = /versionName=(\S+)/.exec(dumpsys)?.[1]
  if (name === undefined) throw new Error("the app is not installed")
  return name
}

/** The PNG's size, read from its header. */
function pngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

export async function openApkStage(spec: ApkStageSpec): Promise<Stage> {
  const device = (await android.devices()).at(0)
  if (!device) throw new Error("no device: the emulator is not up")
  try {
    const version = versionOf(
      (await device.shell(`dumpsys package ${spec.pkg}`)).toString("utf8")
    )
    const webview = await device.webView({ pkg: spec.pkg })
    const page = await webview.page()
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" })
    const errors: Array<string> = []
    page.on("pageerror", (e) => errors.push(e.message))
    await page.route("**/*", async (route) => {
      const url = route.request().url()
      if (
        url.startsWith(APP) ||
        url.startsWith(spec.home) ||
        /^(data|blob|capacitor):/.test(url)
      ) {
        await route.continue()
        return
      }
      if (!OFFLINE_BY_DESIGN.some((host) => url.startsWith(host))) {
        errors.push(`${url} was asked for`)
      }
      await route.abort("internetdisconnected")
    })
    // Read from the accessibility tree, as Snips Capture's release pass reads
    // the screen: `device.info` needs Playwright's driver app on the device.
    // A dump left by an earlier run is never read as this one.
    await device.shell("rm -f /sdcard/walk-ui.xml")
    await device.shell("uiautomator dump /sdcard/walk-ui.xml")
    const bounds = webviewBounds(
      (await device.shell("cat /sdcard/walk-ui.xml")).toString("utf8"),
      spec.pkg
    )
    const innerWidth = Number(await page.evaluate("window.innerWidth"))
    const { viewport, place } = screenPlace(
      bounds,
      innerWidth,
      pngSize(await device.screenshot())
    )
    return {
      page,
      version,
      viewport,
      origin: APP,
      place,
      open: async (init): Promise<void> => {
        for (const content of init) await page.addInitScript({ content })
        await page.goto(`${APP}${spec.path}`)
      },
      settle: (): Promise<void> => settlePage(page),
      shoot: async (path, moving): Promise<void> => {
        await writeFile(
          path,
          moving
            ? await device.screenshot()
            : // The last screen if none held: a phone's clock or a spinner
              // may never stop, and the walk still wants its picture.
              (await heldStill(() => device.screenshot(), STILL_TRIES, 1_000))
                .png
        )
      },
      problems: (): ReadonlyArray<string> => errors,
      close: () => device.close(),
    }
  } catch (e) {
    await device.close()
    throw e
  }
}
