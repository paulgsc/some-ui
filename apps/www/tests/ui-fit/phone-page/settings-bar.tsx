/**
 * Settings' bar of pages (MY-DATA MD1, `src/components/mobile-shell`), as the
 * shell gives it on the phone, for `../settings-bar-fit.spec.ts`: along the
 * bottom when the phone is upright, a rail on its side. It is mounted under a
 * router of its own (a root and nothing else), since its tabs are route
 * links; a tab's page is not this sweep's, so nothing past the root is
 * routed.
 */

import type { JSX } from "react"
import { useState } from "react"
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"

import { MobileNav } from "@/components/mobile-shell"

/** The page the bar is opened on: My data, the tab MD1 adds. */
const AT = "/settings/data"

const Bar = (): JSX.Element => <MobileNav pathname={AT} />

export const SettingsBar = (): JSX.Element => {
  const [router] = useState(() =>
    createRouter({
      routeTree: createRootRoute({ component: Bar }),
      history: createMemoryHistory({ initialEntries: [AT] }),
    })
  )
  return <RouterProvider router={router} />
}
