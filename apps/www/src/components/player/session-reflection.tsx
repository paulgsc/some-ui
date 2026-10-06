import type { JSX } from "react"
import { useState } from "react"
import { Button } from "@some-ui/shared"

import type { Reflection } from "@/lib/session-reflection"
import {
  QUESTIONS,
  readReflection,
  writeReflection,
} from "@/lib/session-reflection"

/**
 * "How did it go?": optional, one tap per row, a second tap clears it. It
 * never gates leaving the wrap. Read from the store each render until the
 * first tap, so a revisited wrap shows what was answered.
 */
export const SessionReflection = ({
  sessionId,
}: {
  sessionId: string
}): JSX.Element => {
  const [picked, setPicked] = useState<Reflection | null>(null)
  const answers = picked ?? readReflection(sessionId)

  const pick = (key: keyof Reflection, value: string): void => {
    const next = {
      ...answers,
      [key]: answers[key] === value ? undefined : value,
    }
    writeReflection(sessionId, next)
    setPicked(next)
  }

  return (
    <section aria-labelledby="how-did-it-go" className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="how-did-it-go" className="font-semibold">
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
            {question.options.map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={
                  answers[question.key] === value ? "default" : "outline"
                }
                aria-pressed={answers[question.key] === value}
                className="h-11"
                onClick={() => pick(question.key, value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
