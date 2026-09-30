import type { Audience } from "@some-ui/vite-config/audience"
import { notFound } from "@tanstack/react-router"
// `virtual:build-profile` is served by audiencePlugin (build.profiles.ts) and
// typed by @some-ui/vite-config/build-profile-client; there is no file for the
// import resolver to find. This module is its only importer on purpose: UI
// that needs to ask (a nav link to a LAN page, say) re-exports from here.
//
//   A3  public UI links to a gated route only behind `hasAudience(...)`
//       (packages/some-vite-config/AUDIENCES.md)
// eslint-disable-next-line import/no-unresolved -- vite virtual module, see above
import { hasAudience, profile } from "virtual:build-profile"

/**
 * A `beforeLoad` for the pathless layout that gates one audience's routes
 * (`routes/_dashboard/_lan.tsx` for "lan").
 *
 * The routes under it exist in every build - same route tree, same types, same
 * typed links - but in a build whose profile leaves the audience out, their
 * workspaces are stubs. This turns a visit into the app's ordinary not-found
 * page before any loader or component can reach one.
 */
export function requireAudience(audience: Audience): () => void {
  return (): void => {
    if (!hasAudience(audience)) throw notFound()
  }
}

/**
 * True in the Android app's build: the `mobile` profile in build.profiles.ts,
 * which apps/mobile's `build:web` selects. That app carries sessions and
 * nothing else; `lib/app-surface` is what narrows it.
 *
 * The profile's name is repeated here because build.profiles.ts is Node-side
 * config the bundle cannot import. `routes/__tests__/mobile-surface.test.ts`
 * takes the name from there, so the two cannot drift apart unnoticed.
 */
export const MOBILE_APP = profile === "mobile"
