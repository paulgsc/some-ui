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
import type { AndroidDevice } from "playwright-core"
import { _android as android } from "playwright-core"

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

/** One look at the WebView's place: the screen's dump and the page's own width and pixel ratio. */
export type PlaceRead = {
  readonly dump: string
  readonly innerWidth: number
  readonly pixelRatio: number
}

/**
 * The stage could not see the app's WebView laid out (WALK9): `why` names
 * the read that had no width, and `dump` is the screen's last dump, kept
 * beside the walk's failure (`./run`).
 */
export class WebViewNotLaidOut extends Error {
  constructor(
    why: string,
    readonly dump: string
  ) {
    super(`the WebView was never laid out: ${why}`)
    this.name = "WebViewNotLaidOut"
  }
}

/**
 * The WebView's box in `read`, if it is laid out there, or why not. Laid
 * out means the dump's node has width, the page has a width and a pixel
 * ratio (finite, above 0), and the node's width over the page's is the
 * page's own device pixel ratio, not a node read mid-layout. That holds for
 * a page at `width=device-width` and no zoom, as the app's
 * (`apps/www/index.html`).
 */
function laidOut(read: PlaceRead, pkg: string): Box | string {
  let webview: Box
  try {
    webview = webviewBounds(read.dump, pkg)
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
  if (!(webview.width > 0))
    return "the app's WebView is 0 px wide in the screen's dump"
  if (!(read.innerWidth > 0) || !Number.isFinite(read.innerWidth))
    return `the page is ${String(read.innerWidth)} px wide (window.innerWidth)`
  if (!(read.pixelRatio > 0) || !Number.isFinite(read.pixelRatio))
    return `the page's pixel ratio is ${String(read.pixelRatio)}`
  const scale = webview.width / read.innerWidth
  if (!(Math.abs(scale - read.pixelRatio) <= 0.02 * read.pixelRatio)) {
    return `the dump's WebView (${String(webview.width)} px) and the page (${String(read.innerWidth)} CSS px at ${String(read.pixelRatio)}) disagree`
  }
  return webview
}

const sameBox = (a: Box, b: Box): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

/** How long the stage waits for the WebView to be laid out, and how often it looks (WALK9). */
const LAID_OUT = { ms: 15_000, everyMs: 500 } as const

/**
 * WALK9: the WebView's place, read once the app's WebView is laid out on
 * screen (`laidOut`) and two looks in a row give it the same box, so a top
 * still moving with the system bars' or the keyboard's insets is not read;
 * looking for `wait.ms`, plus the look under way when it runs out. A dump
 * taken as the app starts, as its keyboard's insets settle or as
 * `uiautomator` turns accessibility on can find the WebView's node not yet
 * laid out (#3489); the stage looks again rather than read that one. A look
 * that throws is a look that saw nothing. Refused with the reason the last
 * look gave, and that look's dump.
 */
export async function placeWhenLaidOut(
  read: () => Promise<PlaceRead>,
  pkg: string,
  screen: { readonly width: number; readonly height: number },
  wait: {
    readonly ms: number
    readonly everyMs: number
    readonly now: () => number
    readonly sleep: (ms: number) => Promise<void>
  }
): Promise<ReturnType<typeof screenPlace>> {
  const until = wait.now() + wait.ms
  let before: Box | null = null
  for (;;) {
    let look: PlaceRead
    let box: Box | string
    try {
      look = await read()
      box = laidOut(look, pkg)
    } catch (e) {
      look = { dump: "", innerWidth: 0, pixelRatio: 0 }
      box = `the look failed: ${e instanceof Error ? e.message : String(e)}`
    }
    if (typeof box !== "string") {
      if (before !== null && sameBox(before, box)) {
        return screenPlace(box, look.innerWidth, screen)
      }
      before = box
    } else {
      before = null
    }
    if (wait.now() >= until) {
      throw new WebViewNotLaidOut(
        typeof box === "string" ? box : "the WebView's box was still moving",
        look.dump
      )
    }
    await wait.sleep(wait.everyMs)
  }
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

/** The screen once two pictures a second apart agree, or the last one. */
async function still(device: AndroidDevice): Promise<Buffer> {
  let last = await device.screenshot()
  for (let i = 0; i < STILL_TRIES; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    const now = await device.screenshot()
    if (now.equals(last)) return now
    last = now
  }
  return last
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
    // A dump left by an earlier look is never read as this one.
    const look = async (): Promise<PlaceRead> => {
      await device.shell("rm -f /sdcard/walk-ui.xml")
      await device.shell("uiautomator dump /sdcard/walk-ui.xml")
      return {
        dump: (await device.shell("cat /sdcard/walk-ui.xml")).toString("utf8"),
        innerWidth: Number(await page.evaluate("window.innerWidth")),
        pixelRatio: Number(await page.evaluate("window.devicePixelRatio")),
      }
    }
    const { viewport, place } = await placeWhenLaidOut(
      look,
      spec.pkg,
      pngSize(await device.screenshot()),
      {
        ...LAID_OUT,
        now: () => Date.now(),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      }
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
          moving ? await device.screenshot() : await still(device)
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
