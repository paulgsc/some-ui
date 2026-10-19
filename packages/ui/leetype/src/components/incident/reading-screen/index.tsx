import type { FC } from "react"
import { Glosses } from "@leetype/components/incident/glosses"
import type { SessionScreen } from "@leetype/types/session-file"
import { Button } from "@some-ui/shared"
import { ExternalLink } from "lucide-react"

type ReadingScreen = Extract<SessionScreen, { type: "reading" }>

type ReadingScreenProps = {
  screen: ReadingScreen
  glossary: Readonly<Record<string, string>>
  /** How the reading was offered: after a struggle, or after a correct pick. */
  offered: "placement" | "pointer" | null
  /** Whether the round it was placed for can be tried again now (Prop. 9.4 (d)). */
  canAskReturn: boolean
  onAct: (action: number) => void
  onOpenSource: () => void
  onAskReturn: () => void
}

/**
 * A reading (canon v1.2, Prop. 9.4): the question it answers and what to
 * look for (`primer`), the exact place, and its in-app core, with the full
 * source behind the link. Its actions are the session file's own (Read
 * now, Save, Skip).
 */
export const ReadingScreenView: FC<ReadingScreenProps> = ({
  screen,
  glossary,
  offered,
  canAskReturn,
  onAct,
  onOpenSource,
  onAskReturn,
}) => {
  const { source } = screen
  return (
    <article className="flex flex-col gap-4">
      {screen.pinned !== undefined && (
        <p className="sticky top-0 z-10 -mx-4 border-b border-border bg-background px-4 py-2 text-pretty text-sm font-medium text-foreground">
          {screen.pinned}
        </p>
      )}
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {offered === "pointer" ? "If you want more" : "A reading"}
      </p>
      {screen.title !== undefined && (
        <h2 className="text-pretty text-base font-semibold text-foreground">
          {screen.title}
        </h2>
      )}
      <p className="whitespace-pre-line text-pretty text-sm leading-relaxed text-foreground">
        {screen.primer}
      </p>
      {screen.body !== undefined && (
        <p className="whitespace-pre-line text-pretty text-sm leading-relaxed text-muted-foreground">
          {screen.body}
        </p>
      )}
      <Glosses terms={screen.glosses} glossary={glossary} />
      <p className="text-pretty text-sm text-muted-foreground">
        {source.author}, <cite>{source.title}</cite> ({source.year}),{" "}
        {source.where}. About {source.minutes} min.
      </p>
      {screen.passage !== undefined && (
        <blockquote className="whitespace-pre-line text-pretty border-l-2 border-l-border pl-3 text-sm leading-relaxed text-foreground">
          {screen.passage}
        </blockquote>
      )}
      <a
        href={source.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 self-start text-sm underline underline-offset-4"
        onClick={onOpenSource}
      >
        The full source
        <ExternalLink aria-hidden className="size-3.5" />
      </a>
      <div className="flex flex-col gap-2">
        {screen.actions.map((action, index) => (
          <Button
            key={`${String(index)} ${action.label}`}
            variant={index === 0 ? "default" : "outline"}
            className="h-auto min-h-11 whitespace-normal text-pretty py-2"
            onClick={(): void => onAct(index)}
          >
            {action.label}
          </Button>
        ))}
        {canAskReturn && (
          <Button
            variant="outline"
            className="min-h-11 self-start"
            onClick={onAskReturn}
          >
            Try the round again with new numbers
          </Button>
        )}
      </div>
    </article>
  )
}
