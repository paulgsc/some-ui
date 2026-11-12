/**
 * Where something stands on a conveyor: its stations in order, the ones it
 * has passed filled, the one it is at ringed, and, when it has stepped off
 * the line for a while, a side track named beside it. Display only: each
 * conveyor (Studio's renders, its takes) keeps its own stations and words
 * and says which one a thing is at; this only lays them out.
 */
import type { JSX } from "react"

import { cn } from "../../../lib/utils"

/** One station on the line, in the conveyor's own words. */
export type Station = {
  readonly id: string
  readonly name: string
}

/** A side track the thing sits on for now, and what that means. */
export type StationAside = {
  readonly name: string
  readonly line: string
}

export const StationStrip = ({
  label,
  stations,
  at,
  aside = null,
  className,
}: {
  /** What the strip is of, for a reader that can't see it. */
  label: string
  stations: ReadonlyArray<Station>
  /** The station it is at; one not on the line marks none. */
  at: string
  aside?: StationAside | null
  className?: string
}): JSX.Element => {
  const here = stations.findIndex((station) => station.id === at)
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <ol aria-label={label} className="flex items-start">
        {stations.map((station, index) => {
          const passed = here !== -1 && index < here
          const current = index === here
          return (
            <li
              key={station.id}
              aria-current={current ? "step" : undefined}
              data-passed={passed ? "" : undefined}
              className={cn(
                "relative flex min-w-0 flex-1 flex-col items-center gap-1 text-center text-[11px] leading-tight",
                current
                  ? "text-foreground font-semibold"
                  : "text-muted-foreground"
              )}
            >
              {index > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-[7px] right-1/2 left-[-50%] h-0.5",
                    passed || current ? "bg-primary" : "bg-border"
                  )}
                />
              )}
              <span
                aria-hidden
                className={cn(
                  "bg-background relative z-10 size-4 rounded-full border-2",
                  passed && "bg-primary border-primary",
                  current && "border-primary ring-primary/25 ring-4",
                  !passed && !current && "border-border"
                )}
              />
              {station.name}
            </li>
          )
        })}
      </ol>
      {aside !== null && (
        <p className="rounded-lg border border-dashed px-3 py-2 text-sm">
          <span className="font-semibold">{aside.name}:</span> {aside.line}
        </p>
      )}
    </div>
  )
}
