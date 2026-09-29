import type { JSX } from "react"
import { useState } from "react"
import type { Reporting } from "@some-ui/lesson-crm"
import { LessonCrm } from "@some-ui/lesson-crm"
import { createFileRoute } from "@tanstack/react-router"
import { toast } from "sonner"

import { mapFileHostError } from "@/lib/intent/errors"
import { createLessonCrmClient } from "@/lib/lesson-crm-client"

/**
 * The CRM's outcomes on this app's overlay plane: `sonner`, mounted once in
 * `providers/index.tsx`, which is where `interactive` intents report
 * (`lib/intent/presentation.ts`). A failure carries its summary and, when
 * trying again could work, a Retry action.
 */
const reporting: Reporting = {
  notify: (notice) => {
    if (notice.tone === "success") {
      toast.success(notice.title)
      return
    }
    const { retry } = notice
    toast.error(notice.title, {
      description: notice.error.summary,
      ...(retry ? { action: { label: "Retry", onClick: retry } } : {}),
    })
  },
  mapError: mapFileHostError,
}

/**
 * The lesson CRM: the lessons `file_host` serves every learner, and the
 * weekly batch among them. LAN-only because `@some-ui/lesson-crm` is a `lan`
 * workspace; the server answers its operator routes only to a passkey
 * session whose subject is in `OPERATOR_SUBJECTS` (401 otherwise, or 403
 * for anyone else signed in).
 *
 * Bounded (`lib/route-bounds`): the CRM is panes of fixed chrome around what
 * they hold, so it takes the window and the page never scrolls behind it.
 */
const LessonsRoute = (): JSX.Element => {
  const [client] = useState(createLessonCrmClient)
  return (
    <section className="flex h-full min-h-0 flex-col gap-3">
      <h1 className="shrink-0 text-xl font-semibold">Lessons</h1>
      <div className="min-h-0 flex-1">
        <LessonCrm client={client} reporting={reporting} />
      </div>
    </section>
  )
}

export const Route = createFileRoute("/_dashboard/_lan/lessons")({
  staticData: { bounded: true },
  component: LessonsRoute,
})
