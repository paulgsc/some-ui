/**
 * The walk both capture specs take (SNIPS1, `docs/snips.md`): open each
 * route the surface offers, let it settle, read what it says it is and the
 * links it holds, take the picture, and keep one snip per distinct image.
 * `$param` routes are filled from the links found on screens already
 * captured, so they come last.
 *
 * The surface differs only in how a picture is taken (`Camera`): the web
 * spec photographs the page, the APK spec the emulator's whole screen.
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import type { AndroidDevice, Page } from "@playwright/test"
import { sha256Hex } from "@some-ui/core-utils"
import type { Region } from "@some-ui/video-render"
import { pngSize as readPngSize, regionsOf } from "@some-ui/video-render"

import {
  describe,
  fillPattern,
  isPattern,
  isStage,
  moduleOf,
  slugOf,
  snipId,
} from "@/lib/snips"
import type {
  Build,
  Part,
  RouteEntry,
  SnipFile,
  SnipRecord,
  Surface,
  Unreached,
  Viewport,
} from "@/lib/snips"

type Camera = {
  /**
   * The picture, as PNG bytes: the whole page for a recording stage
   * (`isStage`), else what the screen shows.
   */
  readonly shoot: (whole: boolean) => Promise<Buffer>
  /**
   * Each part the screen names (`data-region`), boxed in the picture's CSS
   * pixels, where the picture is the page's own; none where it is the
   * device's whole screen, which no page's layout maps onto.
   */
  readonly regions: (whole: boolean) => Promise<ReadonlyArray<Region>>
  /** A short recording of the screen, as its bytes and kind, or null where none is made. */
  readonly record: () => Promise<{
    readonly bytes: Buffer
    readonly kind: "webm" | "mp4"
  } | null>
}

export type Walk = {
  readonly surface: Surface
  readonly build: Build
  readonly page: Page
  readonly camera: Camera
  readonly viewport: Viewport
  readonly appVersion: string
  readonly routes: ReadonlyArray<RouteEntry>
  /** The bundle's root: files land under `<surface>/<viewport>/`. */
  readonly out: string
  /** The app's root as a URL, without a trailing slash: `http://127.0.0.1:4173/some-ui`. */
  readonly base: string
  /** Opens an address in the app. */
  readonly open: (path: string) => Promise<void>
}

/** How long a screen may take to settle: a slowed emulator renders late. */
const SETTLE_MS = 2_500

/**
 * What a screen still reading marks itself with (`Reading`, `@some-ui/shared`;
 * a route still loading, `RoutePending`): the app's reads of home go through
 * the phone's own HTTP, which `networkidle` can't see (#3491).
 */
const BUSY = '[aria-busy="true"]'

/** How long a screen may read before it is left unphotographed, said as unreached. */
const READING_MS = 20_000

/** How many pictures of a screen that began reading after it settled are taken before it is left. */
const LOOKS = 3

/**
 * Starts noting whether anything on the screen reads, at any moment from
 * now until `sawReading`: a line that comes and goes between two looks, as
 * a read that lands while a picture is taken, is noted too (#3491). What it
 * notes is kept on the page's root, as `data-snips-*`, which no screen reads.
 */
const watchReading = (page: Page): Promise<void> =>
  page.evaluate((busy) => {
    const root = document.documentElement
    // Each watch's own number, from a count that only grows in this document.
    const watch = String(Number(root.dataset["snipsWatches"] ?? "0") + 1)
    root.dataset["snipsWatches"] = watch
    root.dataset["snipsWatch"] = watch
    root.dataset["snipsSaw"] =
      document.querySelector(busy) === null ? "" : "yes"
    const reads = (node: Node): boolean =>
      node instanceof Element &&
      (node.matches(busy) || node.querySelector(busy) !== null)
    const observer = new MutationObserver((records): void => {
      // A later watch, or `sawReading`, ends this one.
      if (root.dataset["snipsWatch"] !== watch) {
        observer.disconnect()
        return
      }
      for (const record of records) {
        if (record.type === "attributes" && reads(record.target))
          root.dataset["snipsSaw"] = "yes"
        for (const node of record.addedNodes)
          if (reads(node)) root.dataset["snipsSaw"] = "yes"
      }
    })
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-busy"],
    })
  }, BUSY)

