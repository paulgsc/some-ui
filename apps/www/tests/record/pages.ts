/**
 * Public pages for an essay (#3387): a pull request's checks, a run's job
 * graph, a page of GitHub's docs, each photographed as anyone sees it
 * logged out, a sibling of the snips walk (`docs/snips.md`). It writes
 * `pages.json` (`@some-ui/video-render`'s `some-ui.pages/1`) beside one PNG
 * per page into `--out`, the folder `record:cards --pages` takes beside
 * the essay as `<key>.pages/`.
 *
 *   pnpm --filter www record:pages --pages-file <list>.json --out <dir>
 *
 * The list is `{"pages": [{"url": "https://…", "parts": {"<name>": "<CSS selector>"}}]}`:
 * each page's address and, if a scene zooms to parts of it, each part's
 * name and the selector that finds it. Every page is taken at one size
 * (`PAGE_VIEWPORT`: 1440×900 at 2×, UTC, light, motion reduced) in a
 * browser with no sign-in, cookie or token, so no picture holds anything
 * but what the public sees. Each record keeps the address and the moment
 * it was taken, the "as of" the essay tells its viewer.
 *
 * Refused, before anything is written: an address that isn't public https
 * or carries a user or password, a page that doesn't load, answers an
 * error or sends the browser elsewhere (a sign-in wall), and a part its
 * selector doesn't find wholly on the window.
 */
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { parseArgs } from "node:util"
import type { PageRecord } from "@some-ui/video-render"
import {
  isPublicAddress,
  PAGE_VIEWPORT,
  pageFile,
  PAGES_SCHEMA,
  parsePages,
  pngSize,
} from "@some-ui/video-render"
import { z } from "zod"

import { fail, here, jsonOr, launchChromium, runCommand } from "./command"

const ListSchema = z.strictObject({
  pages: z
    .array(
      z.strictObject({
        url: z
          .string()
          .refine(
            isPublicAddress,
            "a public https address, with no user or password"
          ),
        parts: z
          .record(z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/), z.string())
          .default({}),
      })
    )
    .min(1)
    .max(20),
})

/** How long a page may take to settle, and how long it is given after. */
const LOAD_MS = 60_000
const SETTLE_MS = 2_000

const { values } = parseArgs({
  options: {
    "pages-file": { type: "string" },
    out: { type: "string", default: "out/pages" },
  },
})

await runCommand(async () => {
  const file = values["pages-file"]
  if (!file) fail(["usage: record:pages --pages-file <list>.json --out <dir>"])
  const list = ListSchema.safeParse(
    jsonOr(await readFile(here(file), "utf8"), file)
  )
  if (!list.success)
    fail(list.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`))
  const out = here(values.out)
  await mkdir(out, { recursive: true })
  const browser = await launchChromium()
  const records: Array<PageRecord> = []
  const pictures: Array<{ name: string; bytes: Buffer }> = []
  try {
    // One context, never signed in: what anyone sees.
    const context = await browser.newContext({
      viewport: { width: PAGE_VIEWPORT.width, height: PAGE_VIEWPORT.height },
      deviceScaleFactor: PAGE_VIEWPORT.scale,
      locale: "en-US",
      timezoneId: "UTC",
      colorScheme: "light",
      reducedMotion: "reduce",
    })
    const page = await context.newPage()
    const problems: Array<string> = []
    for (const { url, parts } of list.data.pages) {
      // A page that doesn't load, answers an error, or lands somewhere else
      // (a sign-in wall) is refused: never a picture of another page under
      // this address. Live pages (a run's checks) never go quiet, so this
      // waits for the page's load, then a settle.
      const answer = await page
        .goto(url, { waitUntil: "load", timeout: LOAD_MS })
        .catch((error: unknown) => (error instanceof Error ? error : null))
      if (answer === null || answer instanceof Error) {
        problems.push(
          `${url} didn't load${answer instanceof Error ? `: ${answer.message.split("\n")[0] ?? ""}` : ""}`
        )
        continue
      }
      if (answer.status() >= 400) {
        problems.push(`${url} answered ${String(answer.status())}`)
        continue
      }
      const landed = new URL(page.url())
      const asked = new URL(url)
      if (
        landed.origin !== asked.origin ||
        landed.pathname !== asked.pathname
      ) {
        problems.push(`${url} sent the browser to ${page.url()}`)
        continue
      }
      await page.waitForTimeout(SETTLE_MS)
      const regions: PageRecord["regions"] = []
      for (const [name, selector] of Object.entries(parts)) {
        const box = await page
          .locator(selector)
          .first()
          .boundingBox({ timeout: 5_000 })
          .catch(() => null)
        // A part is boxed whole or refused: a zoom to half of it would
        // frame something the page doesn't show.
        const whole =
          box !== null &&
          box.width > 0 &&
          box.height > 0 &&
          box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= PAGE_VIEWPORT.width &&
          box.y + box.height <= PAGE_VIEWPORT.height
        if (box === null || !whole) {
          problems.push(
            `${url}: ${name} (${selector}) isn't wholly on the window`
          )
          continue
        }
        regions.push({
          name,
          box: { x: box.x, y: box.y, width: box.width, height: box.height },
        })
      }
      const capturedAt = new Date().toISOString()
      const bytes = await page.screenshot()
      const size = pngSize(bytes)
      if (size === null) {
        problems.push(`${url}: the picture isn't a PNG`)
        continue
      }
      const sha256 = createHash("sha256").update(bytes).digest("hex")
      const name = pageFile(url, sha256)
      records.push({
        url,
        capturedAt,
        title: await page.title(),
        width: size.width,
        height: size.height,
        scale: PAGE_VIEWPORT.scale,
        regions,
        image: { name, bytes: bytes.length, sha256 },
      })
      pictures.push({ name, bytes })
      console.log(`took ${name}`)
    }
    if (problems.length > 0) fail(problems)
  } finally {
    await browser.close()
  }
  const record = parsePages({ schema: PAGES_SCHEMA, pages: records })
  if (!record.ok) fail(record.problems)
  for (const { name, bytes } of pictures)
    await writeFile(join(out, name), bytes)
  await writeFile(
    join(out, "pages.json"),
    `${JSON.stringify(record.value, null, 2)}\n`
  )
  console.log(`wrote ${join(out, "pages.json")}`)
})
