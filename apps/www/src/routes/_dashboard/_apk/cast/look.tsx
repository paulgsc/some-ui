import type { JSX } from "react"
import type { HostCharacter, Placement, Shot } from "@some-ui/styles/brand/host"
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router"

import { characterOf, lookOf, pageOf, placementOf, shotOf } from "@/lib/cast"
import { CastLook } from "@/components/cast"

/** What the look's page reads from its address. */
type LookSearch = {
  who: HostCharacter
  look: string
  shot: Shot
  placement: Placement
  /** The grid's page the look was opened from. */
  page: number
}

/** One look of the Cast wing (HOST8), in each shot and placement. */
const LookPage = (): JSX.Element => {
  const search: LookSearch = Route.useSearch()
  const { who, look: id, shot, placement, page } = search
  const navigate = useNavigate({ from: "/cast/look" })
  const look = lookOf(who, id)
  if (look === undefined) {
    return <Navigate to="/cast" search={{ who, page }} replace />
  }
  return (
    <CastLook
      look={look}
      page={page}
      shot={shot}
      placement={placement}
      onShot={(next) =>
        void navigate({
          search: { who, look: id, shot: next, placement, page },
          replace: true,
        })
      }
      onPlacement={(next) =>
        void navigate({
          search: { who, look: id, shot, placement: next, page },
          replace: true,
        })
      }
    />
  )
}

export const Route = createFileRoute("/_dashboard/_apk/cast/look")({
  component: LookPage,
  validateSearch: (search): LookSearch => ({
    who: characterOf(search.who),
    look: typeof search.look === "string" ? search.look : "",
    shot: shotOf(search.shot),
    placement: placementOf(search.placement),
    page: pageOf(search.page),
  }),
})
