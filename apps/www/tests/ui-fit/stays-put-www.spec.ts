/**
 * Promise HS1, for www's phone screens and the shared parts they draw
 * (`./stays-put.spec.ts` holds the claim).
 * - Family: every tap and every answer each walk below takes, at each of
 *   `PHONE_VIEWPORTS` (the phone held sideways among them): the phone-full
 *   prompt brought up by a refused save, with nothing to offer and with a
 *   session offered, dismissed by OK and by Not now, its Remove it working,
 *   answered by a session that stays and by a failure, and a notice of
 *   rounds let go dismissed by Got it; a take item recorded and stopped (its
 *   clock running, its ending said), whose take reaches home, and whose
 *   phone fills up and frees again; "Keep on this account" refused (failed,
 *   invalid, a full shelf, whose list opens below it) and kept; Settings →
 *   Home's address and pairing form typed into, paired with no answer, and
 *   closed; Jobs → Scout's form typed, a scout added, one refused, and the
 *   refusal closed. What each says is on the notice plane, never in the
 *   screen. A tap that declares `reflows` is outside it, and says why; one
 *   that `grows` holds what is at and above it.
 * - Proof: this spec, over `../layout-invariants/stays-put.ts`.
 * - Tolerance: a screen this spec does not walk.
 */

import {
  button,
  putAway,
  refuseWrites,
  type Tap,
} from "@tests/layout-invariants/stays-put"

import { happens, tap, walkEachPhone } from "./harness"

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
  target: (page) => page.locator("[data-take]"),
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
    grows:
      "the list below the button, by the take just made, the one it redoes folded under Earlier takes",
  },
  takes("starts another", "recording"),
  takes("stops it, and it is kept too", "ready"),
  happens("home", "home takes the take, and says since when"),
  happens("fill", "the phone fills up"),
  happens("free", "home takes some, so takes record again"),
]

/** Each keep answered as the walk says, before Keep is tapped. */
const KEEP: ReadonlyArray<Tap> = [
  happens("answer", "the shelf will fail", "failed"),
  button("Keep on this account", "keeps, failed"),
  happens("answer", "the shelf will keep it", "kept"),
  button("Keep on this account", "keeps, kept"),
]

/** A keep the shelf refuses, and the button it leaves disabled. */
const KEEP_INVALID: ReadonlyArray<Tap> = [
  happens("answer", "the shelf will refuse it, invalid", "invalid"),
  button("Keep on this account", "keeps, refused invalid"),
]

/** A full shelf: the refusal, and the shelf to make room from below. */
const KEEP_FULL: ReadonlyArray<Tap> = [
  happens("answer", "the shelf will say it is full", "full"),
  {
    ...button("Keep on this account", "keeps, the shelf full"),
    grows: "the kept shelf, below the button, to make room from",
  },
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
    grows: "the pairing form, below the buttons",
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
  button("Cancel", "cancels: the form below the buttons closes"),
]

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
  putAway("closes the refusal"),
]

walkEachPhone("a tap moves nothing it leaves on www's phone screens (HS1)", [
  // Over the page, with nothing on it to move: only its own controls.
  {
    panel: "www-storage",
    taps: STORAGE,
    label: "phone-full prompt",
    ready: null,
  },
  { panel: "www-take-full", taps: TAKE_FULL, label: "take item, phone full" },
  { panel: "www-keep", taps: KEEP, label: "keep on this account" },
  { panel: "www-keep", taps: KEEP_INVALID, label: "keep, invalid" },
  { panel: "www-keep", taps: KEEP_FULL, label: "keep, shelf full" },
  { panel: "www-home", taps: HOME, label: "settings, home" },
  { panel: "www-scout", taps: SCOUT, label: "jobs, scout" },
])
