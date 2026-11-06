/**
 * Promise HS1, for www's phone screens and the shared parts they draw
 * (`./stays-put.spec.ts` holds the claim and aph's walks).
 * - Family: every tap and every answer each walk below takes, at each of
 *   `PHONE_VIEWPORTS` (the phone held sideways among them): the phone-full
 *   prompt brought up by a refused save, with nothing to offer and with a
 *   session offered, dismissed by OK and by Not now, its Remove it working,
 *   answered by a session that stays and by a failure, and a notice of
 *   rounds let go dismissed by Got it; a take item recorded and stopped
 *   (its clock running, its ending said), whose take reaches home, and
 *   whose phone fills up and frees again; "Keep on this account" refused (failed, invalid, signed
 *   out) and kept; Settings → Home's address and pairing form typed into,
 *   paired with no answer, and closed; Jobs → Scout's form typed, a scout
 *   added, and one refused. A tap that declares `reflows` is outside it, and says why.
 * - Proof: this spec, over `../layout-invariants/stays-put.ts`, whose own
 *   planted shift `./stays-put.spec.ts` checks.
 * - Tolerance: a screen this spec does not walk.
 *
 * Run against a built phone page:
 *
 *   pnpm --filter www build:fit-phone
 *   pnpm --filter www test:ui-fit tests/ui-fit/stays-put-www.spec.ts
 */

import { expect, test, type Page } from "@playwright/test"
import { holdStill, type Tap } from "@tests/layout-invariants/stays-put"

import { PHONE_VIEWPORTS, servePhonePage, tap } from "./harness"

const PAGE = servePhonePage()

const button = (name: string | RegExp, does: string): Tap => ({
  does,
  act: (page) => tap(page, name),
})

/** What happens on the page without a tap: `window.wwwFit` (./phone-page/www.tsx). */
const happens = (action: string, does: string): Tap => ({
  does,
  act: (page): Promise<void> =>
    page.evaluate((name) => {
      const run = window.wwwFit?.[name]
      if (run === undefined) throw new Error(`no fit action ${name}`)
      run()
    }, action),
})

/** The phone-full prompt: nothing to offer, then a session offered. */
const STORAGE: ReadonlyArray<Tap> = [
  happens("refuse", "a save is refused, nothing to offer"),
  button("OK", "taps OK"),
  happens("refuseOffering", "a save is refused, a session offered"),
  button("Not now", "taps Not now"),
  happens("refuseOffering", "a save is refused again"),
  button("Remove it", "taps Remove it"),
  happens("stays", "home can't take it, so it stays"),
  button("Remove it", "taps Remove it again"),
  happens("fails", "the let-go fails"),
  button("Try again", "taps Try again"),
  happens("fails", "it fails again"),
  button("Not now", "taps Not now"),
  happens("notice", "a notice of rounds let go comes up"),
  button("Got it", "taps Got it"),
]

/** The take button, tapped, and what it is once the tap has landed. */
const takes = (does: string, then: string): Tap => ({
  does,
  act: async (page): Promise<void> => {
    await page.locator("[data-take]").click()
    await page.locator(`[data-take="${then}"]`).waitFor()
    // A second of the clock against the cap, as a thumb waits.
    await page.waitForTimeout(1_100)
  },
})

const TAKE_FULL: ReadonlyArray<Tap> = [
  takes("starts a take", "recording"),
  {
    ...takes("stops it, and it is kept", "ready"),
    reflows:
      "disclosure: the list grows by the take just made, the one it redoes folded under Earlier takes",
  },
  takes("starts another", "recording"),
  takes("stops it, and it is kept too", "ready"),
  happens("home", "home takes the take, and says since when"),
  happens("fill", "the phone fills up"),
  happens("free", "home takes some, so takes record again"),
]

/** Each keep answered as the walk says, before Keep is tapped. */
const KEEP: ReadonlyArray<Tap> = [
  happens("failed", "the shelf will fail"),
  button("Keep on this account", "keeps, failed"),
  happens("kept", "the shelf will keep it"),
  button("Keep on this account", "keeps, kept"),
]

