import type { FC } from "react"
import { useEffect, useRef } from "react"
import Prism from "prismjs"

// Import Prism.js and its components in the correct order
import "prismjs/themes/prism-tomorrow.css"
import "prismjs/components/prism-typescript"
import "prismjs/components/prism-c"
import "prismjs/components/prism-cpp"
import "prismjs/components/prism-rust"

type CodeDisplayProps = {
  code: string // Original formatted code for display
  userInput: string // Normalized user input
  language: string
  displayMode: "shown" | "hidden"
  gameState: "idle" | "playing" | "finished" | "timeout"
  normalizedCode: string // Normalized target code for comparison
}

export const CodeDisplay: FC<CodeDisplayProps> = ({
  code,
  userInput,
  language,
  displayMode,
  gameState,
  normalizedCode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (cursorRef.current && containerRef.current && gameState === "playing") {
      const container = containerRef.current
      const cursor = cursorRef.current
      const containerRect = container.getBoundingClientRect()
      const cursorRect = cursor.getBoundingClientRect()

      // Check if cursor is below viewport
      if (cursorRect.bottom > containerRect.bottom - 100) {
        cursor.scrollIntoView({ behavior: "smooth", block: "center" })
      }
      // Check if cursor is above viewport
      else if (cursorRect.top < containerRect.top + 100) {
        cursor.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    }
  }, [userInput, gameState])

  // Build a map from display code positions to normalized code positions
  const buildPositionMap = (displayCode: string, normalized: string) => {
    const map: Array<number> = [] // map[displayIndex] = normalizedIndex
    let normalizedIndex = 0

    for (let i = 0; i < displayCode.length; i++) {
      const char = displayCode[i]

      // Skip leading whitespace at the start of lines
      if (i === 0 || displayCode[i - 1] === "\n") {
        // We're at the start of a line
        let leadingSpaces = 0
        let j = i
        while (
          j < displayCode.length &&
          (displayCode[j] === " " || displayCode[j] === "\t")
        ) {
          leadingSpaces++
          j++
        }

        // Skip leading whitespace in mapping
        if ((leadingSpaces > 0 && char === " ") || char === "\t") {
          map.push(-1) // Mark as skipped
          continue
        }
      }

      map.push(normalizedIndex)

      // Only increment normalized index for non-skipped characters
      if (
        (char !== " " && char !== "\t") ||
        (i > 0 &&
          displayCode[i - 1] !== "\n" &&
          displayCode[i - 1] !== " " &&
          displayCode[i - 1] !== "\t")
      ) {
        normalizedIndex++
      }
    }

    return map
  }

  const renderHighlightedCode = () => {
    if (displayMode === "hidden" && gameState === "playing") {
      // Hidden mode: show only typed characters
      const positionMap = buildPositionMap(code, normalizedCode)

      return code.split("").map((char, idx) => {
        const normalizedIdx = positionMap[idx]

        if (normalizedIdx === -1) {
          // Leading whitespace - always show as dim
          return (
            <span key={idx} className="text-muted-foreground/30">
              {char}
            </span>
          )
        }

        if (normalizedIdx < userInput.length) {
          const isCorrect =
            userInput[normalizedIdx] === normalizedCode[normalizedIdx]
          return (
            <span
              key={idx}
              className={
                isCorrect ? "text-green-400" : "text-red-400 bg-red-400/20"
              }
            >
              {char === "\n" ? "\n" : char}
            </span>
          )
        }
        if (normalizedIdx === userInput.length) {
          return (
            <span
              key={idx}
              ref={cursorRef}
              className="bg-blue-500/30 animate-pulse"
            >
              {char === "\n" ? "\n" : char}
            </span>
          )
        }
        return (
          <span key={idx} className="text-transparent select-none">
            {char === "\n" ? "\n" : char}
          </span>
        )
      })
    }

    // Shown mode: use Prism for syntax highlighting
    const languageMap: Record<string, string> = {
      typescript: "typescript",
      rust: "rust",
      cpp: "cpp",
      c: "c",
    }

    const grammar = Prism.languages[languageMap[language]]
    const tokens = Prism.tokenize(code, grammar)

    const positionMap = buildPositionMap(code, normalizedCode)
    let charIndex = 0

    const renderToken = (token: string | Prism.Token, key: number): any => {
      if (typeof token === "string") {
        return token.split("").map((char) => {
          const currentIdx = charIndex++
          const normalizedIdx = positionMap[currentIdx]
          let className = ""

          // Leading whitespace
          if (normalizedIdx === -1) {
            return (
              <span key={currentIdx} className="text-muted-foreground/50">
                {char}
              </span>
            )
          }

          // Highlight based on user input
          if (normalizedIdx < userInput.length) {
            const isCorrect =
              userInput[normalizedIdx] === normalizedCode[normalizedIdx]
            className = isCorrect
              ? "bg-green-500/10"
              : "bg-red-500/30 text-red-400"
          } else if (normalizedIdx === userInput.length) {
            return (
              <span
                key={currentIdx}
                ref={cursorRef}
                className="bg-blue-500/30 animate-pulse"
              >
                {char}
              </span>
            )
          }

          return (
            <span key={currentIdx} className={className}>
              {char}
            </span>
          )
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
          {content.split("").map((char) => {
            const currentIdx = charIndex++
            const normalizedIdx = positionMap[currentIdx]
            let className = ""

            // Leading whitespace
            if (normalizedIdx === -1) {
              return (
                <span key={currentIdx} className="opacity-50">
                  {char}
                </span>
              )
            }

            if (normalizedIdx < userInput.length) {
              const isCorrect =
                userInput[normalizedIdx] === normalizedCode[normalizedIdx]
              className = isCorrect
                ? "bg-green-500/10"
                : "bg-red-500/30 text-red-400"
            } else if (normalizedIdx === userInput.length) {
              return (
                <span
                  key={currentIdx}
                  ref={cursorRef}
                  className="bg-blue-500/30 animate-pulse"
                >
                  {char}
                </span>
              )
            }

            return (
              <span key={currentIdx} className={className}>
                {char}
              </span>
            )
          })}
        </span>
      )
    }

    return tokens.map((token, i) => renderToken(token, i))
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="code font-mono text-sm leading-relaxed h-[500px] overflow-auto p-4 bg-secondary rounded-lg border border-border"
      >
        <pre className="m-0">
          <code className={`language-${language}`}>
            {renderHighlightedCode()}
          </code>
        </pre>
      </div>

      {displayMode === "hidden" && gameState === "playing" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-card/90 backdrop-blur-sm px-6 py-3 rounded-lg border border-border">
            <p className="text-muted-foreground text-sm font-medium">
              Type from memory - code is hidden
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
