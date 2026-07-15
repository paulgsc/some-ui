import type { FC, JSX, ReactNode } from "react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  buildDisplayMap,
  isWasmLoaded,
} from "@leetype/lib/leetype/leetype-wasm-loader"
import type { CanonicalUnit, DisplayMode } from "@leetype/types/leetype"
import { EyeOff } from "lucide-react"
import Prism from "prismjs"

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

type CodeDisplayProps = {
  displayCode: string
  language: string
  targetUnits: Array<CanonicalUnit>
  userUnits: Array<CanonicalUnit>
  cursorUnitIndex: number
  displayMode?: DisplayMode
  adaptiveMessage?: string
  className?: string
}

export const CodeDisplay: FC<CodeDisplayProps> = ({
  displayCode,
  language,
  targetUnits,
  userUnits,
  cursorUnitIndex,
  displayMode = "shown",
  adaptiveMessage,
  className,
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
  }, [cursorUnitIndex])

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

    const renderChar = (displayChar: DisplayChar): JSX.Element => {
      const { char, unitIndex, displayIndex } = displayChar

      if (unitIndex === cursorUnitIndex) {
        return (
          <span
            key={displayIndex}
            ref={caretRef}
            className="bg-blue-500/30 animate-pulse"
          >
            {char}
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

      return (
        <span key={key} className={`token ${token.type}`}>
          {content}
        </span>
      )
    }

    return tokens.map((token, i) => renderToken(token, i))
  }

  return (
    <div
      ref={containerRef}
      className={`relative font-mono text-sm leading-relaxed h-[500px] overflow-auto p-4 bg-secondary rounded-lg border border-border ${
        className ?? ""
      }`}
    >
      <pre className="m-0">
        <code className={`language-${language}`}>
          {renderHighlightedCode()}
        </code>
      </pre>
      {displayMode === "hidden" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-background/70 backdrop-blur-sm">
          <EyeOff className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">
            Type from memory
          </p>
          {adaptiveMessage && (
            <p className="text-xs text-muted-foreground/70">
              {adaptiveMessage}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
