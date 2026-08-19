import type { FC, JSX, ReactNode, RefObject } from "react"
import type { TextGradient } from "@leetype/types/leetype"
import {
  ROLE_CONTEXT,
  ROLE_TYPEABLE,
  SLOT_CORRECT,
  SLOT_WRONG,
  VISIBILITY_MASKED,
} from "@leetype/types/leetype"
import { ChevronDown } from "lucide-react"
import Prism from "prismjs"
import { cn } from "some-ui-utils"

// Import Prism.js and its components
import "prismjs/themes/prism-tomorrow.css"
import "prismjs/components/prism-typescript"
import "prismjs/components/prism-c"
import "prismjs/components/prism-cpp"
import "prismjs/components/prism-rust"

/**
 * One character wide, exactly like every glyph it stands in for.
 *
 * That is not a cosmetic choice: masked and unmasked renderings of a step
 * must have identical character counts per line, or unmasking reflows the
 * text under the player's eye mid-word.
 * `crates/leetype_wasm/tests/invariants.rs` asserts the width property; this
 * constant is the half of it that lives on this side.
 */
const MASK_CHAR = "•"

const LANGUAGE_MAP: Record<string, string> = {
  typescript: "typescript",
  rust: "rust",
  cpp: "cpp",
  c: "c",
}

/** Fixed widths for the gutter's sign and line-number columns — outside the glyph run, never reflowing with content (LTY-PATCH P3). */
const GUTTER_SIGN_WIDTH = "w-4"
const GUTTER_NUMBER_WIDTH = "w-8"

/**
 * A rendered line's role in a diff-hunk overlay.
 *
 * Deliberately not imported from `types/exercise`'s `PatchLineKind`, even
 * though the two are structurally identical: this file's invariant is that
 * adding a new kind of prompt-side block — or any other exercise concept —
 * must never reach it, and importing a type *named* by the exercise schema
 * would be exactly that kind of reach, however narrow. Plain diff
 * vocabulary (`docs/leetype/README.md`'s "hunk"/"deletion"/"addition"
 * entries) is what actually reaches this component.
 */
export type LineKind = "context" | "del" | "add"

/**
 * The diff-hunk gutter data a step's `patch` overlay projects down to this
 * renderer (LTY-PATCH P3, #1078). `oldStart`/`newStart` seed the gutter's
 * running line-number counters. The hunk's file path is deliberately not
 * here — that renders in `TypingViewport`'s own header, never in this
 * file, which draws no more of a hunk than the lines it is asked to paint.
 */
export type Hunk = {
  lineKinds: ReadonlyArray<LineKind>
  oldStart: number
  newStart: number
}

/**
 * Maps each non-"none" `TextGradient` option to the swatch-driven gradient
 * custom property it paints (`--gradient-heading` / `--gradient-accent` /
 * `--gradient-muted`, tokens/base.css — the same ones the `text-gradient-*`
 * utilities in packages/some-styles/tailwind.css consume).
 *
 * Applied as an inline style rather than that utility class: PrismJS's
 * theme (`prismjs/themes/prism-tomorrow.css`, imported below) is a plain,
 * unlayered stylesheet, and its `code[class*="language-"] { color: #ccc }`
 * rule outranks *any* `@layer utilities` class — including this one —
 * regardless of specificity, per the CSS cascade-layers spec. An inline
 * style outranks both, so it's the only reliable way to override Prism's
 * base color from here.
 */
const TEXT_GRADIENT_STYLE: Record<
  Exclude<TextGradient, "none">,
  { backgroundImage: string }
> = {
  heading: { backgroundImage: "var(--gradient-heading)" },
  accent: { backgroundImage: "var(--gradient-accent)" },
  muted: { backgroundImage: "var(--gradient-muted)" },
}

