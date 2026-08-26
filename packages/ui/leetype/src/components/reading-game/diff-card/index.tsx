import type { FC, ReactNode } from "react"
import { useCallback, useLayoutEffect, useRef, useState } from "react"
import type { ReadingHunk } from "@leetype/lib/leetype/reading-probe"
import Prism from "prismjs"
import { cn, useResizeObserver } from "some-ui-utils"

// The same theme `CodeDisplay` imports. Imported here as well rather than
// relied on transitively: this surface never mounts that component (see the
// doc comment below), so on a phone nothing else would ever pull the
// stylesheet in and every `.token.*` class would render unstyled. Bundlers
// dedupe the second import; a missing one is a silent regression.
import "prismjs/themes/prism-tomorrow.css"
import "prismjs/components/prism-typescript"
import "prismjs/components/prism-c"
import "prismjs/components/prism-cpp"
import "prismjs/components/prism-rust"

/**
 * Prism's grammar ids, keyed by the four languages `TypingBlockSchema`
 * admits. Duplicated from `CodeDisplay`'s map rather than shared: that map is
 * a private detail of a renderer whose invariant is that nothing about
 * exercises reaches it, and exporting it to be reused here would be the first
 * thread out of that file. Four entries, and adding a fifth language is a
 * schema change that would touch both anyway.
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
 * Per-kind paint. A left rail plus a restrained tint, rather than the
 * full-width saturated slab a desktop diff viewer uses: on a phone the hunk
 * is the whole screen's focal object, and a slab that loud makes the two
 * changed rows read as an alert instead of as code.
 *
 * The sign column carries the same information redundantly, so nothing here
 * is communicated by colour alone.
 */
const ROW_PAINT: Record<
  ReadingHunk["rows"][number]["kind"],
  { row: string; sign: string; code?: string }
> = {
  // Context is legible but recessive. The changed rows are the focal region
  // and the surrounding lines are there to support interpretation, so the
  // eye lands on the delta without anything being made unreadable.
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
    // Struck through, matching the vocabulary `CodeDisplay` already paints a
    // deletion in: someone who plays this on both a laptop and a phone should
    // not have to learn the grammar twice.
    code: "line-through decoration-rose-400/40 opacity-70",
  },
}

type DiffCardProps = {
  hunk: ReadingHunk
  className?: string
}

/**
 * The mobile hunk card (LTY-MOBILE) — the primary object on a reading screen,
 * and the component every other one on that screen is subordinate to.
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
 * # Why this is not `CodeDisplay`
 *
 * `CodeDisplay` renders *engine projections*: `roles`, `slotOfDisplay`,
 * `slotStatus`, `visibility`, `cursorDisplay`. Every one of those is a fact
 * about a step in flight under the typing engine, and there is no typing
 * engine on this surface — mounting one to render a card nobody types into
 * would fetch the wasm binary to compute a caret that is never drawn. So this
 * renderer takes authored data (`ReadingHunk`, derived by `readingHunkOf`)
 * and nothing else, which is what keeps `@some-ui/leetype-wasm` out of the
 * mobile chunk entirely.
 *
 * The two renderers agree about what a hunk *is* without sharing code,
 * because both derive their rows from the same `diff.segments` through
 * `renderedDiffLineKinds`. That is the invariant worth having; a shared
 * component parameterised over "does this have an engine attached" would be
 * the mode flag `docs/leetype/README.md` spends four decisions keeping out.
 *
 * # One horizontal scroller, and it is not the page
 *
 * Code never wraps. Wrapping destroys indentation, disconnects a continuation
 * from its sign, and makes an `add` row impossible to line up against the
 * `del` row above it — which is the entire comparison the card exists to
 * support. So the row body scrolls horizontally inside the card while the
 * card itself stays viewport-width, and the gutter is pinned with
 * `position: sticky` so a line number stays readable at any scroll offset.
 *
 * `data-scroll-intent` is declared for the same reason `TypingViewport`
 * declares it: the ui-fit sweep (`docs/ui-fit`) distinguishes a box that
 * scrolls because scrolling *is* the interaction from one that scrolls
 * because it was handed too much, and this is the former.
 */
