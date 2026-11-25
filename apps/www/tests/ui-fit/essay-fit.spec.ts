/**
 * EF1 (`@some-ui/video-render`'s `essay-fit.ts`): the model never says a
 * question, best, beside or deep dive scene is shorter than the stage's real frame
 * draws it, and no such scene of an essay it accepts overflows or cuts off a
 * code line, for the essays of `./panel-page/essays.ts`. The page computes
 * the model, being built with the stage; this reads what it publishes.
 *
 *   pnpm --filter www build:fit
 *   pnpm --filter www test:ui-fit tests/ui-fit/essay-fit.spec.ts
 */

import { expect, test, type Page } from "@playwright/test"

import { ESSAY_STAGE_FIXTURE, servePanelPage } from "./harness"

const PAGE = servePanelPage()

test.describe.configure({ timeout: 4 * 60 * 1000 })

type Drawn = {
  readonly id: string
  readonly overflows: boolean
  /** A code block wider than its box, which the frame clips unseen. */
  readonly clipped: boolean
  /** The card's content as drawn, from its tag's top to its last part's foot, in px. */
  readonly height: number
  readonly model: number
}

async function draw(
  page: Page,
  name: string
): Promise<{ accepted: boolean; scenes: ReadonlyArray<Drawn> }> {
  await page.goto(`${PAGE.url(ESSAY_STAGE_FIXTURE)}&essay=${name}`, {
    waitUntil: "load",
  })
  await page.locator("[data-essay-fit] [data-scene]").first().waitFor()
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((done) => requestAnimationFrame(() => done(null)))
  })
  const accepted =
    (await page.locator("[data-essay-fit]").getAttribute("data-essay-fit")) ===
    "accepted"
  const scenes = await page.$$eval("[data-essay-fit] [data-model]", (boxes) =>
    boxes.map((box) => {
      const frame = box.querySelector("[data-scene]")
      const card = frame?.children[1]?.firstElementChild?.children[1]
      const top = card?.firstElementChild?.getBoundingClientRect().top ?? 0
      const foot = card?.lastElementChild?.getBoundingClientRect().bottom ?? 0
      return {
        id: frame?.getAttribute("data-scene") ?? "",
        overflows: frame?.getAttribute("data-overflow") === "true",
        clipped: [...(card?.querySelectorAll("pre") ?? [])].some(
          (pre) => pre.scrollWidth > pre.clientWidth + 1
        ),
        height: foot - top,
        model: Number(box.getAttribute("data-model")),
      }
    })
  )
  return { accepted, scenes }
}

async function expectHeld(page: Page, name: string): Promise<boolean> {
  const { accepted, scenes } = await draw(page, name)
  expect(
    scenes.flatMap((scene) =>
      scene.height > scene.model + 0.5
        ? [
            `${scene.id}: drawn ${scene.height.toFixed(1)} px, model ${scene.model.toFixed(1)}`,
          ]
        : []
    ),
    `${name}: the model says these are shorter than drawn`
  ).toEqual([])
  if (accepted)
    expect(
      scenes
        .filter((scene) => scene.overflows || scene.clipped)
        .map((scene) => scene.id),
      `${name}: accepted, and these overflow or clip their code`
    ).toEqual([])
  return accepted
}

test.describe("EF1: the essay's model holds the frame the stage draws", () => {
  PAGE.skipUnbuilt()

  test.beforeEach(async ({ page }) => {
    PAGE.expectBuilt()
    await page.setViewportSize({ width: 1920, height: 1080 })
  })

  test("the sample essay", async ({ page }) => {
    expect(await expectHeld(page, "sample")).toBe(true)
  })

  test("points answered by takes of their own, each cited (RR24)", async ({
    page,
  }) => {
    expect(await expectHeld(page, "by-points")).toBe(true)
  })

  test("w47's HF-202, whose question scene ran past the frame (#3547)", async ({
    page,
  }) => {
    expect(await expectHeld(page, "hf-202")).toBe(true)
  })

  test("a fork scene holds its table and its place between A and A′ (RR29)", async ({
    page,
  }) => {
    await page.goto(`${PAGE.url(ESSAY_STAGE_FIXTURE)}&essay=forks`, {
      waitUntil: "load",
    })
    const frame = page.locator("[data-fork] [data-scene]")
    await frame.first().waitFor()
    await page.evaluate(() => document.fonts.ready)
    expect(await frame.count()).toBe(1)
    expect(await frame.first().getAttribute("data-overflow")).not.toBe("true")
  })

  test("every text and the code at the most the model accepts", async ({
    page,
  }) => {
    await page.goto(`${PAGE.url(ESSAY_STAGE_FIXTURE)}&essay=none`)
    const limits = Number(
      await page
        .locator("[data-essay-fit-limits]")
        .getAttribute("data-essay-fit-limits")
    )
    for (let n = 1; n <= limits; n += 1)
      expect(await expectHeld(page, `limit-${String(n)}`)).toBe(true)
  })
})
