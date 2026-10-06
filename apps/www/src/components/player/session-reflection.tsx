import type { JSX } from "react"
import { useId, useState } from "react"

import type { Reflection } from "@/lib/session-reflection"
import {
  QUESTIONS,
  readReflection,
  writeReflection,
} from "@/lib/session-reflection"

import { ToggleChips } from "./toggle-chips"

/**
 * "How did it go?", read from the store each render until the first tap, so
 * a revisited wrap shows what was answered.
 */
export const SessionReflection = ({
  sessionId,
}: {
  sessionId: string
}): JSX.Element => {
  const headingId = useId()
  const [picked, setPicked] = useState<Reflection | null>(null)
  const answers = picked ?? readReflection(sessionId)

  const pick = (key: keyof Reflection, value: string | null): void => {
    const next = { ...answers, [key]: value ?? undefined }
    writeReflection(sessionId, next)
    setPicked(next)
  }

  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id={headingId} className="font-semibold">
          How did it go?
        </h3>
        <span className="text-muted-foreground text-xs">
          optional, one tap each
        </span>
      </div>
      {QUESTIONS.map((question) => (
        <div
          key={question.key}
          role="group"
          aria-label={question.label}
          className="flex items-center gap-2"
        >
          <span className="text-muted-foreground w-16 shrink-0 text-sm">
            {question.label}
          </span>
          <div className="grid min-w-0 flex-1 grid-cols-3 gap-1.5">
            <ToggleChips
              options={question.options}
              value={answers[question.key]}
              onChange={(next) => pick(question.key, next)}
            />
          </div>
        </div>
      ))}
    </section>
  )
}
