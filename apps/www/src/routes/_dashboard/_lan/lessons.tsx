import type { JSX } from "react"
import { useState } from "react"
import type { Reporting } from "@some-ui/lesson-crm"
import { LessonCrm } from "@some-ui/lesson-crm"
import { createFileRoute } from "@tanstack/react-router"
import { toast } from "sonner"

import { mapFileHostError } from "@/lib/intent/errors"
import { createLessonCrmClient } from "@/lib/lesson-crm-client"

/**
 * The CRM's outcomes via `sonner` (where `interactive` intents report,
 * `lib/intent/presentation.ts`): a summary and, when it could work, Retry.
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
 * The lesson CRM: the lessons `file_host` serves, and the weekly batch.
 * LAN-only (`@some-ui/lesson-crm` is a `lan` workspace); operator routes
 * answer only `OPERATOR_SUBJECTS` (401 signed out, 403 otherwise). Bounded
 * (`lib/route-bounds`).
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