/** Whether anything read since `watchReading`, or reads now; ends the watch. */
const sawReading = (page: Page): Promise<boolean> =>
  page.evaluate((busy) => {
    const root = document.documentElement
    const saw = root.dataset["snipsSaw"] === "yes"
    root.dataset["snipsWatch"] = ""
    root.dataset["snipsSaw"] = ""
    return saw || document.querySelector(busy) !== null
  }, BUSY)

export async function walk(w: Walk): Promise<Part> {
  const links = new Set<string>()
  const snips: Array<SnipRecord> = []
  const unreached: Array<Unreached> = []
  /** Each picture's hash, to the address that drew it first. */
  const seen = new Map<string, string>()
  const plain = w.routes.filter((r) => !isPattern(r.path))
  const patterns = w.routes.filter((r) => isPattern(r.path))

  const visit = async (route: RouteEntry, path: string): Promise<void> => {
    await w.open(path)
    // Never a picture of a screen still reading: it shows the reading line,
    // not the screen (#3491).
    const stillReading = (): void => {
      unreached.push({
        surface: w.surface,
        route: route.path,
        why: `it was still reading after ${String(READING_MS / 1000)} s`,
      })
    }
    if (!(await settle(w.page))) {
      stillReading()
      return
    }
    // A screen can begin reading after settle's last look, and its read can
    // land while the picture is taken; a picture taken while anything read
    // since settle is dropped, and the screen settled and shot again, a few
    // times at most.
    await watchReading(w.page)
    const screen = await read(w.page, w.base)
    for (const link of screen.links) links.add(link)
    if (screen.notFound) {
      unreached.push({
        surface: w.surface,
        route: route.path,
        why: "this build does not offer it",
      })
      return
    }
    if (screen.path !== path) {
      unreached.push({
        surface: w.surface,
        route: route.path,
        why: `it sends a visitor on to ${screen.path}`,
      })
      return
    }
    const whole = isStage(route.path)
    let png = await w.camera.shoot(whole)
    for (let look = 1; await sawReading(w.page); look++) {
      if (look >= LOOKS || !(await settle(w.page))) {
        stillReading()
        return
      }
      await watchReading(w.page)
      png = await w.camera.shoot(whole)
    }
    const regions = await w.camera.regions(whole)
    const sha256 = await hashOf(png)
    const same = seen.get(sha256)
    if (same !== undefined) {
      unreached.push({
        surface: w.surface,
        route: route.path,
        why: `it shows the same screen as ${same}`,
      })
      return
    }
    seen.set(sha256, path)
    const id = snipId({
      surface: w.surface,
      path,
      viewport: w.viewport.name,
      appVersion: w.appVersion,
      sha256,
    })
    const drawn = w.build === "debug" ? "debug-" : ""
    const stem = `${w.surface}/${w.viewport.name}/${drawn}${slugOf(path)}-${sha256.slice(0, 12)}`
    const image = await save(w.out, `${stem}.png`, "png", png)
    // A second picture a moment later: where the screen moved, a recording
    // shows what the still cannot.
    await w.page.waitForTimeout(1_000)
    const again = await w.camera.shoot(whole)
    const moving = (await hashOf(again)) !== sha256
    const clip = moving ? await w.camera.record() : null
    const recording = clip
      ? await save(w.out, `${stem}.${clip.kind}`, clip.kind, clip.bytes)
      : undefined
    const module = moduleOf(path)
    snips.push({
      id,
      surface: w.surface,
      build: w.build,
      route: route.path,
      path,
      viewport: w.viewport.name,
      ...pngSize(png),
      scale: w.viewport.scale,
      regions: [...regions],
      appVersion: w.appVersion,
      module,
      shows: screen.shows || module,
      description: describe(module, screen.shows, w.viewport),
      image,
      ...(recording ? { recording } : {}),
    })
  }

  for (const route of plain) await visit(route, route.path)
  for (const route of patterns) {
    const paths = fillPattern(route.path, links)
    if (paths.length === 0) {
      unreached.push({
        surface: w.surface,
        route: route.path,
        why: "no screen in the sample data links to one",
      })
    }
    for (const path of paths) await visit(route, path)
  }
  return { surface: w.surface, appVersion: w.appVersion, snips, unreached }
}

/** Writes a capture job's part beside its files, for `scripts/snips-bundle.ts`. */
export function writePart(out: string, part: Part, name: string): void {
  mkdirSync(out, { recursive: true })
  writeFileSync(
    join(out, `part-${name}.json`),
    `${JSON.stringify(part, null, 2)}\n`
  )
}

