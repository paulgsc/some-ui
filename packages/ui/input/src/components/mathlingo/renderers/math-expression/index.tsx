import type { JSX } from "react"
import { useEffect, useRef } from "react"
import katex from "katex"

import "katex/dist/katex.min.css"

type MathExpressionProps = {
  latex: string
  display?: boolean
  className?: string
}

export const MathExpression = ({
  latex,
  display = false,
  className = "",
}: MathExpressionProps): JSX.Element => {
  const containerRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      try {
        katex.render(latex, containerRef.current, {
          displayMode: display,
          throwOnError: false,
          trust: true,
        })
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("KaTeX rendering error:", error)
        if (containerRef.current) {
          containerRef.current.textContent = latex
        }
      }
    }
  }, [latex, display])

  return (
    <span
      ref={containerRef}
      className={`${display ? "block text-center" : "inline"} ${className}`}
    />
  )
}
