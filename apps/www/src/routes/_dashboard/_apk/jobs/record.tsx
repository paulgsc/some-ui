import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { usePlace } from "@/lib/engagement-places"
import { RECORD_PLACES } from "@/lib/jobs/offers"
import { JobsRecord } from "@/components/jobs/record"

/** The record, and the time spent on it, for ENGAGE (WALK5, C861). */
const PhoneRecord = (): JSX.Element => {
  usePlace(RECORD_PLACES, "record")
  return <JobsRecord />
}

const RecordRoute = (): JSX.Element | null =>
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? <PhoneRecord /> : null

export const Route = createFileRoute("/_dashboard/_apk/jobs/record")({
  component: RecordRoute,
})
