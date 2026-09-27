import { createFileRoute, Outlet } from "@tanstack/react-router"

import { requireAudience } from "@/lib/build-profile"

/**
 * Home of the LAN-only pages: tools for services that only exist on the home
 * network, which would be dead weight in any other build.
 *
 * Only files under this directory may import a "lan"-audience workspace
 * (`gates` in build.profiles.ts; the build fails otherwise). Builds whose
 * profile leaves "lan" out stub those workspaces, and this guard sends any
 * visit to not-found first. src/routes/__tests__/audience-gates.test.ts checks
 * that for every route under here. What it cannot check is a review invariant
 * (packages/some-vite-config/AUDIENCES.md):
 *
 *   A1  a route here uses nothing from a "lan" workspace's main entry in
 *       `loaderDeps`, `search` or `context` - those run before this guard;
 *       take what they need from the workspace's `/contract`
 *   A3  a link to a route here from outside it sits behind `hasAudience`
 */
export const Route = createFileRoute("/_dashboard/_lan")({
  beforeLoad: requireAudience("lan"),
  component: Outlet,
})
