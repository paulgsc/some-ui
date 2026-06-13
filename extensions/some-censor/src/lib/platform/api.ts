/**
 * platform/api — canonical import target.
 *
 * THIS FILE IS NEVER BUNDLED DIRECTLY.
 *
 * Both Vite configs alias `@censor/platform/api` to either
 * `api.firefox.ts` or `api.chrome.ts` before module resolution runs.
 * This file only exists so that:
 *
 *   1. TypeScript can resolve `import { ext } from "@censor/platform/api"`
 *      without an error when the alias hasn't been applied (e.g. during
 *      `tsc --noEmit` / vitest).
 *
 *   2. vitest can import it directly (test environment doesn't go through
 *      the Vite alias layer the same way) — the stub below lets tests run
 *      without a live extension API.
 *
 * Consumer pattern (the only public export from this layer):
 *
 *   import { ext } from "@censor/platform/api"
 *   ext.runtime.sendMessage(...)
 *   ext.storage.local.get(...)
 *
 * Never import `browser` or `chrome` globals directly anywhere else in
 * src/lib/. All extension API access MUST go through `ext`.
 */

// Determine which global is available at runtime (test shim or real extension).
// In production builds this branch is never evaluated — the alias replaces the
// whole file.  In vitest (jsdom) neither global exists, so we fall through to
// the no-op stub defined in vitest.setup.ts via `global.browser`.
export const ext: typeof browser =
  typeof browser !== "undefined"
    ? browser
    : typeof chrome !== "undefined"
      ? // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        (chrome as unknown as typeof browser)
      : // Final fallback: the vitest setup injects global.browser as a vi.fn() mock.
        // If neither is present we throw at module load so tests fail loudly.
        (() => {
          throw new Error(
            "[BOYO] platform/api: no extension runtime found. " +
              "In tests, ensure vitest.setup.ts has injected global.browser."
          )
        })()
