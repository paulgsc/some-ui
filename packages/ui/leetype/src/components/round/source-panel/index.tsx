import type { FC, ReactNode } from "react"
import { useState } from "react"
import type { Algorithm } from "@leetype/types/algorithm"
import { cn } from "@some-ui/core-utils"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@some-ui/shared"
import Prism from "prismjs"

// Imported here too: this may mount where neither `CodeDisplay` nor
// `DiffCard` does (see `DiffCard`).
import "prismjs/themes/prism-tomorrow.css"
import "prismjs/components/prism-typescript"
import "prismjs/components/prism-c"
import "prismjs/components/prism-cpp"
import "prismjs/components/prism-rust"

/**
 * Prism's grammar ids for the four languages `AlgorithmSchema` admits.
 * Duplicated, like `DiffCard`'s, so no other renderer's code reaches here.
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

/** The one accordion item this component renders. */
const ITEM_VALUE = "source"

type SourcePanelProps = {
  algorithm: Algorithm
  className?: string
}

/**
 * The round's whole-program reveal (Def. 1.1 / Prop. 1.1):
 * `algorithm.source`, closed by default, opening on a single tap.
 *
 * **No precondition in its call path.** It takes an `Algorithm` and nothing
 * else (no ledger, ordinal, prior answer or timer), so Prop. 1.1
 * ("revelation may never be conditioned on any learner state") holds by
 * construction.
 *
 * **Nothing reads whether it was opened.** `open` stays in local state, with
 * no callback or persistence: `A` is not the assessed artifact (Cor. 6.1),
 * and an observable reveal would make it a signal.
 *
 * **Closes when the algorithm changes.** Callers may swap `algorithm` on a
 * mounted instance, so `open` resets during render when `algorithm.source`
 * (Def. 1.1's identity for `A`) changes, never painting the next source
 * open for a frame.
 *
 * **Renders through Prism directly**, not `CodeDisplay` or `DiffCard`: `A`
 * is a static program, neither typed into nor diffed. This file does not
 * import `DiffCard`, so `DiffCard` never becomes a window onto `A`.
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
            Wrapping, not truncated: `inputAlphabet` is unbounded free text
            the learner needs to interpret the program.
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
          {/*
            data-scroll-intent: this scroll is the interaction (ui-fit). As a
            native scroller inside `ArtifactSwitcher`'s pager, it takes a
            drag before the pager does.
          */}
          <pre
            data-scroll-intent="code-display"
            className="m-0 overflow-x-auto rounded bg-secondary p-3 font-mono text-xs leading-relaxed"
          >
            <code className={`language-${grammarId}`}>{highlight()}</code>
          </pre>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
