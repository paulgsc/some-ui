import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import type { PickAffordance } from "@/lib/jobs/offers"
import { PickFlow } from "@/components/jobs/pick"

const PickRoute = (): JSX.Element | null => {
  const { day, pickId } = Route.useParams()
  const { from } = Route.useSearch()
  return import.meta.env.VITE_DEVICE_BACKEND === "true" ? (
    <PickFlow day={day} pickId={pickId} from={from} />
  ) : null
}

export const Route = createFileRoute("/_dashboard/_apk/jobs/pick/$day/$pickId")(
  {
    component: PickRoute,
    // Which offer Today's link was (WALK5, C861), so a pick's steps count
    // under the offer that was taken; absent from any other way in.
    validateSearch: (search): { from?: PickAffordance } =>
      search.from === "todays-pick" || search.from === "other-pick"
        ? { from: search.from }
        : {},
  }
)
