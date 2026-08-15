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
}

/**
 * A pure glyph renderer: a linear sequence of display characters plus caret
 * state, and nothing else.
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
 * this file.
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
}): JSX.Element => {
  const renderChar = (char: string, displayIndex: number): JSX.Element => {
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
    // so it reads as given rather than as a not-yet-typed real character.
    if (isContext) {
      return (
        <span key={displayIndex} className="italic text-muted-foreground/70">
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

  return (
    <div className={cn("font-mono text-sm leading-relaxed", className)}>
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
    </div>
  )
}
