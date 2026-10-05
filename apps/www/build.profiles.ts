import { resolve } from "node:path"
import type { GatedAudience } from "@some-ui/vite-config"
import { audiencePlugin } from "@some-ui/vite-config"
import { defineProfiles } from "@some-ui/vite-config/audience"
import type { Plugin } from "vite"

/**
 * The deployables this app builds into, selected by `SOME_UI_PROFILE`. A
 * profile lists the audiences whose `packages/ui/*` workspaces it bundles;
 * the rest are stubbed (they still typecheck and route, but ship no code).
 * About bundle size, not access.
 *
 * - **`lan`** - the default: `vite dev`, `vite preview` and the Docker image
 *   served on the home network. Carries everything.
 * - **`pages`** - the GitHub Pages build (.github/workflows/pages.yml).
 * - **`mobile`** - the Android app (apps/mobile's `build:web`): `public` plus
 *   `apk` (workspaces that need the phone, e.g. the soundbite recorder), and
 *   sessions only (`src/lib/app-surface`). Run `vite dev` with
 *   `SOME_UI_PROFILE=mobile` to see `apk` pages in a browser.
 *
 * The variable is in turbo.json's `www#build` env, so profiles never share a
 * cache entry.
 */
/**
 * The Android app's profile. www's bundle cannot import this file, so
 * `src/lib/build-profile` repeats the name; the mobile-surface test checks
 * the two against each other.
 */
export const MOBILE_PROFILE = "mobile"

export const profiles = defineProfiles({
  lan: { audiences: ["public", "lan"] },
  pages: { audiences: ["public"] },
  [MOBILE_PROFILE]: { audiences: ["public", "apk"] },
})

/** Directories whose immediate children carry `package.json#someUi`. */
export const workspaceRoots = [
  resolve(import.meta.dirname, "../../packages/ui"),
] as const

/**
 * Where each gated audience's workspaces may be imported from: only routes
 * under `_lan/` (or `_apk/`), whose layout sends a visit to not-found where
 * the audience is stubbed. The build fails on any other import, and
 * `src/routes/__tests__/audience-gates.test.ts` checks the layouts.
 */
export const gates: Readonly<Record<GatedAudience, ReadonlyArray<string>>> = {
  lan: ["src/routes/_dashboard/_lan"],
  apk: ["src/routes/_dashboard/_apk"],
}

/**
 * www's `audiencePlugin`, shared by vite.config.ts and vitest.config.ts. The
 * test runner passes `checkGates: false`: tests are not bundled, and the ones
 * that exercise a gated route or mock a gated workspace live outside the gate.
 */
export function buildAudiencePlugin({
  profile = process.env.SOME_UI_PROFILE,
  checkGates = true,
}: { profile?: string; checkGates?: boolean } = {}): Plugin {
  return audiencePlugin({
    profiles,
    profile,
    defaultProfile: "lan",
    workspaceRoots,
    gates,
    checkGates,
  })
}
