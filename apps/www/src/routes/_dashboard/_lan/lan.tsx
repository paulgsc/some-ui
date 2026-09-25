import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

/**
 * Index of the LAN-only pages. Empty until the first one lands; the OBS
 * workspace is the first planned.
 */
const LanIndexRoute = (): JSX.Element => (
  <section className="flex flex-col gap-2 p-6">
    <h1 className="text-2xl font-semibold">LAN tools</h1>
    <p className="text-muted-foreground">
      Pages for services on the home network. Nothing here yet.
    </p>
  </section>
)

export const Route = createFileRoute("/_dashboard/_lan/lan")({
  component: LanIndexRoute,
})
