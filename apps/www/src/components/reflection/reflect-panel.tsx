import type { JSX, SubmitEvent } from "react"
import { useState } from "react"
import { formatTimecode } from "@some-ui/core-utils"
import { Button, Input, useConfirmSheet } from "@some-ui/shared"
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
    ? "written ones go to home while paired"
    : "kept in this browser"
}

/** A typed line or the one-tap answers: what the panel lists. */
type Written = Reflection & {
  body: Exclude<Reflection["body"], { kind: "voice" }>
}

const isWritten = (reflection: Reflection): reflection is Written =>
  reflection.body.kind !== "voice"

function describe(reflection: Written): string {
  const { body } = reflection
  if (body.kind === "text") return `"${body.text}"`
  return QUESTIONS.flatMap((question) => {
    const answer = body.answers[question.key]
    const label = question.options.find(([id]) => id === answer)?.[1]
    return label ? [`${question.label}: ${label.toLowerCase()}`] : []
  }).join(" · ")
}

/**
 * Reflecting on one session, at any moment of it or after: say it (phone),
 * type it, or tap how it is going. The spoken ones are the take pattern's
 * rows (`DeviceReflectionVoice`); the written ones are listed below, and
 * letting one go asks first, since it cannot be brought back here.
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
  const { ask, sheet } = useConfirmSheet()

  // A spoken one is the take pattern's row, above.
  const own = inOrder(
    kept.filter((r): r is Written => r.sessionId === sessionId && isWritten(r))
  )
  const answers = answersOf(kept, sessionId)?.answers ?? {}
  const stale = staleCount(kept, now)

  // The phone asks in a sheet; the desktop web keeps the browser's dialog
  // (CLAUDE.md, "The phone and the desktop web are separate surfaces").
  const confirmLetGo = (id: string, at: string): void => {
    if (import.meta.env.VITE_DEVICE_BACKEND !== "true") {
      if (confirm(`Let go of the one at ${at}? It can't be brought back.`)) {
        letGo([id])
      }
      return
    }
    ask({
      title: "Let this one go?",
      description: `The one at ${at} leaves this phone and can't be brought back here. One home already has stays on home.`,
      confirm: "Let it go",
      onConfirm: () => letGo([id]),
    })
  }

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
                    onClick={() => confirmLetGo(reflection.id, at)}
                  >
                    <X className="size-3.5" aria-hidden />
                  </Button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {sheet}
    </div>
  )
}
