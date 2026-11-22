import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { tabReceipts } from "@/lib/asks/kept"
import type { AskView, ListState } from "@/lib/asks/list"
import { listSearch, pivotShowOf, viewParams } from "@/lib/asks/list"
import { AskList, AsksPivot } from "@/components/asks"

/** A view of Asks (`lib/asks/list`): a kind's list, or the pivot. */
const ViewRoute = (): JSX.Element => {
  const { view }: { view: AskView } = Route.useParams()
  const state: ListState = Route.useSearch()
  const navigate = Route.useNavigate()
  const onStep = (next: ListState): void => {
    void navigate({ search: next, replace: true })
  }
  return view === "pivot" ? (
    <AsksPivot
      show={pivotShowOf(state)}
      onShow={(show) => onStep({ ...state, show })}
    />
  ) : (
    <AskList kind={view} kept={tabReceipts} state={state} onStep={onStep} />
  )
}

export const Route = createFileRoute("/_dashboard/_lan/asks/$view")({
  params: viewParams,
  validateSearch: listSearch,
  component: ViewRoute,
})
