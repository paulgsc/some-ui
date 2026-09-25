import { createFileRoute, Outlet } from "@tanstack/react-router"

import { requireAudience } from "@/lib/build-profile"

/**
 * Home of the LAN-only pages: tools for services that only exist on the home
 * network, which would be dead weight in any other build.
 *
 * Only files under this directory may import a "lan"-audience workspace (the
 * `gates` in vite.config.ts; the build fails otherwise). Builds whose profile
 * leaves "lan" out stub those workspaces, and this guard sends any visit to
 * not-found first. Search schemas and anything else a child route evaluates
 * before this guard runs come from the workspace's `/contract` subpath, which
 * every build carries.
 */
export const Route = createFileRoute("/_dashboard/_lan")({
  beforeLoad: requireAudience("lan"),
  component: Outlet,
})
