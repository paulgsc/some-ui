import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"

import { authority } from "@/lib/authority"
import { requireAudience } from "@/lib/build-profile"

/**
 * Home of the LAN-only pages: tools for services on the home network only.
 *
 * Only files under this directory may import a "lan"-audience workspace
 * (`gates` in build.profiles.ts). Where "lan" is stubbed, this guard sends a
 * visit to not-found (checked by src/routes/__tests__/audience-gates.test.ts).
 * Review invariants (packages/some-vite-config/AUDIENCES.md):
 *
 *   A1  a route here uses nothing from a "lan" workspace's main entry in
 *       `loaderDeps`, `search` or `context` - those run before this guard;
 *       take what they need from the workspace's `/contract`
 *   A3  a link to a route here from outside it sits behind `hasAudience`
 */
const requireLan = requireAudience("lan")

/**
 * Also account-only: the tools act as an operator. The parent layout has
 * already waited for the session check (`authority.settled()`), so a
 * synchronous look at the authority suffices.
 */
export const Route = createFileRoute("/_dashboard/_lan")({
  beforeLoad: ({ location }) => {
    requireLan()
    if (!authority.is("account")) {
      throw redirect({ to: "/auth", search: { redirect: location.href } })
    }
  },
  component: Outlet,
})
