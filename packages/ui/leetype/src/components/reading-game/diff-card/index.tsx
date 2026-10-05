import type { FC, ReactNode } from "react"
import { useCallback, useLayoutEffect, useRef, useState } from "react"
import type { ReadingHunk } from "@leetype/lib/leetype/reading-probe"
import Prism from "prismjs"
import { cn, useResizeObserver } from "some-ui-utils"

// Imported here too: this surface never mounts `CodeDisplay`, so on a phone
// nothing else would load the theme and `.token.*` would render unstyled.
import "prismjs/themes/prism-tomorrow.css"
import "prismjs/components/prism-typescript"
import "prismjs/components/prism-c"
import "prismjs/components/prism-cpp"
import "prismjs/components/prism-rust"

/**
 * Prism's grammar ids for the four languages `TypingBlockSchema` admits.
 * Duplicated from `CodeDisplay`'s private map rather than exported from it.
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

/**
 * Per-kind paint: a left rail plus a restrained tint, since a saturated slab
 * on a phone reads as an alert. The sign column repeats the information, so
 * nothing relies on colour alone.
 */
const ROW_PAINT: Record<
  ReadingHunk["rows"][number]["kind"],
  { row: string; sign: string; code?: string }
> = {
  // Context is legible but recessive, so the eye lands on the delta.
  context: {
    row: "border-l-transparent",
    sign: "text-muted-foreground/40",
    code: "opacity-60",
  },
  add: {
    row: "border-l-emerald-500/70 bg-emerald-500/[0.07]",
    sign: "text-emerald-400",
  },
  del: {
    row: "border-l-rose-500/60 bg-rose-500/[0.06]",
    sign: "text-rose-400",
    // Struck through, as `CodeDisplay` paints a deletion.
    code: "line-through decoration-rose-400/40 opacity-70",
  },
}

type DiffCardProps = {
  hunk: ReadingHunk
  className?: string
}

/**
 * The mobile hunk card (LTY-MOBILE): the primary object on a reading screen.
 *
 * ```text
 * ╭────────────────────────────────────────╮
 * │ src/auth/session.rs              Rust  │  header, outside the scroll box
 * ├────────────────────────────────────────┤
 * │ 41    let session = store.lookup(id)?; │
 * │ 42  - if session.expired() {           │  ← rail + tint + sign
 * │ 42  + if session.expired() || …        │ →  code scrolls, page never does
 * │ 43      return Ok(None);               │
 * ╰────────────────────────────────────────╯
 * ```
 *
 * Not `CodeDisplay`: that renders typing-engine projections, and mounting an
 * engine here would fetch the wasm binary for a caret never drawn. This takes
 * authored `ReadingHunk` data only, keeping `@some-ui/leetype-wasm` out of
 * the mobile chunk. Both renderers derive rows from the same `diff.segments`
 * via `renderedDiffLineKinds`, so they agree without sharing code.
 *
 * Code never wraps: wrapping destroys indentation and add/del alignment. The
 * row body scrolls horizontally inside the card, with the gutter sticky.
 * `data-scroll-intent` tells the ui-fit sweep this scroll is the interaction.
 */
