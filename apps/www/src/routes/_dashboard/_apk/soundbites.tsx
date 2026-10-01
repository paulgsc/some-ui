import type { JSX } from "react"
import { useRef } from "react"
import type { SoundbiteContext, SoundbiteSource } from "@some-ui/soundbites"
import { Soundbites } from "@some-ui/soundbites"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

import type { SessionRecord, SessionStatus } from "@/lib/tenant"
import { sessionsQuery, useSessions } from "@/lib/tenant"

/**
 * `?say=` arrives from a tap that already meant "let me say why": the
 * sessions list's button, or a study reminder's "Not today" action. The page
 * starts listening at once, and records which of the two it was.
 */
type SoundbitesSearch = { say?: "sessions" | "reminder" }

/**
 * `?say=` as the source it names. Takes `unknown`: www declares no router
 * `Register`, so `useSearch` is untyped and this is where it is narrowed.
 */
function sourceOf(say: unknown): SoundbiteSource {
  if (say === "sessions" || say === "reminder") return say
  return "direct"
}

const OPEN_STATUSES: ReadonlyArray<SessionStatus> = [
  "active",
  "paused",
  "scheduled",
]

/** What the soundbite notes about where things stood, from the sessions. */
function contextFrom(
  sessions: ReadonlyArray<SessionRecord>,
  source: SoundbiteSource
): SoundbiteContext {
  const latest = sessions.reduce<string | null>(
    (max, s) => (max === null || s.updatedAt > max ? s.updatedAt : max),
    null
  )
  return {
    source,
    lastSessionAt: latest,
    openSessions: sessions.filter((s) => OPEN_STATUSES.includes(s.status))
      .length,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }
}

const SoundbitesRoute = (): JSX.Element => {
  const { say } = Route.useSearch()
  const navigate = useNavigate()
  // Never waited on: the recording starts whether or not the list has
  // loaded, and a soundbite saved before it has notes no sessions.
  const { data: sessions } = useSessions()
  // Read as the first take is kept; any take after it on this visit was the
  // page's own doing. Not `say` itself, which the auto-start clears.
  const source = useRef(sourceOf(say))

  return (
    <Soundbites
      autoStart={sourceOf(say) !== "direct"}
      // Forget the request once honoured, so going back or reloading does
      // not open the microphone again.
      onAutoStart={() =>
        void navigate({ to: "/soundbites", search: {}, replace: true })
      }
      context={() => {
        const context = contextFrom(sessions ?? [], source.current)
        source.current = "direct"
        return context
      }}
    />
  )
}

function validateSearch(search: Record<string, unknown>): SoundbitesSearch {
  return search.say === "sessions" || search.say === "reminder"
    ? { say: search.say }
    : {}
}

export const Route = createFileRoute("/_dashboard/_apk/soundbites")({
  validateSearch,
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(sessionsQuery)
  },
  component: SoundbitesRoute,
})
