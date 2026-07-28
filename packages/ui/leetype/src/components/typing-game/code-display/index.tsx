import type { FC, JSX, ReactNode } from "react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  buildDisplayMap,
  isWasmLoaded,
} from "@leetype/lib/leetype/leetype-wasm-loader"
import type {
  CanonicalUnit,
  DisplayMode,
  TextGradient,
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

type DisplayChar = {
  char: string
  unitIndex: number
  displayIndex: number
}

const MASK_CHAR = "•"

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
  targetUnits: Array<CanonicalUnit>
  userUnits: Array<CanonicalUnit>
  /**
   * Index, into `displayCode`'s characters (not canonical units), of the
   * character the player is currently on. Deliberately display-character
   * granularity rather than unit granularity: a canonical unit can span
   * several rendered characters (e.g. a run of indentation whitespace
   * collapses to one separator unit), and matching on unit index made the
   * cursor highlight that whole run at once instead of tracking each
   * keystroke - the off-by-one/visual-confusion bug from issue #829.
   */
  cursorDisplayIndex: number
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
  targetUnits,
  userUnits,
  cursorDisplayIndex,
  displayMode = "shown",
  adaptiveMessage,
  className,
  textGradient = "none",
}): JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null)
  const caretRef = useRef<HTMLSpanElement>(null)
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [wasmReady, setWasmReady] = useState(isWasmLoaded())

  useEffect(() => {
    if (!wasmReady) {
      checkIntervalRef.current = setInterval(() => {
        if (isWasmLoaded()) {
          setWasmReady(true)
          if (checkIntervalRef.current) clearInterval(checkIntervalRef.current)
        }
      }, 50)
    }
    return (): void => {
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current)
    }
  }, [wasmReady])

  const displayBuffer = useMemo((): Array<DisplayChar> | null => {
    if (!wasmReady) return null

    try {
      const map: Array<number> = Array.from(buildDisplayMap(displayCode))
      const chars = Array.from(displayCode)

      // Ensure map length matches chars length to avoid undefined access
      const lastUnitIndex = map.length > 0 ? (map[map.length - 1] ?? 0) : 0

      return chars.map(
        (char, i): DisplayChar => ({
          char,
          unitIndex: map[i] ?? lastUnitIndex,
          displayIndex: i,
        })
      )
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error building display map:", error)
      return null
    }
  }, [displayCode, wasmReady])

  useLayoutEffect(() => {
    if (caretRef.current && containerRef.current) {
      const container = containerRef.current
      const caret = caretRef.current
      const containerRect = container.getBoundingClientRect()
      const caretRect = caret.getBoundingClientRect()

      if (
        caretRect.bottom > containerRect.bottom - 100 ||
        caretRect.top < containerRect.top + 100
      ) {
        caret.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    }
  }, [cursorDisplayIndex])

  const renderHighlightedCode = (): ReactNode => {
    if (!displayBuffer) return displayCode

    const languageMap: Record<string, string> = {
      typescript: "typescript",
      rust: "rust",
      cpp: "cpp",
      c: "c",
    }

    const selectedLang = languageMap[language] ?? "javascript"
    const grammar = Prism.languages[selectedLang]
    if (!grammar) return displayCode
    const tokens = Prism.tokenize(displayCode, grammar)

    let charIndex = 0
    const isHidden = displayMode === "hidden"

    const renderChar = (displayChar: DisplayChar): JSX.Element => {
      const { char, unitIndex, displayIndex } = displayChar
      const isWhitespace = char.trim() === ""

      if (displayIndex === cursorDisplayIndex) {
        return (
          <span
            key={displayIndex}
            ref={caretRef}
            title="You are here"
            className="relative rounded-[2px] bg-blue-500/30 ring-2 ring-blue-400 ring-offset-1 ring-offset-background animate-pulse"
          >
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute -top-3.5 left-1/2 h-3 w-3 -translate-x-1/2 text-blue-400"
            />
            {isHidden && !isWhitespace ? MASK_CHAR : char}
          </span>
        )
      }

      if (unitIndex < userUnits.length) {
        const targetUnit = targetUnits[unitIndex]
        const userUnit = userUnits[unitIndex]

        let isCorrect = true
        if (targetUnit && userUnit) {
          if (targetUnit.kind !== userUnit.kind) {
            isCorrect = false
          } else if (
            targetUnit.kind === "char" &&
            userUnit.kind === "char" &&
            targetUnit.value !== userUnit.value
          ) {
            isCorrect = false
          }
        }

        // Already-typed characters are always revealed at full opacity,
        // in either display mode — the reveal is what gives typing feedback.
        return (
          <span
            key={displayIndex}
            className={
              isCorrect
                ? "bg-green-500/10 text-green-400"
                : "bg-red-500/30 text-red-400"
            }
          >
            {char}
          </span>
        )
      }

      if (isHidden && !isWhitespace) {
        return (
          <span key={displayIndex} className="text-muted-foreground/40">
            {MASK_CHAR}
          </span>
        )
      }

      return <span key={displayIndex}>{char}</span>
    }

    const renderToken = (
      token: string | Prism.Token,
      key: string | number
    ): ReactNode => {
      if (typeof token === "string") {
        return token.split("").map((_) => {
          const displayChar = displayBuffer[charIndex++]
          return displayChar ? renderChar(displayChar) : null
        })
      }

      const content = Array.isArray(token.content)
        ? token.content.map((t, i) => renderToken(t, `${key}-${i}`))
        : typeof token.content === "string"
          ? token.content.split("").map((_) => {
              const displayChar = displayBuffer[charIndex++]
              return displayChar ? renderChar(displayChar) : null
            })
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

    return tokens.map((token, i) => renderToken(token, i))
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative font-mono text-sm leading-relaxed h-[500px] overflow-auto p-4 bg-secondary rounded-lg border border-border",
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
