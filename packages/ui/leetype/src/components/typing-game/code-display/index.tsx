import type { FC, JSX, ReactNode, RefObject } from "react"
import type { TextGradient } from "@leetype/types/leetype"
import {
  ROLE_CONTEXT,
  ROLE_TYPEABLE,
  SLOT_CORRECT,
  SLOT_WRONG,
  VISIBILITY_MASKED,
} from "@leetype/types/leetype"
import { cn } from "@some-ui/core-utils"
import { ChevronDown } from "lucide-react"
import Prism from "prismjs"

import "prismjs/themes/prism-tomorrow.css"
import "prismjs/components/prism-typescript"
import "prismjs/components/prism-c"
import "prismjs/components/prism-cpp"
import "prismjs/components/prism-rust"

/**
 * One character wide, like every glyph it stands in for: masked and unmasked
 * lines must match in length or unmasking reflows text mid-word.
 * `crates/leetype_wasm/tests/invariants.rs` asserts the engine's half.
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
 * A rendered line's role in a diff-hunk overlay. Structurally identical to
 * `types/exercise`'s `RenderedDiffLineKind` but not imported: no exercise
 * concept may reach this file, only plain diff vocabulary.
 */
export type LineKind = "context" | "del" | "add"

/**
 * The diff-hunk gutter data a step's overlay projects down to this renderer
 * (LTY-PATCH). `oldStart`/`newStart` seed the line-number counters. The file
 * path renders in `TypingViewport`'s header, not here.
 */
export type Hunk = {
  lineKinds: ReadonlyArray<LineKind>
  oldStart: number
  newStart: number
}

/**
 * Maps each non-"none" `TextGradient` to its gradient custom property
 * (`--gradient-*`, tokens/base.css, as the `text-gradient-*` utilities use).
 *
 * Inline rather than the utility class: Prism's theme is unlayered, so its
 * `code[class*="language-"] { color: #ccc }` outranks any `@layer utilities`
 * class regardless of specificity. Only an inline style beats it.
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
   * Per-rendered-character slot ordinal, `-1` for layout characters: an
   * indentation run is rendered in place but has no slot, so it is never
   * typed.
   */
  slotOfDisplay: Int32Array
  /** Per-slot status: untouched / correct / wrong. */
  slotStatus: Uint8Array
  /**
   * Per-slot reveal state, projected by the engine's control loop. This
   * component decides *nothing* about masking (no threshold, latch, flag or
   * memory); the policy is engine state, tested by `cargo test -p
   * leetype_wasm` without a DOM.
   */
  visibility: Uint8Array
  /**
   * Index into `displayCode` of the character the player is on. The engine
   * guarantees a typeable character (or one past the end when done), never
   * an indentation run.
   */
  cursorDisplay: number
  /** Lets `TypingViewport` find the caret to follow it; this component only marks it. */
  caretRef?: RefObject<HTMLSpanElement | null>
  className?: string
  /**
   * When not "none", not-yet-typed code renders in a gradient instead of
   * Prism's palette. Typed feedback and the cursor keep their own colors.
   */
  textGradient?: TextGradient
  /**
   * A diff-hunk overlay (LTY-PATCH): adds a sign column, old/new line-number
   * columns and add/del row tints. The two paths are independent render
   * functions, not one path branching on a flag.
   */
  hunk?: Hunk
}

/**
 * A pure glyph renderer: a linear sequence of display characters plus caret
 * state, organized into rows when handed a `hunk` (layout, not policy).
 *
 * It renders at whatever height its parent gives it; scrolling and
 * caret-following belong to `TypingViewport`.
 *
 * It knows nothing about exercises, prompts, steps or competencies, and that
 * is the invariant worth protecting: a new prompt-side block kind must never
 * reach this file. `LineKind`/`Hunk` are plain diff vocabulary. It owns no
 * masking policy, error accounting, threshold, latch or memory.
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

    // Context: read, never typed, never masked (it has no slot). Muted in
    // gradient mode too, like typed feedback. `-webkit-text-fill-color` is
    // inherited, so it is reset here or WebKit would paint the span with the
    // gradient ancestor's `transparent`.
    //
    // A `del` row's context is struck through in muted red instead, so it
    // reads as removed. Set on the span itself, since a direct color beats
    // anything a row wrapper could inherit down.
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

    // Layout the engine skips: rendered as-is, never masked or scored.
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
   * The hunk-mode renderer: one row per line, each with its own gutter. A
   * separate function from `renderHighlightedCode`, so the no-hunk path is
   * untouched code, not just untouched output.
   *
   * Tokenizes **per line**: a construct spanning lines (block comment,
   * multi-line string) may be colored wrongly, but `renderChar` still runs
   * once per character, so the stream is never in question.
   *
   * `charIndex` runs across every line so it stays aligned with
   * `roles`/`slotOfDisplay`/`slotStatus` past line breaks.
   */
  const renderHunkRows = (activeHunk: Hunk): ReactNode => {
    const selectedLang = LANGUAGE_MAP[language] ?? "javascript"
    const grammar = Prism.languages[selectedLang]
    const lines = displayCode.split("\n")
    let charIndex = 0
    let oldLine = activeHunk.oldStart
    let newLine = activeHunk.newStart

    const rowData = lines.map((line, lineIndex) => {
      // A short lineKinds renders its tail as context.
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
        // The '\n' has a display index but no glyph: the row is the break.
        charIndex += 1
      }

      // Two-column convention: add fills new only, del old only, context both.
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
      // Character feedback sets its own background, which paints over this
      // row tint, so the tint needs no knowledge of slot status.
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
            A real `<pre>`: Prism's unlayered `:not(pre) > code[class*="language-"]`
            rule sets `white-space: normal` and an opaque background, and beats
            any utility class (see `TEXT_GRADIENT_STYLE`), collapsing
            indentation and hiding the row tint.
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
