import type { JSX } from "react"
import { cn } from "@some-ui/core-utils"
import { scenarioOf, type ScenarioId } from "@some-ui/game-scenarios"

/** A scenario's 24x24 stroke icon (`@some-ui/game-scenarios`, `ICONS`). */
export const ScenarioIcon = ({
  id,
  className,
}: {
  id: ScenarioId
  className?: string
}): JSX.Element => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={cn("size-6 shrink-0", className)}
  >
    {scenarioOf(id).icon.map((d) => (
      <path key={d} d={d} />
    ))}
  </svg>
)
