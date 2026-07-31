/**
 * Regression coverage for the "modal options don't respond to the mouse" bug:
 * `DialogOverlay` shipped at `z-50` while `DialogPrimitive.Content` shipped at
 * `z-40` (packages/ui/shared/src/components/ui/dialog.tsx). Both are
 * `position: fixed`, so the overlay - a full-viewport scrim that accepts
 * pointer events - painted *above* the dialog body and swallowed every click
 * aimed at it. The keyboard path was untouched (Radix's focus trap still
 * walked the content), so the symptom read as "the buttons in this modal are
 * dead to the cursor" rather than as a stacking bug.
 *
 * It reached the player because every `showOverlay` dialog in the app is on
 * the leetype session path: the blocking challenge picker
 * (components/typing-game/leetype), the bottom nav's info/settings dialog
 * (game-bottom-nav), and the skip menu (section-navigator).
 *
 * These tests don't boot the app - see tests/csp/csp.spec.ts for the
 * established pattern this follows. The z-index pair is read straight out of
 * dialog.tsx's shipped class strings, so the fixture can't drift from the
 * component: `stackingOrderIsSound` pins the invariant at the source, and the
 * DOM tests prove what that ordering does to a real click. The BEFORE fixture
 * replays the pre-fix values so the AFTER assertions are pinned against a
 * fixture known to fail without them (mirrors the CSP spec's own "sanity"
 * test).
 */

import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIALOG_COMPONENT = resolve(
  __dirname,
  "../../../../packages/ui/shared/src/components/ui/dialog.tsx"
)

const VIEWPORT = { width: 1280, height: 800 }

/** The pre-fix values, kept as literals so the sanity fixture is meaningful. */
const BEFORE_FIX = { overlay: 50, content: 40 } as const

type ZPair = { overlay: number; content: number }

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- TS global augmentation requires `interface`, not `type`
  interface Window {
    __optionClicks?: number
  }
}

/**
 * Read the shipped `z-<n>` utility off each of the two Radix slots in
 * dialog.tsx. Both slots build their class list with `cn("…", className)`, so
 * scanning from the slot's `data-slot` marker to the end of that `cn(` call is
 * enough to isolate one slot's own utilities from the other's.
 */
function readShippedZIndexes(): ZPair {
  const source = readFileSync(DIALOG_COMPONENT, "utf8")

  const readSlot = (slot: string): number => {
    const start = source.indexOf(`data-slot="${slot}"`)
    if (start === -1) {
      throw new Error(`No ${slot} slot found in ${DIALOG_COMPONENT}`)
    }
    const end = source.indexOf("{...props}", start)
    const block = source.slice(start, end === -1 ? undefined : end)
    // Skip `z-` inside data-* variants (e.g. `data-[state=open]:z-…`) and take
    // the plain, unconditional utility - that's the one that always applies.
    const matches = [...block.matchAll(/(^|[\s"'])z-(\d+)\b/g)]
    if (matches.length === 0) {
      throw new Error(`No plain z-index utility on ${slot} in ${block}`)
    }
    return Number(matches[0][2])
  }

  return {
    overlay: readSlot("dialog-overlay"),
    content: readSlot("dialog-content"),
  }
}

/**
 * A minimal stand-in for what Radix renders into the portal: the scrim and the
 * dialog body as siblings, overlay first (Radix's own order - see
 * DialogContent), each `position: fixed` at the z-index dialog.tsx ships. The
 * `pointer-events: auto` on both mirrors what Radix's DismissableLayer sets
 * while a modal dialog is open.
 */
function shellHtml({ overlay, content }: ZPair): string {
  return `<!DOCTYPE html>
<html>
<head>
<style>
  * { box-sizing: border-box; margin: 0; }
  body { font-family: sans-serif; }
  .overlay {
    position: fixed; inset: 0; z-index: ${overlay};
    background: rgba(0, 0, 0, 0.5); pointer-events: auto;
  }
  .content {
    position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
    z-index: ${content}; display: grid; gap: 16px; width: 512px; padding: 24px;
    background: #fff; border: 1px solid #ccc; border-radius: 8px;
    pointer-events: auto;
  }
  .option { display: block; width: 100%; padding: 16px; text-align: left; }
</style>
</head>
<body>
  <div data-slot="dialog-portal">
    <div class="overlay" data-slot="dialog-overlay"></div>
    <div class="content" data-slot="dialog-content" role="dialog">
      <h2>Choose a Challenge</h2>
      <button class="option" id="option" type="button">Linked List</button>
    </div>
  </div>
  <script>
    window.__optionClicks = 0;
    document.getElementById("option").addEventListener("click", () => {
      window.__optionClicks++;
    });
  </script>
</body>
</html>`
}

async function loadShell(
  page: Page,
  variant: string,
  zIndexes: ZPair
): Promise<void> {
  await page.route("**/*", (route) =>
    route.fulfill({ body: shellHtml(zIndexes), contentType: "text/html" })
  )
  await page.goto(`https://localhost/__dialog-overlay-regression__/${variant}`)
}

/** What the browser would actually hand a click aimed at the option button. */
async function slotUnderOption(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const box = document.getElementById("option")!.getBoundingClientRect()
    const hit = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2
    )
    return hit?.closest("[data-slot]")?.getAttribute("data-slot") ?? null
  })
}

async function clickOptionCentre(page: Page): Promise<number> {
  const box = await page.locator("#option").boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  return page.evaluate(() => window.__optionClicks ?? 0)
}

test.describe("dialog content is never buried under its own overlay", () => {
  test.use({ viewport: VIEWPORT })

  test("the shipped z-index pair puts content above the overlay", () => {
    const { overlay, content } = readShippedZIndexes()

    // Strictly greater, not >=: equal values only resolve in the content's
    // favour by DOM order, which is a Radix implementation detail this
    // component shouldn't be betting on.
    expect(content).toBeGreaterThan(overlay)
  })

  test("a mouse click on a dialog option reaches the option, not the scrim", async ({
    page,
  }) => {
    await loadShell(page, "after", readShippedZIndexes())

    expect(await slotUnderOption(page)).toBe("dialog-content")
    expect(await clickOptionCentre(page)).toBe(1)
  })

  test("sanity: the pre-fix z-index pair swallows the same click (proves the assertions above are meaningful)", async ({
    page,
  }) => {
    await loadShell(page, "before", BEFORE_FIX)

    // Nothing about the dialog body moved - it is still there, still sized,
    // still focusable. Only the hit test changed, which is exactly why the bug
    // presented as mouse-only.
    await expect(page.locator("#option")).toBeVisible()
    expect(await slotUnderOption(page)).toBe("dialog-overlay")
    expect(await clickOptionCentre(page)).toBe(0)
  })
})
