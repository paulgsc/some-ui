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
  code: string
  userInput: string
  language: string
  displayMode: "shown" | "hidden"
  gameState: "idle" | "playing" | "finished" | "timeout"
}

export const CodeDisplay: FC<CodeDisplayProps> = ({
  code,
  userInput,
  language,
  displayMode,
  gameState,
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

  const renderHighlightedCode = () => {
    if (displayMode === "hidden" && gameState === "playing") {
      // Hidden mode: show only typed characters
      return code.split("").map((char, idx) => {
        if (idx < userInput.length) {
          const isCorrect = userInput[idx] === char
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
        if (idx === userInput.length) {
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

    let charIndex = 0
    const renderToken = (token: string | Prism.Token, key: number): any => {
      if (typeof token === "string") {
        return token.split("").map((char) => {
          const currentIdx = charIndex++
          let className = ""

          // Highlight based on user input
          if (currentIdx < userInput.length) {
            const isCorrect = userInput[currentIdx] === char
            className = isCorrect
              ? "bg-green-500/10"
              : "bg-red-500/30 text-red-400"
          } else if (currentIdx === userInput.length) {
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
            let className = ""

            if (currentIdx < userInput.length) {
              const isCorrect = userInput[currentIdx] === char
              className = isCorrect
                ? "bg-green-500/10"
                : "bg-red-500/30 text-red-400"
            } else if (currentIdx === userInput.length) {
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
