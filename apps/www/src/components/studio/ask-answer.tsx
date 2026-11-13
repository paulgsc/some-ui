/**
 * An ask answered by voice on its page (SFEED5, #2746): one button to say
 * the answer, what home heard in it, and where it goes. Renders
 * `lib/ask-answer`'s state and forwards taps. Phone-only: the ask's route
 * hands it in where the build records.
 */
import type { JSX } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { assertNever } from "@some-ui/core-utils"
import { Button, Notice } from "@some-ui/shared"
import { RECORDING_FAILURE_COPY, TURN_WORDS } from "@some-ui/voice-capture"
import { Mic, Square } from "lucide-react"

import type {
  AnswerNotice,
  AnswerPhase,
  AskAnswerPorts,
} from "@/lib/ask-answer"
import { createAskAnswer } from "@/lib/ask-answer"
import { STUDIO_INDEX_WORDS } from "@/lib/studio-index"

import { Part } from "./layout"

const WORDS = STUDIO_INDEX_WORDS.asks.answer

const noticeSaid = (notice: AnswerNotice): string =>
  typeof notice === "string"
    ? WORDS.notice[notice]
    : RECORDING_FAILURE_COPY[notice.refused]

const where = (phase: AnswerPhase): string | null => {
  switch (phase.kind) {
    case "recording": {
      return phase.ready ? TURN_WORDS.listening : TURN_WORDS.gettingReady
    }
    case "finishing": {
      return TURN_WORDS.finishing
    }
    case "idle":
    case "hearing":
    case "heard":
    case "kept": {
      return null
    }
    default: {
      return assertNever(phase)
    }
  }
}

const keptSaid = (phase: Extract<AnswerPhase, { kind: "kept" }>): string => {
  if (phase.why !== "away") return WORDS.kept[phase.why]
  return phase.on === "home" ? WORDS.kept.awayOnHome : WORDS.kept.awayOnPhone
}

/** `answers`: the ref the take is kept under (`answerRef`). */
export const AskAnswer = ({
  ports,
  answers,
}: {
  ports: AskAnswerPorts
  answers: string
}): JSX.Element => {
  /* eslint-disable owner-guard/no-mount-snapshot -- the runtime is created once per mount, keyed by the ask */
  const [runtime] = useState(() => createAskAnswer(ports, answers))
  /* eslint-enable owner-guard/no-mount-snapshot */
  useEffect(() => runtime.attach(), [runtime])
  const { voice, phase, notice } = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot
  )
  const under = phase.kind === "recording" || phase.kind === "finishing"
  const said =
    phase.kind === "heard" || phase.kind === "kept" || phase.kind === "hearing"
  const status = where(phase)
  return (
    <Part label={WORDS.label}>
      <p className="text-muted-foreground text-sm">{WORDS.line}</p>
      {voice === "unpaired" || voice === "unavailable" ? (
        <p className="text-sm">
          {voice === "unpaired" ? WORDS.unpaired : WORDS.noVoice}
        </p>
      ) : under ? (
        <Button
          size="lg"
          disabled={phase.kind !== "recording"}
          onClick={() => runtime.dispatch({ type: "stopTalking" })}
        >
          <Square className="size-5" aria-hidden="true" />
          {TURN_WORDS.stop}
        </Button>
      ) : (
        <Button
          size="lg"
          disabled={voice !== "ready"}
          onClick={() => runtime.dispatch({ type: "talk" })}
        >
          <Mic className="size-5" aria-hidden="true" />
          {said ? WORDS.again : TURN_WORDS.talk}
        </Button>
      )}
      {phase.kind === "heard" && (
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs font-bold">
            {WORDS.heard}
          </span>
          <p className="lifted rounded-2xl p-3 text-base">{phase.words}</p>
        </div>
      )}
      {phase.kind === "kept" && <Notice>{keptSaid(phase)}</Notice>}
      {phase.kind === "hearing" && (
        <Notice>
          <span className="block">{TURN_WORDS.hearing}</span>
          <span className="text-muted-foreground block">
            {WORDS.hearingLine}
          </span>
        </Notice>
      )}
      {status !== null && <Notice>{status}</Notice>}
      {notice !== null && <Notice>{noticeSaid(notice)}</Notice>}
    </Part>
  )
}
