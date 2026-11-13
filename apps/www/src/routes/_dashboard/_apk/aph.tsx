import type { JSX } from "react"
import { useEffect, useState } from "react"
import { APH_OFFERS, aphStore, exchangeWithHome } from "@some-ui/aph"
import type { Offer } from "@some-ui/engagement"
import { pageVisit, watchVisit } from "@some-ui/engagement"
import { useShelf } from "@some-ui/react-hooks"
import { createFileRoute, Outlet } from "@tanstack/react-router"

import { AphVisitContext } from "@/lib/aph-visit"
import type { AphKeeping } from "@/lib/home-link/aph"
import { DeviceAphLane } from "@/components/aph/device-aph-lane"
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

/** The views the strip offers on every visit, by where each goes. */
const VIEW_OFFERS: Partial<Record<View["to"], Offer>> = {
  "/aph/history": APH_OFFERS.history,
  "/aph/trend": APH_OFFERS.trend,
}
const STRIP = Object.values(VIEW_OFFERS)

const APH: AphKeeping = {
  store: aphStore,
  exchange: exchangeWithHome,
}

const AphLayout = (): JSX.Element => {
  const [visit] = useState(() => pageVisit(document))
  useEffect(() => watchVisit(visit, document), [visit])
  useShelf(visit, "views", STRIP)

  return (
    <AphVisitContext.Provider value={visit}>
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        {import.meta.env.VITE_DEVICE_BACKEND === "true" ? (
          <DeviceAphLane aph={APH} />
        ) : null}
        <ViewStrip
          label="aph"
          views={VIEWS}
          onPick={(view) => {
            const offer = VIEW_OFFERS[view.to]
            if (offer !== undefined) visit.take(offer)
          }}
        />
        <Outlet />
      </div>
    </AphVisitContext.Provider>
  )
}

export const Route = createFileRoute("/_dashboard/_apk/aph")({
  component: AphLayout,
})
