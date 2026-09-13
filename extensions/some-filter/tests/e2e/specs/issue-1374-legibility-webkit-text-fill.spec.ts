/**
 * #1374 — `ownTextColor`'s own `-webkit-text-fill-color` guard read the
 * *computed* value, which real Chromium always resolves to a concrete
 * color (mirroring `color`) even with no such declaration anywhere. The
 * guard fired unconditionally, forcing `foreground: "underdetermined"` for
 * every legibility-audit candidate in production — silently turning a real
 * contrast violation into inconclusive noise instead of the meaningful
 * `"violated"` diagnostic this channel exists to produce.
 *
 * jsdom cannot reproduce this: it preserves the literal `"currentcolor"`
 * string for an unset/`currentcolor`-valued property, which is why
 * `legibility-audit.test.ts`'s own unit tests passed throughout. Only a
 * real Chromium run can prove the fix.
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
  LEGIBILITY_AUDIT_GLOBAL,
  legibilityAuditScript,
} from "@filter/playwright/fixtures/legibility-audit-module"
import { test as base, expect } from "@playwright/test"

type LegibilityAuditWindowApi = {
  auditLegibility: (root: Element) => {
    attrsByKey: ReadonlyMap<string, { foreground: unknown; backdrop: unknown }>
  }
  decideLegibility: (
    attrsByKey: ReadonlyMap<string, { foreground: unknown; backdrop: unknown }>
  ) => ReadonlyArray<{ kind: string; key: string; verdict: string }>
}

// `page.evaluate` runs this file's callbacks in the browser, where the
// injected script (page.addScriptTag) has actually assigned
// window[LEGIBILITY_AUDIT_GLOBAL] — real at runtime, but nothing lib.dom's
// own `Window` type knows about. Augmenting it for this one specific,
// literal key (LEGIBILITY_AUDIT_GLOBAL's own inferred `const` type) lets
// `window[globalName]` type-check directly, with no type assertion needed.
declare global {
  // `interface`, not `type`: augmenting the existing global `Window`
  // interface via declaration merging requires it — `type` cannot merge.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Window {
    [LEGIBILITY_AUDIT_GLOBAL]?: LegibilityAuditWindowApi
  }
}

const test = base.extend<{ scriptContent: string }>({
  // eslint-disable-next-line no-empty-pattern
  scriptContent: async ({}, use) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(await legibilityAuditScript())
  },
})

// This spec uses @playwright/test's own default `page` fixture (a bare
// page, no extension) rather than ../fixture.ts's launchPersistentContext
// — so, unlike every other spec here, it never reads
// PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH on its own. Without this, Playwright
// falls back to its own auto-managed browser download, which this sandbox
// (and any environment following fixture.ts's own setup) does not have.
test.use({
  launchOptions: {
    executablePath: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"],
  },
})

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

    const result = await page.evaluate(
      (globalName: typeof LEGIBILITY_AUDIT_GLOBAL) => {
        const api = window[globalName]
        if (api === undefined) throw new Error(`window.${globalName} missing`)
        const { attrsByKey } = api.auditLegibility(document.body)
        const actions = api.decideLegibility(attrsByKey)
        return { attrs: Array.from(attrsByKey.values()), actions }
      },
      LEGIBILITY_AUDIT_GLOBAL
    )

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
})
