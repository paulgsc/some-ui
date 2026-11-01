import type { FC } from "react"
import { useState } from "react"
import { Glosses } from "@leetype/components/incident/glosses"
import { RubricPoints } from "@leetype/components/incident/rubric-points"
import {
  SCREEN_ARTICLE,
  ScreenHeading,
} from "@leetype/components/incident/screen-heading"
import type { SpokenAnswer } from "@leetype/lib/leetype/incident-play"
import type { SpokenTakeView } from "@leetype/lib/leetype/spoken-take"
import type { SessionScreen } from "@leetype/types/session-file"
import { rubricText } from "@leetype/types/session-file"
import { assertNever } from "@some-ui/core-utils"
import { Button, Label, TakeItem, Textarea } from "@some-ui/shared"
import type { TakePlace } from "@some-ui/voice-capture"

type RecordScreen = Extract<SessionScreen, { type: "record" }>

type RecordScreenProps = {
  screen: RecordScreen
  glossary: Readonly<Record<string, string>>
  spoken: SpokenAnswer | null
  /** The answer's take, or `null` where the host has no microphone: typing only. */
  take: SpokenTakeView | null
  /** D1: starts a take, a Redo of the recorded answer included, or stops it. */
  onTap: () => void
  onPlay: (id: string) => void
  /** D3: sets the recorded answer's take aside, withdrawing the answer. */
  onLetGo: (id: string, place: TakePlace) => void
  /** The answer is to be typed: a take under way answers nothing. */
  onTypeInstead: () => void
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

/** What the ticks are of: a Redo's take, or a new answer, starts them afresh. */
function answerKey(spoken: SpokenAnswer): string {
  return spoken.as === "recorded" ? spoken.take : spoken.as
}

/** The rubric's points, ticked for one answer, and Done. */
const TickedRubric: FC<{
  points: ReadonlyArray<string>
  waiting: boolean
  onTicked: (ticks: ReadonlyArray<string>) => void
}> = ({ points, waiting, onTicked }) => {
  // An edit buffer for one answer: keyed by it where it is drawn.
  const [ticks, setTicks] = useState<ReadonlyArray<string>>([])
  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">
          Tick what your answer said
        </legend>
        {points.map((point, index) => (
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
      <Button
        className="min-h-11 self-start"
        disabled={waiting}
        onClick={(): void => onTicked(ticks)}
      >
        Done
      </Button>
    </>
  )
}

/**
 * A spoken answer (canon v1.2, Def. 9.5): the prompt, then tap to record,
 * type instead, or pass. The take is the take pattern's parts (`TakeItem`):
 * once it is the answer, its row stands where the answer is said, with Play,
 * Redo and Let it go. The rubric shows only once there is an answer or a
 * pass (Ax. 9.2); the learner ticks what an answer hit.
 */
export const RecordScreenView: FC<RecordScreenProps> = ({
  screen,
  glossary,
  spoken,
  take,
  onTap,
  onPlay,
  onLetGo,
  onTypeInstead,
  onTyped,
  onPass,
  onTicked,
}) => {
  // Edit buffers for this screen's answer; the screen is keyed by its id.
  const [typing, setTyping] = useState(take === null)
  const [text, setText] = useState("")
  // A take needs room for audio and a note; a typed answer, a note only.
  const full = take?.full === true
  const noRoom = take?.notesFull === true

  const heading = (
    <>
      <ScreenHeading screen={screen} />
      <Glosses terms={screen.glosses} glossary={glossary} />
      <p className="text-pretty text-base font-medium text-foreground">
        {screen.prompt}
      </p>
    </>
  )

  const takeItem =
    take === null ? null : (
      <TakeItem
        view={take.item}
        onTap={onTap}
        onPlay={onPlay}
        onRedo={onTap}
        onLetGo={onLetGo}
      />
    )

  if (spoken !== null) {
    return (
      <article className={SCREEN_ARTICLE}>
        {heading}
        {spoken.as === "recorded" && takeItem !== null ? (
          takeItem
        ) : (
          <p className="text-pretty text-sm text-muted-foreground">
            {answered(spoken)}
          </p>
        )}
        {spoken.as === "passed" ? (
          <>
            <RubricPoints rubric={rubricText(screen)} />
            <Button
              className="min-h-11 self-start"
              onClick={(): void => onTicked([])}
            >
              Continue
            </Button>
          </>
        ) : (
          <TickedRubric
            key={answerKey(spoken)}
            points={rubricText(screen)}
            waiting={take?.answering === true}
            onTicked={onTicked}
          />
        )}
      </article>
    )
  }

  return (
    <article className={SCREEN_ARTICLE}>
      {heading}
      {full && (
        <p role="status" className="text-pretty text-sm text-muted-foreground">
          {noRoom
            ? "This phone has kept as many answers as it can until a home it's paired with has the ones on it."
            : "This phone has kept as many recorded answers as it can until a home it's paired with has the ones on it. You can still type one."}
        </p>
      )}
      {take !== null && !typing && (
        <div className="flex flex-col gap-2">
          {!full && takeItem}
          <Button
            variant="outline"
            className="min-h-11 self-start"
            onClick={(): void => {
              setTyping(true)
              onTypeInstead()
            }}
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
