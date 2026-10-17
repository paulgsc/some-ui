import type { JSX } from "react"
import { aphStore, exchangeWithHome } from "@some-ui/aph"
import { createFileRoute, Link, Outlet } from "@tanstack/react-router"

import type { AphKeeping } from "@/lib/home-link/aph"
import { DeviceKeepOnHome } from "@/components/aph/device-keep-on-home"

/**
 * aph's one screen, in four views: log a figure, the history of entries and
 * their reconciliation, the trend, and what it is all measured against. The
 * views share this strip, so moving between them is never a trip back Home.
 */
const VIEWS = [
  { to: "/aph", label: "Log", exact: true },
  { to: "/aph/history", label: "History", exact: false },
  { to: "/aph/trend", label: "Trend", exact: false },
  { to: "/aph/settings", label: "Settings", exact: false },
] as const

/** What the home link runs aph's keeping with: its store and exchange. */
const APH: AphKeeping = { store: aphStore, exchange: exchangeWithHome }

const AphLayout = (): JSX.Element => (
  <div className="mx-auto flex w-full max-w-md flex-col gap-4">
    {import.meta.env.VITE_DEVICE_BACKEND === "true" ? (
      <DeviceKeepOnHome aph={APH} />
    ) : null}
    <nav
      aria-label="aph"
      className="bg-muted grid grid-cols-4 gap-1 rounded-lg p-1"
    >
      {VIEWS.map((v) => (
        <Link
          key={v.to}
          to={v.to}
          activeOptions={{ exact: v.exact, includeSearch: false }}
          className="text-muted-foreground flex h-9 items-center justify-center rounded-md text-sm"
          activeProps={{
            className: "bg-background text-foreground font-medium shadow-sm",
            "aria-current": "page",
          }}
        >
          {v.label}
        </Link>
      ))}
    </nav>
    <Outlet />
  </div>
)

export const Route = createFileRoute("/_dashboard/_apk/aph")({
  component: AphLayout,
})
