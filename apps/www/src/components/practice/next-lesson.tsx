/**
 * Practice Home's "Next lesson" and "Pick a portion": one press makes a
 * Korean session at its defaults (`lib/quick-start`), starts it and opens
 * the player on the lesson (`?open=`: it plays at once, and Korean opens on
 * the newest lesson not opened, or on "What are you hungry for?"). The
 * composer stays behind "Start" for anything else.
 *
 * Made then started, as the composer's "Save & Play" is: a press after the
 * session was made but not started only starts it, so one press never makes
 * two sessions.
 */
import type { JSX } from "react"
import { useState } from "react"
import { matchIntent } from "@some-ui/intent-kit"
import { useNavigate } from "@tanstack/react-router"

import {
  composeSequentialIntents,
  useIntent,
  useIntentEffect,
} from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"
import { basicSession, startedPatch } from "@/lib/quick-start"
import type { SessionRecord } from "@/lib/tenant"
import { useCreateSession, useUpdateSession } from "@/lib/tenant"
import type { LessonOpening } from "@/components/player/session-viewport"

const activate = (
  session: SessionRecord
): { id: string; patch: ReturnType<typeof startedPatch> } => ({
  id: session.id,
  patch: startedPatch(),
})

/** Each press's words, by where it opens the lesson. */
const LABELS: Record<LessonOpening, string> = {
  next: "Next lesson",
  menu: "Pick a portion",
}

export const NextLesson = ({
  open = "next",
  variant,
  className,
  onLaunch,
}: {
  /** Where the lesson opens: the next lesson, or the portion menu. */
  open?: LessonOpening
  variant?: "outline"
  className?: string
  /**
   * Pressed: the host keeps this mounted from now until it navigates, as
   * the session it starts shows as in progress before then.
   */
  onLaunch?: () => void
}): JSX.Element => {
  const navigate = useNavigate()
  const create = useIntent(useCreateSession(), { presentation: "interactive" })
  const start = useIntent(useUpdateSession(), { presentation: "interactive" })
  // Named once per mount: a store that takes an id makes one session
  // however often the same create is sent.
  const [id] = useState(() => crypto.randomUUID())

  useIntentEffect(create, (session) => start.start(activate(session)))
  useIntentEffect(start, (session) => {
    void navigate({
      to: "/sessions/$sessionId",
      params: { sessionId: session.id },
      search: { open },
    })
  })

  const made = matchIntent<SessionRecord, SessionRecord | null>(create.state, {
    idle: () => null,
    working: () => null,
    succeeded: (session) => session,
    failed: () => null,
  })
  const press = (): void => {
    onLaunch?.()
    if (made) start.start(activate(made))
    else create.start({ ...basicSession(["topik"]), id })
  }

  return (
    <IntentButton
      state={composeSequentialIntents(create.state, start.state, {
        first: "make",
        second: "start",
      })}
      onPress={press}
      idleLabel={LABELS[open]}
      workingLabel="Getting it ready..."
      size="sm"
      variant={variant}
      className={className}
      failureOwnLine
    />
  )
}
