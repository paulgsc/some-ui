import { createFileRoute, Outlet } from "@tanstack/react-router"

import { requireAudience } from "@/lib/build-profile"

/**
 * Home of the Android-app-only pages: what needs the phone itself (its
 * microphone, its own storage) and would be dead weight in a browser build.
 *
 * Only files under this directory may import an "apk"-audience workspace
 * (`gates` in build.profiles.ts; the build fails otherwise). Builds whose
 * profile leaves "apk" out (every one but `mobile`) stub those workspaces,
 * and this guard sends any visit to not-found first.
 * src/routes/__tests__/audience-gates.test.ts checks that for every route
 * under here. What it cannot check is a review invariant
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
