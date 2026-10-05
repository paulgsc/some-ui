/**
 * #1374 — `ownTextColor`'s `-webkit-text-fill-color` guard. Real Chromium
 * always resolves the computed value to a concrete colour (mirroring
 * `color`), so a guard on the computed value alone forced
 * `"underdetermined"` for every candidate; an inline-only check misses the
 * `background-clip: text` pattern, where the real fill comes from a shared
 * class. The guard compares computed `-webkit-text-fill-color` against
 * computed `color` (see `ownTextColor`); each spec pins one half.
 *
 * jsdom keeps the literal `"currentcolor"` string rather than resolving it,
 * so only real Chromium can prove either half.
 *
 * Not run through the full pipeline: its per-surface darkening can repair a
 * carrier first and confound the assertion. Injects the real compiled
 * `legibility-audit.ts` (`legibility-audit-module.ts`) into a bare page and
 * calls `auditLegibility`/`decideLegibility` directly, as
 * `scope-registry-harness.ts` does for the same kind of problem.
 */
import {
  auditPage,
  LEGIBILITY_AUDIT_LAUNCH_OPTIONS,
  legibilityAuditTest as test,
} from "@filter/playwright/fixtures/legibility-audit-harness"
import { expect } from "@playwright/test"

// Declared in the spec file, not the shared harness — see
// LEGIBILITY_AUDIT_LAUNCH_OPTIONS for why a shared `.use()` fails.
test.use({ launchOptions: LEGIBILITY_AUDIT_LAUNCH_OPTIONS })

test.describe("legibility audit's -webkit-text-fill-color guard against real Chromium (#1374)", () => {
  test("an explicit-colored carrier with no own -webkit-text-fill-color resolves a real color, not underdetermined", async ({
    page,
    scriptContent,
  }) => {
    // A carrier with no background and its own explicit `color`, under a
    // themed ancestor backdrop: rgb(20,20,20) on rgb(13,17,23) is ~1.1:1, a
    // decisive violation, so passing by accident needs the guard bug.
    await page.setContent(`
      <div id="ancestor" style="background-color: rgb(13,17,23)">
        <span id="carrier" style="color: rgb(20,20,20)">hi</span>
      </div>
    `)
    await page.addScriptTag({ content: scriptContent })

    const result = await auditPage(page)

    // A guard on the computed value alone returns "underdetermined" before
    // the colour logic runs.
    expect(
      result.attrs,
      "#carrier declares an explicit color and no -webkit-text-fill-color " +
        "at all — its own foreground must resolve to a real color, not " +
        `"underdetermined": ${JSON.stringify(result.attrs)}`
    ).toEqual([
      {
        foreground: [20 / 255, 20 / 255, 20 / 255, 1],
        backdrop: [13 / 255, 17 / 255, 23 / 255, 1],
      },
    ])

    expect(
      result.actions,
      `expected a "violated" verdict for this ~1.1:1 contrast pair, got: ${JSON.stringify(result.actions)}`
    ).toEqual([
      {
        kind: "tag-legibility",
        key: "rgb(20, 20, 20)~rgb(13, 17, 23)",
        verdict: "violated",
      },
    ])
  })

  test("a class-provided -webkit-text-fill-color override is still detected as underdetermined", async ({
    page,
    scriptContent,
  }) => {
    // The `background-clip: text` pattern: the fill comes from a class, and
    // `color: white` is only a fallback. The rendered glyph (#111) is near
    // invisible on the dark backdrop; comparing computed fill against
    // computed colour catches a class override like an inline one.
    await page.setContent(`
      <style>.fill-override { -webkit-text-fill-color: rgb(17, 17, 17); }</style>
      <div id="ancestor" style="background-color: rgb(17,17,17)">
        <span id="carrier" class="fill-override" style="color: white">hi</span>
      </div>
    `)
    await page.addScriptTag({ content: scriptContent })

    const result = await auditPage(page)

    expect(
      result.attrs,
      "#carrier's real rendered fill comes from a class rule, not `color` " +
        `— it must still be flagged underdetermined, not read as legible ` +
        `white-on-dark via \`color\` alone: ${JSON.stringify(result.attrs)}`
    ).toEqual([
      {
        foreground: "underdetermined",
        backdrop: [17 / 255, 17 / 255, 17 / 255, 1],
      },
    ])

    expect(result.actions).toEqual([
      {
        kind: "tag-legibility",
        key: "underdetermined~rgb(17, 17, 17)",
        verdict: "underdetermined",
      },
    ])
  })
})
