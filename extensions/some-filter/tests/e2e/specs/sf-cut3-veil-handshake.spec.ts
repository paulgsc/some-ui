/**
 * SF-CUT3 (#1489) — the enforcement sheet's veil handshake, measured frame by
 * frame.
 *
 * Every scene runs with `enforcementSheetEnabled` on, where auto mode is the
 * sheet alone: the content script requests the sheet for its own document,
 * confirms it by reading `<html>`'s computed background, and only then lets
 * the veil come down. The claim under test is therefore about frames, not
 * about DOM state at rest: at no sampled animation frame is the page both
 * unveiled and unenforced. A sampler installed with `addInitScript` (so it
 * runs from `document_start`, in every frame, main world) records, on every
 * rAF, whether the veil is present and what `<html>` computes to.
 *
 * The sampler reads computed style every frame, which forces a style flush
 * per frame — it perturbs timing slightly, in the direction of *more*
 * opportunities to observe an unveiled frame, not fewer.
 */

import { expect, test } from "@filter/playwright/fixture"
import type { BrowserContext, Frame, Page, Worker } from "@playwright/test"

// SWATCHES.default.bg0 — a literal, for the same reason
// adr0002-enforcement-sheet.spec.ts gives: the worker's evaluate() context is
// not this module graph.
const ENFORCED_BG = "rgb(23, 28, 37)"
const VEIL_ID = "__sw_prepaint_veil"
// lib/content/enforcement-handshake.ts's ENFORCEMENT_LIVENESS_MS.
const LIVENESS_MS = 2_500

type Sample = {
  readonly t: number
  readonly veil: boolean
  readonly bg: string
  readonly filter: string
  readonly probeBg: string | null
  readonly legacy: boolean
  readonly state: string | null
}

type SamplerWindow = Window & {
  __sfSamples?: Array<Sample>
  __sfSampleUntil?: number
  __sfDcl?: number
}

/**
 * Installed in every frame from document_start. Samples for `ms` after the
 * document starts; `restartSampling()` below re-arms it for a later window.
 */
function installSampler(ms: number): void {
  const w: SamplerWindow = window
  w.__sfSamples = []
  w.__sfSampleUntil = performance.now() + ms
  document.addEventListener("DOMContentLoaded", () => {
    w.__sfDcl = performance.now()
  })
  const tick = (): void => {
    const html = document.documentElement
    const style = getComputedStyle(html)
    const probe = document.querySelector("[data-probe]")
    w.__sfSamples?.push({
      t: performance.now(),
      veil: document.getElementById("__sw_prepaint_veil") !== null,
      bg: style.backgroundColor,
      filter: style.filter,
      probeBg: probe === null ? null : getComputedStyle(probe).backgroundColor,
      legacy: html.hasAttribute("data-sw-legacy"),
      state: document.querySelector("body")?.dataset["swTabState"] ?? null,
    })
    if (performance.now() < (w.__sfSampleUntil ?? 0)) {
      requestAnimationFrame(tick)
    }
  }
  requestAnimationFrame(tick)
}

async function restartSampling(
  target: Page | Frame,
  ms: number
): Promise<void> {
  await target.evaluate((duration) => {
    const w: SamplerWindow = window
    const running =
      (w.__sfSampleUntil ?? 0) > performance.now() &&
      w.__sfSamples !== undefined
    w.__sfSamples = []
    w.__sfSampleUntil = performance.now() + duration
    if (running) return
    const tick = (): void => {
      const html = document.documentElement
      const style = getComputedStyle(html)
      const probe = document.querySelector("[data-probe]")
      w.__sfSamples?.push({
        t: performance.now(),
        veil: document.getElementById("__sw_prepaint_veil") !== null,
        bg: style.backgroundColor,
        filter: style.filter,
        probeBg:
          probe === null ? null : getComputedStyle(probe).backgroundColor,
        legacy: html.hasAttribute("data-sw-legacy"),
        state: document.body.dataset["swTabState"] ?? null,
      })
      if (performance.now() < (w.__sfSampleUntil ?? 0)) {
        requestAnimationFrame(tick)
      }
    }
    requestAnimationFrame(tick)
  }, ms)
}

async function samplesOf(target: Page | Frame): Promise<Array<Sample>> {
  return target.evaluate(() => {
    const w: SamplerWindow = window
    return w.__sfSamples ?? []
  })
}

/** Waits until the sampler's window has closed, so a read gets every frame. */
async function samplingDone(target: Page | Frame): Promise<void> {
  await target.waitForFunction(
    () => {
      const w: SamplerWindow = window
      return performance.now() > (w.__sfSampleUntil ?? 0) + 50
    },
    undefined,
    { timeout: 10_000, polling: 100 }
  )
}

