/**
 * Does every screen of the phone's Studio fit the phone? (#2252, STUDIO ST4.)
 *
 * The panel sweep (`./panel-fit.spec.ts`) cannot see Studio: its page is
 * built under the `lan` profile, which stubs every `apk` workspace, and
 * `@some-ui/soundbites` is one. So the phone page (`./phone-page`, built by
 * `pnpm --filter www build:fit-phone` under the Android app's profile)
 * mounts Studio on fakes, opened on a video in each standing a screen
 * needs (`phone-page/fixtures.tsx`), and this spec taps from each Start to
 * the screens that standing reaches, the way the owner would, measuring at
 * each stop with the panel sweep's own measure (`findViolations`).
 *
 * The sizes are the phone's alone (`PHONE_VIEWPORTS`): Studio is a phone
 * surface (`_apk`). The page's body scrolls as the route's does, so a tall
 * screen is not a finding here; a wide one is, and so is a box that asserts
 * a height its content cannot fit.
 *
 * Run against a built phone page:
 *
 *   pnpm --filter www build:fit-phone
 *   pnpm --filter www test:e2e tests/ui-fit/studio-fit.spec.ts
 */

import { expect, test, type Page } from "@playwright/test"

import {
  describeViolation,
  findViolations,
  PHONE_VIEWPORTS,
  servePhonePage,
} from "./harness"
import type { PhoneId } from "./phone-page/fixtures"
import { fitReviewText } from "./phone-page/studio-seed"

type Stop = {
  readonly screen: string
  readonly go: (page: Page) => Promise<void>
}

type Walk = {
  readonly fixture: PhoneId
  readonly stops: ReadonlyArray<Stop>
}

const tap = (page: Page, name: string | RegExp): Promise<void> =>
  page.getByRole("button", { name }).first().click()

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

/** The walks, each in the order the owner meets the screens from that Start. */
const WALKS: ReadonlyArray<Walk> = [
  {
    fixture: "studio-empty",
    stops: [
      {
        screen: "Start, no video",
        go: (page) =>
          page.getByText("No video yet").waitFor({ timeout: 10_000 }),
      },
    ],
  },
  {
    fixture: "studio-fresh",
    stops: [
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
  },
  {
    fixture: "studio-reviewed",
    stops: [
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
          await page
            .getByRole("button", { name: /^Keep · next scene/ })
            .waitFor()
        },
      },
    ],
  },
  {
    fixture: "idea",
    stops: [
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
  },
]

const PLANTED_OVERFLOW: PhoneId = "planted-overflow"

const PAGE = servePhonePage()

test.describe.configure({ timeout: 3 * 60 * 1000 })

test.describe("every screen of the phone's Studio fits the phone", () => {
  PAGE.skipUnbuilt()

  test("the phone page is built, and every fixture on it is walked", async ({
    page,
  }) => {
    PAGE.expectBuilt()
    // `PhoneId` typing catches a walked id with no fixture. It cannot catch
    // the reverse: a fixture added to the page that no walk names, which
    // would sit there unmeasured.
    await page.goto(PAGE.url())
    const walked = new Set<string>([
      ...WALKS.map((walk) => walk.fixture),
      PLANTED_OVERFLOW,
    ])
    const unwalked = (
      await page.locator("[data-fit-panels] li").allTextContents()
    ).filter((panel) => !walked.has(panel))
    expect(
      unwalked,
      `These fixtures are on the phone page but no walk reaches them; add ` +
        `each to WALKS: ${unwalked.join(", ")}`
    ).toEqual([])
  })

  for (const phone of PHONE_VIEWPORTS) {
    test(`fits at ${phone.name} (${phone.width}x${phone.height})`, async ({
      page,
    }) => {
      PAGE.expectBuilt()
      await page.setViewportSize({ width: phone.width, height: phone.height })
      const errors: Array<string> = []
      page.on("pageerror", (error) => errors.push(error.message))

      const failures: Array<string> = []
      for (const walk of WALKS) {
        await page.goto(PAGE.url(walk.fixture), { waitUntil: "load" })
        for (const stop of walk.stops) {
          const where = `${walk.fixture}: ${stop.screen}`
          await stop.go(page)
          // Let a screen that just changed settle before measuring.
          await page.waitForTimeout(250)
          const { mounted, violations } = await findViolations(page)
          if (!mounted) {
            failures.push(`${where}: rendered nothing. ${errors.join(" | ")}`)
            continue
          }
          for (const violation of violations) {
            failures.push(describeViolation(where, violation))
          }
        }
      }

      expect(errors, errors.join("\n")).toEqual([])
      expect(failures, failures.join("\n")).toEqual([])
    })
  }

  /**
   * The guard the doctrine asks for: plant a box that cannot fit and confirm
   * the measurement sees it, on the same built page as the screens, so a
   * harness that silently measured nothing fails here instead of reporting
   * every screen above as fitting.
   */
  test("a box that overflows its height is seen", async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 })
    const errors: Array<string> = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.goto(PAGE.url(PLANTED_OVERFLOW), { waitUntil: "load" })
    await page.waitForTimeout(250)
    const { mounted, violations } = await findViolations(page)

    expect(
      mounted,
      `The planted box rendered nothing: ${errors.join(" | ")}`
    ).toBe(true)
    expect(
      violations.some(
        (violation) =>
          violation.kind === "leak" &&
          violation.classes.includes("planted-panel")
      ),
      `The planted box holds 900px of content in 120px and does not clip ` +
        `it. If this is not reported, the sweep above is measuring nothing: ` +
        `${JSON.stringify(violations)}`
    ).toBe(true)
  })
})
