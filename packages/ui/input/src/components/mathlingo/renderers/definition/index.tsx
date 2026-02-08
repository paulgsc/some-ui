import type { JSX } from "react"

import { MathExpression } from "@input/components/mathlingo/renderers/math-expression"

type DefinitionProps = {
  text: string
  className?: string
}

export const Definition = ({
  text,
  className = "",
}: DefinitionProps): JSX.Element => {
  // Parse text for LaTeX expressions wrapped in $ or $$
  const parts = text.split(/(\$\$?[^$]+\$\$?)/g)

  return (
    <div
      className={`p-4 bg-secondary/50 rounded-lg border border-border ${className}`}
    >
      <p className="text-foreground leading-relaxed">
        {parts.map((part, index) => {
          if (part.startsWith("$$") && part.endsWith("$$")) {
            const latex = part.slice(2, -2)
            return <MathExpression key={index} latex={latex} display />
          } else if (part.startsWith("$") && part.endsWith("$")) {
            const latex = part.slice(1, -1)
            return <MathExpression key={index} latex={latex} />
          }
          return <span key={index}>{part}</span>
        })}
      </p>
    </div>
  )
}
