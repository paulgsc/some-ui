import type { JSX } from "react"
import { cn } from "@some-ui/core-utils"
import type { SoundbiteSituation, SoundbiteSource } from "@some-ui/soundbites"
import { Journal, phoneSoundbiteStore, Soundbites } from "@some-ui/soundbites"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { handOff, shareAgentExport } from "@/lib/agent-export"
import { useArrivalKey } from "@/lib/arrival-key"
import { useAsyncIntent, useIntentEffect } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"
import { letGoJournal, shareJournal } from "@/lib/journal-share"
import type { SessionRecord, SessionStatus } from "@/lib/tenant"
import { sessionsQuery, useSessions } from "@/lib/tenant"

/**
 * `?say=` comes from a tap that already meant "let me talk" (Home's "Not
 * today? Say why", a reminder's "Not today", "Hold to talk"): the page starts
 * listening at once and records which.
 */
type SoundbitesSearch = {
  say?: "sessions" | "reminder" | "capture"
  /**
   * The Build Journal's voice takes instead of the study soundbites. A `say`
   * is always a soundbite, so it wins.
   */
  tab?: "journal"
}

const SAY_SOURCES: ReadonlyArray<NonNullable<SoundbitesSearch["say"]>> = [
  "sessions",
  "reminder",
  "capture",
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

/**
 * Everything the phone knows about studying, out through the share sheet.
 * Held while a take is in flight, so the export cannot miss it.
 */
const ShareWithAgent = ({ taking }: { taking: boolean }): JSX.Element => {
  const share = useAsyncIntent(() => shareAgentExport(phoneSoundbiteStore()), {
    presentation: "interactive",
  })
  // Android says "shared" once an app is picked, even if the person backs
  // out of it: the reflections leave the phone only once they say so.
  useIntentEffect(share.state, ({ outcome, sent }) => {
    if (outcome !== "shared" || sent.length === 0) return
    if (
      confirm(
        `Did they arrive? OK lets the ${sent.length} reflections go from this phone; Cancel keeps them here.`
      )
    )
      handOff(sent)
  })
  return (
    <section className="space-y-2">
      <p className="text-muted-foreground text-sm">
        Your sessions with their reflections, soundbites and stop reasons, as
        files for an agent to read. You pick where they go; once they arrive,
        the reflections leave the phone.
      </p>
      <IntentButton
        state={share.state}
        onPress={() => share.start(undefined)}
        disabled={taking}
        variant="outline"
        size="sm"
        idleLabel="Share with an agent"
        workingLabel="Preparing..."
      />
    </section>
  )
}

/**
 * The page's footer on the phone. The flag is read inline, so other builds
 * drop the export and its plugins (vite-env.d.ts, VITE_DEVICE_BACKEND).
 */
const shareFooter =
  import.meta.env.VITE_DEVICE_BACKEND === "true"
    ? (taking: boolean): JSX.Element => <ShareWithAgent taking={taking} />
    : undefined

/**
 * An episode's takes out through the share sheet, in the primer's order.
 * Held while a take is in flight, so the files cannot miss it; once the
 * person says they arrived, the episode leaves the phone.
 */
const ShareJournal = ({
  taking,
  takes,
}: {
  taking: boolean
  takes: number
}): JSX.Element => {
  const share = useAsyncIntent(() => shareJournal(), {
    presentation: "interactive",
  })
  // Android says "shared" once an app is picked, even if the person backs
  // out of it: the episode leaves the phone only once they say so.
  useIntentEffect(share.state, (outcome) => {
    if (outcome !== "shared") return
    if (
      confirm(
        "Did they arrive? OK lets this episode go from the phone; Cancel keeps it here."
      )
    )
      letGoJournal()
  })
  return (
    <section className="space-y-2">
      <p className="text-muted-foreground text-sm">
        takes.json and each take&apos;s audio, in the primer&apos;s order. Pick
        Build Journal/voice/takes in Drive; once they arrive, the episode leaves
        the phone.
      </p>
      <IntentButton
        state={share.state}
        onPress={() => share.start(undefined)}
        disabled={taking || takes === 0}
        size="sm"
        idleLabel="Share takes"
        workingLabel="Preparing..."
      />
    </section>
  )
}

const journalFooter =
  import.meta.env.VITE_DEVICE_BACKEND === "true"
    ? (state: { taking: boolean; takes: number }): JSX.Element => (
        <ShareJournal {...state} />
      )
    : undefined

const TABS = [
  { tab: undefined, label: "Soundbites" },
  { tab: "journal", label: "Journal" },
] as const

const SoundbitesRoute = (): JSX.Element => {
  const { say, tab } = Route.useSearch()
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

  const journal = tab === "journal" && !isSaySource(say)

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <div
        role="tablist"
        aria-label="Voice"
        className="bg-muted grid grid-cols-2 rounded-full p-1"
      >
        {TABS.map((each) => {
          const selected = (each.tab === "journal") === journal
          return (
            <button
              key={each.label}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() =>
                void navigate({
                  to: "/soundbites",
                  search: each.tab === undefined ? {} : { tab: each.tab },
                  replace: true,
                })
              }
              className={cn(
                "focus-visible:ring-ring rounded-full py-2 text-sm font-bold focus-visible:ring-2 focus-visible:outline-none",
                selected
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground"
              )}
            >
              {each.label}
            </button>
          )
        })}
      </div>
      {journal ? (
        <Journal footer={journalFooter} />
      ) : (
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
          footer={shareFooter}
        />
      )}
    </div>
  )
}

function validateSearch(search: Record<string, unknown>): SoundbitesSearch {
  if (isSaySource(search.say)) return { say: search.say }
  return search.tab === "journal" ? { tab: "journal" } : {}
}

export const Route = createFileRoute("/_dashboard/_apk/soundbites")({
  validateSearch,
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(sessionsQuery)
  },
  component: SoundbitesRoute,
})
