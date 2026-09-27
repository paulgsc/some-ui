import type { JSX } from "react"
import { useState } from "react"
import { LessonCrm } from "@some-ui/lesson-crm"
import { createFileRoute } from "@tanstack/react-router"

import { createLessonCrmClient } from "@/lib/lesson-crm-client"

/**
 * The lesson CRM: the lessons `file_host` serves every learner, and the
 * weekly batch among them. LAN-only because `@some-ui/lesson-crm` is a `lan`
 * workspace, not because anything here is protected - the server's operator
 * routes answer anyone its origin allowlist admits.
 */
const LessonsRoute = (): JSX.Element => {
  const [client] = useState(createLessonCrmClient)
  return (
    <section className="flex flex-col gap-4 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Lessons</h1>
        <p className="text-muted-foreground text-sm">
          What the server serves learners. The manifest is this week&apos;s
          batch: retire a lesson to take it out, restore it to bring it back.
        </p>
      </header>
      <LessonCrm client={client} />
    </section>
  )
}

export const Route = createFileRoute("/_dashboard/_lan/lessons")({
  component: LessonsRoute,
})
