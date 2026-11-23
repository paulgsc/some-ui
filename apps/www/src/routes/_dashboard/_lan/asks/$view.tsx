import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { tabReceipts } from "@/lib/asks/kept"
import type { AskView, ListState } from "@/lib/asks/list"
import { listSearch, viewParams } from "@/lib/asks/list"
import { AsksView } from "@/components/asks"

const ViewRoute = (): JSX.Element => {
  const { view }: { view: AskView } = Route.useParams()
  const state: ListState = Route.useSearch()
  return <AsksView view={view} state={state} kept={tabReceipts} />
}

export const Route = createFileRoute("/_dashboard/_lan/asks/$view")({
  params: viewParams,
  validateSearch: listSearch,
  component: ViewRoute,
})