/** The frames this story exists to make impossible: no veil, no sheet. */
function unveiledAndUnenforced(samples: ReadonlyArray<Sample>): Array<Sample> {
  return samples.filter((s) => !s.veil && s.bg !== ENFORCED_BG)
}

async function backgroundWorker(context: BrowserContext): Promise<Worker> {
  const [existing] = context.serviceWorkers()
  const sw = existing ?? (await context.waitForEvent("serviceworker"))
  // A fresh context's worker can be handed back before its global scope
  // exists (see adr0002-enforcement-sheet.spec.ts's identical helper).
  for (let attempt = 0; attempt < 250; attempt++) {
    const bound = await sw.evaluate(() => {
      const scope: { chrome?: Partial<typeof chrome> } = globalThis
      return scope.chrome?.storage !== undefined
    })
    if (bound) return sw
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error("chrome.storage never bound in the service worker")
}

/**
 * Turns the flag on and waits for the background's reaction to it: the
 * subframe script registration (background.ts's syncFrameScript), which is
 * what a frame created after this point depends on.
 */
async function enableEnforcement(sw: Worker): Promise<void> {
  await sw.evaluate(async () => {
    // eslint-disable-next-line no-restricted-globals
    await chrome.storage.local.set({ enforcementSheetEnabled: true })
  })
  for (let attempt = 0; attempt < 100; attempt++) {
    const registered = await sw.evaluate(async () => {
      // eslint-disable-next-line no-restricted-globals
      const scripts = await chrome.scripting.getRegisteredContentScripts({
        ids: ["sf-enforcement-frames"],
      })
      return scripts.length
    })
    if (registered === 1) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error("frame script never registered after enabling the flag")
}

async function awaitEnforced(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.body.dataset["swThemeApplied"] === "enforced",
    undefined,
    { timeout: 5_000, polling: 50 }
  )
}

async function cycle(sw: Worker, urlSubstring: string): Promise<void> {
  await sw.evaluate(async (target: string) => {
    // eslint-disable-next-line no-restricted-globals
    const tabs = await chrome.tabs.query({})
    const tab = tabs.find((t) => t.url?.includes(target))
    if (tab?.id === undefined) throw new Error(`no tab matching ${target}`)
    // eslint-disable-next-line no-restricted-globals
    await chrome.tabs.sendMessage(tab.id, { type: "CYCLE_TAB_STATE" })
  }, urlSubstring)
}

test.describe("SF-CUT3 veil handshake (flag on)", () => {
  for (const name of ["light-page", "hostile-page"]) {
    test(`cold load, ${name}: no frame is both unveiled and unenforced, and the classifier never starts`, async ({
      context,
      fixture,
    }) => {
      const sw = await backgroundWorker(context)
      await enableEnforcement(sw)
      await context.addInitScript(installSampler, 3_000)

      const page = await fixture.goto(name)
      await awaitEnforced(page)
      await samplingDone(page)

      const samples = await samplesOf(page)
      expect(
        samples.length,
        "the sampler must actually have run"
      ).toBeGreaterThan(20)
      expect(
        samples.some((s) => s.veil),
        "precondition: the veil was up at the start of the load"
      ).toBe(true)
      expect(unveiledAndUnenforced(samples)).toEqual([])

      // Either engine, never both: under the flag the classifier's own
      // artifacts never appear.
      const classifier = await page.evaluate(() => ({
        dark: document.documentElement.hasAttribute("data-sw-dark"),
        patched: document.querySelectorAll("[data-sw-patched]").length,
        darkSheet: document.getElementById("__sw_dark_theme") !== null,
      }))
      expect(classifier).toEqual({ dark: false, patched: 0, darkSheet: false })
    })
  }

  test("a slow background (a worker busy for 800 ms, inside the liveness bound): the veil holds until the sheet is read back, not until the request is sent", async ({
    context,
    fixture,
  }) => {
    const sw = await backgroundWorker(context)
    await enableEnforcement(sw)
    await context.addInitScript(installSampler, 3_000)

    // A cold or busy MV3 worker answers hundreds of milliseconds late. A
    // release driven by the request (or by a fixed two frames after it)
    // lifts the veil before the sheet exists; the confirm read waits.
    const busy = sw.evaluate((ms) => {
      const end = Date.now() + ms
      while (Date.now() < end) {
        // spin
      }
    }, 800)
    const page = await fixture.goto("light-page")
    await busy
    await awaitEnforced(page)
    await samplingDone(page)

    const samples = await samplesOf(page)
    expect(samples.length).toBeGreaterThan(20)
    expect(unveiledAndUnenforced(samples)).toEqual([])
  })

  test("a vendor 5 s canvas transition: the veil never lifts while <html> is anything but bg0", async ({
    context,
    fixture,
  }) => {
    const sw = await backgroundWorker(context)
    await enableEnforcement(sw)
    await context.addInitScript(installSampler, 3_000)

    const page = await fixture.goto("transition-vendor-page")
    await awaitEnforced(page)
    // The freeze made the sheet's value the current one before it was
    // removed, so there is nothing left to animate — not even afterwards.
    expect(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).backgroundColor
      )
    ).toBe(ENFORCED_BG)
    await samplingDone(page)

    const samples = await samplesOf(page)
    expect(samples.length).toBeGreaterThan(20)
    expect(unveiledAndUnenforced(samples)).toEqual([])
    expect(
      samples.filter((s) => !s.veil).every((s) => s.bg === ENFORCED_BG),
      "every unveiled frame reads exactly bg0 — no interpolated value"
    ).toBe(true)
  })

  test("an <iframe> inserted 500 ms after load gets the sheet under its own veil", async ({
    context,
    fixture,
  }) => {
    const sw = await backgroundWorker(context)
    await enableEnforcement(sw)
    await context.addInitScript(installSampler, 3_000)

    const page = await fixture.goto("light-page")
    await awaitEnforced(page)
    await page.waitForTimeout(500)
    await page.evaluate(() => {
      const frame = document.createElement("iframe")
      frame.src = "frame-child-page.html"
      frame.style.cssText = "width: 400px; height: 300px; border: 0"
      document.body.append(frame)
    })

    const child = await (async (): Promise<Frame> => {
      for (let attempt = 0; attempt < 100; attempt++) {
        const found = page
          .frames()
          .find((f) => f.url().includes("frame-child-page.html"))
        if (found !== undefined) return found
        await page.waitForTimeout(20)
      }
      throw new Error("child frame never attached")
    })()
    await child.waitForFunction(
      (expected) =>
        getComputedStyle(document.documentElement).backgroundColor ===
          expected && document.getElementById("__sw_prepaint_veil") === null,
      ENFORCED_BG,
      { timeout: 5_000, polling: 50 }
    )
    await samplingDone(child)

    const samples = await samplesOf(child)
    expect(samples.length).toBeGreaterThan(10)
    expect(
      samples.some((s) => s.veil),
      "precondition: the frame raised its own veil"
    ).toBe(true)
    expect(unveiledAndUnenforced(samples)).toEqual([])
  })

  test("a background that never answers: the veil releases at the liveness bound onto the native page, and the timeout is counted", async ({
    context,
    fixture,
  }) => {
    const sw = await backgroundWorker(context)
    await enableEnforcement(sw)
    await context.addInitScript(installSampler, 4_500)

    // Hold the worker's only thread for longer than the liveness bound, so
    // ENSURE_ENFORCEMENT is queued and never answered in time. Not awaited:
    // it returns only once the loop ends.
    const blocked = sw.evaluate((ms) => {
      const end = Date.now() + ms
      while (Date.now() < end) {
        // spin
      }
    }, 6_000)

    const page = await fixture.goto("light-page")
    await page.waitForFunction(
      (id) => document.getElementById(id) === null,
      VEIL_ID,
      { timeout: LIVENESS_MS + 3_000, polling: 20 }
    )
    const released = await page.evaluate(() => {
      const w: SamplerWindow = window
      return {
        dcl: w.__sfDcl ?? null,
        now: performance.now(),
        bg: getComputedStyle(document.documentElement).backgroundColor,
        applied: document.body.dataset["swThemeApplied"] ?? null,
      }
    })

    // Released by the liveness bound, not by a confirm: native page, no
    // sheet, no theme.
    expect(released.bg).toBe("rgb(255, 255, 255)")
    expect(released.applied).toBe("none")
    expect(released.dcl).not.toBeNull()
    // The request goes out one storage read after DOMContentLoaded; the
    // release lands within the bound plus the issue's 200 ms allowance (and
    // a polling interval), and not before the bound — which would mean it
    // was not the liveness path at all.
    const heldFor = released.now - (released.dcl ?? 0)
    expect(heldFor).toBeGreaterThanOrEqual(LIVENESS_MS - 50)
    expect(heldFor).toBeLessThanOrEqual(LIVENESS_MS + 200 + 100)

    await blocked
    const sessionId = await page.evaluate(
      () => document.body.dataset["swObservabilitySession"] ?? ""
    )
    const key = `sf.observability.session.${sessionId}.v1`
    let timeouts = 0
    for (let attempt = 0; attempt < 50 && timeouts === 0; attempt++) {
      timeouts = await sw.evaluate(async (k: string) => {
        // eslint-disable-next-line no-restricted-globals
        const store: Record<string, unknown> = await chrome.storage.local.get(k)
        const bundle = store[k]
        if (bundle === null || typeof bundle !== "object") return 0
        const metrics: unknown = Reflect.get(bundle, "metrics")
        if (metrics === null || typeof metrics !== "object") return 0
        const counters: unknown = Reflect.get(metrics, "counters")
        if (counters === null || typeof counters !== "object") return 0
        const value: unknown = Reflect.get(counters, "enforcement_timeout")
        return typeof value === "number" ? value : 0
      }, key)
      if (timeouts === 0) await page.waitForTimeout(100)
    }
    expect(timeouts).toBeGreaterThanOrEqual(1)
  })

  test("auto -> off -> legacy -> auto on one tab: no sheet in off or legacy, legacy's own invert is what applies, the sheet returns in auto, and no unveiled native frame in auto or legacy", async ({
    context,
    fixture,
  }) => {
    const sw = await backgroundWorker(context)
    await enableEnforcement(sw)
    const page = await fixture.goto("light-page")
    await awaitEnforced(page)
    await restartSampling(page, 8_000)

    // auto -> off
    await cycle(sw, "light-page.html")
    await page.waitForFunction(
      () =>
        document.body.dataset["swTabState"] === "off" &&
        document.getElementById("__sw_prepaint_veil") === null &&
        getComputedStyle(document.documentElement).backgroundColor ===
          "rgb(255, 255, 255)",
      undefined,
      { timeout: 5_000, polling: 50 }
    )
    expect(
      await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor
      ),
      "off: the vendor's own body colour, no sheet"
    ).toBe("rgb(255, 255, 255)")

    // off -> legacy
    await cycle(sw, "light-page.html")
    await page.waitForFunction(
      () =>
        document.documentElement.hasAttribute("data-sw-legacy") &&
        document.getElementById("__sw_prepaint_veil") === null,
      undefined,
      { timeout: 5_000, polling: 50 }
    )
    const legacy = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      return { filter: style.filter, bg: style.backgroundColor }
    })
    // The canvas rule's `filter: none` would override this if the sheet were
    // still present: legacy's invert must be what the root computes to.
    expect(legacy.filter).toContain("invert")
    expect(legacy.bg).not.toBe(ENFORCED_BG)

    // legacy -> auto
    await cycle(sw, "light-page.html")
    await awaitEnforced(page)
    await page.waitForFunction(
      (id) => document.getElementById(id) === null,
      VEIL_ID,
      { timeout: 5_000, polling: 50 }
    )
    const back = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      return { filter: style.filter, bg: style.backgroundColor }
    })
    expect(back).toEqual({ filter: "none", bg: ENFORCED_BG })

    await samplingDone(page)
    const samples = await samplesOf(page)
    expect(samples.length).toBeGreaterThan(20)
    const leaks = samples.filter(
      (s) =>
        !s.veil &&
        s.state !== "off" &&
        s.bg !== ENFORCED_BG &&
        !(s.legacy && s.filter.includes("invert"))
    )
    expect(leaks).toEqual([])
    // And the one combination #1489 forbids outright: legacy declared while
    // the canvas rule still forces `filter: none`.
    expect(
      samples.filter((s) => s.legacy && !s.veil && !s.filter.includes("invert"))
    ).toEqual([])
  })

  test("a yt-navigate-* head/body swap: the sheet survives it and no frame shows the new route's vendor colours", async ({
    context,
    fixture,
  }) => {
    const sw = await backgroundWorker(context)
    await enableEnforcement(sw)
    const page = await fixture.goto("hostile-page")
    await awaitEnforced(page)
    await page.waitForFunction(
      (id) => document.getElementById(id) === null,
      VEIL_ID,
      { timeout: 5_000, polling: 50 }
    )
    await restartSampling(page, 2_000)

    // The router's own sequence: start, a synchronous <head>/<body> swap
    // carrying a white route, a few frames of settling, then finish.
    await page.evaluate(() => {
      window.dispatchEvent(new Event("yt-navigate-start"))
      const head = document.createElement("head")
      const body = document.createElement("body")
      body.setAttribute("style", "background-color: rgb(255, 255, 255)")
      body.innerHTML =
        '<div data-probe style="background-color: rgb(255, 255, 255); height: 400px">new route</div>'
      document.documentElement.replaceChild(head, document.head)
      document.documentElement.replaceChild(body, document.body)
    })
    await page.waitForTimeout(300)
    await page.evaluate(() => {
      window.dispatchEvent(new Event("yt-navigate-finish"))
    })
    await samplingDone(page)

    const samples = await samplesOf(page)
    expect(samples.length).toBeGreaterThan(20)
    // The sheet is attached to the document, not to <head>: <html> keeps
    // bg0 across the swap, and the new route's white probe is erased from
    // its very first frame.
    expect(unveiledAndUnenforced(samples)).toEqual([])
    const probeFrames = samples.filter((s) => s.probeBg !== null)
    expect(probeFrames.length).toBeGreaterThan(5)
    expect(
      probeFrames.filter((s) => !s.veil && s.probeBg !== "rgba(0, 0, 0, 0)")
    ).toEqual([])
  })
})