const KEEP_REFUSED = (why: "invalid" | "signed-out"): ReadonlyArray<Tap> => [
  happens(why, `the shelf will refuse it, ${why}`),
  button("Keep on this account", `keeps, refused ${why}`),
]

/** Keys typed into the field `#id`, one at a time. */
const types = (id: string, text: string): Tap => ({
  does: `types "${text}" in #${id}`,
  act: (page) => page.locator(`#${id}`).pressSequentially(text),
})

/** Pair, and the answer: here, that home didn't answer. */
const pairs = (does: string): Tap => ({
  does,
  act: async (page): Promise<void> => {
    await tap(page, /^Pair with/)
    await page.getByText(/^Couldn.t reach/).waitFor()
  },
})

/** Settings → Home, unpaired: an address, then the pairing form. */
const HOME: ReadonlyArray<Tap> = [
  types("home-server", "h"),
  types("home-server", "ome-server.example.com:3000"),
  {
    ...button("Pair...", "opens the pairing form"),
    reflows: "disclosure: the pairing form opens below the buttons",
  },
  types("pair-address", "http://home"),
  {
    does: "makes it an https address",
    act: (page) =>
      page.locator("#pair-address").fill("https://home-server.example.com"),
  },
  types("pair-code", "K7QF 2M9X"),
  pairs("pairs, and home doesn't answer"),
  pairs("pairs again"),
  {
    ...button("Cancel", "cancels"),
    reflows: "disclosure: the pairing form closes",
  },
]

/** From here on, the phone keeps nothing: every write is refused. */
const refuseWrites: Tap = {
  does: "the phone stops keeping writes",
  act: (page): Promise<void> =>
    page.evaluate(() => {
      Storage.prototype.setItem = (): never => {
        throw new DOMException("full", "QuotaExceededError")
      }
    }),
}

/**
 * A scout typed in: first a link the run can't open, which asks for its
 * posting, then one it can. The posting's field is not typed into: it sizes
 * to its text (`field-sizing: content`), as a field the person is filling.
 */
const SCOUT_TYPED: ReadonlyArray<Tap> = [
  types("scout-url", "https://careers.example.com/jobs/4521"),
  {
    does: "makes it a link the run opens",
    act: (page) =>
      page.locator("#scout-url").fill("https://jobs.lever.co/second-dinner/1"),
  },
  types("scout-title", "SDET · Second Dinner"),
]

/** Jobs → Scout: one added, then one the phone can't keep. */
const SCOUT: ReadonlyArray<Tap> = [
  ...SCOUT_TYPED,
  button("Add to my scouts", "adds it"),
  refuseWrites,
  ...SCOUT_TYPED,
  button("Add to my scouts", "adds it, refused"),
]

async function open(page: Page, panel: string): Promise<Array<string>> {
  const errors: Array<string> = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto(PAGE.url(panel), { waitUntil: "load" })
  await expect(page.locator("[data-fit-slot] button").first()).toBeVisible()
  return errors
}

test.describe("a tap moves nothing it leaves on www's phone screens (HS1)", () => {
  PAGE.skipUnbuilt()

  for (const phone of PHONE_VIEWPORTS) {
    test(`www at ${phone.name} (${phone.width}x${phone.height})`, async ({
      page,
    }) => {
      PAGE.expectBuilt()
      await page.setViewportSize({ width: phone.width, height: phone.height })
      const failures: Array<string> = []

      const walks = [
        ["www-storage", STORAGE, "phone-full prompt"],
        ["www-take-full", TAKE_FULL, "take item, phone full"],
        ["www-keep", KEEP, "keep on this account"],
        ["www-keep", KEEP_REFUSED("invalid"), "keep, invalid"],
        ["www-keep", KEEP_REFUSED("signed-out"), "keep, signed out"],
        ["www-home", HOME, "settings, home"],
        ["www-scout", SCOUT, "jobs, scout"],
      ] as const
      for (const [panel, taps, label] of walks) {
        const errors = await open(page, panel)
        failures.push(...(await holdStill(page, taps, label)))
        expect(errors, `${label}: ${errors.join("\n")}`).toEqual([])
      }

      expect(failures, failures.join("\n")).toEqual([])
    })
  }
})
