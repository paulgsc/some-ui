import type { FC } from "react"
import { useState } from "react"
import { Glosses } from "@leetype/components/incident/glosses"
import type { SpokenAnswer } from "@leetype/lib/leetype/incident-play"
import type { SpokenTakeSnapshot } from "@leetype/lib/leetype/spoken-take"
import type { SessionScreen } from "@leetype/types/session-file"
import { assertNever } from "@some-ui/core-utils"
import { Button, Label, Textarea } from "@some-ui/shared"
import { Mic } from "lucide-react"

type RecordScreen = Extract<SessionScreen, { type: "record" }>

type RecordScreenProps = {
  screen: RecordScreen
  glossary: Readonly<Record<string, string>>
  spoken: SpokenAnswer | null
  /** The microphone, or `null` where the host has none: typing only. */
  take: SpokenTakeSnapshot | null
  onRecordStart: () => void
  onRecordStop: () => void
  onTyped: (text: string) => void
  onPass: () => void
  onTicked: (ticks: ReadonlyArray<string>) => void
}

function answered(spoken: SpokenAnswer): string {
  switch (spoken.as) {
    case "recorded": {
      return `You answered aloud, ${String(Math.round(spoken.seconds))} seconds.`
    }
    case "typed": {
      return `You typed: ${spoken.text}`
    }
    case "passed": {
      return "You passed. This is what a good answer would hit:"
    }
    default: {
      return assertNever(spoken)
    }
  }
}

/**
 * A spoken answer (canon v1.2, Def. 9.5): the prompt, then hold to record,
 * type instead, or pass. The rubric shows only once there is an answer or a
 * pass (Ax. 9.2); the learner ticks what an answer hit.
 */
export const RecordScreenView: FC<RecordScreenProps> = ({
  screen,
  glossary,
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
  // A take needs room for audio and a note; a typed answer, a note only.
  const full = take?.full === true
  const noRoom = take?.notesFull === true

  const heading = (
    <>
      {screen.pinned !== undefined && (
        <p className="sticky top-0 z-10 -mx-4 border-b border-border bg-background px-4 py-2 text-pretty text-sm font-medium text-foreground">
          {screen.pinned}
        </p>
      )}
      {screen.title !== undefined && (
        <h2 className="text-pretty text-base font-semibold text-foreground">
          {screen.title}
        </h2>
      )}
      {screen.body !== undefined && (
        <p className="whitespace-pre-line text-pretty text-sm leading-relaxed text-foreground">
          {screen.body}
        </p>
      )}
      <Glosses terms={screen.glosses} glossary={glossary} />
      <p className="text-pretty text-base font-medium text-foreground">
        {screen.prompt}
      </p>
    </>
  )

  if (spoken !== null) {
    return (
      <article className="flex flex-col gap-4">
        {heading}
        <p className="text-pretty text-sm text-muted-foreground">
          {answered(spoken)}
        </p>
        {spoken.as === "passed" ? (
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {screen.rubric.map((point, index) => (
              <li key={`${String(index)} ${point}`} className="text-pretty">
                {point}
              </li>
            ))}
          </ul>
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-foreground">
              Tick what your answer said
            </legend>
            {screen.rubric.map((point, index) => (
              <div
                key={`${String(index)} ${point}`}
                className="flex items-start gap-2"
              >
                <input
                  type="checkbox"
                  id={`tick-${String(index)}`}
                  className="mt-0.5 size-5 shrink-0 accent-primary"
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
                  htmlFor={`tick-${String(index)}`}
                  className="text-pretty text-sm font-normal leading-snug"
                >
                  {point}
                </Label>
              </div>
            ))}
          </fieldset>
        )}
        <Button
          className="min-h-11 self-start"
          onClick={(): void => onTicked(ticks)}
        >
          {spoken.as === "passed" ? "Continue" : "Done"}
        </Button>
      </article>
    )
  }

  return (
    <article className="flex flex-col gap-4">
      {heading}
      {full && (
        <p role="status" className="text-pretty text-sm text-muted-foreground">
          {noRoom
            ? "This phone has kept as many answers as it can until you share them with a study-context export."
            : "This phone has kept as many recorded answers as it can until you share them with a study-context export. You can still type one."}
        </p>
      )}
      {take !== null && !typing && (
        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            className="h-auto min-h-14 touch-none select-none"
            disabled={full}
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
            variant="outline"
            className="min-h-11 self-start"
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
          <Button
            className="min-h-11 self-start"
            disabled={text.trim() === "" || noRoom}
            onClick={(): void => onTyped(text.trim())}
          >
            Done
          </Button>
        </div>
      )}
      <Button
        variant="outline"
        className="min-h-11 self-start"
        onClick={onPass}
      >
        Pass
      </Button>
    </article>
  )
}
