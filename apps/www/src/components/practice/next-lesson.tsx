/**
 * Practice Home's "Next lesson": one press makes a Korean session at its
 * defaults (`lib/quick-start`), starts it and opens the player on the
 * lesson (`?next=true`: it plays at once, and Korean opens on the newest
 * lesson not opened). The composer stays behind "Start" for anything else.
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
import { basicSession } from "@/lib/quick-start"
import type { SessionRecord } from "@/lib/tenant"
import { useCreateSession, useUpdateSession } from "@/lib/tenant"

const activate = (
  session: SessionRecord
): { id: string; patch: { status: "active"; startedAt: string } } => ({
  id: session.id,
  patch: { status: "active", startedAt: new Date().toISOString() },
})

export const NextLesson = ({
  className,
}: {
  className?: string
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
      search: { next: true },
    })
  })

  const made = matchIntent<SessionRecord, SessionRecord | null>(create.state, {
    idle: () => null,
    working: () => null,
    succeeded: (session) => session,
    failed: () => null,
  })
  const press = (): void => {
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
      idleLabel="Next lesson"
      workingLabel="Getting it ready..."
      size="sm"
      className={className}
    />
  )
}
