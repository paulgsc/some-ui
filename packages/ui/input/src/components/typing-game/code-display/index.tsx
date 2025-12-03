import type { FC } from "react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  buildDisplayMap,
  isWasmLoaded,
} from "@input/lib/leetype/leetype-wasm-loader"
import type { CanonicalUnit } from "@input/types/leetype"
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
  displayCode: string // The formatted code to display
  language: string
  targetUnits: Array<CanonicalUnit>
  userUnits: Array<CanonicalUnit>
  cursorUnitIndex: number
  className?: string
}

export const CodeDisplay: FC<CodeDisplayProps> = ({
  displayCode,
  language,
  targetUnits,
  userUnits,
  cursorUnitIndex,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const caretRef = useRef<HTMLSpanElement>(null)
  const [wasmReady, setWasmReady] = useState(isWasmLoaded())

  // Wait for WASM to be ready
  useEffect(() => {
    if (!wasmReady) {
      const checkInterval = setInterval(() => {
        if (isWasmLoaded()) {
          setWasmReady(true)
          clearInterval(checkInterval)
        }
      }, 50)
      return () => clearInterval(checkInterval)
    }
  }, [wasmReady])

  // Build display buffer from WASM
  const displayBuffer = useMemo((): Array<DisplayChar> | null => {
    if (!wasmReady) return null

    try {
      const map: Array<number> = buildDisplayMap(displayCode)
      const chars = Array.from(displayCode)

      // Defensive: ensure map length matches chars length
      if (map.length !== chars.length) {
        const last = map.length ? map[map.length - 1] : 0
        while (map.length < chars.length) map.push(last)
      }

      return chars.map((char, i) => ({
        char,
        unitIndex: map[i],
        displayIndex: i,
      }))
    } catch (error) {
      console.error("Error building display map:", error)
      return null
    }
  }, [displayCode, wasmReady])

  // Auto-scroll to keep cursor in view
  useLayoutEffect(() => {
    if (caretRef.current && containerRef.current) {
      const container = containerRef.current
      const caret = caretRef.current
      const containerRect = container.getBoundingClientRect()
      const caretRect = caret.getBoundingClientRect()

      // Check if caret is out of view
      if (
        caretRect.bottom > containerRect.bottom - 100 ||
        caretRect.top < containerRect.top + 100
      ) {
        caret.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    }
  }, [cursorUnitIndex])

  const renderHighlightedCode = () => {
    if (!displayBuffer) {
      // Fallback: render plain code while waiting for WASM
      return displayCode
    }

    // Map for Prism syntax highlighting
    const languageMap: Record<string, string> = {
      typescript: "typescript",
      rust: "rust",
      cpp: "cpp",
      c: "c",
    }

    const grammar =
      Prism.languages[languageMap[language]] || Prism.languages.javascript
    const tokens = Prism.tokenize(displayCode, grammar)

    let charIndex = 0

    const renderToken = (token: string | Prism.Token, key: number): any => {
      if (typeof token === "string") {
        return token.split("").map(() => {
          const displayChar = displayBuffer[charIndex++]
          if (!displayChar) return null
          return renderChar(displayChar)
        })
      }

      if (Array.isArray(token.content)) {
        return (
          <span key={key} className={`token ${token.type}`}>
            {token.content.map((t, i) => renderToken(t, i))}
          </span>
        )
      }

      const content = String(token.content)
      return (
        <span key={key} className={`token ${token.type}`}>
          {content.split("").map(() => {
            const displayChar = displayBuffer[charIndex++]
            if (!displayChar) return null
            return renderChar(displayChar)
          })}
        </span>
      )
    }

    const renderChar = (displayChar: DisplayChar) => {
      const { char, unitIndex, displayIndex } = displayChar

      // Check if this is the cursor position
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

      // Check if this unit has been typed
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
              isCorrect ? "bg-green-500/10" : "bg-red-500/30 text-red-400"
            }
          >
            {char}
          </span>
        )
      }

      // Not yet typed - render normally
      return <span key={displayIndex}>{char}</span>
    }

    return tokens.map((token, i) => renderToken(token, i))
  }

  return (
    <div
      ref={containerRef}
      className={`code-display font-mono text-sm leading-relaxed h-[500px] overflow-auto p-4 bg-secondary rounded-lg border border-border ${
        className || ""
      }`}
    >
      <pre className="m-0">
        <code className={`language-${language}`}>
          {renderHighlightedCode()}
        </code>
      </pre>
    </div>
  )
}
