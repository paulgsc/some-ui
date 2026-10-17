/**
 * BOYO — the popup's settings reach an open tab (#1807)
 *
 * S1 — Changing the boundary in the popup re-decides the cards of an open
 *      tab without a reload, and every stamp moves straight from one value
 *      to the other: no card is ever unstamped on the way.
 * S2 — The switch stops and restarts the runtime in that tab.
 */

import { expect, test } from "@censor/playwright/fixture"
import type { Page } from "@playwright/test"

/** "2 years ago": plated under one year, absent under two. */
const MOVES = "vid_ccc333"
/** "3 years ago": plated under either. */
const STAYS = "vid_aaa111"

/** Every value `data-boyo` takes on `videoId`'s elements from now on. */
async function recordStamps(page: Page, videoId: string): Promise<void> {
  await page.evaluate((vid) => {
    const seen: Array<string | null> = []
    Reflect.set(window, "__STAMPS__", seen)
    new MutationObserver((records) => {
      for (const r of records) {
        if (
          r.target instanceof HTMLElement &&
          r.target.dataset["boyoVid"] === vid
        )
          seen.push(r.target.getAttribute("data-boyo"))
      }
    }).observe(document.body, {
      attributes: true,
      attributeFilter: ["data-boyo"],
      subtree: true,
    })
  }, videoId)
}

async function stamps(page: Page): Promise<Array<unknown>> {
  const seen = await page.evaluate((): unknown =>
    Reflect.get(window, "__STAMPS__")
  )
  const list: Array<unknown> = Array.isArray(seen) ? seen : []
  return list
}

test("S1: the boundary re-decides an open tab, stamp to stamp", async ({
  context,
  extensionId,
  fixture,
}) => {
  const page = await fixture.goto("yt-home")
  await fixture.pollDebug(
    page,
    (d) => d.entries[MOVES]?.viewKind === "plated" && STAYS in d.entries
  )
  await recordStamps(page, MOVES)

  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)

  await popup.getByRole("button", { name: "2 years" }).click()
  await expect(popup.getByRole("button", { name: "2 years" })).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  const raised = await fixture.pollDebug(
    page,
    (d) => d.entries[MOVES]?.viewKind === "absent"
  )
  expect(raised.entries[STAYS]?.viewKind).toBe("plated")
  expect(await fixture.fixtureCall(page, "dataBoyoFor", MOVES)).toBe("absent")

  await popup.getByRole("button", { name: "1 year" }).click()
  await fixture.pollDebug(page, (d) => d.entries[MOVES]?.viewKind === "plated")

  const seen = await stamps(page)
  expect(seen.length).toBeGreaterThan(0)
  expect(seen.every((v) => v === "absent" || v === "plated")).toBe(true)
})

test("S2: the switch stops and restarts the open tab", async ({
  context,
  extensionId,
  fixture,
}) => {
  const page = await fixture.goto("yt-home")
  await fixture.pollDebug(
    page,
    (d) => d.phase === "running" && MOVES in d.entries
  )

  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  const toggle = popup.getByRole("switch")

  await toggle.click()
  await expect(toggle).toHaveAttribute("aria-checked", "false")
  await fixture.pollDebug(page, (d) => d.phase === "idle")
  expect(await fixture.fixtureCall(page, "dataBoyoFor", MOVES)).toBeNull()

  await toggle.click()
  await fixture.pollDebug(
    page,
    (d) => d.phase === "running" && d.entries[MOVES]?.viewKind === "plated"
  )
})
