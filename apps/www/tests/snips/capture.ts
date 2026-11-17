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

import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import type { Page } from "@playwright/test"

import {
  describe,
  fillPattern,
  isPattern,
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
  /** The picture, as PNG bytes. */
  readonly shoot: () => Promise<Buffer>
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

export async function walk(w: Walk): Promise<Part> {
  const links = new Set<string>()
  const snips: Array<SnipRecord> = []
  const unreached: Array<Unreached> = []
  const seen = new Set<string>()
  const plain = w.routes.filter((r) => !isPattern(r.path))
  const patterns = w.routes.filter((r) => isPattern(r.path))

  const visit = async (route: RouteEntry, path: string): Promise<void> => {
    await w.open(path)
    await settle(w.page)
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
    const png = await w.camera.shoot()
    const sha256 = hashOf(png)
    if (seen.has(sha256)) return
    seen.add(sha256)
    const id = snipId({
      surface: w.surface,
      path,
      viewport: w.viewport.name,
      appVersion: w.appVersion,
      sha256,
    })
    const drawn = w.build === "debug" ? "debug-" : ""
    const stem = `${w.surface}/${w.viewport.name}/${drawn}${slugOf(path)}-${sha256.slice(0, 12)}`
    const image = save(w.out, `${stem}.png`, "png", png)
    // A second picture a moment later: where the screen moved, a recording
    // shows what the still cannot.
    await w.page.waitForTimeout(1_000)
    const again = await w.camera.shoot()
    const moving = hashOf(again) !== sha256
    const clip = moving ? await w.camera.record() : null
    const recording = clip
      ? save(w.out, `${stem}.${clip.kind}`, clip.kind, clip.bytes)
      : undefined
    const module = moduleOf(path)
    snips.push({
      id,
      surface: w.surface,
      build: w.build,
      route: route.path,
      path,
      viewport: w.viewport.name,
      width: w.viewport.width,
      height: w.viewport.height,
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

export function hashOf(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex")
}

export function save(
  out: string,
  name: string,
  kind: SnipFile["kind"],
  bytes: Buffer
): SnipFile {
  const file = join(out, name)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, bytes)
  return { name, kind, bytes: bytes.length, sha256: hashOf(bytes) }
}

/** Waits for the network to go quiet and fonts to load, then a beat for late paints. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {
    // A screen that keeps a request open still gets its picture.
  })
  await page.evaluate(() => document.fonts.ready.then(() => true))
  await page.waitForTimeout(SETTLE_MS)
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
