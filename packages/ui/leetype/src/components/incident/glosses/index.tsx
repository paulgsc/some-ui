import type { FC } from "react"

type GlossesProps = {
  /** The terms the screen glosses (`screen.glosses`). */
  terms: ReadonlyArray<string> | undefined
  glossary: Readonly<Record<string, string>>
}

/**
 * The one-line glosses a screen declares (canon v1.2, Prop. 9.5), on any
 * kind of screen, since the content lint counts any screen that glosses a
 * term as defining it.
 */
export const Glosses: FC<GlossesProps> = ({ terms, glossary }) => {
  const shown = (terms ?? []).flatMap((term) => {
    const gloss = glossary[term]
    return gloss === undefined ? [] : [{ term, gloss }]
  })
  if (shown.length === 0) return null
  return (
    <dl className="flex flex-col gap-1 text-xs text-muted-foreground">
      {shown.map(({ term, gloss }) => (
        <div key={term}>
          <dt className="inline font-semibold text-foreground">{term}</dt>
          <dd className="inline">: {gloss}</dd>
        </div>
      ))}
    </dl>
  )
}
