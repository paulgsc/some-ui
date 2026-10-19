import type { FC } from "react"
import { ParkedRounds } from "@leetype/components/incident/parked-rounds"
import type { PlayForm } from "@leetype/lib/leetype/incident-play"
import type { ParkedRound } from "@leetype/lib/leetype/incident-play/words"
import { Button } from "@some-ui/shared"

type SessionStartProps = {
  title: string
  oneLine: string
  /** Where the learner is in the file, in words. */
  place: string
  fullMinutes: number
  shortMinutes: number
  parked: ReadonlyArray<ParkedRound>
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
 * it, and every round of the file still parked (`ParkedRounds`).
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
      <ParkedRounds
        parked={parked}
        onRound={onRound}
        onConfirmation={onConfirmation}
      />
    </article>
  )
}
