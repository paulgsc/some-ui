/**
 * MIC9 (#2379): the real recorder runs the scenario family in Chromium.
 *
 * Every test elsewhere replaces `recorder.ts`; here nothing does. Chromium
 * launches with a fake microphone playing one of two committed clips
 * (`clips/`, a synthesized two seconds of talking and two of silence), and
 * the page (`page.ts`) plays each case of `cases.ts` on the real take kit
 * over the real `micRecorder`, then plays the same scenario on the
 * simulated microphone scripted as that clip. Each test fails when:
 *
 * - the two end differently: the simulated microphone no longer behaves as
 *   the real one does, so every screen test built on it proves less;
 * - either run breaks VC2 or VC3 (`src/lib/properties.ts`), counting the
 *   real microphone's open streams by their tracks, so a stream left live
 *   after an ending fails here (`held-idle`);
 * - a track the real microphone handed out is still live once it is over;
 * - the real take does not look like the clip: no bytes, a length far
 *   from the clip's, a peak on the wrong side of `HEARD_FLOOR`.
 */
import { readFile } from "node:fs/promises"
import { extname, resolve } from "node:path"
import { expect, test } from "@playwright/test"

import type { CaseRun } from "./cases"
import { CLIP_MS, TAKE_CASES } from "./cases"

const DIST = resolve(import.meta.dirname, "dist")

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".map": "application/json",
}

/** How far a take's length may sit from the clip's: the opening, a tick. */
const LENGTH_SLACK_MS = 400

test.beforeEach(async ({ page }) => {
  // `http://localhost` is a secure context, so `getUserMedia` is there.
  await page.route("http://localhost/**", async (route) => {
    const path = new URL(route.request().url()).pathname
    const file = resolve(DIST, `.${path === "/" ? "/index.html" : path}`)
    if (!file.startsWith(DIST)) {
      await route.fulfill({ status: 404 })
      return
    }
    await route.fulfill({
      body: await readFile(file),
      contentType: TYPES[extname(file)] ?? "application/octet-stream",
    })
  })
  await page.goto("http://localhost/")
  await page.waitForFunction(() => window.playTakeCase !== undefined)
})

for (const take of TAKE_CASES) {
  test(`${take.name} @${take.clip}`, async ({ page }) => {
    const run: CaseRun = await page.evaluate(async (name) => {
      if (window.playTakeCase === undefined) throw new Error("no page")
      return window.playTakeCase(name)
    }, take.name)
    const { real, simulated, floor } = run

    expect(real.endings, "the real and simulated microphones agree").toEqual(
      simulated.endings
    )
    expect(real.endings.map(({ ending }) => ending)).toEqual(take.ends)
    expect(real.violations, "the real microphone").toEqual([])
    expect(simulated.violations, "the simulated microphone").toEqual([])

    expect(real.tracks.length).toBeGreaterThan(0)
    expect(real.tracks.every((state) => state === "ended")).toBe(true)
    expect(real.open).toBe(0)

    if (take.take !== undefined) {
      expect(real.takes).toHaveLength(1)
      const [kept] = real.takes
      if (kept === undefined) throw new Error("no take")
      expect(kept.bytes).toBeGreaterThan(0)
      expect(kept.mimeType).toMatch(/^audio\//)
      expect(Math.abs(kept.durationMs - CLIP_MS)).toBeLessThan(LENGTH_SLACK_MS)
      expect(kept.decodedMs, "the bytes decode as audio").not.toBeNull()
      expect(Math.abs((kept.decodedMs ?? 0) - CLIP_MS)).toBeLessThan(
        LENGTH_SLACK_MS
      )
      expect(kept.peak, "the meter measured the take").not.toBeNull()
      if (take.take.heard) expect(kept.peak).toBeGreaterThan(floor)
      else expect(kept.peak).toBeLessThan(floor)
    }
  })
}