/** A PNG's own size, from its header: what was drawn, whatever was asked for. */
export function pngSize(png: Buffer): { width: number; height: number } {
  const size = readPngSize(png)
  if (size === null) throw new Error("the camera gave no PNG")
  return size
}

/** A file's SHA-256, as home hashes content (`sha256Hex`). */
export function hashOf(bytes: Buffer): Promise<string> {
  return sha256Hex(new Uint8Array(bytes).buffer)
}

/**
 * A 4-second recording of the emulator's screen, for an APK screen still
 * moving after it was taken: both builds' walks use it.
 */
export async function recordScreen(
  device: AndroidDevice
): Promise<{ readonly bytes: Buffer; readonly kind: "mp4" } | null> {
  await device.shell("screenrecord --time-limit 4 /sdcard/snip.mp4")
  const bytes = await device.shell("cat /sdcard/snip.mp4")
  await device.shell("rm -f /sdcard/snip.mp4")
  return bytes.length > 0 ? { bytes, kind: "mp4" } : null
}

export async function save(
  out: string,
  name: string,
  kind: SnipFile["kind"],
  bytes: Buffer
): Promise<SnipFile> {
  const file = join(out, name)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, bytes)
  return { name, kind, bytes: bytes.length, sha256: await hashOf(bytes) }
}

/**
 * The parts the page names (`data-region`), each boxed around every element
 * that carries it, within what the page's picture shows (`regionsOf`): the
 * window, or the `whole` page from its top-left.
 */
export async function pageRegions(
  page: Page,
  whole: boolean
): Promise<ReadonlyArray<Region>> {
  const { measured, width, height } = await page.evaluate((whole) => {
    const dx = whole ? window.scrollX : 0
    const dy = whole ? window.scrollY : 0
    const root = document.documentElement
    return {
      measured: [
        ...document.querySelectorAll<HTMLElement>("[data-region]"),
      ].map((part) => {
        const r = part.getBoundingClientRect()
        return {
          ref: part.dataset.region ?? "",
          box: { x: r.x + dx, y: r.y + dy, width: r.width, height: r.height },
        }
      }),
      width: whole ? root.scrollWidth : window.innerWidth,
      height: whole ? root.scrollHeight : window.innerHeight,
    }
  }, whole)
  return regionsOf(measured, { width, height })
}

/**
 * Waits for the network to go quiet, for nothing on the screen to be reading
 * (`BUSY`) and fonts to load, then a beat for late paints: while anything
 * read at any moment of the beat, it waits again. False when
 * the screen was still reading after `readingMs` in all.
 */
export async function settle(
  page: Page,
  readingMs: number = READING_MS
): Promise<boolean> {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {
    // A screen that keeps a request open still gets its picture.
  })
  const until = Date.now() + readingMs
  // A screen may start reading only after it first looks idle (it mounts,
  // then asks home), so it is read again after the beat: what it shows
  // then is what gets photographed.
  for (;;) {
    const read = await page
      .waitForFunction((busy) => document.querySelector(busy) === null, BUSY, {
        timeout: Math.max(1, until - Date.now()),
      })
      .then(() => true)
      .catch(() => false)
    if (!read) return false
    await page.evaluate(() => document.fonts.ready.then(() => true))
    await watchReading(page)
    await page.waitForTimeout(SETTLE_MS)
    if (!(await sawReading(page))) return true
    if (Date.now() >= until) return false
  }
}

type Screen = {
  readonly path: string
  readonly shows: string
  readonly notFound: boolean
  readonly links: ReadonlyArray<string>
}

/** What the screen says it is, where it ended up, and the in-app links it holds. */
async function read(page: Page, base: string): Promise<Screen> {
  return page.evaluate((base) => {
    const inApp = (href: string): string | null => {
      if (!href.startsWith(base)) return null
      const rest = href.slice(base.length).split(/[?#]/)[0] ?? ""
      return rest === "" ? "/" : rest
    }
    const heading = document.querySelector("h1")?.textContent.trim() ?? ""
    const sub = document.querySelector("main h2")?.textContent.trim() ?? ""
    const path = inApp(location.href) ?? location.pathname
    return {
      path: path.length > 1 ? path.replace(/\/$/, "") : path,
      // The page's own heading; the site's title says nothing of the screen.
      shows: heading || sub,
      notFound: heading === "Page not found",
      links: [...document.querySelectorAll<HTMLAnchorElement>("a[href]")]
        .map((a) => inApp(a.href))
        .filter((l): l is string => l !== null),
    }
  }, base)
}
