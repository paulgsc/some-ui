/**
 * Does every screen of the phone's incident session fit the phone? (#1922.)
 *
 * The panel sweep (`./panel-fit.spec.ts`) measures each fixture as it loads,
 * which for LeetType is the rounds the panel opens on. A session file's
 * screens are reached only by playing it, so this sweep plays one: the
 * `leetype-incident` fixture holds a session file written to make every
 * kind of screen as full as a file can (`./panel-page/incident-session.ts`),
 * and each step below taps the way a learner would, then measures what
 * leaves the rect with the panel sweep's own measure (`findViolations`).
 *
 * The sizes are the phone's alone (`PHONE_VIEWPORTS`): the incident session
 * is a phone surface (`ON_PHONE` in www).
 *
 * Run against a built panel page:
 *
 *   pnpm --filter www build:fit
 *   pnpm --filter www test:ui-fit
 */

import { expect, test, type Page } from "@playwright/test"

import {
  describeViolation,
  findViolations,
  INCIDENT_FIXTURE,
  PHONE_VIEWPORTS,
  servePanelPage,
} from "./harness"

type Stop = {
  readonly screen: string
  readonly go: (page: Page) => Promise<void>
}

const tap = (page: Page, name: string | RegExp): Promise<void> =>
  page.getByRole("button", { name }).first().click()

/** The walk, in the order a learner meets each kind of screen. */
const WALK: ReadonlyArray<Stop> = [
  {
    screen: "the card holding the file",
    // A build without this fixture renders an empty slot: fail on it soon.
    go: (page) =>
      page.getByRole("button", { name: /^Play / }).waitFor({ timeout: 10_000 }),
  },
  { screen: "first screen", go: (page) => tap(page, /^Play /) },
  { screen: "info screen", go: (page) => tap(page, /the whole session/) },
  {
    screen: "round, before the pick",
    go: (page) => tap(page, "Start with incident 1"),
  },
  {
    screen: "round, a struggle's reveal",
    go: (page) => tap(page, /^Three machines is too small/),
  },
  {
    screen: "round, the worked answer",
    go: (page) => tap(page, "Show the worked answer"),
  },
  { screen: "reading, a placement", go: (page) => tap(page, "Continue") },
  {
    screen: "rounds waiting, during play",
    go: (page) => tap(page, "Rounds waiting"),
  },
  {
    screen: "round, a correct pick's reveal",
    go: async (page): Promise<void> => {
      await tap(page, "Rounds waiting")
      await tap(page, "Save it; this round waits")
      await tap(page, /^Hear back from a majority/)
    },
  },
  { screen: "reading, a pointer", go: (page) => tap(page, "Continue") },
  { screen: "the take's choice", go: (page) => tap(page, "Skip") },
  {
    screen: "record, the microphone",
    go: (page) => tap(page, /^Incident 1: the writes/),
  },
  { screen: "record, typed", go: (page) => tap(page, "Type it instead") },
  {
    screen: "record, the rubric",
    go: async (page): Promise<void> => {
      await page
        .getByLabel("Your answer, typed")
        .fill("The OK came before a majority held the write.")
      await tap(page, "Done")
    },
  },
  {
    screen: "reading, after a weak take",
    go: async (page): Promise<void> => {
      await page.getByRole("checkbox").first().check()
      await tap(page, "Done")
    },
  },
  {
    screen: "end screen",
    go: (page) => tap(page, "Skip; the take waits"),
  },
  {
    screen: "first screen, with what waits",
    go: async (page): Promise<void> => {
      await tap(page, "Done")
      await tap(page, /^Play /)
      await tap(page, "Show the worked answer")
      await tap(page, "Show what a good answer says")
    },
  },
]

const PAGE = servePanelPage()

test.describe.configure({ timeout: 2 * 60 * 1000 })

test.describe("every screen of the incident session fits the phone", () => {
  PAGE.skipUnbuilt()

  for (const phone of PHONE_VIEWPORTS) {
    test(`fits at ${phone.name} (${phone.width}x${phone.height})`, async ({
      page,
    }) => {
      PAGE.expectBuilt()
      await page.setViewportSize({ width: phone.width, height: phone.height })
      const errors: Array<string> = []
      page.on("pageerror", (error) => errors.push(error.message))
      await page.goto(PAGE.url(INCIDENT_FIXTURE), { waitUntil: "load" })

      const failures: Array<string> = []
      for (const stop of WALK) {
        await stop.go(page)
        // The reveal scrolls itself into view; let it settle before measuring.
        await page.waitForTimeout(250)
        const { mounted, violations } = await findViolations(page)
        if (!mounted) {
          failures.push(
            `${stop.screen}: rendered nothing. ${errors.join(" | ")}`
          )
          continue
        }
        for (const violation of violations) {
          failures.push(describeViolation(stop.screen, violation))
        }
      }

      expect(errors, errors.join("\n")).toEqual([])
      expect(failures, failures.join("\n")).toEqual([])
    })
  }
})
