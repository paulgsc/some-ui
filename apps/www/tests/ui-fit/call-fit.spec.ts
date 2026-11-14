/**
 * CF1 (`@some-ui/video-render`'s `call-fit.ts`): the model never says a page
 * is shorter than the stage's real frame draws it, and no page of a week it
 * accepts overflows, for the weeks of `./panel-page/call-weeks.ts` and the
 * week of 2026-11-06. The page computes the model, being built with the
 * stage; this reads what it publishes.
 *
 *   pnpm --filter www build:fit
 *   pnpm --filter www test:ui-fit tests/ui-fit/call-fit.spec.ts
 */

import { expect, test, type Page } from "@playwright/test"
import { readPinned } from "@some-ui/video-render/node"
import { NOV_6_WEEK } from "@some-ui/video-render/testing"

import { CALL_STAGE_FIXTURE, servePanelPage } from "./harness"

const PAGE = servePanelPage()

test.describe.configure({ timeout: 4 * 60 * 1000 })

type Drawn = {
  readonly id: string
  readonly overflows: boolean
  /** The picture's height as drawn, in px. */
  readonly height: number
  /** The picture's height as the model says, in px, where it says one. */
  readonly model: number | null
}

/** The page of `week`, given or named, drawn and measured. */
async function draw(
  page: Page,
  week: { readonly named: string } | { readonly given: unknown }
): Promise<{ accepted: boolean; scenes: ReadonlyArray<Drawn> }> {
  if ("given" in week)
    await page.addInitScript((data) => {
      Object.assign(window, { __CALL_FIT_WEEK__: data })
    }, week.given)
  const name = "given" in week ? "given" : week.named
  await page.goto(`${PAGE.url(CALL_STAGE_FIXTURE)}&week=${name}`, {
    waitUntil: "load",
  })
  await page.locator("[data-call-fit] [data-scene]").first().waitFor()
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((done) => requestAnimationFrame(() => done(null)))
  })
  const accepted =
    (await page.locator("[data-call-fit]").getAttribute("data-call-fit")) ===
    "accepted"
  const scenes = await page.$$eval("[data-call-fit] [data-model]", (boxes) =>
    boxes.map((box) => {
      const frame = box.querySelector("[data-scene]")
      const picture = frame?.children[1]?.firstElementChild
      const model = box.getAttribute("data-model")
      return {
        id: frame?.getAttribute("data-scene") ?? "",
        overflows: frame?.getAttribute("data-overflow") === "true",
        height: picture ? picture.getBoundingClientRect().height : 0,
        model: model === null ? null : Number(model),
      }
    })
  )
  return { accepted, scenes }
}

async function expectHeld(
  page: Page,
  name: string,
  week: { readonly named: string } | { readonly given: unknown }
): Promise<boolean> {
  const { accepted, scenes } = await draw(page, week)
  expect(scenes.length, name).toBeGreaterThan(0)
  const under = scenes.flatMap((scene) =>
    scene.model !== null && scene.height > scene.model + 0.5
      ? [
          `${scene.id}: drawn ${scene.height.toFixed(1)} px, model ${scene.model.toFixed(1)}`,
        ]
      : []
  )
  expect(under, `${name}: the model says these are shorter than drawn`).toEqual(
    []
  )
  if (accepted)
    expect(
      scenes.filter((scene) => scene.overflows).map((scene) => scene.id),
      `${name}: accepted, and these overflow`
    ).toEqual([])
  return accepted
}

test.describe("CF1: the call's model holds the frame the stage draws", () => {
  PAGE.skipUnbuilt()

  test.beforeEach(async ({ page }) => {
    PAGE.expectBuilt()
    await page.setViewportSize({ width: 1920, height: 1080 })
  })

  test("the sample week", async ({ page }) => {
    expect(await expectHeld(page, "sample", { named: "sample" })).toBe(true)
  })

  test("the week of 2026-11-06", async ({ page }) => {
    const given = await readPinned(NOV_6_WEEK)
    test.skip(given === null, "paulgsc/testing can't be read here")
    expect(await expectHeld(page, "2026-11-06", { given })).toBe(true)
  })

  test("every list at its longest", async ({ page }) => {
    expect(await expectHeld(page, "longest", { named: "longest" })).toBe(true)
  })

  test("every free text at the most the model accepts", async ({ page }) => {
    await page.goto(`${PAGE.url(CALL_STAGE_FIXTURE)}&week=none`)
    const limits = Number(
      await page
        .locator("[data-call-fit-limits]")
        .getAttribute("data-call-fit-limits")
    )
    expect(limits).toBeGreaterThan(0)
    for (let n = 1; n <= limits; n += 1)
      expect(
        await expectHeld(page, `limit-${String(n)}`, {
          named: `limit-${String(n)}`,
        })
      ).toBe(true)
  })
})
