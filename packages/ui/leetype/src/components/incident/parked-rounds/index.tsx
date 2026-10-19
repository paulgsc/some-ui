import type { FC } from "react"
import { useState } from "react"
import { WorkedAnswer } from "@leetype/components/incident/worked-answer"
import type { ParkedRound } from "@leetype/lib/leetype/incident-play/words"
import type { ChoiceScreen, SessionScreen } from "@leetype/types/session-file"
import { Button } from "@some-ui/shared"

type RecordScreen = Extract<SessionScreen, { type: "record" }>

type ParkedRoundsProps = {
  /** A round, or a take (a record screen), parked. */
  parked: ReadonlyArray<
    ParkedRound & { readonly screen: ChoiceScreen | RecordScreen }
  >
  /** Plays a parked round's return, or the round itself. */
  onRound: (round: ParkedRound, take: "return" | "round") => void
  /** Records a parked round's worked confirmation being taken. */
  onConfirmation: (round: ParkedRound) => void
  /** The screen in view, during play: it is not offered to play again. */
  inView?: string
}

/**
 * The rounds of the file still waiting on a reading, each with its return,
 * the round itself and its worked confirmation one tap away (canon v1.2,
 * Prop. 9.4 (d)); a return whose reading was read is said to be ready. A
 * take has no return: it is said again, and its rubric is its worked
 * confirmation.
 */
export const ParkedRounds: FC<ParkedRoundsProps> = ({
  parked,
  onRound,
  onConfirmation,
  inView,
}) => {
  // Which worked confirmations are open, by round.
  const [open, setOpen] = useState<ReadonlyArray<string>>([])
  if (parked.length === 0) return null
  return (
    <section aria-label="Waiting on a reading" className="flex flex-col gap-3">
      <p className="text-sm font-medium text-foreground">
        Waiting on a reading
      </p>
      {parked.map((round) => (
        <div
          key={round.round}
          className="flex flex-col gap-2 rounded-lg border border-border/60 px-3 py-2"
        >
          <p className="text-pretty text-sm text-foreground">
            {round.name}
            {round.read ? ": you read what it was waiting on." : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            {round.returns && (
              <Button
                variant={round.read ? "default" : "outline"}
                className="min-h-11"
                onClick={(): void => onRound(round, "return")}
              >
                Try it with new numbers
              </Button>
            )}
            {round.round !== inView && (
              <Button
                variant="outline"
                className="min-h-11"
                onClick={(): void => onRound(round, "round")}
              >
                {round.screen.type === "record"
                  ? "Say it again"
                  : "Play it again"}
              </Button>
            )}
            {!open.includes(round.round) && (
              <Button
                variant="outline"
                className="min-h-11"
                onClick={(): void => {
                  onConfirmation(round)
                  setOpen((now) => [...now, round.round])
                }}
              >
                {round.screen.type === "record"
                  ? "Show what a good answer says"
                  : "Show the worked answer"}
              </Button>
            )}
          </div>
          {open.includes(round.round) && (
            <div className="text-sm">
              {round.screen.type === "record" ? (
                <ul className="flex list-disc flex-col gap-1 pl-5">
                  {round.screen.rubric.map((point, index) => (
                    <li
                      key={`${String(index)} ${point}`}
                      className="text-pretty"
                    >
                      {point}
                    </li>
                  ))}
                </ul>
              ) : (
                <WorkedAnswer screen={round.screen} />
              )}
            </div>
          )}
        </div>
      ))}
    </section>
  )
}
