import type { JSX } from "react"
import type { Appearance } from "@some-ui/styles/theme"
import { appearanceClassName } from "@some-ui/styles/theme"

import type { CodeSpan, CodeTone } from "../../../lib/code-card"
import { CODE_CARD_WORDS, codeLines } from "../../../lib/code-card"
import type { CodeLanguage } from "../../../lib/code-tokens"
import { cn } from "../../../lib/utils"

export type { CodeSpan } from "../../../lib/code-card"

/**
 * Each tone's colour, from the semantic tokens the `code` appearance sets
 * (`packages/some-styles/themes/code.css`: keywords and functions in
 * `primary`, types and numbers in `accent`, comments in `muted-foreground`).
 * Never Prism's `token` classes: a Prism theme loaded elsewhere on the page
 * would paint over them.
 */
const TONE_CLASS: Readonly<Record<CodeTone, string | undefined>> = {
  keyword: "text-primary",
  type: "text-accent",
  literal: "text-accent",
  comment: "italic text-muted-foreground",
  plain: undefined,
}

type CodeCardProps = {
  /** The program's source, as it is compiled. */
  code: string
  /** Its grammar; Rust unless said otherwise. */
  language?: CodeLanguage
  /** Lines a variant changed, numbered from 1: each gets a `+` in the gutter. */
  changedLines?: ReadonlyArray<number>
  /**
   * rustc's spans for a diagnostic, as its JSON gives them: each is
   * underlined, and each line it touches is highlighted. Only the mark: the
   * message, notes and help are the host's to lay out.
   */
  spans?: ReadonlyArray<CodeSpan>
  /** Names the code for assistive tech ("The program", "Variant 2"). */
  label: string
  /**
   * Art direction. `inherit` (default) renders in the host's theme; pass
   * `"code"` for the vim-night editor surface.
   */
  appearance?: Appearance
  className?: string
}

/**
 * A program on the phone: a line-number gutter, `+` on a variant's changed
 * lines, and a diagnostic's span underlined on its highlighted line.
 *
 * Code never wraps here. A long line scrolls sideways inside the code region,
 * and the gutter stays put beside it; the card itself is as wide as its host
 * gives it, so the page never scrolls sideways. How tall it is, and what
 * scrolls it vertically, are the host's.
 */
export const CodeCard = ({
  code,
  language = "rust",
  changedLines,
  spans,
  label,
  appearance = "inherit",
  className,
}: CodeCardProps): JSX.Element => {
  const lines = codeLines(code, language, { changedLines, spans })

  return (
    <figure
      aria-label={label}
      className={cn(
        appearanceClassName(appearance),
        "m-0 flex min-w-0 overflow-hidden rounded-md border border-border bg-background font-mono text-sm leading-relaxed text-foreground",
        className
      )}
    >
      <div
        aria-hidden="true"
        className="shrink-0 select-none border-r border-border py-2 text-right tabular-nums text-muted-foreground"
      >
        {lines.map((line) => (
          <div
            key={line.number}
            data-code-gutter={line.number}
            className={cn(
              "flex whitespace-pre pl-2 pr-1",
              line.marked && "bg-destructive/15 text-destructive"
            )}
          >
            <span className="min-w-[2ch]">{line.number}</span>
            <span className="w-[2ch] text-center text-primary">
              {line.changed ? "+" : " "}
            </span>
          </div>
        ))}
      </div>
      <div
        data-scroll-intent="code-display"
        className="min-w-0 flex-1 overflow-x-auto py-2"
      >
        <pre className="m-0 w-max min-w-full [tab-size:4]">
          <code className="block">
            {lines.map((line) => (
              <div
                key={line.number}
                data-code-line={line.number}
                data-code-changed={line.changed || undefined}
                data-code-marked={line.marked || undefined}
                className={cn(
                  "whitespace-pre px-3",
                  line.marked && "bg-destructive/15"
                )}
              >
                {line.changed && (
                  <span className="sr-only">{CODE_CARD_WORDS.changedLine}</span>
                )}
                {line.runs.length === 0
                  ? " "
                  : line.runs.map((run) =>
                      run.marked ? (
                        <mark
                          key={run.column}
                          data-code-span=""
                          className={cn(
                            "bg-transparent text-inherit underline decoration-destructive decoration-wavy decoration-2 underline-offset-4",
                            TONE_CLASS[run.tone]
                          )}
                        >
                          {run.text}
                        </mark>
                      ) : (
                        <span key={run.column} className={TONE_CLASS[run.tone]}>
                          {run.text}
                        </span>
                      )
                    )}
              </div>
            ))}
          </code>
        </pre>
      </div>
    </figure>
  )
}
