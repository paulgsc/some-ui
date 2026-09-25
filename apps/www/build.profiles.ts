import { resolve } from "node:path"
import { audiencePlugin } from "@some-ui/vite-config"
import { defineProfiles } from "@some-ui/vite-config/audience"
import type { Plugin } from "vite"

/**
 * The deployables this one app builds into, selected per build by
 * `SOME_UI_PROFILE`. A profile lists the audiences whose `packages/ui/*`
 * workspaces it bundles; every other workspace is stubbed out of that build -
 * it still typechecks and routes, it just ships no code. This is about bundle
 * size, not access: a LAN tool is dead weight anywhere off the LAN, so builds
 * that are never on it leave it out.
 *
 * - **`lan`** - the default: `vite dev`, `vite preview` and the Docker image
 *   served on the home network. Carries everything.
 * - **`pages`** - the GitHub Pages build (.github/workflows/pages.yml).
 *
 * A future VPS image is one more line here plus `SOME_UI_PROFILE` in its
 * pipeline. The variable is declared in turbo.json's `www#build` env, so two
 * profiles never share a cache entry.
 */
const profiles = defineProfiles({
  lan: { audiences: ["public", "lan"] },
  pages: { audiences: ["public"] },
})

/**
 * www's `audiencePlugin`, shared by vite.config.ts and vitest.config.ts.
 *
 * `gates` is where each gated audience may be imported from: only routes
 * under `_lan/`, whose layout sends a visit to not-found in builds that stub
 * the audience out. The build fails on an import from anywhere else, in every
 * profile.
 */
export function buildAudiencePlugin(
  profile: string | undefined = process.env.SOME_UI_PROFILE
): Plugin {
  return audiencePlugin({
    profiles,
    profile,
    defaultProfile: "lan",
    workspaceRoots: [resolve(import.meta.dirname, "../../packages/ui")],
    gates: { lan: ["src/routes/_dashboard/_lan"] },
  })
}
