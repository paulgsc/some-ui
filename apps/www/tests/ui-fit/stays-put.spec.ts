/**
 * Promise HS1.
 * - Claim: on a phone screen, a tap or key that leaves you on that screen
 *   moves no tap target still on it: what a tap brings up (a refusal, a
 *   "Typo?", a preview, a hint) keeps its room whether it shows or not, or
 *   comes after the last control.
 * - Family: every tap each walk below takes, at each of `PHONE_VIEWPORTS`
 *   (the phone held sideways among them); for aph's logger, mine and theirs,
 *   every digit from an empty figure to one past the longest, approx on and
 *   off, each checkpoint, a label, an earlier and a later day, a save kept
 *   and a save refused; for History's entry sheet, my figure retyped, approx,
 *   a save refused, a label tapped off down to the last one; for History's
 *   drafts, a submit refused. A tap that declares `reflows` (Mine/Theirs, "N
 *   older") is outside it, and says why.
 * - Proof: this spec, which takes every tap and compares every target's box
 *   before and after (`../layout-invariants/stays-put.ts`), and fails on the
 *   planted shift if the measure goes blind.
 * - Tolerance: a screen this spec does not walk. `Reserved`
 *   (@some-ui/shared) is the room a new one keeps; a walk here is how it is
 *   held.
 *
 * Run against a built phone page:
 *
 *   pnpm --filter www build:fit-phone
 *   pnpm --filter www test:ui-fit tests/ui-fit/stays-put.spec.ts
 */

import { expect, test, type Page } from "@playwright/test"
import { holdStill, type Tap } from "@tests/layout-invariants/stays-put"

import { PHONE_VIEWPORTS, servePhonePage } from "./harness"

const PAGE = servePhonePage()

/** Where a tap looks for its control: the page, or the sheet open on it. */
type Scope = (page: Page) => Pick<Page, "getByRole">

const onPage: Scope = (page) => page
const inSheet: Scope = (page) => page.getByRole("dialog")

const key = (k: string): Tap => ({
  does: `types ${k}`,
  act: (page) => page.getByRole("button", { name: k, exact: true }).click(),
})

const button = (
  name: string | RegExp,
  does: string,
  scope: Scope = onPage
): Tap => ({
  does,
  act: (page) => scope(page).getByRole("button", { name }).first().click(),
})

const radio = (name: string | RegExp, does: string): Tap => ({
  does,
  act: (page) => page.getByRole("radio", { name }).first().click(),
})

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

/** The logger, mine: 5,100 typed digit by digit, past its last digit, and saved. */
const LOG_MINE: ReadonlyArray<Tap> = [
  key("5"),
  key("1"),
  key("0"),
  key("0"),
  key("0"),
  key("Delete digit"),
  button("~ approx", "turns approx off"),
  button("~ approx", "turns approx on"),
  button(/^Plus/, "nudges up"),
  button(/^Minus/, "nudges down"),
  radio(/12:00/, "picks 12:00"),
  radio(/Other/, "picks Other"),
  radio(/7:00/, "picks 7:00"),
  button("no-bs", "labels it no-bs"),
  button(/^Save/, "saves a draft"),
  button("Earlier day", "goes a day back, while today holds a draft"),
  button("Later day", "comes back to today"),
  refuseWrites,
  key("9"),
  button(/^(Save|Replace)/, "saves, refused"),
]

/** The logger, theirs: a figure typed against the newest entry waiting. */
const LOG_THEIRS: ReadonlyArray<Tap> = [
  {
    ...radio(/^Theirs/, "switches to theirs"),
    reflows: "mode: theirs is another form, with no day or labels",
  },
  key("5"),
  key("1"),
  key("0"),
  key("0"),
  key("0"),
  key("Delete digit"),
  {
    ...button(/older$/, "shows the older entries"),
    reflows: "disclosure: the list grows by what was asked for",
  },
  refuseWrites,
  button(/^Save theirs/, "saves theirs, refused"),
]

/** History's entry sheet, on an entry awaiting theirs. */
const ENTRY_SHEET: ReadonlyArray<Tap> = [
  {
    does: "opens an entry",
    act: (page) =>
      page
        .getByRole("button", { name: /^[0-9:]+: Awaiting/ })
        .first()
        .click(),
    reflows: "screen: the sheet opens",
  },
  {
    does: "retypes my figure",
    act: (page) =>
      inSheet(page).getByRole("textbox", { name: /mine/i }).fill("51000"),
  },
  button("~ approx", "turns approx off", inSheet),
  button("~ approx", "turns approx on", inSheet),
  button("no-bs", "labels it no-bs", inSheet),
  button("w-o-bs", "labels it w-o-bs", inSheet),
  button("no-bs", "takes no-bs off", inSheet),
  refuseWrites,
  button("Save", "saves my figure, refused", inSheet),
]

/** History's drafts, after the logger saved one. */
const DRAFTS: ReadonlyArray<Tap> = [
  button("Pick all", "picks every draft"),
  refuseWrites,
  button(/^Submit/, "submits, refused"),
]

async function open(page: Page, panel: string): Promise<Array<string>> {
  const errors: Array<string> = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto(PAGE.url(panel), { waitUntil: "load" })
  await expect(page.locator("[data-fit-slot] button").first()).toBeVisible()
  return errors
}

test.describe("a tap moves nothing it leaves on the screen (HS1)", () => {
  PAGE.skipUnbuilt()

  test("the measure sees a planted shift", async ({ page }) => {
    PAGE.expectBuilt()
    await open(page, "planted-shift")
    const failures = await holdStill(
      page,
      [button("Bring a line up", "brings a line up")],
      "planted"
    )
    expect(
      failures.some((f) => f.includes("Planted target")),
      `A line mounted above "Planted target" moves it. If this is not ` +
        `reported, every walk below measures nothing: ${failures.join("\n")}`
    ).toBe(true)
  })

  for (const phone of PHONE_VIEWPORTS) {
    test(`aph at ${phone.name} (${phone.width}x${phone.height})`, async ({
      page,
    }) => {
      PAGE.expectBuilt()
      await page.setViewportSize({ width: phone.width, height: phone.height })
      const failures: Array<string> = []

      // Each walk on a fresh page: the writes are kept again, and the draft
      // the first saved stays in this page's storage for History.
      const walks = [
        ["aph-log", LOG_MINE, "aph log, mine"],
        ["aph-log", LOG_THEIRS, "aph log, theirs"],
        ["aph-history", DRAFTS, "aph history, drafts"],
        ["aph-history", ENTRY_SHEET, "aph entry sheet"],
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
