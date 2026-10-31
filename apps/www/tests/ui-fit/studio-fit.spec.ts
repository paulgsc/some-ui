/**
 * Does every screen of the phone's Studio fit the phone? (#2252, STUDIO ST4.)
 *
 * Studio is an `apk` workspace, so it is swept on the phone page
 * (`./phone-page`; docs/ui-fit/README.md, 2f, says why that page exists),
 * mounted on fakes, opened on a video in each standing a screen needs
 * (`phone-page/fixtures.tsx`). This spec taps from each Start to the screens
 * that standing reaches, the way the owner would, measuring at each stop
 * with the panel sweep's own measure (`findViolations`).
 *
 * The sizes are the phone's alone (`PHONE_VIEWPORTS`): Studio is a phone
 * surface (`_apk`). The page's body scrolls as the route's does, so a tall
 * screen is not a finding here; a wide one is (the body scrolling sideways,
 * `wide` in `findViolations`), and so is a box that asserts a height its
 * content cannot fit.
 *
 * Run against a built phone page:
 *
 *   pnpm --filter www build:fit-phone
 *   pnpm --filter www test:e2e tests/ui-fit/studio-fit.spec.ts
 */

import { expect, test, type Page } from "@playwright/test"

import type { Stop } from "./harness"
import {
  expectPlantedSeen,
  findViolations,
  PHONE_VIEWPORTS,
  servePhonePage,
  tap,
  walk,
} from "./harness"
import type { PhoneId } from "./phone-page/fixtures"
import { fitReviewText } from "./phone-page/studio-seed"

/** Start's sitting rows carry their status in their name: match the head. */
const sitting = (kind: "Record" | "Watch" | "Shape" | "Finish"): RegExp =>
  new RegExp(`^${kind} `)

/**
 * The first stop of a walk waits for Start to have read the store: a build
 * without the fixture renders an empty slot, which fails here, soon.
 */
const start = (page: Page): Promise<void> =>
  page.getByRole("button", { name: sitting("Record") }).waitFor({
    timeout: 10_000,
  })

/** The planted fixtures, each by what the sweep must report it as. */
const PLANTED = {
  "planted-overflow": "leak",
  "planted-wide": "wide",
} as const satisfies Partial<Record<PhoneId, "leak" | "wide">>

/**
 * The walks, one per fixture, each in the order the owner meets the screens
 * from that Start. Keyed by every fixture but the planted ones, so a fixture
 * no walk reaches fails tsc.
 */
const WALKS: Record<
  Exclude<PhoneId, keyof typeof PLANTED>,
  ReadonlyArray<Stop>