export const DiffCard: FC<DiffCardProps> = ({ hunk, className }) => {
  const grammarId = LANGUAGE_MAP[hunk.language] ?? "javascript"
  const grammar = Prism.languages[grammarId]
  const label = LANGUAGE_LABEL[hunk.language] ?? hunk.language

  /**
   * Whether any line runs past the card, and whether the reader has already
   * scrolled to the end of it.
   *
   * Measured rather than assumed, because the affordance is not decoration.
   * A line clipped with no sign that it continues reads as the whole line,
   * and on a surface whose entire task is *say what this change does* a
   * reader who never learns there is more text answers a question about code
   * they did not see. That is a correctness problem, not a polish one — which
   * is why it is worth a `ResizeObserver` rather than a permanent edge fade
   * that would also shade the end of a short line.
   */
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [clipped, setClipped] = useState(false)
  const measure = useCallback((): void => {
    const scroller = scrollerRef.current
    if (!scroller) return
    // A pixel of slack: sub-pixel layout rounding otherwise reports a
    // permanent one-pixel overflow on a card that fits exactly.
    setClipped(
      scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft > 1
    )
  }, [])
  useResizeObserver({ ref: scrollerRef, onResize: measure })

  /**
   * Back to the start of the line whenever the card is handed a different
   * hunk.
   *
   * Nothing remounts this component between steps — `ReadingSession` renders
   * one `DiffCard` and swaps its prop — so the scroll box is the *same* DOM
   * element from one step to the next and keeps whatever `scrollLeft` the
   * reader left it at. `ResizeObserver` does not cover the gap either: it
   * fires on the scroller's own box changing, and the box is identical
   * between steps; only the content inside it changed. The result was a new
   * hunk opening halfway across its first line, under a "swipe" affordance
   * left over from the previous one.
   *
   * Keyed on a signature of the rows rather than on the `hunk` object,
   * because a caller may legitimately rebuild that object on every render —
   * this file's own stories do — and resetting on identity would snap the
   * scroll back mid-swipe. The signature is a few hundred characters for a
   * four-to-ten-line hunk, which is what a hunk is.
   *
   * A layout effect, not an effect: it runs after the new rows are in the DOM
   * and before paint, so no frame is ever shown at the stale offset.
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
    // Tokenised per line, the same trade `CodeDisplay`'s hunk path makes: a
    // construct spanning a line boundary (an unterminated block comment, a
    // multi-line string) colours as two locally-wrong fragments. Colour is
    // the only thing at stake — no character is added, dropped or reordered
    // — and a hunk is four to ten lines, authored.
    return Prism.tokenize(text, grammar).map((token, index) =>
      renderToken(token, index)
    )
  }

  return (
    <div
      className={cn(
        // The one object on the screen that reads as an object: a defined
        // border and its own surface, so the hunk is what the learner is
        // inspecting rather than one panel among several of equal weight.
        "overflow-hidden rounded-xl border border-border/80 bg-secondary shadow-sm",
        className
      )}
    >
      {hunk.path !== undefined && (
        <div className="flex items-baseline gap-3 border-b border-border/70 px-3 py-2">
          {/* `dir="rtl"` with a left-to-right override keeps the *end* of a
              long path visible when it ellipsizes — a phone truncating
              `src/…/session.rs` down to `src/lib/inte…` names nothing the
              reader can use. */}
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
                {/* Sticky so the number and sign survive a horizontal scroll.
                    Opaque backgrounds, or the code would slide visibly
                    underneath them. */}
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
                {/* The screen-reader half of the same signal: `+`/`−` is
                    decorative punctuation to a screen reader, so the row's
                    role is said in words instead. Never colour alone. */}
                {row.kind !== "context" && (
                  <span className="sr-only">
                    {row.kind === "add" ? "added line: " : "removed line: "}
                  </span>
                )}
                <pre
                  className={cn(
                    // Content-width rather than `flex-1`: the row's own tint
                    // already spans the full scroll width (the row is a block
                    // inside `min-w-max`), and a flexible child here would
                    // either be unable to shrink below its content or, with
                    // `min-w-0`, clip a long line the card means to scroll.
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
