/**
 * Shared harness for injecting the real compiled `legibility-audit.ts`
 * (`legibility-audit-module.ts`) into a bare page and calling
 * `auditLegibility`/`decideLegibility` directly, bypassing the pipeline's
 * confounding per-surface repair.
 */
import { test as base } from "@playwright/test"

import {
  LEGIBILITY_AUDIT_GLOBAL,
  legibilityAuditScript,
} from "./legibility-audit-module"

type LegibilityAuditWindowApi = {
  auditLegibility: (root: Element) => {
    attrsByKey: ReadonlyMap<string, { foreground: unknown; backdrop: unknown }>
  }
  decideLegibility: (
    attrsByKey: ReadonlyMap<string, { foreground: unknown; backdrop: unknown }>
  ) => ReadonlyArray<{ kind: string; key: string; verdict: string }>
}

// The injected script assigns window[LEGIBILITY_AUDIT_GLOBAL] at runtime;
// augmenting `Window` for that literal key lets `window[globalName]`
// type-check without an assertion.
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

/**
 * This harness uses @playwright/test's default bare `page`, so it does not
 * read PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH on its own; without these options
 * Playwright falls back to a browser download this sandbox lacks.
 *
 * Exported for each spec's *own* `legibilityAuditTest.use(...)`: a `.use()`
 * in a shared helper attaches to the helper's root suite, so the worker hash
 * depends on file load order — Playwright's "inconsistent test.use()
 * options" error, which a new spec sorting between the two broke.
 */
export const LEGIBILITY_AUDIT_LAUNCH_OPTIONS = {
  executablePath: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"],
}

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
