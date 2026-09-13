/**
 * Shared Playwright harness for injecting the real, compiled
 * `legibility-audit.ts` module (`legibility-audit-module.ts`) into a bare
 * page and calling `auditLegibility`/`decideLegibility` directly — the
 * isolation rationale (bypassing the full `--load-extension` pipeline's own
 * confounding per-surface repair) is `legibility-audit-module.ts`'s own doc
 * comment. Extracted here once a second spec (#1358, alongside #1374's own)
 * needed the identical `test` extension and `auditPage` helper, rather than
 * duplicating both.
 */
import { test as base } from "@playwright/test"

import {
  LEGIBILITY_AUDIT_GLOBAL,
  legibilityAuditScript,
} from "./legibility-audit-module"

export type LegibilityAuditWindowApi = {
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

export const legibilityAuditTest = base.extend<{ scriptContent: string }>({
  // eslint-disable-next-line no-empty-pattern
  scriptContent: async ({}, use) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(await legibilityAuditScript())
  },
})

// This harness uses @playwright/test's own default `page` fixture (a bare
// page, no extension) rather than ../fixture.ts's launchPersistentContext —
// so, unlike every other spec here, it never reads
// PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH on its own. Without this, Playwright
// falls back to its own auto-managed browser download, which this sandbox
// (and any environment following fixture.ts's own setup) does not have.
legibilityAuditTest.use({
  launchOptions: {
    executablePath: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"],
  },
})

export async function auditPage(page: {
  evaluate: <T>(
    fn: (globalName: typeof LEGIBILITY_AUDIT_GLOBAL) => T,
    arg: typeof LEGIBILITY_AUDIT_GLOBAL
  ) => Promise<T>
}): Promise<{
  attrs: Array<{ foreground: unknown; backdrop: unknown }>
  actions: ReadonlyArray<{ kind: string; key: string; verdict: string }>
}> {
  return page.evaluate((globalName: typeof LEGIBILITY_AUDIT_GLOBAL) => {
    const api = window[globalName]
    if (api === undefined) throw new Error(`window.${globalName} missing`)
    const { attrsByKey } = api.auditLegibility(document.body)
    const actions = api.decideLegibility(attrsByKey)
    return { attrs: Array.from(attrsByKey.values()), actions }
  }, LEGIBILITY_AUDIT_GLOBAL)
}
