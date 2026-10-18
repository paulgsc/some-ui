/**
 * BOYO — the crowd is gone (#1802, QD14)
 *
 * C1 — Every crowd number and age in the fixture is hidden by a crowd rule:
 *      the nearest element that is `display: none` is not a card the
 *      evidence made absent.
 * C2 — What a card keeps (title, channel name, duration), and the controls
 *      beside a number, are still rendered.
 */

import { expect, test } from "@censor/playwright/fixture"

type Verdict = { readonly label: string; readonly hiddenBy: string | null }

test("C1: every crowd number and age is hidden by a crowd rule, not by its card", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-crowd")
  await fixture.pollDebug(page, (d) => d.phase === "running", {
    timeout: 8000,
  })

  const verdicts = await page.evaluate((): Array<Verdict> => {
    const out: Array<Verdict> = []
    for (const el of document.querySelectorAll("[data-crowd]")) {
      let hidden: Element | null = null
      for (let n: Element | null = el; n !== null; n = n.parentElement) {
        if (getComputedStyle(n).display === "none") {
          hidden = n
          break
        }
      }
      out.push({
        label: el.getAttribute("data-crowd") ?? "",
        hiddenBy:
          hidden === null
            ? null
            : hidden.hasAttribute("data-boyo")
              ? "its card"
              : "a crowd rule",
      })
    }
    return out
  })

  expect(verdicts.length).toBeGreaterThan(20)
  for (const { label, hiddenBy } of verdicts) {
    expect(hiddenBy, label).toBe("a crowd rule")
  }
})

test("C2: a card's title, channel and duration, and the buttons, stay rendered", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-crowd")
  await fixture.pollDebug(
    page,
    (d) =>
      d.phase === "running" &&
      d.entries["vid_crowd01"]?.viewKind === "plated" &&
      d.entries["vid_crowd02"]?.viewKind === "plated",
    { timeout: 8000 }
  )

  const kept = page.locator("[data-keep]")
  const count = await kept.count()
  expect(count).toBeGreaterThan(10)
  for (let i = 0; i < count; i += 1) {
    const el = kept.nth(i)
    await expect(el, (await el.getAttribute("data-keep")) ?? "").toBeVisible()
  }
})
