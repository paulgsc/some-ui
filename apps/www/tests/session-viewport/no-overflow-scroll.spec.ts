/**
 * Regression coverage for #692, resolved by #695 (epic #693, story 2 - see
 * docs/session-viewport/02-kill-the-cutoff.md): the player route must
 * measure a fixed, bounded viewport V and clip content to it. The page must
 * never grow to accommodate an oversized activity - that's the page-level
 * `overflow-auto` scroll the epic explicitly forbids.
 *
 * This doesn't boot the real app (no dev server, no router/orchestrator
 * state) - see tests/csp/csp.spec.ts for the established pattern this
 * follows. It mirrors, as static CSS, the exact flex/overflow chain now
 * shipped across:
 *   - apps/www/src/routes/_dashboard.tsx        (wrapper + outlet)
 *   - apps/www/src/components/player/live-player.tsx
 *   - apps/www/src/components/player/session-viewport.tsx
 * then drops in a deliberately oversized child (standing in for an activity
 * like @some-ui/interview's InterviewApp, which assumes `min-h-screen` -
 * logged in the doc above) to prove the chain clips instead of growing the
 * page. The BEFORE fixture reproduces the pre-#695 classes so the AFTER
 * assertions are pinned against a fixture that's known to fail without the
 * fix (mirrors the CSP spec's own "sanity" test).
 */

import { expect, test, type Page } from "@playwright/test"

const VIEWPORT = { width: 1280, height: 800 }
const ACTIVITY_HEIGHT = 3000

type ShellVariant = "before" | "after"

function shellHtml(variant: ShellVariant): string {
  const wrapperCss =
    variant === "after"
      ? "min-height: 100svh; height: 100svh; overflow: hidden;"
      : "min-height: 100svh;"

  const outletCss =
    variant === "after"
      ? "flex: 1 1 0%; min-height: 0; overflow: hidden; padding: 24px;"
      : "flex: 1 1 0%; overflow: auto; padding: 24px;"

  const sessionViewportCss =
    variant === "after"
      ? "flex: 1 1 0%; min-height: 0; overflow: hidden;"
      : "flex: 1 1 0%; min-height: 680px; overflow: hidden;"

  return `<!DOCTYPE html>
<html>
<head>
<style>
  * { box-sizing: border-box; margin: 0; }
  body { font-family: sans-serif; }
  /* mirrors SidebarProvider's wrapper div (some-ui-shared/sidebar.tsx) */
  .wrapper { display: flex; width: 100%; ${wrapperCss} }
  .sidebar { width: 200px; flex-shrink: 0; background: #eee; }
  /* mirrors SidebarInset's <main> */
  main { display: flex; flex-direction: column; flex: 1 1 0%; min-height: 100svh; background: #fff; }
  header { height: 56px; flex-shrink: 0; border-bottom: 1px solid #ccc; }
  /* mirrors the outlet div in routes/_dashboard.tsx */
  .outlet { ${outletCss} }
  /* mirrors live-player.tsx's root div */
  .live-player { display: flex; flex-direction: column; gap: 16px; width: 100%; height: 100%; min-height: 0; }
  .now-next { flex-shrink: 0; height: 24px; }
  .transport { flex-shrink: 0; height: 64px; border: 1px solid #ccc; }
  /* mirrors session-viewport.tsx's root div */
  .session-viewport { ${sessionViewportCss} border: 1px solid #999; position: relative; width: 100%; }
  /* stand-in for an activity that assumes it owns the whole viewport
     (e.g. InterviewApp's 'min-h-screen', VoiceAvatar's 'min-h-screen') */
  .activity { min-height: ${ACTIVITY_HEIGHT}px; background: repeating-linear-gradient(45deg, #ddd, #ddd 10px, #eee 10px, #eee 20px); }
</style>
</head>
<body>
  <div class="wrapper">
    <div class="sidebar"></div>
    <main>
      <header></header>
      <div class="outlet">
        <div class="live-player">
          <div class="session-viewport" id="session-viewport">
            <div class="activity" id="activity">tall activity content</div>
          </div>
          <div class="now-next"></div>
          <div class="transport"></div>
        </div>
      </div>
    </main>
  </div>
</body>
</html>`
}

async function loadShell(page: Page, variant: ShellVariant): Promise<void> {
  await page.route("**/*", (route) =>
    route.fulfill({ body: shellHtml(variant), contentType: "text/html" })
  )
  await page.goto(
    `https://localhost/__session-viewport-regression__/${variant}`
  )
}

test.describe("session viewport never resolves overflow with page-level scroll", () => {
  test.use({ viewport: VIEWPORT })

  test("after #695: an oversized activity is clipped, the page does not grow", async ({
    page,
  }) => {
    await loadShell(page, "after")

    const pageScrollHeight = await page.evaluate(
      () => document.documentElement.scrollHeight
    )
    expect(pageScrollHeight).toBeLessThanOrEqual(VIEWPORT.height)

    const viewportBox = await page.locator("#session-viewport").boundingBox()
    expect(viewportBox).not.toBeNull()
    // Bounded well under the activity's natural size - V, not the
    // activity's content, decided the rendered height.
    expect(viewportBox!.height).toBeLessThan(ACTIVITY_HEIGHT / 2)

    // The oversized activity is still there, just clipped by its bounded
    // ancestor rather than pushing the page taller.
    const activityHeight = await page.evaluate(
      () => document.getElementById("activity")!.getBoundingClientRect().height
    )
    expect(activityHeight).toBeGreaterThan(viewportBox!.height)
  })

  test("before #695 (sanity): the same oversized activity grows the whole page", async ({
    page,
  }) => {
    await loadShell(page, "before")

    const pageScrollHeight = await page.evaluate(
      () => document.documentElement.scrollHeight
    )
    // Proves the fixture is meaningful: without the fix, nothing in the
    // ancestor chain has a definite height, so flex-grow never resolves
    // against a fixed V - the whole document grows to fit the activity.
    expect(pageScrollHeight).toBeGreaterThan(VIEWPORT.height)
  })
})
