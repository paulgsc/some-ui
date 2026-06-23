/**
 * platform/api — canonical import target.
 *
 * THIS FILE IS NEVER BUNDLED DIRECTLY.
 *
 * Both Vite configs alias `@conveyor/platform/content` and
 * `@conveyor/platform/background` to the platform-specific implementation
 * (api.chrome.ts or api.firefox.ts) before module resolution runs.
 *
 * This file exists so that:
 *   1. TypeScript can resolve imports during `tsc --noEmit` and vitest
 *      (neither goes through the Vite alias layer).
 *   2. vitest falls back here — `browser` is stubbed in vitest.setup.ts.
 *
 * Consumer pattern (content scripts and background):
 *   import { ext } from "@conveyor/platform/content"
 *   ext.runtime.getURL("conveyor.css")
 *   ext.storage.local.get(key)
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
            "[CONVEYOR] platform/api: no extension runtime found. " +
              "In tests, ensure vitest.setup.ts has injected global.browser."
          )
        })()
