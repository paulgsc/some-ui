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
  wingPath,
} from "@/lib/snips"
import type { Part, SnipRecord, Unreached, Viewport } from "@/lib/snips"

import { hashOf, pngSize, save } from "./capture"

/** The bar: tabs whose centre sits in the bottom part of the screen. */
const BAR_FROM = 0.85
/** Two controls whose centres are this close in height sit in one row. */
const ROW_PX = 24
/**
 * Controls that act rather than navigate: never tapped, wherever they sit,
 * since one could ask for the microphone or end the pairing every later
 * picture relies on.
 */
const ACTS = /sign out|unpair|delete|record|let go|remove|erase|forget/i
/** How long a screen may take to hold still before it is taken anyway. */
const SETTLE_TRIES = 10

type Node = {
  readonly label: string
  readonly x: number
  readonly y: number
}

export type ReleaseWalk = {
  readonly device: AndroidDevice
  readonly pkg: string
  readonly viewport: Viewport
  readonly appVersion: string
  readonly out: string
}

export async function releaseWalk(w: ReleaseWalk): Promise<Part> {
  const snips: Array<SnipRecord> = []
  const seen = new Set<string>()
  const shell = async (command: string): Promise<string> =>
    (await w.device.shell(command)).toString("utf8")

  const unreached: Array<Unreached> = []
  const take = async (wing: string, tab?: string): Promise<void> => {
    const path = wingPath(wing, tab)
    // The release build reads the device's clock, which runs while the
    // walk does: set it back before each picture, so a screen that shows
    // the time draws the same on every run.
    await shell(`date ${toyboxDate(FROZEN_AT)}`)
    const png = await settled(w.device)
    if (!(await inFront(shell, w.pkg))) {
      // A tap that opened something else (a permission dialog, another
      // app): not the app's screen, so not a snip.
      unreached.push({
        surface: "apk",
        route: path,
        why: "the tap opened a screen that is not the app's",
      })
      await shell("input keyevent 4")
      return
    }
    const sha256 = hashOf(png)
    if (seen.has(sha256)) return
    seen.add(sha256)
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
      appVersion: w.appVersion,
      module,
      shows,
      description: describe(module, shows, w.viewport),
      image: save(
        w.out,
        `apk/${w.viewport.name}/release-${slugOf(path)}-${sha256.slice(0, 12)}.png`,
        "png",
        png
      ),
    })
  }

  for (const component of await launchers(shell, w.pkg)) {
    const wing = wingOf(component)
    const open = async (): Promise<void> => {
      await shell(`am start -W -n ${w.pkg}/${component}`)
    }
    await open()
    await take(wing)
    const screen = pngSize(await w.device.screenshot()).height
    for (const tab of bar(await dump(shell), w.pkg, screen)) {
      await open()
      await settled(w.device)
      const now = bar(await dump(shell), w.pkg, screen).find(
        (n) => n.label === tab.label
      )
      if (!now) continue
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
  return [
    ...listed.matchAll(new RegExp(`${pkg.replace(/\./g, "\\.")}/(\\S+)`, "g")),
  ]
    .map((m) => m[1])
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
 * The tabs of the bar along the bottom, left to right: the app's own
 * labelled controls in the lowest row of two or more across the bottom of
 * the screen. A lone button near the bottom, a row of digits (the Self
 * wing's rating, which proof run 44042604819 tapped) and any control that
 * acts (`ACTS`) are not tabs.
 */
function bar(
  xml: string,
  pkg: string,
  screenHeight: number
): ReadonlyArray<Node> {
  const nodes: Array<Node> = []
  for (const node of xml.match(/<node\b[^>]*>/g) ?? []) {
    if (attribute(node, "package") !== pkg) continue
    if (attribute(node, "clickable") !== "true") continue
    const label = attribute(node, "text") || attribute(node, "content-desc")
    if (label === "" || /^\d+$/.test(label) || ACTS.test(label)) continue
    const bounds = (attribute(node, "bounds").match(/-?\d+/g) ?? []).map(Number)
    if (bounds.length !== 4) continue
    const [left = 0, top = 0, right = 0, bottom = 0] = bounds
    const y = Math.round((top + bottom) / 2)
    if (y < screenHeight * BAR_FROM) continue
    nodes.push({ label, x: Math.round((left + right) / 2), y })
  }
  const rows: Array<Array<Node>> = []
  for (const node of [...nodes].sort((a, b) => b.y - a.y)) {
    const row = rows.find((r) => Math.abs((r[0]?.y ?? 0) - node.y) <= ROW_PX)
    if (row) row.push(node)
    else rows.push([node])
  }
  const tabs = rows.find((r) => new Set(r.map((n) => n.label)).size >= 2) ?? []
  const unique = new Map(tabs.map((n) => [n.label, n]))
  return [...unique.values()].sort((a, b) => a.x - b.x)
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

/** The screen once two pictures a second apart agree, or after SETTLE_TRIES. */
async function settled(device: AndroidDevice): Promise<Buffer> {
  let last = await device.screenshot()
  for (let i = 0; i < SETTLE_TRIES; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    const now = await device.screenshot()
    if (now.equals(last)) return now
    last = now
  }
  return last
}
