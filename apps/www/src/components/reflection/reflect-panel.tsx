import type { JSX, SubmitEvent } from "react"
import { useState } from "react"
import { formatTimecode } from "@some-ui/core-utils"
import { Button, Input } from "@some-ui/shared"
import { X } from "lucide-react"

import { useMinuteClock } from "@/lib/clock"
import type { KeepResult, Reflection } from "@/lib/session-reflection"
import {
  answersOf,
  inOrder,
  QUESTIONS,
  REFLECTION_TEXT_MAX,
  reflections,
  staleCount,
} from "@/lib/session-reflection"
import { useReflections } from "@/lib/session-reflection/use-reflections"
import { ToggleChips } from "@/components/player/toggle-chips"

import { DeviceReflectionVoice } from "./device-reflection-voice"
import { letGo } from "./let-go"

const REFUSED: Record<Exclude<KeepResult, "kept">, string> = {
  failed: "The phone wouldn't store that. Try again.",
}

/** What the count says beside it: where reflections are kept. */
function where(): string {
  return import.meta.env.VITE_DEVICE_BACKEND === "true"
    ? "written ones go to home"
    : "kept in this browser"
}

function describe(reflection: Reflection): string {
  const { body } = reflection
  if (body.kind === "text") return `"${body.text}"`
  if (body.kind === "voice") return `Voice · ${formatTimecode(body.durationMs)}`
  return QUESTIONS.flatMap((question) => {
    const answer = body.answers[question.key]
    const label = question.options.find(([id]) => id === answer)?.[1]
    return label ? [`${question.label}: ${label.toLowerCase()}`] : []
  }).join(" · ")
}

/**
 * Reflecting on one session, at any moment of it or after: say it (phone),
 * type it, or tap how it is going. There is always room for another: on the
 * phone, the written ones go to home (LA16, docs/learner-data-authority.md).
 */
export const ReflectPanel = ({
  sessionId,
  atMs,
}: {
  sessionId: string
  /** How far into the session now, or null after it ended. */
  atMs: number | null
}): JSX.Element => {
  const { kept } = useReflections()
  const now = useMinuteClock().getTime()
  const [text, setText] = useState("")
  const [refused, setRefused] = useState<string | null>(null)

  const own = inOrder(kept.filter((r) => r.sessionId === sessionId))
  const answers = answersOf(kept, sessionId)?.answers ?? {}
  const stale = staleCount(kept, now)

  const said = (result: KeepResult): boolean => {
    setRefused(result === "kept" ? null : REFUSED[result])
    return result === "kept"
  }

  const keepText = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const line = text.trim()
    if (line === "") return
    const result = reflections.keep({
      id: crypto.randomUUID(),
      sessionId,
      createdAt: new Date().toISOString(),
      atMs,
      body: { kind: "text", text: line },
    })
    if (said(result)) setText("")
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        {kept.length} kept
        {stale > 0 ? ` · ${stale} stale` : ""} · {where()}
      </p>

      {import.meta.env.VITE_DEVICE_BACKEND === "true" && (
        <DeviceReflectionVoice
          key={sessionId}
          sessionId={sessionId}
          atMs={atMs}
        />
      )}
      <form onSubmit={keepText} className="flex gap-2">
        <Input
          aria-label="Type a reflection"
          placeholder={
            import.meta.env.VITE_DEVICE_BACKEND === "true"
              ? "or type a line..."
              : "What's on your mind?"
          }
          value={text}
          maxLength={REFLECTION_TEXT_MAX}
          onChange={(event) => setText(event.target.value)}
          className="h-11"
        />
        <Button
          type="submit"
          variant="outline"
          className="h-11"
          disabled={text.trim() === ""}
        >
          Keep
        </Button>
      </form>

      <div className="flex flex-col gap-2">
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
                onChange={(next) =>
                  said(
                    reflections.setAnswers(
                      sessionId,
                      { ...answers, [question.key]: next ?? undefined },
                      atMs
                    )
                  )
                }
              />
            </div>
          </div>
        ))}
      </div>

      {refused !== null && (
        <p role="alert" className="text-destructive text-sm">
          {refused}
        </p>
      )}

      {own.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t pt-3">
          <p className="text-sm font-medium">This session · {own.length}</p>
          <ul className="flex flex-col gap-1">
            {own.map((reflection) => {
              const timecode =
                reflection.atMs === null
                  ? null
                  : formatTimecode(reflection.atMs)
              const at = timecode ?? "the end"
              return (
                <li
                  key={reflection.id}
                  className="bg-muted/60 flex items-center gap-2 rounded-md py-1 pr-1 pl-2.5 text-sm"
                >
                  <span className="text-muted-foreground w-12 shrink-0 font-mono text-xs">
                    {timecode ?? "after"}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {describe(reflection)}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8 shrink-0"
                    aria-label={`Let go of the one at ${at}`}
                    onClick={() => letGo([reflection.id])}
                  >
                    <X className="size-3.5" aria-hidden />
                  </Button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
