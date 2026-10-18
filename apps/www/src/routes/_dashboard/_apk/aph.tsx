import type { JSX } from "react"
import { aphStore, exchangeWithHome } from "@some-ui/aph"
import { createFileRoute, Outlet } from "@tanstack/react-router"

import type { AphKeeping } from "@/lib/home-link/aph"
import { DeviceKeepOnHome } from "@/components/aph/device-keep-on-home"
import type { View } from "@/components/view-strip"
import { ViewStrip } from "@/components/view-strip"

/**
 * aph's one screen, in four views: log a figure, the history of entries and
 * their reconciliation, the trend, and what it is all measured against.
 */
const VIEWS = [
  { to: "/aph", label: "Log", exact: true },
  { to: "/aph/history", label: "History", exact: false },
  { to: "/aph/trend", label: "Trend", exact: false },
  { to: "/aph/settings", label: "Settings", exact: false },
] as const satisfies ReadonlyArray<View>

const APH: AphKeeping = { store: aphStore, exchange: exchangeWithHome }

const AphLayout = (): JSX.Element => (
  <div className="mx-auto flex w-full max-w-md flex-col gap-4">
    {import.meta.env.VITE_DEVICE_BACKEND === "true" ? (
      <DeviceKeepOnHome aph={APH} />
    ) : null}
    <ViewStrip label="aph" views={VIEWS} />
    <Outlet />
  </div>
)

export const Route = createFileRoute("/_dashboard/_apk/aph")({
  component: AphLayout,
})
