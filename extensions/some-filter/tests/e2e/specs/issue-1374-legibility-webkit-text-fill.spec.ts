/**
 * #1374 — `ownTextColor`'s own `-webkit-text-fill-color` guard read the
 * *computed* value in isolation, which real Chromium always resolves to a
 * concrete color (mirroring `color`) even with no such declaration
 * anywhere. The guard fired unconditionally, forcing `foreground:
 * "underdetermined"` for every legibility-audit candidate in production —
 * silently turning a real contrast violation into inconclusive noise
 * instead of the meaningful `"violated"` diagnostic this channel exists to
 * produce.
 *
 * A first fix (inspecting only `el.style`, the inline specified value)
 * closed that but reopened a different, worse gap Codex's own review of
 * that fix caught: an inline-only check never sees a stylesheet-rule-based
 * or inherited `-webkit-text-fill-color` — the actual `background-clip:
 * text` pattern (`color` set inline as a fallback, the real fill supplied
 * by a shared class) — silently trusting `color` for a carrier whose real
 * rendered glyph is a completely different color. The landed fix instead
 * compares the *computed* `-webkit-text-fill-color` against the computed
 * `color` on the same element (`legibility-audit.ts`'s own doc comment on
 * `ownTextColor` has the full reasoning); both specs below guard one half
 * of that comparison.
 *
 * jsdom cannot reproduce either failure mode: it preserves the literal
 * `"currentcolor"` string for an unset/`currentcolor`-valued property
 * rather than resolving it, which is why `legibility-audit.test.ts`'s own
 * unit tests passed throughout both the bug and the first, incomplete fix.
 * Only a real Chromium run can prove either half.
 *
 * Deliberately not run through the full `--load-extension` pipeline
 * (`../fixture.ts`): the main auto-theme pipeline's own per-surface
 * darkening can itself repair a carrier's foreground color before this
 * audit ever runs, which would confound an assertion aimed at this
 * module's own resolution logic with an unrelated (and, this session
 * found, more comprehensive than documented) repair mechanism. This spec
 * instead injects the real compiled `legibility-audit.ts` module
 * (`legibility-audit-module.ts`) into a bare page and calls
 * `auditLegibility`/`decideLegibility` directly against a DOM this test
 * fully controls — proving the module's own behavior in real Chromium,
 * isolated from pipeline confounds, mirroring
 * `scope-registry-harness.ts`'s established isolation rationale for an
 * identical shape of problem.
 */
import {
  auditPage,
  LEGIBILITY_AUDIT_LAUNCH_OPTIONS,
  legibilityAuditTest as test,
} from "@filter/playwright/fixtures/legibility-audit-harness"
import { expect } from "@playwright/test"

// Declared here, in the spec file itself, rather than in the shared harness
// — see LEGIBILITY_AUDIT_LAUNCH_OPTIONS's own doc comment for the
// Playwright "inconsistent test.use() options" configuration failure a
// `.use()` in a common helper produces.
test.use({ launchOptions: LEGIBILITY_AUDIT_LAUNCH_OPTIONS })

test.describe("legibility audit's -webkit-text-fill-color guard against real Chromium (#1374)", () => {
  test("an explicit-colored carrier with no own -webkit-text-fill-color resolves a real color, not underdetermined", async ({
    page,
    scriptContent,
  }) => {
    // The "F-20" shape legibility-audit.test.ts already covers in jsdom: a
    // carrier with no own background, its own explicit `color`, nested
    // under an ancestor whose own (themed) background is what actually
    // resolves as the backdrop. rgb(20,20,20) text over rgb(13,17,23) is a
    // real, decisive WCAG AA violation (~1.1:1) — nowhere near the 4.5:1
    // floor — so the only way this test could pass by accident is if the
    // guard bug were still forcing "underdetermined".
    await page.setContent(`
      <div id="ancestor" style="background-color: rgb(13,17,23)">
        <span id="carrier" style="color: rgb(20,20,20)">hi</span>
      </div>
    `)
    await page.addScriptTag({ content: scriptContent })

    const result = await auditPage(page)

    // Before the fix: ownTextColor's -webkit-text-fill-color guard read
    // getComputedStyle's own resolved value — a concrete color in real
    // Chromium regardless of whether the property was ever declared — and
    // returned "underdetermined" unconditionally, before the color logic
    // that would have caught this violation ever ran.
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
    // Codex's own finding on the first fix (inline-only): the actual
    // `background-clip: text` pattern supplies -webkit-text-fill-color via
    // a shared class, not an inline declaration — `color: white` here is
    // only ever a non-gradient fallback, never what actually renders.
    // Checking only el.style silently missed this, auditing the carrier as
    // legible white-on-dark using `color` while the real painted glyph
    // (#111, from the class) would be effectively invisible against the
    // same dark backdrop. The fixed guard compares computed
    // -webkit-text-fill-color against computed color instead, which
    // catches a class-based override exactly the same way as an inline
    // one.
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
