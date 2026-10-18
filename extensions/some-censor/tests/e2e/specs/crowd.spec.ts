/**
 * BOYO — the crowd is gone (#1802, QD14)
 *
 * C1 — Every crowd number and age in the fixture is hidden by a crowd rule:
 *      the nearest element on its path that is `display: none` is one a
 *      crowd selector names.
 * C2 — No crowd rule hides what a card keeps (title, channel name,
 *      duration) or the controls beside a number: anything hiding one is
 *      its card, absent by its evidence.
 */

import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { crowdRules } from "@censor/lib/content/__tests__/crowd-css"
import { expect, test } from "@censor/playwright/fixture"
import type { Page } from "@playwright/test"

const CSS = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../src/styles/content.css"
  ),
  "utf8"
)
const CROWD = crowdRules(CSS).map((r) => r.selector)

/** What the nearest `display: none` element on a path is. */
type Hider = "none" | "crowd" | "card" | "other"
type Verdict = { readonly label: string; readonly hider: Hider }

test.beforeAll(() => {
  // Without it, an empty parse would make C2 pass with nothing to spare.
  expect(CROWD.length).toBeGreaterThan(20)
})

/**
 * For each element carrying `attr`, what hides it: nothing, a crowd rule, the
 * card it sits in (stamped absent), or anything else.
 */
async function verdicts(
  page: Page,
  attr: "data-crowd" | "data-keep"
): Promise<Array<Verdict>> {
  return page.evaluate(
    ([a, selectors]) =>
      [...document.querySelectorAll(`[${a}]`)].map((el) => {
        let n: Element | null = el
        while (n !== null && getComputedStyle(n).display !== "none") {
          n = n.parentElement
        }
        const hider = n
        const kind =
          hider === null
            ? "none"
            : selectors.some((s) => hider.matches(s))
              ? "crowd"
              : hider.getAttribute("data-boyo") === "absent"
                ? "card"
                : "other"
        return { label: el.getAttribute(a) ?? "", hider: kind }
      }),
    [attr, CROWD] as const
  )
}

test("C1: every crowd number and age is hidden by a crowd rule", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-crowd")
  await fixture.pollDebug(page, (d) => d.phase === "running", {
    timeout: 8000,
  })

  const crowd = await verdicts(page, "data-crowd")
  expect(crowd.length).toBeGreaterThan(20)
  for (const { label, hider } of crowd) {
    expect(hider, label).toBe("crowd")
  }
})

test("C2: no crowd rule hides what a card keeps, or a button", async ({
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

  const kept = await verdicts(page, "data-keep")
  expect(kept.length).toBeGreaterThan(10)
  for (const { label, hider } of kept) {
    expect(["none", "card"], label).toContain(hider)
  }
})