export const DiffCard: FC<DiffCardProps> = ({ hunk, className }) => {
  const grammarId = LANGUAGE_MAP[hunk.language] ?? "javascript"
  const grammar = Prism.languages[grammarId]
  const label = LANGUAGE_LABEL[hunk.language] ?? hunk.language

  /**
   * Whether any line runs past the card and the reader has not scrolled to
   * its end. Measured, because a clipped line with no hint reads as the whole
   * line, and the reader would answer about code they never saw.
   */
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [clipped, setClipped] = useState(false)
  const measure = useCallback((): void => {
    const scroller = scrollerRef.current
    if (!scroller) return
    // A pixel of slack for sub-pixel rounding.
    setClipped(
      scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft > 1
    )
  }, [])
  useResizeObserver({ ref: scrollerRef, onResize: measure })

  /**
   * Back to the start of the line whenever the card gets a different hunk.
   * `ReadingSession` swaps the prop without remounting, so the scroller keeps
   * its `scrollLeft`, and `ResizeObserver` does not fire (the box is the same).
   *
   * Keyed on a signature of the rows, not the `hunk` object, which callers
   * may rebuild every render. A layout effect, so no frame paints at the
   * stale offset.
   */
  const signature = `${hunk.path ?? ""}\u0000${hunk.language}\u0000${hunk.rows
    .map((row) => row.text)
    .join("\n")}`
  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    scroller.scrollLeft = 0
    measure()
  }, [signature, measure])

  const highlight = (text: string): ReactNode => {
    if (!grammar || text.length === 0) return text
    // Tokenised per line, as `CodeDisplay`'s hunk path: a multi-line
    // construct may colour wrongly, but no character changes.
    return Prism.tokenize(text, grammar).map((token, index) =>
      renderToken(token, index)
    )
  }

  return (
    <div
      className={cn(
        // Its own border and surface: the one object on the screen.
        "overflow-hidden rounded-xl border border-border/80 bg-secondary shadow-sm",
        className
      )}
    >
      {hunk.path !== undefined && (
        <div className="flex items-baseline gap-3 border-b border-border/70 px-3 py-2">
          {/* `dir="rtl"` keeps the *end* of a long path visible when it
              ellipsizes. */}
          <span
            dir="rtl"
            className="min-w-0 flex-1 truncate text-left font-mono text-xs text-muted-foreground"
          >
            <bdi>{hunk.path}</bdi>
          </span>
          <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground/70">
            {label}
          </span>
        </div>
      )}

      <div
        ref={scrollerRef}
        onScroll={measure}
        // scroll-intent: code-display — a source line is as long as it is, and
        // the alternative to scrolling it is wrapping it, which destroys the
        // add/del alignment the card exists for. Declared so the ui-fit sweep
        // can tell this apart from a box that was handed too much.
        data-scroll-intent="code-display"
        className="overflow-x-auto font-mono text-[13px] leading-[1.6]"
      >
        <div className="min-w-max">
          {hunk.rows.map((row) => {
            const paint = ROW_PAINT[row.kind]
            const sign =
              row.kind === "add" ? "+" : row.kind === "del" ? "−" : " "

            return (
              <div
                key={row.index}
                data-line-kind={row.kind}
                className={cn("flex border-l-2", paint.row)}
              >
                {/* Sticky, with opaque backgrounds so code slides underneath. */}
                <span
                  className={cn(
                    "sticky left-0 z-10 w-9 shrink-0 select-none bg-secondary px-1 text-right tabular-nums text-muted-foreground/40",
                    row.kind === "add" && "bg-emerald-500/[0.07]",
                    row.kind === "del" && "bg-rose-500/[0.06]"
                  )}
                >
                  {row.newLine ?? row.oldLine ?? ""}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "sticky left-9 z-10 w-4 shrink-0 select-none bg-secondary text-center",
                    row.kind === "add" && "bg-emerald-500/[0.07]",
                    row.kind === "del" && "bg-rose-500/[0.06]",
                    paint.sign
                  )}
                >
                  {sign}
                </span>
                {/* Screen readers get the row's role in words, not `+`/`−`. */}
                {row.kind !== "context" && (
                  <span className="sr-only">
                    {row.kind === "add" ? "added line: " : "removed line: "}
                  </span>
                )}
                <pre
                  className={cn(
                    // Content-width, not `flex-1`: the row's tint already spans
                    // the scroll width, and `min-w-0` would clip a long line.
                    "m-0 whitespace-pre pr-3 text-foreground/90",
                    paint.code
                  )}
                >
                  <code className={`language-${hunk.language}`}>
                    {row.text.length === 0 ? " " : highlight(row.text)}
                  </code>
                </pre>
              </div>
            )
          })}
        </div>
      </div>

      {clipped && (
        <p
          aria-live="polite"
          className="select-none border-t border-border/50 px-3 py-1.5 text-right text-[11px] text-muted-foreground/70"
        >
          Swipe the code to read on <span aria-hidden="true">→</span>
        </p>
      )}
    </div>
  )
}

/**
 * One Prism token, as spans carrying its `.token.<type>` classes so the
 * imported theme paints them. Recursive because Prism nests token content.
 */
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
