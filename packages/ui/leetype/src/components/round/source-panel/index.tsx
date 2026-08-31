import type { FC, ReactNode } from "react"
import { useState } from "react"
import type { Algorithm } from "@leetype/types/algorithm"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@some-ui/shared"
import Prism from "prismjs"
import { cn } from "some-ui-utils"

// The same theme `CodeDisplay` and `DiffCard` import. Imported here as well
// rather than relied on transitively, for the same reason `DiffCard`'s own
// copy gives: this component may mount on a surface neither of those ever
// does, and a missing import would be a silent regression rather than a
// loud one.
import "prismjs/themes/prism-tomorrow.css"
import "prismjs/components/prism-typescript"
import "prismjs/components/prism-c"
import "prismjs/components/prism-cpp"
import "prismjs/components/prism-rust"

/**
 * Prism's grammar ids, keyed by the four languages `AlgorithmSchema` admits.
 * Duplicated from `CodeDisplay`'s and `DiffCard`'s own copies rather than
 * shared: each is a private detail of a renderer, per `DiffCard`'s own
 * comment on the same duplication, and this file's invariant — that nothing
 * about the typing engine or a diff hunk reaches it — is exactly the kind of
 * thing importing another renderer's map would start eroding.
 */
const LANGUAGE_MAP: Record<string, string> = {
  typescript: "typescript",
  rust: "rust",
  cpp: "cpp",
  c: "c",
}

/** What the language chip says. Falls through to the raw id for anything unmapped. */
const LANGUAGE_LABEL: Record<string, string> = {
  typescript: "TypeScript",
  rust: "Rust",
  cpp: "C++",
  c: "C",
}

/** Renders one Prism token (or a run of them) as plain nodes — no `dangerouslySetInnerHTML` anywhere on this path. */
function renderToken(
  token: string | Prism.Token,
  key: string | number
): ReactNode {
  if (typeof token === "string") return token

  const content: ReactNode = Array.isArray(token.content)
    ? token.content.map((inner, index) => renderToken(inner, `${key}-${index}`))
    : typeof token.content === "string"
      ? token.content
      : renderToken(token.content, `${key}-sub`)

  return (
    <span key={key} className={`token ${token.type}`}>
      {content}
    </span>
  )
}

/** The one accordion item this component ever renders. Fixed, not derived — there is exactly one panel per instance, so nothing needs to disambiguate it from a sibling. */
const ITEM_VALUE = "source"

type SourcePanelProps = {
  algorithm: Algorithm
  className?: string
}

/**
 * The round's whole-program reveal (R1, #1204, Def. 1.1 / Prop. 1.1):
 * `algorithm.source` closed by default, opening on a single tap.
 *
 * **No precondition anywhere in its call path.** This component takes an
 * `Algorithm` and nothing else — no ledger, no ordinal, no prior-answer
 * flag, no timer. There is no prop this file could gate the toggle on even
 * if it wanted to, which is what makes Prop. 1.1 ("revelation may never be
 * conditioned on any learner state") true by construction rather than by
 * a check somewhere that could drift. A fresh mount opens exactly the same
 * way whether it is the first thing a round renders or the hundredth.
 *
 * **Nothing reads whether the panel was opened.** `open` lives in this
 * component's own `useState` and goes nowhere else — no `onOpenChange`
 * prop, nothing lifted to a caller, nothing persisted. `A` is explicitly
 * not the assessed artifact (Cor. 6.1); a reveal a caller could observe
 * would smuggle it back in as a signal.
 *
 * **Closes again when the algorithm changes.** A caller may legitimately
 * swap `algorithm` on an already-mounted instance rather than remounting it
 * (`ReadingSession` does exactly this with `DiffCard`'s `hunk` prop) — React
 * does not reset local state on a prop change by itself, so without this a
 * round left open would carry its `open = true` straight into the next
 * round's source, revealing it before anyone tapped anything. Compared
 * during render against `algorithm.source` (Def. 1.1's actual identity for
 * `A`) rather than in an effect, so the stale content is never painted open
 * for a frame before snapping shut.
 *
 * **Renders through Prism directly** — the library, not `CodeDisplay` or
 * `DiffCard` — because `A` carries none of what either of those needs:
 * no engine projection (`roles` / `slotOfDisplay` / `slotStatus` /
 * `visibility` / `cursorDisplay`), no hunk-shaped `lineKinds`. `A`'s
 * source is a complete, static program, tokenized once — not typed into,
 * not diffed. This is a new panel, not a new renderer: the one existing
 * invariant this story has to keep is that `DiffCard` still draws a hunk
 * and never becomes a window onto `A`, which holds trivially — this file
 * does not import or modify `DiffCard`.
 */
export const SourcePanel: FC<SourcePanelProps> = ({ algorithm, className }) => {
  const [open, setOpen] = useState(false)
  const [seenSource, setSeenSource] = useState(algorithm.source)
  if (algorithm.source !== seenSource) {
    setSeenSource(algorithm.source)
    setOpen(false)
  }
  const grammarId = LANGUAGE_MAP[algorithm.language] ?? "javascript"
  const grammar = Prism.languages[grammarId]
  const label = LANGUAGE_LABEL[algorithm.language] ?? algorithm.language

  const highlight = (): ReactNode => {
    if (!grammar) return algorithm.source
    return Prism.tokenize(algorithm.source, grammar).map((token, index) =>
      renderToken(token, index)
    )
  }

  return (
    <Accordion
      type="single"
      collapsible
      value={open ? ITEM_VALUE : ""}
      onValueChange={(value) => setOpen(value === ITEM_VALUE)}
      className={cn(
        "rounded-md border border-border/60 bg-background/90 text-sm shadow-sm",
        className
      )}
    >
      <AccordionItem value={ITEM_VALUE} className="border-none">
        <AccordionTrigger className="px-3 py-2 text-xs font-medium text-muted-foreground hover:no-underline">
          <span className="flex items-center gap-2">
            <span>{open ? "Hide source" : "Show source"}</span>
            <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-normal text-muted-foreground/70">
              {label}
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="px-3 pb-3 pt-0">
          {/*
            One line each, wrapping rather than clipped: `inputAlphabet` is
            unbounded free text (a review finding on #1248 caught the prior
            single `truncate`d line silently dropping it on a narrow phone,
            with no way to recover the omitted text). Both are part of what
            the learner needs to interpret the program, so losing either
            silently is a correctness problem on this surface, not a
            polish one — the same posture `DiffCard`'s own clipped-line
            affordance is built on.
          */}
          <div className="mb-2 space-y-0.5 font-mono text-[11px] text-muted-foreground/70">
            <p className="break-words">
              entry point{" "}
              <span className="text-foreground/80">{algorithm.entryPoint}</span>
            </p>
            <p className="break-words">
              input{" "}
              <span className="text-foreground/80">
                {algorithm.inputAlphabet}
              </span>
            </p>
          </div>
          <pre className="m-0 overflow-x-auto rounded bg-secondary p-3 font-mono text-xs leading-relaxed">
            <code className={`language-${grammarId}`}>{highlight()}</code>
          </pre>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
