import type { JSX } from "react"
import type { HostCharacter } from "@some-ui/styles/brand/host"
import type { Role } from "@some-ui/styles/brand/host-role"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { characterOf, pageOf, roleOf } from "@/lib/cast"
import { CastHome } from "@/components/cast"

/** The Cast wing's Home (HOST8): a character's every look, live. */
const Cast = (): JSX.Element => {
  const { who, role, page } = Route.useSearch()
  const navigate = useNavigate({ from: "/cast" })
  return (
    <CastHome
      who={who}
      playing={role}
      page={page}
      onWho={(next) =>
        void navigate({
          search: { who: next, role: roleOf(next, role), page: 0 },
          replace: true,
        })
      }
      onPlaying={(next) =>
        void navigate({ search: { who, role: next, page }, replace: true })
      }
      onPage={(next) =>
        void navigate({ search: { who, role, page: next }, replace: true })
      }
    />
  )
}

export const Route = createFileRoute("/_dashboard/_apk/cast/")({
  component: Cast,
  validateSearch: (
    search
  ): { who: HostCharacter; role: Role; page: number } => {
    const who = characterOf(search.who)
    return { who, role: roleOf(who, search.role), page: pageOf(search.page) }
  },
})
