/**
 * The release APK's half of the APK snips (SNIPS1, `docs/snips.md`): the
 * app as it ships, reached only through its own navigation. Each launcher
 * icon's wing is opened, photographed, and each tab of the bar along the
 * bottom of its screen is tapped and photographed in turn. The release
 * build keeps its WebView closed, so nothing here reads the page: the
 * screen is read through the accessibility tree (`uiautomator dump`), as
 * `apps/mobile/compat/ui.mjs` reads it, and taken with `screencap`.
 *
 * A release picture is named by where the taps reached it (`wingPath`);
 * the bundle names it by route when the debug pass drew the same pixels
 * (`preferRelease` in `@/lib/snips`).
 */

import type { AndroidDevice } from "@playwright/test"

import {
  describe,
  FROZEN_AT,
  moduleOf,
  slugOf,
  snipId,
  tabBar,
  wingPath,
} from "@/lib/snips"
import type {
  BarNode,
  Part,
  SnipRecord,
  Unreached,
  Viewport,
} from "@/lib/snips"

import { hashOf, pngSize, recordScreen, save } from "./capture"

/** The bar: tabs whose centre sits in the bottom part of the screen. */
const BAR_FROM = 0.85
/** Two controls whose centres are this close in height sit in one row. */
const ROW_PX = 24
/**
 * Controls that act rather than navigate: never tapped, wherever they sit,
 * since one could ask for the microphone or end the pairing every later
 * picture relies on.
 */
const ACTS =
  /\b(sign out|unpair|delete|record|let go|remove|erase|forget|cancel|save|send|submit|share|clear|start|stop)\b/i
/** How long a screen may take to hold still before it is taken anyway. */
const SETTLE_TRIES = 10

type Node = Pick<BarNode, "label" | "x" | "y">

export type ReleaseWalk = {
  readonly device: AndroidDevice
  readonly pkg: string
  readonly viewport: Viewport
  readonly appVersion: string
  readonly out: string
}

export async function releaseWalk(w: ReleaseWalk): Promise<Part> {
  const snips: Array<SnipRecord> = []
  /** Each picture's hash, to the place that drew it first. */
  const seen = new Map<string, string>()
  const shell = async (command: string): Promise<string> =>
    (await w.device.shell(command)).toString("utf8")

  const unreached: Array<Unreached> = []
  // The release build reads the device's clock, which runs while the walk
  // does: set it back just before each launch or tap, so the screen it draws
  // shows the same time on every run.
  const freeze = (): Promise<string> => shell(`date ${toyboxDate(FROZEN_AT)}`)
  const take = async (wing: string, tab?: string): Promise<void> => {
    const path = wingPath(wing, tab)
    const { png, moving } = await settled(w.device)
    if (!(await inFront(shell, w.pkg))) {
      // A tap that opened something else (a permission dialog, another
      // app): not the app's screen, so not a snip.
      unreached.push({
        surface: "apk",
        route: path,
        why:
          tab === undefined
            ? "its icon opened a screen that is not the app's"
            : "the tap opened a screen that is not the app's",
      })
      await shell("input keyevent 4")
      return
    }
    const sha256 = await hashOf(png)
    const same = seen.get(sha256)
    if (same !== undefined) {
      unreached.push({
        surface: "apk",
        route: path,
        why: `it shows the same screen as ${same}`,
      })
      return
    }
    seen.set(sha256, path)
    const stem = `apk/${w.viewport.name}/release-${slugOf(path)}-${sha256.slice(0, 12)}`
    const image = await save(w.out, `${stem}.png`, "png", png)
    // A screen still moving after SETTLE_TRIES gets a short recording too.
    const clip = moving ? await recordScreen(w.device) : null
    const recording = clip
      ? await save(w.out, `${stem}.${clip.kind}`, clip.kind, clip.bytes)
      : undefined
    const module = moduleOf(path)
    const shows = tab ?? wing
    snips.push({
      id: snipId({
        surface: "apk",
        path,
        viewport: w.viewport.name,
        appVersion: w.appVersion,
        sha256,
      }),
      surface: "apk",
      build: "release",
      route: path,
      path,
      viewport: w.viewport.name,
      ...pngSize(png),
      scale: w.viewport.scale,
      // The device's whole screen: no page's layout maps onto it.
      regions: [],
      appVersion: w.appVersion,
      module,
      shows,
      description: describe(module, shows, w.viewport),
      image,
      ...(recording ? { recording } : {}),
    })
  }

  for (const component of await launchers(shell, w.pkg)) {
    const wing = wingOf(component)
    const open = async (): Promise<void> => {
      await freeze()
      await shell(`am start -W -n ${w.pkg}/${component}`)
    }
    await open()
    await take(wing)
    const screen = pngSize(await w.device.screenshot())
    for (const tab of bar(await dump(shell), w.pkg, screen)) {
      await open()
      await settled(w.device)
      const now = bar(await dump(shell), w.pkg, screen).find(
        (n) => n.label === tab.label
      )
      if (!now) continue
      await freeze()
      await shell(`input tap ${now.x} ${now.y}`)
      await take(wing, tab.label)
    }
  }
  return { surface: "apk", appVersion: w.appVersion, snips, unreached }
}

