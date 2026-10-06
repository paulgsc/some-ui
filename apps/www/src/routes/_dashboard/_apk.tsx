import { createFileRoute, Outlet } from "@tanstack/react-router"

import { requireAudience } from "@/lib/build-profile"

/**
 * Home of the Android-only pages: what needs the phone itself (microphone,
 * storage).
 *
 * Only files under this directory may import an "apk"-audience workspace
 * (`gates` in build.profiles.ts). Where "apk" is stubbed (every profile but
 * `mobile`), this guard sends a visit to not-found (checked by
 * src/routes/__tests__/audience-gates.test.ts). Review invariants
 * (packages/some-vite-config/AUDIENCES.md):
 *
 *   A1  a route here uses nothing from an "apk" workspace's main entry in
 *       `loaderDeps`, `search` or `context` - those run before this guard
 *   A3  a link to a route here from outside it sits behind `hasAudience`
 */
export const Route = createFileRoute("/_dashboard/_apk")({
  beforeLoad: requireAudience("apk"),
  component: Outlet,
})
