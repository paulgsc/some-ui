/**
 * SN2 (#3491): the capture photographs no screen still reading. Its wait,
 * `settle`, in a real Chromium: a screen with nothing reading settles at
 * once; one whose reading line goes after a while settles once it has gone,
 * though nothing the page's network shows marks the read (the app's reads
 * of home go through the phone's own HTTP); one that never stops reading
 * is refused, so `walk` lists it as unreached and takes no picture. A
 * screen that looks idle at first and starts reading a moment later (it
 * mounts, then asks home) is waited for too.
 */

import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

import { hashOf, settle, walk } from "./capture"

/** A screen whose reading line (`Reading`, `@some-ui/shared`) goes after `ms`, or never. */
const screenReading = (ms: number | null): string => `
  <main>
    <p aria-busy="true" id="reading">Asking home…</p>
    ${
      ms === null
        ? ""
        : `<script>setTimeout(() => {
            document.getElementById("reading").replaceWith(
              Object.assign(document.createElement("p"), { textContent: "Renders" })
            )
          }, ${String(ms)})</script>`
    }
  </main>`

test.describe("the capture's wait for a screen to read (SN2)", () => {
  test("settles at once when nothing is reading", async ({ page }) => {
    await page.setContent("<main><h1>Renders</h1></main>")
    expect(await settle(page, 1_000)).toBe(true)
  })

  test("waits for a read its network never shows, and settles once it has landed", async ({
    page,
  }) => {
    // Longer than the beat `settle` takes after a screen has read (2.5 s), so
    // only the wait for the reading line explains its going.
    await page.setContent(screenReading(6_000))
    const from = Date.now()
    expect(await settle(page, 10_000)).toBe(true)
    expect(Date.now() - from).toBeGreaterThanOrEqual(6_000)
    expect(await page.locator('[aria-busy="true"]').count()).toBe(0)
  })

  test("waits for a read that starts only after the screen first looked idle", async ({
    page,
  }) => {
    // Idle at first, reading from 1 s (inside the beat) to 5 s.
    await page.setContent(`<main><h1>Takes</h1><script>
      setTimeout(() => {
        const p = Object.assign(document.createElement("p"), { id: "reading", textContent: "Asking home…" })
        p.setAttribute("aria-busy", "true")
        document.querySelector("main").append(p)
      }, 1_000)
      setTimeout(() => document.getElementById("reading").remove(), 5_000)
    </script></main>`)
    expect(await settle(page, 10_000)).toBe(true)
    expect(await page.locator('[aria-busy="true"]').count()).toBe(0)
  })

  test("refuses a screen that starts reading after it looked idle and never stops", async ({
    page,
  }) => {
    await page.setContent(`<main><h1>Takes</h1><script>
      setTimeout(() => {
        const p = Object.assign(document.createElement("p"), { textContent: "Asking home…" })
        p.setAttribute("aria-busy", "true")
        document.querySelector("main").append(p)
      }, 1_000)
    </script></main>`)
    expect(await settle(page, 4_000)).toBe(false)
  })

  test("waits again for a read that comes and goes inside the beat", async ({
    page,
  }) => {
    // Idle at first; reading from 1 s to 1.5 s, inside the 2.5 s beat. Only
    // a second beat after it can be trusted to show the screen it landed on.
    await page.setContent(`<main><h1>Takes</h1><script>
      setTimeout(() => {
        const p = Object.assign(document.createElement("p"), { id: "reading", textContent: "Asking home…" })
        p.setAttribute("aria-busy", "true")
        document.querySelector("main").append(p)
      }, 1_000)
      setTimeout(() => document.getElementById("reading").remove(), 1_500)
    </script></main>`)
    const from = Date.now()
    expect(await settle(page, 10_000)).toBe(true)
    expect(Date.now() - from).toBeGreaterThanOrEqual(5_000)
  })

  test("refuses a screen still reading at its bound", async ({ page }) => {
    await page.setContent(screenReading(null))
    expect(await settle(page, 1_000)).toBe(false)
  })
})

/** The app's root, served from the test itself. */
const BASE = "http://snips.test/app"

/**
 * Walks one screen, /takes, whose reading line appears just as the first
 * picture is taken (after `settle` looked) and goes after `goesMs`, or never,
 * or as soon as that picture is taken: a read that lands while it is taken.
 * Each picture notes whether the screen was reading as it was taken.
 */
async function walkTakes(
  page: Page,
  out: string,
  goesMs: number | "with the picture" | null
): Promise<{
  readonly part: Awaited<ReturnType<typeof walk>>
  readonly shots: ReadonlyArray<boolean>
  /** Each picture's SHA-256, in the order taken. */
  readonly pictures: ReadonlyArray<string>
}> {
  await page.route(`${BASE}/**`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<main><h1>Takes</h1></main>",
    })
  )
  const shots: Array<boolean> = []
  const pictures: Array<string> = []
  const part = await walk({
    surface: "web",
    build: "debug",
    page,
    viewport: {
      name: "phone",
      width: 412,
      height: 915,
      scale: 1,
      words: "a phone",
    },
    appVersion: "0.0.0",
    routes: [{ id: "/takes", path: "/takes", audience: "public" }],
    out,
    base: BASE,
    open: async (path) => {
      await page.goto(`${BASE}${path}`)
    },
    camera: {
      shoot: async () => {
        if (shots.length === 0)
          await page.evaluate((goesMs) => {
            const p = Object.assign(document.createElement("p"), {
              id: "reading",
              textContent: "Asking home…",
            })
            p.setAttribute("aria-busy", "true")
            document.querySelector("main")?.append(p)
            if (typeof goesMs === "number")
              setTimeout(
                () => document.getElementById("reading")?.remove(),
                goesMs
              )
          }, goesMs)
        shots.push(
          await page.evaluate(
            () => document.querySelector('[aria-busy="true"]') !== null
          )
        )
        const png = await page.screenshot()
        pictures.push(await hashOf(png))
        if (goesMs === "with the picture" && shots.length === 1)
          await page.evaluate(() =>
            document.getElementById("reading")?.remove()
          )
        return png
      },
      regions: () => Promise.resolve([]),
      record: () => Promise.resolve(null),
    },
  })
  return { part, shots, pictures }
}

test.describe("the capture's walk drops a picture of a screen that began reading (SN2)", () => {
  test("shoots again once the read has landed, and keeps only that picture", async ({
    page,
  }) => {
    const { part, shots } = await walkTakes(
      page,
      test.info().outputPath("walk"),
      4_000
    )
    expect(part.unreached).toEqual([])
    expect(part.snips).toHaveLength(1)
    expect(shots[0]).toBe(true)
    expect(shots.at(-1)).toBe(false)
  })

  test("drops a picture taken while a read landed, though nothing reads by the time it looks", async ({
    page,
  }) => {
    const { part, shots, pictures } = await walkTakes(
      page,
      test.info().outputPath("walk"),
      "with the picture"
    )
    expect(part.unreached).toEqual([])
    expect(part.snips).toHaveLength(1)
    expect(part.snips[0]?.image.sha256).not.toBe(pictures[0])
    // The first picture, taken while it read, is dropped; every later one
    // (the retake, and the motion check's second look) shows it read.
    expect(shots[0]).toBe(true)
    expect(shots.slice(1)).not.toContain(true)
  })

  test("lists a screen that never stops reading as unreached, with no picture", async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const { part } = await walkTakes(page, test.info().outputPath("walk"), null)
    expect(part.snips).toEqual([])
    expect(part.unreached).toEqual([
      {
        surface: "web",
        route: "/takes",
        why: "it was still reading after 20 s",
      },
    ])
  })
})
