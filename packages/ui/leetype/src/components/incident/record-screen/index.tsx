import type { FC } from "react"
import { useState } from "react"
import type { SpokenAnswer } from "@leetype/lib/leetype/incident-play"
import type { SpokenTakeSnapshot } from "@leetype/lib/leetype/spoken-take"
import type { SessionScreen } from "@leetype/types/session-file"
import { Button, Label, Textarea } from "@some-ui/shared"
import { Mic } from "lucide-react"

type RecordScreen = Extract<SessionScreen, { type: "record" }>

type RecordScreenProps = {
  screen: RecordScreen
  spoken: SpokenAnswer | null
  /** The microphone, or `null` where the host has none: typing only. */
  take: SpokenTakeSnapshot | null
  onRecordStart: () => void
  onRecordStop: () => void
  onTyped: (text: string) => void
  onPass: () => void
  onTicked: (ticks: ReadonlyArray<string>) => void
}

/**
 * A spoken answer (canon v1.2, Def. 9.5): the prompt, then hold to record,
 * type instead, or pass. The rubric shows only once there is an answer
 * (Ax. 9.2), and the learner ticks what it hit.
 */
export const RecordScreenView: FC<RecordScreenProps> = ({
  screen,
  spoken,
  take,
  onRecordStart,
  onRecordStop,
  onTyped,
  onPass,
  onTicked,
}) => {
  // Edit buffers for this screen's answer; the screen is keyed by its id.
  const [typing, setTyping] = useState(take === null)
  const [text, setText] = useState("")
  const [ticks, setTicks] = useState<ReadonlyArray<string>>([])

  if (spoken !== null) {
    return (
      <article className="flex flex-col gap-4">
        <p className="text-pretty text-base font-medium text-foreground">
          {screen.prompt}
        </p>
        <p className="text-pretty text-sm text-muted-foreground">
          {spoken.as === "recorded"
            ? `You answered aloud, ${String(Math.round(spoken.seconds))} seconds.`
            : `You typed: ${spoken.text}`}
        </p>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-foreground">
            Tick what your answer said
          </legend>
          {screen.rubric.map((point) => (
            <div key={point} className="flex items-start gap-2">
              <input
                type="checkbox"
                id={`tick-${point}`}
                className="mt-0.5 size-4 shrink-0 accent-primary"
                checked={ticks.includes(point)}
                onChange={(event): void => {
                  const { checked } = event.target
                  setTicks((now) =>
                    checked
                      ? [...now, point]
                      : now.filter((tick) => tick !== point)
                  )
                }}
              />
              <Label
                htmlFor={`tick-${point}`}
                className="text-pretty text-sm font-normal leading-snug"
              >
                {point}
              </Label>
            </div>
          ))}
        </fieldset>
        <Button className="self-start" onClick={(): void => onTicked(ticks)}>
          Done
        </Button>
      </article>
    )
  }

  return (
    <article className="flex flex-col gap-4">
      <p className="text-pretty text-base font-medium text-foreground">
        {screen.prompt}
      </p>
      {take !== null && !typing && (
        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            className="h-auto min-h-14 touch-none select-none"
            disabled={take.full}
            onPointerDown={onRecordStart}
            onPointerUp={onRecordStop}
            onPointerCancel={onRecordStop}
            onPointerLeave={take.recording ? onRecordStop : undefined}
          >
            <Mic aria-hidden />
            {take.recording ? "Recording… let go to stop" : "Hold to record"}
          </Button>
          {take.said !== null && (
            <p
              role="status"
              className="text-pretty text-sm text-muted-foreground"
            >
              {take.said}
            </p>
          )}
          <Button
            variant="link"
            className="h-auto self-start p-0"
            onClick={(): void => setTyping(true)}
          >
            Type it instead
          </Button>
        </div>
      )}
      {typing && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="spoken-typed" className="text-sm">
            Your answer, typed
          </Label>
          <Textarea
            id="spoken-typed"
            value={text}
            rows={4}
            onChange={(event): void => setText(event.target.value)}
          />
          {take?.full === true && (
            <p
              role="status"
              className="text-pretty text-sm text-muted-foreground"
            >
              This phone has kept as many answers as it can until you share them
              with a study-context export.
            </p>
          )}
          <Button
            className="self-start"
            disabled={text.trim() === "" || take?.full === true}
            onClick={(): void => onTyped(text.trim())}
          >
            Done
          </Button>
        </div>
      )}
      <Button variant="outline" className="self-start" onClick={onPass}>
        Pass
      </Button>
    </article>
  )
}
