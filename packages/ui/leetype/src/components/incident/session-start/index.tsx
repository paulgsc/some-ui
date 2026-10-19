import type { FC } from "react"
import type { PlayForm } from "@leetype/lib/leetype/incident-play"
import type { ReadyReturn } from "@leetype/lib/leetype/incident-play/words"
import { Button } from "@some-ui/shared"

type SessionStartProps = {
  title: string
  oneLine: string
  /** Where the learner is in the file, in words. */
  place: string
  fullMinutes: number
  shortMinutes: number
  returns: ReadonlyArray<ReadyReturn>
  onStart: (form: PlayForm) => void
  onReturn: (ready: ReadyReturn) => void
}

/**
 * A session's first screen (canon v1.2, Prop. 9.6): the session, where the
 * learner is in it, and its length, declared, with the short form beside
 * it. A parked round whose reading has been read is offered back here.
 */
export const SessionStart: FC<SessionStartProps> = ({
  title,
  oneLine,
  place,
  fullMinutes,
  shortMinutes,
  returns,
  onStart,
  onReturn,
}) => (
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
      <Button
        variant="outline"
        className="h-auto min-h-11 whitespace-normal text-pretty py-2"
        onClick={(): void => onStart("short")}
      >
        About {shortMinutes} minutes: one incident and the take
      </Button>
    </div>
    {returns.length > 0 && (
      <section aria-label="Waiting for you" className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">
          You read what these were waiting on:
        </p>
        {returns.map((ready) => (
          <Button
            key={ready.round}
            variant="ghost"
            className="h-auto justify-start whitespace-normal text-pretty py-2 text-left"
            onClick={(): void => onReturn(ready)}
          >
            Try {ready.name} again, with new numbers
          </Button>
        ))}
      </section>
    )}
  </article>
)
