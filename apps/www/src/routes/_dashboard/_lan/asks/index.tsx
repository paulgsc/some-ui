import { createFileRoute } from "@tanstack/react-router"

import { AsksLanding } from "@/components/asks"

/** Asks itself: on to the first kind with an ask waiting (`landingKind`). */
export const Route = createFileRoute("/_dashboard/_lan/asks/")({
  component: AsksLanding,
})
