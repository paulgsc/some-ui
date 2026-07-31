import type { FC, JSX, ReactNode } from "react"
import { useLayoutEffect, useRef } from "react"
import type { DisplayMode, TextGradient } from "@leetype/types/leetype"
import { ROLE_TYPEABLE, SLOT_CORRECT, SLOT_WRONG } from "@leetype/types/leetype"
import { ChevronDown } from "lucide-react"
import Prism from "prismjs"
import { cn } from "some-ui-utils"

// Import Prism.js and its components
import "prismjs/themes/prism-tomorrow.css"
import "prismjs/components/prism-typescript"
import "prismjs/components/prism-c"
import "prismjs/components/prism-cpp"
import "prismjs/components/prism-rust"

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
   * keystroke for.
   */
  roles: Uint8Array
  /**
   * Per-rendered-character slot ordinal, `-1` for layout characters. The
   * indirection is the whole point of the new model: a run of indentation
   * has display indices but no slots, so it can be rendered in place while
   * being completely absent from what the player has to type.
   */
  slotOfDisplay: Int32Array
  /** Per-slot status: untouched / correct / wrong. */
  slotStatus: Uint8Array
  /**
   * Index, into `displayCode`'s characters, of the character the player is
   * currently on. The engine guarantees this is always a typeable character
   * (or one past the end when the chunk is done) — the caret never lands
   * inside an indentation run, which is what makes the overlay read as
   * "you are exactly here" instead of drifting through whitespace.
   */
  cursorDisplay: number
  displayMode?: DisplayMode
  adaptiveMessage?: string
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

export const CodeDisplay: FC<CodeDisplayProps> = ({
  displayCode,
  language,
  roles,
  slotOfDisplay,
  slotStatus,
  cursorDisplay,
  displayMode = "shown",
  adaptiveMessage,
  className,
  textGradient = "none",
}): JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null)
  const caretRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    const caret = caretRef.current
    if (!caret || !container) return

    const containerRect = container.getBoundingClientRect()
    const caretRect = caret.getBoundingClientRect()

    if (
      caretRect.bottom > containerRect.bottom - 100 ||
      caretRect.top < containerRect.top + 100
    ) {
      caret.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }, [cursorDisplay])

  const isHidden = displayMode === "hidden"

  const renderChar = (char: string, displayIndex: number): JSX.Element => {
    const isTypeable = roles[displayIndex] === ROLE_TYPEABLE
    const slot = slotOfDisplay[displayIndex] ?? -1
    const status = slot >= 0 ? slotStatus[slot] : undefined

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
          {isHidden ? MASK_CHAR : char}
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

    // Layout the engine skips: rendered as-is so the code keeps its shape,
    // never masked and never scored. This is the visual half of "you don't
    // type indentation" — the player's eye follows the caret straight past
    // it.
    if (!isTypeable) {
      return <span key={displayIndex}>{char}</span>
    }

    if (isHidden) {
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

    // The caret parks one past the last character when the chunk is done,
    // so it needs somewhere to live that no source character occupies.
    if (cursorDisplay >= roles.length) {
      return (
        <>
          {body}
          <span
            key="caret-end"
            ref={caretRef}
            title="Chunk complete"
            className="relative rounded-[2px] bg-blue-500/20 px-1 ring-2 ring-blue-400/60"
          />
        </>
      )
    }

    return body
  }

  return (
    <div
      ref={containerRef}
      // scroll-intent: code-display — the source the player reads and types
      // through is as long as the file is, and the caret is auto-scrolled to
      // follow them. The scroll *is* the interaction here, not a fallback for
      // a box that was handed too much; declared so the ui-fit sweep can tell
      // the two apart (docs/ui-fit).
      data-scroll-intent="code-display"
      className={cn(
        "relative h-[500px] overflow-auto rounded-lg border border-border bg-secondary p-4 font-mono text-sm leading-relaxed",
        className
      )}
    >
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
      {adaptiveMessage && (
        <div className="absolute right-3 top-3 rounded-full border border-border bg-background/80 px-3 py-1 text-xs text-muted-foreground backdrop-blur-sm">
          {adaptiveMessage}
        </div>
      )}
    </div>
  )
}