type CodeDisplayProps = {
  displayCode: string
  language: string
  /**
   * Per-rendered-character role from the engine: `ROLE_SKIP` for layout the
   * caret jumps over, `ROLE_TYPEABLE` for characters the player owes a
   * keystroke for, `ROLE_CONTEXT` for code the player reads but is never
   * asked to type.
   */
  roles: Uint8Array
  /**
   * Per-rendered-character slot ordinal, `-1` for layout characters. The
   * indirection is the whole point of the model: a run of indentation has
   * display indices but no slots, so it can be rendered in place while
   * being completely absent from what the player has to type.
   */
  slotOfDisplay: Int32Array
  /** Per-slot status: untouched / correct / wrong. */
  slotStatus: Uint8Array
  /**
   * Per-slot reveal state, projected by the engine's control loop.
   *
   * This component decides *nothing* about masking. It has no threshold, no
   * latch, no mode flag and no memory: it draws a bullet where the map says
   * masked and the glyph where it says revealed. The policy — when `k`
   * opens, how fast it closes, what the player has already been shown — is
   * engine state, provable by `cargo test -p leetype_wasm` with no DOM in
   * the picture.
   */
  visibility: Uint8Array
  /**
   * Index, into `displayCode`'s characters, of the character the player is
   * currently on. The engine guarantees this is always a typeable character
   * (or one past the end when the step is done) — the caret never lands
   * inside an indentation run, which is what makes the overlay read as
   * "you are exactly here" instead of drifting through whitespace.
   */
  cursorDisplay: number
  /**
   * Handed down so the scroll container can find the caret without this
   * component having to know why anyone wants it. Caret-*following* is
   * `TypingViewport`'s job; this component only says where the caret is.
   */
  caretRef?: RefObject<HTMLSpanElement | null>
  className?: string
  /**
   * When set to anything but "none", not-yet-typed code renders in a
   * swatch-driven gradient instead of Prism's syntax-highlight palette —
   * already-typed feedback (correct/incorrect) and the cursor keep their
   * own colors either way, since that signal stays functional regardless
   * of the cosmetic mode.
   */
  textGradient?: TextGradient
  /**
   * A diff-hunk overlay (LTY-PATCH P3, #1078): when present, the renderer
   * gains a sign column and old/new line-number columns, and add/del rows
   * gain a background tint. Absent, this component renders exactly as it
   * always has — the two paths are independent render functions, not one
   * path branching on a flag part-way through.
   */
  hunk?: Hunk
}

/**
 * A pure glyph renderer: a linear sequence of display characters plus caret
 * state, and nothing else — organized into rows when handed a `hunk`
 * overlay, which is layout, not policy (LTY-PATCH P3, #1078 amends decision
 * 1 in `docs/leetype/README.md` on exactly this point).
 *
 * It used to be three things — a renderer, a scroll container
 * (`h-[500px] overflow-auto`) and a caret-following controller. The fixed
 * height was the tell: a component that sizes itself owns its own scroll,
 * and a component that owns its own scroll cannot be composed into a card
 * that wants to give it the remaining 80% and no more. The scroll and the
 * caret-following moved to `TypingViewport`; what is left renders correctly
 * at whatever height its parent gives it.
 *
 * It knows nothing about exercises, prompts, steps or competencies. Its
 * props contain no vocabulary from any of them, and that is the invariant
 * worth protecting: adding a new kind of prompt-side block must never reach
 * this file. `hunk` is not an exception — `LineKind`/`Hunk` are plain diff
 * vocabulary, not exercise vocabulary, and this component still owns no
 * masking policy, no error accounting, no threshold, no latch and no
 * memory; it draws what it is handed, one row at a time instead of one
 * flat stream when a hunk says which rows are which.
 */
