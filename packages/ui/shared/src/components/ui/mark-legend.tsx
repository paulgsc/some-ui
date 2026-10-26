import type { JSX, ReactNode } from "react"

/** One line of a legend: a mark as drawn, and what it means. */
export type MarkLegendLine = {
  readonly key: string
  readonly mark: ReactNode
  readonly text: string
}

/**
 * What each mark of a status means: a titled list, one line per mark, so a
 * reader learns the marks where they meet them. Each surface draws its own
 * marks and keeps its own words; this only lays them out.
 */
export const MarkLegend = ({
  title,
  lines,
  className,
}: {
  title: string
  lines: ReadonlyArray<MarkLegendLine>
  className?: string
}): JSX.Element => (
  <section aria-label={title} className={className}>
    <h3 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
      {title}
    </h3>
    <ul className="mt-2 flex flex-col gap-2">
      {lines.map(({ key, mark, text }) => (
        <li key={key} className="flex items-center gap-3 text-sm">
          {mark}
          {text}
        </li>
      ))}
    </ul>
  </section>
)
