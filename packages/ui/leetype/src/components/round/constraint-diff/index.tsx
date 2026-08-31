import type { FC } from "react"
import type { ConstraintDiffRow } from "@leetype/lib/leetype/constraint"
import { constraintDiffRows } from "@leetype/lib/leetype/constraint"
import type {
  ComparisonOperator,
  ConstraintDiff as ConstraintDiffValue,
} from "@leetype/types/constraint"
import { cn } from "some-ui-utils"

/** The mathematical symbol each operator reads as in the canon's own worked examples (`n ≤ 10^5`). */
const OPERATOR_SYMBOL: Record<ComparisonOperator, string> = {
  "<=": "≤",
  "<": "<",
  ">=": "≥",
  ">": ">",
  "=": "=",
}

const BOUND_FORMAT = new Intl.NumberFormat("en-US")

/**
 * Per-kind paint for a row's rail, tint and sign — the same visual grammar
 * `DiffCard` (`components/reading-game/diff-card`) paints a code diff's rows
 * in, duplicated here rather than imported. Not shared for the same reason
 * `DiffCard` itself duplicates `LANGUAGE_MAP`/`LANGUAGE_LABEL` rather than
 * pulling them from `CodeDisplay`: the two components' row shapes never
 * actually agree (`DiffCard`'s rows are Prism-highlighted source lines with
 * a per-line gutter number; a constraint diff's rows are
 * `dimension operator bound` triples with no line to number), so importing
 * a shared constant would be the one thread of coupling between two
 * renderers that otherwise share nothing but a three-value vocabulary.
 */
const ROW_PAINT: Record<
  ConstraintDiffRow["kind"],
  { row: string; sign: string; text?: string }
> = {
  context: {
    row: "border-l-transparent",
    sign: "text-muted-foreground/40",
    text: "opacity-60",
  },
  add: {
    row: "border-l-emerald-500/70 bg-emerald-500/[0.07]",
    sign: "text-emerald-400",
  },
  del: {
    row: "border-l-rose-500/60 bg-rose-500/[0.06]",
    sign: "text-rose-400",
    text: "line-through decoration-rose-400/40 opacity-70",
  },
}

type ConstraintDiffProps = {
  diff: ConstraintDiffValue
  className?: string
}

/**
 * `(C, C′)`, rendered (R3, #1206, Def. 3.2 / Thm. 3.1 / Cor. 3.1) — the
 * perturbation as a first-class artifact, in the same visual register as a
 * code diff: a sign column, a removed row, an added row. Every row comes
 * from `constraintDiffRows` (`lib/leetype/constraint`), which reuses
 * `renderedDiffLineKinds`' own `"context" | "del" | "add"` vocabulary rather
 * than inventing a second one.
 *
 * Cor. 3.1's own reading: a row pair here says the bound moved, never that
 * the algorithm did — `T` as a function is unchanged by construction
 * (`ConstraintDiffSchema` rejects anything else), so nothing on this card
 * claims otherwise. It renders on its own, with no accompanying code change
 * required — Def. 8.1.1's `ok` branch is still a round without one.
 *
 * # Why this does not mount `DiffCard`
 *
 * `DiffCard`'s props (`hunk.language`, Prism tokenization, a per-line
 * `oldLine`/`newLine` gutter, an optional `hunk.path` header) are all
 * source-code-specific — a constraint diff has no language to highlight and
 * no line to number, and forcing `n ≤ 100,000` through a TypeScript/Rust/C/
 * C++ tokenizer to satisfy `DiffCard`'s `language` prop would apply
 * incorrect syntax highlighting to text that is not source code. That is a
 * real mismatch in `DiffCard`'s own props, not a licence to fork its
 * component — what this file actually reuses from it is the row *model*
 * (the `"context" | "del" | "add"` kind vocabulary, from
 * `constraintDiffRows`) and its visual register (the sign column, the
 * per-kind rail and tint), not its Prism/gutter machinery.
 */
export const ConstraintDiff: FC<ConstraintDiffProps> = ({
  diff,
  className,
}) => {
  const rows = constraintDiffRows(diff)

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border/80 bg-secondary shadow-sm",
        className
      )}
    >
      <div className="font-mono text-[13px] leading-[1.6]">
        {rows.map((row) => {
          const paint = ROW_PAINT[row.kind]
          const sign = row.kind === "add" ? "+" : row.kind === "del" ? "−" : " "

          return (
            <div
              key={`${row.dimension}-${row.index}`}
              data-line-kind={row.kind}
              className={cn(
                "flex items-baseline gap-2 border-l-2 px-2 py-0.5",
                paint.row
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "w-4 shrink-0 select-none text-center",
                  paint.sign
                )}
              >
                {sign}
              </span>
              {/* The screen-reader half of the same signal, same posture as
                  `DiffCard`: `+`/`−` is decorative punctuation to a screen
                  reader, so the row's role is said in words instead. */}
              {row.kind !== "context" && (
                <span className="sr-only">
                  {row.kind === "add" ? "new bound: " : "old bound: "}
                </span>
              )}
              <span className={cn("text-foreground/90", paint.text)}>
                {`${row.dimension} ${OPERATOR_SYMBOL[row.operator]} ${BOUND_FORMAT.format(row.bound)}`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
