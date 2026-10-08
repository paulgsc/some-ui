import type { JSX } from "react"
import type { SoundbiteSituation, SoundbiteSource } from "@some-ui/soundbites"
import { phoneSoundbiteStore, Soundbites } from "@some-ui/soundbites"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { shareAgentExport } from "@/lib/agent-export"
import { useArrivalKey } from "@/lib/arrival-key"
import { useAsyncIntent } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"
import type { SessionRecord, SessionStatus } from "@/lib/tenant"
import { sessionsQuery, useSessions } from "@/lib/tenant"

/**
 * `?say=` comes from a tap that already meant "let me talk" (Home's "Not
 * today? Say why", a reminder's "Not today", "Hold to talk", the wrap's "Say
 * what stuck"): the page starts listening at once and records which.
 */
type SoundbitesSearch = { say?: "sessions" | "reminder" | "capture" | "wrap" }

const SAY_SOURCES: ReadonlyArray<NonNullable<SoundbitesSearch["say"]>> = [
  "sessions",
  "reminder",
  "capture",
  "wrap",
]

function isSaySource(
  say: unknown
): say is NonNullable<SoundbitesSearch["say"]> {
  return SAY_SOURCES.some((s) => s === say)
}

/**
 * `?say=` as the source it names. Takes `unknown`: www declares no router
 * `Register`, so `useSearch` is untyped and this is where it is narrowed.
 */
function sourceOf(say: unknown): SoundbiteSource {
  return isSaySource(say) ? say : "direct"
}

const OPEN_STATUSES: ReadonlyArray<SessionStatus> = [
  "active",
  "paused",
  "scheduled",
]

/** What the soundbite notes about where things stood, from the sessions. */
function situationFrom(
  sessions: ReadonlyArray<SessionRecord>
): SoundbiteSituation {
  const latest = sessions.reduce<string | null>(
    (max, s) => (max === null || s.updatedAt > max ? s.updatedAt : max),
    null
  )
  return {
    lastSessionAt: latest,
    openSessions: sessions.filter((s) => OPEN_STATUSES.includes(s.status))
      .length,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }
}

/** Everything the phone knows about studying, out through the share sheet. */
const ShareWithAgent = (): JSX.Element => {
  const share = useAsyncIntent(() => shareAgentExport(phoneSoundbiteStore()), {
    presentation: "interactive",
  })
  return (
    <section className="mx-auto w-full max-w-md space-y-2 pb-8">
      <p className="text-muted-foreground text-sm">
        Your soundbites, session reflections and stop reasons, as files for an
        agent to read. You pick where they go.
      </p>
      <IntentButton
        state={share.state}
        onPress={() => share.start(undefined)}
        variant="outline"
        size="sm"
        idleLabel="Share with an agent"
        workingLabel="Preparing..."
      />
    </section>
  )
}

const SoundbitesRoute = (): JSX.Element => {
  const { say } = Route.useSearch()
  const navigate = useNavigate()
  // Never waited on: the recording starts whether or not the list has
  // loaded, and a soundbite saved before it has notes no sessions.
  const { data: sessions } = useSessions()
  // The way in. Read once by the page, which keeps it until a take is
  // stored, so clearing `?say=` below does not lose it.
  const source = sourceOf(say)
  // A new request remounts the recorder (it reads its way in once); the
  // clearing below is not a new request, so it never remounts mid-take.
  const arrival = useArrivalKey(isSaySource(say) ? say : undefined)

  return (
    <div className="flex flex-col">
      <Soundbites
        key={arrival}
        source={source}
        autoStart={source !== "direct"}
        // Forget the request once honoured, so going back or reloading does
        // not open the microphone again.
        onAutoStart={() =>
          void navigate({ to: "/soundbites", search: {}, replace: true })
        }
        situation={() => situationFrom(sessions ?? [])}
      />
      {/* Inline, so other builds drop the export and its plugins
          (vite-env.d.ts, VITE_DEVICE_BACKEND). */}
      {import.meta.env.VITE_DEVICE_BACKEND === "true" ? (
        <ShareWithAgent />
      ) : null}
    </div>
  )
}

function validateSearch(search: Record<string, unknown>): SoundbitesSearch {
  return isSaySource(search.say) ? { say: search.say } : {}
}

export const Route = createFileRoute("/_dashboard/_apk/soundbites")({
  validateSearch,
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(sessionsQuery)
  },
  component: SoundbitesRoute,
})
