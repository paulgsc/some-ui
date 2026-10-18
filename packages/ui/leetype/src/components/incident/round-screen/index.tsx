import type { FC } from "react"
import type { Reveal } from "@leetype/lib/leetype/incident-play"
import type { ChoiceScreen } from "@leetype/types/session-file"
import { cn } from "@some-ui/core-utils"
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
 * reveal. Before the pick nothing names the rule (Rem. 9.4); a struggle's
 * reveal says what the picked option breaks and never which one is right,
 * with the worked confirmation one tap away (Prop. 9.4 (d)).
 */
export const RoundScreen: FC<RoundScreenProps> = ({
  screen,
  glossary,
  reveal,
  onPick,
  onContinue,
  onShowConfirmation,
}) => {
  const terms = (screen.glosses ?? []).flatMap((term) => {
    const gloss = glossary[term]
    return gloss === undefined ? [] : [{ term, gloss }]
  })
  const picked = reveal === null ? undefined : screen.options[reveal.option]
  const correctIndex = screen.options.findIndex((option) => option.correct)

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
            {screen.panel.rows.map((row) => (
              <div key={row.who} className="contents">
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
      {terms.length > 0 && (
        <dl className="flex flex-col gap-1 text-xs text-muted-foreground">
          {terms.map(({ term, gloss }) => (
            <div key={term}>
              <dt className="inline font-semibold text-foreground">{term}</dt>
              <dd className="inline">: {gloss}</dd>
            </div>
          ))}
        </dl>
      )}
      <div role="group" aria-label="Options" className="flex flex-col gap-2">
        {screen.options.map((option, index) => (
          <Button
            key={option.label}
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
          aria-label="What your pick shows"
          className="flex flex-col gap-3 rounded-lg border-l-2 border-l-border bg-card/50 px-3 py-3 text-sm"
        >
          {reveal.confirmation ? (
            <>
              {screen.options.map((option, index) =>
                option.abstain ? null : (
                  <div key={option.label}>
                    <p
                      className={cn(
                        "font-medium",
                        index === correctIndex
                          ? "text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {index === correctIndex ? "Holds: " : "Breaks: "}
                      {option.label}
                    </p>
                    {option.feedback !== undefined && (
                      <p className="text-pretty text-muted-foreground">
                        {option.feedback}
                      </p>
                    )}
                  </div>
                )
              )}
              {screen.rule !== undefined && (
                <p className="text-xs text-muted-foreground">
                  Decided by {screen.rule}.
                </p>
              )}
            </>
          ) : (
            <>
              {picked?.feedback !== undefined && picked.correct !== true && (
                <p className="text-pretty text-muted-foreground">
                  {picked.feedback}
                </p>
              )}
              <Button
                variant="link"
                className="h-auto self-start p-0"
                onClick={onShowConfirmation}
              >
                Show the worked answer
              </Button>
            </>
          )}
          <Button className="self-start" onClick={onContinue}>
            Continue
          </Button>
        </section>
      )}
    </article>
  )
}
