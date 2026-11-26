import type { JSX } from "react"
import type { HostCharacter, Placement, Shot } from "@some-ui/styles/brand/host"
import type { Role } from "@some-ui/styles/brand/host-role"
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router"

import {
  characterOf,
  lookOf,
  pageOf,
  placementOf,
  roleOf,
  shotOf,
} from "@/lib/cast"
import { CastLook } from "@/components/cast"

/** What the look's page reads from its address. */
type LookSearch = {
  who: HostCharacter
  look: string
  role: Role
  shot: Shot
  placement: Placement
  /** The grid's page the look was opened from. */
  page: number
}

/** One look of the Cast wing (HOST8), in each shot and placement. */
const LookPage = (): JSX.Element => {
  const search: LookSearch = Route.useSearch()
  const { who, look: id, role, shot, placement, page } = search
  const navigate = useNavigate({ from: "/cast/look" })
  const look = lookOf(who, id)
  if (look === undefined) {
    return <Navigate to="/cast" search={{ who, role, page }} replace />
  }
  const go = (next: Partial<LookSearch>): void =>
    void navigate({ search: { ...search, ...next }, replace: true })
  return (
    <CastLook
      look={look}
      playing={role}
      page={page}
      shot={shot}
      placement={placement}
      onPlaying={(next) => go({ role: next })}
      onShot={(next) => go({ shot: next })}
      onPlacement={(next) => go({ placement: next })}
    />
  )
}

export const Route = createFileRoute("/_dashboard/_apk/cast/look")({
  component: LookPage,
  validateSearch: (search): LookSearch => {
    const who = characterOf(search.who)
    return {
      who,
      look: typeof search.look === "string" ? search.look : "",
      role: roleOf(who, search.role),
      shot: shotOf(search.shot),
      placement: placementOf(search.placement),
      page: pageOf(search.page),
    }
  },
})
