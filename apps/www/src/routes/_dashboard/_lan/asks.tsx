import type { JSX } from "react"
import { createFileRoute, Outlet } from "@tanstack/react-router"

import { AsksFrame } from "@/components/asks"

/**
 * Asks (docs/asks.md): what waits on the owner, on the home network's
 * desktop web only (`_lan.tsx`, C1097), a nav beside one view (C1200);
 * what the owner does here stays in this tab (C1096).
 */
const AsksLayout = (): JSX.Element => (
  <AsksFrame>
    <Outlet />
  </AsksFrame>
)

export const Route = createFileRoute("/_dashboard/_lan/asks")({
  component: AsksLayout,
})