export const CodeDisplay: FC<CodeDisplayProps> = ({
  displayCode,
  language,
  roles,
  slotOfDisplay,
  slotStatus,
  visibility,
  cursorDisplay,
  caretRef,
  className,
  textGradient = "none",
  hunk,
}): JSX.Element => {
  const renderChar = (
    char: string,
    displayIndex: number,
    lineKind?: LineKind
  ): JSX.Element => {
    const isTypeable = roles[displayIndex] === ROLE_TYPEABLE
    const isContext = roles[displayIndex] === ROLE_CONTEXT
    const slot = slotOfDisplay[displayIndex] ?? -1
    const status = slot >= 0 ? slotStatus[slot] : undefined
    const isMasked = slot >= 0 && visibility[slot] === VISIBILITY_MASKED

    if (displayIndex === cursorDisplay) {
      return (
        <span
          key={displayIndex}
          ref={caretRef}
          title="You are here"
          className="relative animate-pulse rounded-[2px] bg-blue-500/30 ring-2 ring-blue-400 ring-offset-1 ring-offset-background"
        >
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute -top-3.5 left-1/2 h-3 w-3 -translate-x-1/2 text-blue-400"
          />
          {isMasked ? MASK_CHAR : char}
        </span>
      )
    }

    if (status === SLOT_CORRECT) {
      return (
        <span key={displayIndex} className="bg-green-500/10 text-green-400">
          {char}
        </span>
      )
    }

    if (status === SLOT_WRONG) {
      return (
        <span key={displayIndex} className="bg-red-500/30 text-red-400">
          {char}
        </span>
      )
    }

    // Context: code the player reads but is never asked to type, and never
    // masked — it carries no slot for VISIBILITY_MASKED to apply to. Muted
    // so it reads as given rather than as a not-yet-typed real character,
    // in gradient mode as much as out of it — the deliberate answer to "how
    // does context interact with TextGradient" the story for this file asks
    // for, matching the posture SLOT_CORRECT/SLOT_WRONG already take
    // ("already-typed feedback... keep their own colors either way", see
    // `TextGradient`'s doc comment). `-webkit-text-fill-color` is itself an
    // inherited property, so without resetting it here a context span would
    // silently pick up the gradient `<code>` ancestor's `transparent` in
    // WebKit and vanish into the clipped gradient instead of staying muted.
    //
    // A `del` row's context is the one exception (LTY-PATCH P3, #1078):
    // struck-through and muted red rather than italic-muted, so a removed
    // line reads as removed rather than merely given — distinct paint, same
    // reset, both unmasked either way. This has to live here rather than as
    // a row-level style override: the color and italics below are set
    // directly on this span, and a directly-set color always wins over
    // whatever an ancestor row wrapper tries to inherit down to it.
    if (isContext) {
      const isDeleted = lineKind === "del"
      return (
        <span
          key={displayIndex}
          className={
            isDeleted
              ? "text-red-400/70 line-through decoration-red-400/50"
              : "italic text-muted-foreground/70"
          }
          style={{ WebkitTextFillColor: "currentColor" }}
        >
          {char}
        </span>
      )
    }

    // Layout the engine skips: rendered as-is so the code keeps its shape,
    // never masked and never scored. This is the visual half of "you don't
    // type indentation" — the player's eye follows the caret straight past
    // it.
    if (!isTypeable) {
      return <span key={displayIndex}>{char}</span>
    }

    if (isMasked) {
      return (
        <span key={displayIndex} className="text-muted-foreground/40">
          {MASK_CHAR}
        </span>
      )
    }

    return <span key={displayIndex}>{char}</span>
  }

  const renderHighlightedCode = (): ReactNode => {
    const selectedLang = LANGUAGE_MAP[language] ?? "javascript"
    const grammar = Prism.languages[selectedLang]
    if (!grammar || roles.length === 0) return displayCode

    const tokens = Prism.tokenize(displayCode, grammar)
    let charIndex = 0

    const renderRun = (text: string): Array<JSX.Element> =>
      Array.from(text).map((char) => renderChar(char, charIndex++))

    const renderToken = (
      token: string | Prism.Token,
      key: string | number
    ): ReactNode => {
      if (typeof token === "string") return renderRun(token)

      const content = Array.isArray(token.content)
        ? token.content.map((t, i) => renderToken(t, `${key}-${i}`))
        : typeof token.content === "string"
          ? renderRun(token.content)
          : renderToken(token.content, `${key}-sub`)

      // Gradient mode drops Prism's `.token.<type>` class so these
      // characters have no explicit `color` of their own, letting them
      // inherit `color: transparent` from the gradient-clipped <code>
      // below instead of Prism's syntax-highlight palette.
      return (
        <span
          key={key}
          className={
            textGradient === "none" ? `token ${token.type}` : undefined
          }
        >
          {content}
        </span>
      )
    }

    const body = tokens.map((token, i) => renderToken(token, i))

    // The caret parks one past the last character when the step is done, so
    // it needs somewhere to live that no source character occupies.
    if (cursorDisplay >= roles.length) {
      return (
        <>
          {body}
          <span
            key="caret-end"
            ref={caretRef}
            title="Step complete"
            className="relative rounded-[2px] bg-blue-500/20 px-1 ring-2 ring-blue-400/60"
          />
        </>
      )
    }

    return body
  }

  /**
   * The hunk-mode renderer (LTY-PATCH P3, #1078): one row per line of
   * `displayCode`, each with its own gutter, instead of one flat inline
   * stream. A wholly separate function from `renderHighlightedCode` above,
   * not a shared path branching on `hunk` — the no-hunk path stays
   * untouched code, not merely untouched output, which is what makes "a
   * step with no patch renders byte-identically to today" true by
   * construction rather than by careful branching.
   *
   * Tokenizes **per line**, not once over the whole `displayCode` — the
   * deliberate trade the story's own hazard section calls out. A construct
   * that would tokenize as one Prism token across a line boundary (an
   * unterminated block comment, a multi-line string) instead tokenizes as
   * two independent, locally-wrong fragments; colors can be wrong for that
   * one line pair, same as the story anticipates, but the character stream
   * itself is never in question, because `renderChar` still runs once per
   * source character regardless of what Prism made of it. Author a hunk
   * that does not straddle a multi-line construct if this matters for a
   * given instance.
   *
   * `charIndex` is one running counter shared across every line, the same
   * single source of truth `renderHighlightedCode` uses — it has to keep
   * agreeing with `roles`/`slotOfDisplay`/`slotStatus` across a line break
   * exactly as it does within one line, or the caret ends up on the wrong
   * glyph the moment a hunk spans more than one row.
   */
  const renderHunkRows = (activeHunk: Hunk): ReactNode => {
    const selectedLang = LANGUAGE_MAP[language] ?? "javascript"
    const grammar = Prism.languages[selectedLang]
    const lines = displayCode.split("\n")
    let charIndex = 0
    let oldLine = activeHunk.oldStart
    let newLine = activeHunk.newStart

    const rowData = lines.map((line, lineIndex) => {
      // A lineKinds shorter than the rendered line count is legal (P2) —
      // the tail renders as unmarked context, total rather than throwing.
      const kind: LineKind = activeHunk.lineKinds[lineIndex] ?? "context"

      const renderRun = (text: string): Array<JSX.Element> =>
        Array.from(text).map((char) => renderChar(char, charIndex++, kind))

      const renderToken = (
        token: string | Prism.Token,
        key: string | number
      ): ReactNode => {
        if (typeof token === "string") return renderRun(token)

        const content = Array.isArray(token.content)
          ? token.content.map((t, i) => renderToken(t, `${key}-${i}`))
          : typeof token.content === "string"
            ? renderRun(token.content)
            : renderToken(token.content, `${key}-sub`)

        return (
          <span
            key={key}
            className={
              textGradient === "none" ? `token ${token.type}` : undefined
            }
          >
            {content}
          </span>
        )
      }

      const rowNodes: Array<ReactNode> =
        !grammar || roles.length === 0
          ? Array.from(line).map((char) => renderChar(char, charIndex++, kind))
          : Prism.tokenize(line, grammar).map((token, i) =>
              renderToken(token, `${lineIndex}-${i}`)
            )

      if (lineIndex < lines.length - 1) {
        // The '\n' between this line and the next: a real display index —
        // `roles`/`slotOfDisplay` still carry an entry for it — but never a
        // glyph of its own. The row boundary is the line break now; a
        // rendered '\n' character would only add a stray one.
        charIndex += 1
      }

      // The ordinary two-column diff convention: add rows fill the new
      // column only, del rows the old column only, context rows both.
      const showOld = kind !== "add"
      const showNew = kind !== "del"
      const oldLabel = showOld ? oldLine : undefined
      const newLabel = showNew ? newLine : undefined
      if (showOld) oldLine += 1
      if (showNew) newLine += 1

      return { lineIndex, kind, rowNodes, oldLabel, newLabel }
    })

    // Same end-of-step caret `renderHighlightedCode` places after the last
    // character — here, the last character of the last row.
    const lastRow = rowData[rowData.length - 1]
    if (cursorDisplay >= roles.length && lastRow !== undefined) {
      lastRow.rowNodes.push(
        <span
          key="caret-end"
          ref={caretRef}
          title="Step complete"
          className="relative rounded-[2px] bg-blue-500/20 px-1 ring-2 ring-blue-400/60"
        />
      )
    }

    return rowData.map(({ lineIndex, kind, rowNodes, oldLabel, newLabel }) => {
      const sign = kind === "add" ? "+" : kind === "del" ? "-" : " "
      // The tint sits behind the character-level feedback painted inside
      // `rowNodes` (SLOT_CORRECT/SLOT_WRONG set their own background
      // directly on the character span), which is what makes it win: a
      // child's own background always paints over its ancestor's in normal
      // stacking order, so nothing here has to know about slot status to
      // stay out of its way.
      const tintClass =
        kind === "add"
          ? "bg-green-500/10"
          : kind === "del"
            ? "bg-red-500/10"
            : undefined
      const codeStyle =
        textGradient !== "none"
          ? {
              ...TEXT_GRADIENT_STYLE[textGradient],
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              color: "transparent",
            }
          : undefined

      return (
        <div
          key={lineIndex}
          data-line-kind={kind}
          className={cn("flex", tintClass)}
        >
          <span
            className={cn(
              GUTTER_SIGN_WIDTH,
              "shrink-0 select-none text-center text-muted-foreground/50"
            )}
          >
            {sign}
          </span>
          <span
            className={cn(
              GUTTER_NUMBER_WIDTH,
              "shrink-0 select-none pr-2 text-right tabular-nums text-muted-foreground/40"
            )}
          >
            {oldLabel ?? ""}
          </span>
          <span
            className={cn(
              GUTTER_NUMBER_WIDTH,
              "shrink-0 select-none pr-2 text-right tabular-nums text-muted-foreground/40"
            )}
          >
            {newLabel ?? ""}
          </span>
          {/*
            A real `<pre>`, not a `<code>` styled to look like one: Prism's
            imported theme (`prism-tomorrow.css`) carries an unlayered
            `:not(pre) > code[class*="language-"]` rule that overrides
            `white-space` to `normal` and paints an opaque background —
            unlayered CSS outranks any `@layer utilities` class regardless
            of specificity (the same fact `TEXT_GRADIENT_STYLE`'s own
            comment already documents for `color`), so a Tailwind
            `whitespace-pre` utility on a bare `<code>` here would silently
            lose to it, collapsing indentation and hiding the row tint
            behind an opaque background no DOM-only test would catch. The
            no-hunk path was never exposed to this because `code` already
            sits inside a real `pre` there.
          */}
          <pre className="m-0 min-w-0 flex-1">
            <code className={`language-${language}`} style={codeStyle}>
              {rowNodes}
            </code>
          </pre>
        </div>
      )
    })
  }

  return (
    <div className={cn("font-mono text-sm leading-relaxed", className)}>
      {hunk === undefined ? (
        <pre className="m-0">
          <code
            className={`language-${language}`}
            style={
              textGradient !== "none"
                ? {
                    ...TEXT_GRADIENT_STYLE[textGradient],
                    backgroundClip: "text",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    color: "transparent",
                  }
                : undefined
            }
          >
            {renderHighlightedCode()}
          </code>
        </pre>
      ) : (
        renderHunkRows(hunk)
      )}
    </div>
  )
}
