/**
 * platform/api — canonical import target.
 *
 * THIS FILE IS NEVER BUNDLED DIRECTLY.
 *
 * Both Vite configs alias `@filter/lib/platform/api` to either
 * `api.firefox.ts` or `api.chrome.ts` before module resolution runs.
 * This file only exists so that:
 *
 *   1. TypeScript can resolve `import { ext } from "@filter/lib/platform/api"`
 *      during `tsc --noEmit` and vitest (neither goes through the Vite alias).
 *
 *   2. vitest can import it directly — the fallback below picks up the
 *      `browser` global stubbed by vitest.setup.ts.
 *
 * Consumer pattern:
 *
 *   import { ext } from "@filter/lib/platform/api"
 *   ext.runtime.getURL("prepaint.css")
 *   ext.runtime.sendMessage(...)
 *
 * Never import `browser` or `chrome` globals directly in src/.
 */
export const ext: typeof browser =
  typeof browser !== "undefined"
    ? browser
    : typeof chrome !== "undefined"
      ? // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        (chrome as unknown as typeof browser)
      : (() => {
          throw new Error(
            "[FILTER] platform/api: no extension runtime found. " +
              "In tests, ensure vitest.setup.ts has injected global.browser."
          )
        })()
