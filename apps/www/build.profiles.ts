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
 *   served on the home network. Carries everything but `apk`.
 * - **`pages`** - the GitHub Pages build (.github/workflows/pages.yml):
 *   `public` plus `web`.
 * - **`mobile`** - the Android app (apps/mobile's `build:web`): `public` plus
 *   `apk` (workspaces that need the phone, e.g. the soundbite recorder), and
 *   sessions only (`src/lib/app-surface`). Run `vite dev` with
 *   `SOME_UI_PROFILE=mobile` to see `apk` pages in a browser.
 *
 * `web` and `apk` are mirrors: the desktop web and the phone are separate
 * surfaces, each built for what its device affords, so neither profile
 * carries the other's.
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
  lan: { audiences: ["public", "lan", "web"] },
  pages: { audiences: ["public", "web"] },
  [MOBILE_PROFILE]: { audiences: ["public", "apk"] },
})

/** Directories whose immediate children carry `package.json#someUi`. */
export const workspaceRoots = [
  resolve(import.meta.dirname, "../../packages/ui"),
] as const

/**
 * The web surface's door: a gate that is a module rather than a route
 * layout. A door is how shared code (the session player, a page every build
 * routes to) reaches a gated workspace without a route of its own: it hands
 * the workspace out only where the build carries its audience, and nothing
 * where it does not (A4, packages/some-vite-config/AUDIENCES.md).
 * `src/lib/web-surface/index.test.tsx` checks the door's exports both ways.
 */
const WEB_DOOR = "src/lib/web-surface"

/** Every gate in `gates` that is a door, not a layout route. */
const doors: ReadonlyArray<string> = [WEB_DOOR]

/**
 * Where each gated audience's workspaces may be imported from: routes under
 * `_lan/` (or `_apk/`), whose layout sends a visit to not-found where the
 * audience is stubbed, or a door (`doors`, above). The build fails on any
 * other import, and `src/routes/__tests__/audience-gates.test.ts` checks the
 * layouts.
 */
const gates: Readonly<Record<GatedAudience, ReadonlyArray<string>>> = {
  lan: ["src/routes/_dashboard/_lan"],
  apk: ["src/routes/_dashboard/_apk"],
  web: [WEB_DOOR],
}

/** `gates` without the doors: each audience's layout-route directories. */
export const routeGates: ReadonlyArray<{
  audience: string
  dirs: ReadonlyArray<string>
}> = Object.entries(gates).map(([audience, dirs]) => ({
  audience,
  dirs: dirs.filter((dir) => !doors.includes(dir)),
}))

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
