/**
 * The phone's own Rust Rounds screens for an essay (RR31, #3288; call
 * C790): each ticket's card of the week home handed over, drawn by the
 * built app's `/rust-screen` stage at the phone's size, photographed whole,
 * with every part the card names (`data-region`) boxed, into
 * `<root>/screens/` as `screens.json` (`@some-ui/video-render`'s
 * `some-ui.screens/1`) and one `<TICKET>.png` per ticket.
 *
 * `--week-file` is the week as home serves it (`GET /rust-weeks/<id>`, with
 * its rustc runs). The stage reads it by the phone's own door
 * (`heldFromHome`) and refuses one the phone couldn't hold; the recorder
 * reads only its id and its tickets' keys, to know which cards to open
 * (`@some-ui/rust-rounds` can't load in node: its entry carries CSS).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { Browser, Page, Route } from "@playwright/test"
import type { Measured, Screen, Screens } from "@some-ui/video-render"
import {
  parseScreens,
  regionsOf,
  SCREENS_SCHEMA,
  TICKET_KEY_PATTERN,
} from "@some-ui/video-render"
import { z } from "zod"

import { answerFile, fail } from "./command"
import { shownFrame } from "./voiced"

/** The phone the cards are drawn for: the snips' phone (`lib/snips`' `WEB_VIEWPORTS`). */
const PHONE = { width: 412, height: 915 } as const

/** Device pixels per CSS pixel: sharp when a scene zooms in. */
const SCALE = 2

/** Of the week home serves, all the recorder reads: which cards to open. */
const ServedSchema = z.object({
  id: z.string(),
  week: z.object({
    tickets: z.array(
      z.object({ id: z.string().regex(new RegExp(`^${TICKET_KEY_PATTERN}$`)) })
    ),
  }),
})

/** The stage's read of the week (`call/feed.ts`' `rustScreenSource`). */
const READ = /\/rust-screens\/[^/?#]+\.json$/

/**
 * Photographs each ticket of the week in `weekFile` and writes the record;
 * refuses a week the phone can't read, or another week than `week`.
 */
export async function captureScreens({
  browser,
  origin,
  weekFile,
  week,
  root,
}: {
  readonly browser: Browser
  readonly origin: string
  readonly weekFile: string
  /** The essay's week: the file must hold the same. */
  readonly week: string
  readonly root: string
}): Promise<Screens> {
  const bytes = await readFile(weekFile)
  const served = ServedSchema.safeParse(parsedOr(bytes, weekFile))
  if (!served.success)
    fail([`${weekFile} is no week as home serves one (GET /rust-weeks/<id>)`])
  if (served.data.id !== week)
    fail([`${weekFile} holds the week of ${served.data.id}, not ${week}`])

  const out = join(root, "screens")
  await mkdir(out, { recursive: true })
  const context = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: SCALE,
    reducedMotion: "reduce",
  })
  try {
    const page = await context.newPage()
    // Registered first, so the read below answers before it: Playwright
    // tries the newest route first.
    await page.route("**/*", (route) => onlyTheStage(route, origin))
    await page.route(READ, (route) => answerFile(route, bytes, week))
    const screens: Array<Screen> = []
    for (const ticket of served.data.week.tickets) {
      await page.goto(
        `${origin}/rust-screen?${new URLSearchParams({
          week,
          ticket: ticket.id,
        }).toString()}`
      )
      const card = await shownFrame(page, `[data-screen="${ticket.id}"]`)
      const drawn = await page.locator("[data-week]").getAttribute("data-week")
      if (drawn !== week)
        fail([`the stage drew the week of ${drawn ?? "none"}, not ${week}`])
      await page.evaluate(() => document.fonts.ready)
      screens.push(await photograph(card, ticket.id, out))
    }
    const record = {
      schema: SCREENS_SCHEMA,
      source: { kind: "rust-week", id: week },
      screens,
    }
    const parsed = parseScreens(record)
    if (!parsed.ok)
      fail(["The screens captured don't make a record:", ...parsed.problems])
    await writeFile(
      join(out, "screens.json"),
      `${JSON.stringify(parsed.value, null, 1)}\n`
    )
    return parsed.value
  } finally {
    await context.close()
  }
}

/** One card, whole, and its named parts, measured from the card's top-left. */
async function photograph(
  card: ReturnType<Page["locator"]>,
  id: string,
  out: string
): Promise<Screen> {
  const measured: Array<Measured> = await card.evaluate((element) => {
    const c = element.getBoundingClientRect()
    return [...element.querySelectorAll<HTMLElement>("[data-region]")].map(
      (part) => {
        const r = part.getBoundingClientRect()
        return {
          ref: part.dataset.region ?? "",
          box: { x: r.x - c.x, y: r.y - c.y, width: r.width, height: r.height },
        }
      }
    )
  })
  const png = await card.screenshot({ animations: "disabled" })
  // The picture's own size (PNG's IHDR), in CSS pixels.
  const width = png.readUInt32BE(16) / SCALE
  const height = png.readUInt32BE(20) / SCALE
  const file = `${id}.png`
  await writeFile(join(out, file), png)
  return {
    id,
    file,
    width,
    height,
    scale: SCALE,
    viewport: { ...PHONE },
    regions: regionsOf(measured.map((part) => within(part, width, height))),
  }
}

/** A part's box kept inside the picture, as sub-pixel layout can spill past it. */
function within(part: Measured, width: number, height: number): Measured {
  const x = Math.max(0, part.box.x)
  const y = Math.max(0, part.box.y)
  return {
    ref: part.ref,
    box: {
      x,
      y,
      width: Math.min(part.box.x + part.box.width, width) - x,
      height: Math.min(part.box.y + part.box.height, height) - y,
    },
  }
}

function parsedOr(bytes: Buffer, path: string): unknown {
  try {
    return JSON.parse(bytes.toString("utf8"))
  } catch {
    return fail([`${path} is not JSON`])
  }
}

/** The stage's own files go through; nothing else leaves the page. */
function onlyTheStage(route: Route, origin: string): Promise<void> {
  return new URL(route.request().url()).origin === origin
    ? route.fallback()
    : route.abort("blockedbyclient")
}
