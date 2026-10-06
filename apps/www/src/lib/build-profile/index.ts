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
 * (`routes/_dashboard/_lan.tsx` for "lan"). The routes exist in every build,
 * but where the audience is stubbed this turns a visit into not-found before
 * any loader or component runs.
 */
export function requireAudience(audience: Audience): () => void {
  return (): void => {
    if (!hasAudience(audience)) throw notFound()
  }
}

/**
 * True in the Android app's build (the `mobile` profile, selected by
 * apps/mobile's `build:web`). The name is repeated because the bundle cannot
 * import build.profiles.ts; `routes/__tests__/mobile-surface.test.ts` checks
 * the two agree.
 */
export const MOBILE_APP = profile === "mobile"

/**
 * Whether this build carries `audience`'s workspaces. What a link to a gated
 * route sits behind (A3, packages/some-vite-config/AUDIENCES.md).
 */
export { hasAudience }
