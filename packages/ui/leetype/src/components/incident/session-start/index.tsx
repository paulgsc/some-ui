import type { FC } from "react"
import { useState } from "react"
import { WorkedAnswer } from "@leetype/components/incident/worked-answer"
import type { PlayForm } from "@leetype/lib/leetype/incident-play"
import type { ParkedRound } from "@leetype/lib/leetype/incident-play/words"
import type { ChoiceScreen } from "@leetype/types/session-file"
import { Button } from "@some-ui/shared"

type SessionStartProps = {
  title: string
  oneLine: string
  /** Where the learner is in the file, in words. */
  place: string
  fullMinutes: number
  shortMinutes: number
  parked: ReadonlyArray<ParkedRound & { readonly screen: ChoiceScreen }>
  onStart: (form: PlayForm) => void
  /** Plays a parked round's return, or the round itself. */
  onRound: (round: ParkedRound, take: "return" | "round") => void
  /** Records a parked round's worked confirmation being taken. */
  onConfirmation: (round: ParkedRound) => void
  /** Leaves without starting a session. */
  onBack?: () => void
}

/**
 * A session's first screen (canon v1.2, Prop. 9.6): the session, where the
 * learner is in it, and its length, declared, with the short form beside
 * it. Every round of the file still parked is here too, its return, the
 * round itself and its worked confirmation each one tap away (Prop. 9.4
 * (d)); a return whose reading was read is said to be ready.
 */
export const SessionStart: FC<SessionStartProps> = ({
  title,
  oneLine,
  place,
  fullMinutes,
  shortMinutes,
  parked,
  onStart,
  onRound,
  onConfirmation,
  onBack,
}) => {
  // Which worked confirmations are open, by round.
  const [open, setOpen] = useState<ReadonlyArray<string>>([])
  return (
    <article className="flex flex-col gap-4 py-2">
      <h2 className="text-pretty text-base font-semibold text-foreground">
        {title}
      </h2>
      <p className="text-pretty text-sm leading-relaxed text-foreground">
        {oneLine}
      </p>
      <p className="text-pretty text-sm text-muted-foreground">{place}</p>
      <div className="flex flex-col gap-2">
        <Button
          className="h-auto min-h-11 whitespace-normal text-pretty py-2"
          onClick={(): void => onStart("full")}
        >
          About {fullMinutes} minutes: the whole session
        </Button>
        {shortMinutes < fullMinutes && (
          <Button
            variant="outline"
            className="h-auto min-h-11 whitespace-normal text-pretty py-2"
            onClick={(): void => onStart("short")}
          >
            About {shortMinutes} minutes: one incident and the take
          </Button>
        )}
        {onBack !== undefined && (
          <Button
            variant="ghost"
            className="min-h-11 self-start"
            onClick={onBack}
          >
            Not now
          </Button>
        )}
      </div>
      {parked.length > 0 && (
        <section
          aria-label="Waiting on a reading"
          className="flex flex-col gap-3"
        >
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
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={(): void => onRound(round, "round")}
                >
                  Play it again
                </Button>
                {!open.includes(round.round) && (
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={(): void => {
                      onConfirmation(round)
                      setOpen((now) => [...now, round.round])
                    }}
                  >
                    Show the worked answer
                  </Button>
                )}
              </div>
              {open.includes(round.round) && (
                <div className="text-sm">
                  <WorkedAnswer screen={round.screen} />
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </article>
  )
}
