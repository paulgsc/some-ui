import type { JSX } from "react"
import type { HostCharacter } from "@some-ui/styles/brand/host"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { characterOf, pageOf } from "@/lib/cast"
import { CastHome } from "@/components/cast"

/** The Cast wing's Home (HOST8): a character's every look, live. */
const Cast = (): JSX.Element => {
  const { who, page } = Route.useSearch()
  const navigate = useNavigate({ from: "/cast" })
  return (
    <CastHome
      who={who}
      page={page}
      onWho={(next) =>
        void navigate({ search: { who: next, page: 0 }, replace: true })
      }
      onPage={(next) =>
        void navigate({ search: { who, page: next }, replace: true })
      }
    />
  )
}

export const Route = createFileRoute("/_dashboard/_apk/cast/")({
  component: Cast,
  validateSearch: (search): { who: HostCharacter; page: number } => ({
    who: characterOf(search.who),
    page: pageOf(search.page),
  }),
})
