import type { FC } from "react"
import { useEffect, useRef } from "react"
import { Glosses } from "@leetype/components/incident/glosses"
import { WorkedAnswer } from "@leetype/components/incident/worked-answer"
import type { Reveal } from "@leetype/lib/leetype/incident-play"
import type { ChoiceScreen } from "@leetype/types/session-file"
import { Button } from "@some-ui/shared"

type RoundScreenProps = {
  screen: ChoiceScreen
  /** The session file's glossary, for the terms this screen glosses. */
  glossary: Readonly<Record<string, string>>
  reveal: Reveal | null
  onPick: (option: number) => void
  onContinue: () => void
  onShowConfirmation: () => void
}

/**
 * An incident round on one scrolling screen (canon v1.2, Def. 9.3): the job
 * pinned above the situation, the options under it, and after the pick its
 * reveal, brought into view and given focus, since the tapped option is no
 * longer there to hold it. Before the pick nothing names the rule
 * (Rem. 9.4); a struggle's reveal says what the picked option breaks and
 * never which one is right, with the worked confirmation one tap away
 * (Prop. 9.4 (d)).
 */
export const RoundScreen: FC<RoundScreenProps> = ({
  screen,
  glossary,
  reveal,
  onPick,
  onContinue,
  onShowConfirmation,
}) => {
  const picked = reveal === null ? undefined : screen.options[reveal.option]
  const revealed = useRef<HTMLElement>(null)
  const shown = reveal !== null
  useEffect(() => {
    if (!shown) return
    revealed.current?.scrollIntoView({ block: "nearest" })
    revealed.current?.focus({ preventScroll: true })
  }, [shown])

  return (
    <article className="flex flex-col gap-4">
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
      {screen.panel !== undefined && (
        <section
          aria-label={screen.panel.title ?? "Who holds what"}
          className="rounded-lg border border-border/60 px-3 py-2"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {screen.panel.title ?? "Who holds what"}
          </p>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {screen.panel.rows.map((row, index) => (
              <div key={`${String(index)} ${row.who}`} className="contents">
                <dt className="font-medium text-foreground">{row.who}</dt>
                <dd className="min-w-0 text-muted-foreground">{row.holds}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {screen.provenance !== undefined && (
        <p className="text-xs text-muted-foreground">{screen.provenance}</p>
      )}
      <Glosses terms={screen.glosses} glossary={glossary} />
      <div role="group" aria-label="Options" className="flex flex-col gap-2">
        {screen.options.map((option, index) => (
          <Button
            key={`${String(index)} ${option.label}`}
            variant={reveal?.option === index ? "default" : "outline"}
            className="h-auto min-h-11 justify-start whitespace-normal text-pretty py-2 text-left"
            disabled={reveal !== null}
            aria-pressed={reveal?.option === index}
            onClick={(): void => onPick(index)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {reveal !== null && (
        <section
          ref={revealed}
          tabIndex={-1}
          aria-label="What your pick shows"
          className="flex flex-col gap-3 rounded-lg border-l-2 border-l-border bg-card/50 px-3 py-3 text-sm outline-none"
        >
          {reveal.confirmation ? (
            <WorkedAnswer screen={screen} />
          ) : (
            <>
              {picked?.feedback !== undefined && picked.correct !== true && (
                <p className="text-pretty text-muted-foreground">
                  {picked.feedback}
                </p>
              )}
              <Button
                variant="outline"
                className="min-h-11 self-start"
                onClick={onShowConfirmation}
              >
                Show the worked answer
              </Button>
            </>
          )}
          <Button className="min-h-11 self-start" onClick={onContinue}>
            Continue
          </Button>
        </section>
      )}
    </article>
  )
}