/** Every launcher entry the installed package has: the app's icon and each wing's. */
async function launchers(
  shell: (command: string) => Promise<string>,
  pkg: string
): Promise<ReadonlyArray<string>> {
  const listed = await shell(
    "cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER"
  )
  // `<package>/<component>` lines, read without building a pattern from
  // the package's name.
  return listed
    .split(/\s+/)
    .filter((word) => word.startsWith(`${pkg}/`))
    .map((word) => word.slice(pkg.length + 1))
    .sort()
}

/** `.WingPractice` -> `practice`; the plain icon (`.MainActivity`) is `app`. */
function wingOf(component: string): string {
  const name = component.replace(/^.*\./, "")
  return name.startsWith("Wing") ? name.slice(4) : "app"
}

async function dump(
  shell: (command: string) => Promise<string>
): Promise<string> {
  await shell("uiautomator dump /sdcard/snips-ui.xml")
  return shell("cat /sdcard/snips-ui.xml")
}

const attribute = (node: string, name: string): string =>
  new RegExp(`\\b${name}="([^"]*)"`).exec(node)?.[1] ?? ""

/**
 * The tabs of the bar along the bottom, left to right (`tabBar`): of the
 * app's own labelled controls across the bottom of the screen. A row of
 * digits (the Self wing's rating, which proof run 44042604819 tapped) and
 * any control that acts (`ACTS`) are not tabs.
 */
function bar(
  xml: string,
  pkg: string,
  screen: { readonly width: number; readonly height: number }
): ReadonlyArray<Node> {
  const nodes: Array<BarNode> = []
  let appBottom = 0
  for (const node of xml.match(/<node\b[^>]*>/g) ?? []) {
    if (attribute(node, "package") !== pkg) continue
    const bounds = (attribute(node, "bounds").match(/-?\d+/g) ?? []).map(Number)
    if (bounds.length !== 4) continue
    const [left = 0, top = 0, right = 0, bottom = 0] = bounds
    if (bottom <= screen.height) appBottom = Math.max(appBottom, bottom)
    if (attribute(node, "clickable") !== "true") continue
    const label = attribute(node, "text") || attribute(node, "content-desc")
    if (label === "" || /^\d+$/.test(label) || ACTS.test(label)) continue
    const y = Math.round((top + bottom) / 2)
    if (y < screen.height * BAR_FROM) continue
    nodes.push({
      label,
      x: Math.round((left + right) / 2),
      y,
      bottom,
      selected: attribute(node, "selected") === "true",
    })
  }
  return tabBar(nodes, { appBottom, rowPx: ROW_PX })
}

/** Whether the app's own window is the one in front. */
async function inFront(
  shell: (command: string) => Promise<string>,
  pkg: string
): Promise<boolean> {
  const focus = await shell("dumpsys window")
  const line = /mCurrentFocus=[^\n]*/.exec(focus)?.[0] ?? ""
  return line.includes(`${pkg}/`)
}

/** `2026-11-02T09:30:00.000Z` as toybox `date` sets it: MMDDhhmmYYYY.ss, UTC. */
function toyboxDate(iso: string): string {
  const d = new Date(iso)
  const two = (n: number): string => String(n).padStart(2, "0")
  return `${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}${two(d.getUTCHours())}${two(d.getUTCMinutes())}${d.getUTCFullYear()}.${two(d.getUTCSeconds())}`
}

/**
 * The screen once two pictures a second apart agree, or after SETTLE_TRIES,
 * with whether it was still moving then.
 */
async function settled(
  device: AndroidDevice
): Promise<{ readonly png: Buffer; readonly moving: boolean }> {
  let last = await device.screenshot()
  for (let i = 0; i < SETTLE_TRIES; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    const now = await device.screenshot()
    if (now.equals(last)) return { png: now, moving: false }
    last = now
  }
  return { png: last, moving: true }
}