> = {
  "studio-empty": [
    {
      // The wing's New idea button (`StudioHome`) is step 1's body here.
      screen: "Start, no video",
      go: async (page): Promise<void> => {
        await page.getByText("No video yet").waitFor({ timeout: 10_000 })
        await page.getByRole("link", { name: /^New idea/ }).waitFor()
      },
    },
  ],
  "studio-fresh": [
    { screen: "Start, nothing recorded", go: start },
    {
      screen: "Record, scene 1 before a take",
      go: (page) => tap(page, sitting("Record")),
    },
    { screen: "Record, recording", go: (page) => tap(page, "Start talking") },
    {
      screen: "Record, a take kept",
      go: async (page): Promise<void> => {
        await tap(page, "Done, keep it")
        await page.getByRole("button", { name: "Again" }).waitFor()
      },
    },
    {
      screen: "Done for now, how it went",
      go: (page) => tap(page, "Done for now"),
    },
    {
      screen: "Done for now, what got in the way",
      go: (page) => tap(page, "Some snags"),
    },
    {
      screen: "Done for now, saved",
      go: async (page): Promise<void> => {
        await tap(page, "The microphone")
        await page.getByText("Saved where you left it").waitFor()
      },
    },
    { screen: "Start, after a sitting", go: (page) => tap(page, "Not yet") },
    {
      // A plan other than the one in force, so its card says what it sets.
      screen: "Shape, the look",
      go: async (page): Promise<void> => {
        await tap(page, sitting("Shape"))
        await tap(page, "Lively")
      },
    },
    {
      screen: "Shape, the voice",
      go: async (page): Promise<void> => {
        await tap(page, "Next")
        await tap(page, "Read")
      },
    },
    {
      screen: "Finish, a scene without a take",
      go: async (page): Promise<void> => {
        await tap(page, "Keep this")
        await tap(page, sitting("Finish"))
      },
    },
    {
      screen: "Watch, before a render",
      go: async (page): Promise<void> => {
        await tap(page, "Back")
        await tap(page, sitting("Watch"))
      },
    },
    {
      screen: "History",
      go: async (page): Promise<void> => {
        await tap(page, "Back")
        await tap(page, "History")
      },
    },
    {
      screen: "Time spent",
      go: async (page): Promise<void> => {
        await tap(page, "Back")
        await tap(page, "Time spent")
      },
    },
  ],
  "studio-reviewed": [
    { screen: "Start, every scene taken", go: start },
    {
      screen: "Watch, a render with a change asked",
      go: async (page): Promise<void> => {
        await tap(page, sitting("Watch"))
        // The render and its review.json together, as Watch asks; the
        // change Claude applied sits at the render's first moment, so it
        // is asked before the playhead moves.
        await page.locator('input[type="file"]').setInputFiles([
          {
            name: "review.mp4",
            mimeType: "video/mp4",
            buffer: Buffer.from("v"),
          },
          {
            name: "review.json",
            mimeType: "application/json",
            buffer: Buffer.from(fitReviewText(2)),
          },
        ])
        await page.getByRole("button", { name: "Good" }).waitFor()
      },
    },
    {
      // Once the change is answered, the scene's idea is asked (ST5).
      screen: "Watch, whose idea a scene is",
      go: async (page): Promise<void> => {
        await tap(page, "Good")
        await page.getByRole("button", { name: "That's right" }).waitFor()
      },
    },
    {
      // Claude's idea, so putting it right asks where the owner's words are.
      screen: "Watch, where your own words are",
      go: async (page): Promise<void> => {
        await tap(page, "Not quite")
        await page
          .getByRole("button", { name: "In my take for this scene" })
          .waitFor()
      },
    },
    {
      // Left as it stands, then confirmed: no new version, so Finish below
      // still finds the version marked ready.
      screen: "Watch, the idea said",
      go: async (page): Promise<void> => {
        await page
          .getByLabel("Where it came from")
          .fill(
            "From the notebook I kept through week 8, the page where the model called Detroit."
          )
        await tap(page, "Leave it as it stands")
        await tap(page, "That's right")
        await page.getByText("Kept: whose idea it is.").waitFor()
      },
    },
    {
      screen: "Finish, ready for YouTube",
      go: async (page): Promise<void> => {
        await tap(page, "Back")
        await tap(page, sitting("Finish"))
      },
    },
    {
      // Record resumes on the scene of the last take kept: the last one,
      // whose Keep carries its longest label.
      screen: "Record, the last scene with its take",
      go: async (page): Promise<void> => {
        await tap(page, "Back")
        await tap(page, sitting("Record"))
        await page
          .getByRole("button", { name: /^Keep · that's every scene/ })
          .waitFor()
      },
    },
    {
      screen: "Record, an earlier scene with its take",
      go: async (page): Promise<void> => {
        await tap(page, "Previous scene")
        await page.getByRole("button", { name: /^Keep · next scene/ }).waitFor()
      },
    },
  ],
  idea: [
    {
      screen: "New idea, the first question",
      go: (page) =>
        page.getByRole("button", { name: "Say it" }).waitFor({
          timeout: 10_000,
        }),
    },
    { screen: "New idea, typed", go: (page) => tap(page, "Type instead") },
    {
      screen: "New idea, the next question",
      go: async (page): Promise<void> => {
        await page
          .getByRole("textbox")
          .fill(
            "A short on the week the model called Detroit and what it got wrong."
          )
        await tap(page, "Keep these words")
      },
    },
  ],
}

const PAGE = servePhonePage()

test.describe.configure({ timeout: 3 * 60 * 1000 })

test.describe("every screen of the phone's Studio fits the phone", () => {
  PAGE.skipUnbuilt()

  for (const phone of PHONE_VIEWPORTS) {
    test(`fits at ${phone.name} (${phone.width}x${phone.height})`, async ({
      page,
    }) => {
      PAGE.expectBuilt()
      await page.setViewportSize({ width: phone.width, height: phone.height })
      const errors: Array<string> = []
      page.on("pageerror", (error) => errors.push(error.message))

      const failures: Array<string> = []
      for (const [fixture, stops] of Object.entries(WALKS)) {
        await page.goto(PAGE.url(fixture), { waitUntil: "load" })
        failures.push(...(await walk(page, stops, fixture, errors)))
      }

      expect(errors, errors.join("\n")).toEqual([])
      expect(failures, failures.join("\n")).toEqual([])
    })
  }

  /**
   * The phone page is its own build with its own slot (`phone-page/main.tsx`),
   * so panel-fit's planted panel proves nothing about it: a slot here that
   * stopped holding the screen would leave every walk above measuring nothing,
   * and a body whose scroll hid a screen wider than the phone would pass every
   * walk however wide its screens grew.
   */
  for (const [fixture, planted] of Object.entries(PLANTED)) {
    test(`the planted ${planted} (${fixture}) is seen`, async ({ page }) => {
      PAGE.expectBuilt()
      await page.setViewportSize({ width: 360, height: 780 })
      const errors: Array<string> = []
      page.on("pageerror", (error) => errors.push(error.message))
      await page.goto(PAGE.url(fixture), { waitUntil: "load" })
      await page.waitForTimeout(250)
      expectPlantedSeen(await findViolations(page), errors, planted)
    })
  }
})
