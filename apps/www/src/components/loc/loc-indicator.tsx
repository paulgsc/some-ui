/**
 * The lines-of-code pulse: a small standing indicator in the dashboard header,
 * beside the audio one, of how much code has been written lately.
 *
 * At rest it is seven bars (the last seven days) and a number. Hovering shows
 * a card with the week in words; clicking opens the breakdown - added and
 * removed, a bar chart for the range, the split between repositories, and a
 * switch that brings lockfiles and generated files back in.
 *
 * The numbers are a snapshot taken when this build was made
 * (`lib/loc-report`), not a live count, and the footer says which day it is
 * as of. A build that carries no snapshot renders nothing at all.
 */

import type { JSX } from "react"
import { useMemo, useState } from "react"
import {
  Button,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@some-ui/shared"
import { ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react"
import { cn, formatDay } from "some-ui-utils"

import type { LocSnapshot } from "@/lib/loc-report/schema"
import { locSnapshot } from "@/lib/loc-report/snapshot"
import type { RangeKey, Summary } from "@/lib/loc-report/summarize"
import { compactCount, RANGES, summarize } from "@/lib/loc-report/summarize"

const ADDED_TEXT = "text-blue-700 dark:text-blue-400"
const ADDED_FILL = "bg-blue-700 dark:bg-blue-400"
const REMOVED_TEXT = "text-orange-700 dark:text-orange-400"
const REMOVED_FILL = "bg-orange-700 dark:bg-orange-400"

/**
 * Where each repository's own numbers can be seen live on GitHub: its
 * code-frequency graph. One link per repository, because the snapshot is a sum
 * over several and a single link would open one of them.
 */
const GITHUB_URL = "https://github.com/paulgsc"

/** The chart's height, split at the baseline: additions above, removals below. */
const ABOVE_BASELINE_PX = 60
const BELOW_BASELINE_PX = 36

const count = (value: number): string => value.toLocaleString("en-US")
const signed = (value: number): string =>
  `${value < 0 ? "−" : "+"}${count(Math.abs(value))}`

const RANGE_PHRASE: Record<RangeKey, string> = {
  "7d": "in the last 7 days",
  "30d": "in the last 30 days",
  "90d": "in the last 90 days",
}

const PREVIOUS_PHRASE: Record<RangeKey, string> = {
  "7d": "previous 7 days",
  "30d": "previous 30 days",
  "90d": "previous 90 days",
}

/** Seven bars, one per day, the last one in the accent. Decorative: the number says it. */
const Sparkline = ({ days }: { days: Summary["buckets"] }): JSX.Element => {
  const tallest = Math.max(1, ...days.map((day) => day.added))
  return (
    <span aria-hidden="true" className={cn("flex h-4 items-end gap-0.5")}>
      {days.map((day, index) => (
        <span
          key={day.from}
          className={cn(
            "block w-[3px] rounded-[1px]",
            index === days.length - 1 ? ADDED_FILL : "bg-muted-foreground/60"
          )}
          style={{
            height: Math.max(3, Math.round((16 * day.added) / tallest)),
          }}
        />
      ))}
    </span>
  )
}

const Chart = ({ summary }: { summary: Summary }): JSX.Element => {
  const tallest = Math.max(1, ...summary.buckets.map((bar) => bar.added))
  const scale = ABOVE_BASELINE_PX / tallest
  return (
    <div className={cn("space-y-1.5")}>
      <div
        role="img"
        aria-label={`Lines added and removed, ${formatDay(summary.from)} to ${formatDay(summary.to)}`}
        className={cn("relative flex items-stretch gap-0.5")}
        style={{ height: ABOVE_BASELINE_PX + BELOW_BASELINE_PX }}
      >
        <div
          aria-hidden="true"
          className={cn("bg-border absolute inset-x-0 h-px")}
          style={{ top: ABOVE_BASELINE_PX }}
        />
        {summary.buckets.map((bar) => (
          <div
            key={bar.from}
            title={`${bar.from === bar.to ? formatDay(bar.from) : `${formatDay(bar.from)} – ${formatDay(bar.to)}`}: +${count(bar.added)} −${count(bar.removed)}`}
            className={cn("flex min-w-0 flex-1 flex-col")}
          >
            <div
              className={cn("flex items-end")}
              style={{ height: ABOVE_BASELINE_PX }}
            >
              <div
                className={cn("w-full rounded-t-[2px]", ADDED_FILL)}
                style={{
                  height:
                    bar.added > 0
                      ? Math.max(2, Math.round(bar.added * scale))
                      : 0,
                }}
              />
            </div>
            <div
              className={cn("flex items-start")}
              style={{ height: BELOW_BASELINE_PX }}
            >
              <div
                className={cn("w-full rounded-b-[2px]", REMOVED_FILL)}
                style={{
                  height:
                    bar.removed > 0
                      ? Math.min(
                          BELOW_BASELINE_PX,
                          Math.max(2, Math.round(bar.removed * scale))
                        )
                      : 0,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className={cn("text-muted-foreground flex justify-between text-xs")}>
        <span>{formatDay(summary.from)}</span>
        <span>{formatDay(summary.to)}</span>
      </div>
    </div>
  )
}

const Repos = ({ summary }: { summary: Summary }): JSX.Element | null => {
  if (summary.repos.length < 2 || summary.added === 0) return null
  return (
    <div className={cn("space-y-2")}>
      {summary.repos.map((repo) => (
        <div
          key={repo.repo}
          className={cn("flex items-center gap-3 text-xs tabular-nums")}
        >
          <span className={cn("w-14 shrink-0")}>{repo.repo}</span>
          <span
            className={cn("bg-muted h-1.5 flex-1 overflow-hidden rounded-full")}
          >
            <span
              className={cn("block h-full rounded-full", ADDED_FILL)}
              style={{
                width: `${Math.round((repo.added / summary.added) * 100)}%`,
              }}
            />
          </span>
          <span className={cn("min-w-16 shrink-0 text-right")}>
            +{count(repo.added)}
          </span>
        </div>
      ))}
    </div>
  )
}

const LocPulse = ({ snapshot }: { snapshot: LocSnapshot }): JSX.Element => {
  const [range, setRange] = useState<RangeKey>("7d")
  const [includeGenerated, setIncludeGenerated] = useState(false)

  const week = useMemo(
    () => summarize(snapshot, "7d", includeGenerated),
    [snapshot, includeGenerated]
  )
  const selected = useMemo(
    () => summarize(snapshot, range, includeGenerated),
    [snapshot, range, includeGenerated]
  )

  const label = `Lines of code, last 7 days: ${count(week.added)} added, ${count(week.removed)} removed. Show details`

  return (
    <Popover>
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn("gap-2")}
                aria-label={label}
              >
                <Sparkline days={week.buckets} />
                <span className={cn("text-xs font-semibold tabular-nums")}>
                  +{compactCount(week.added)}
                </span>
                <span
                  className={cn(
                    "text-muted-foreground hidden text-xs sm:inline"
                  )}
                >
                  7d
                </span>
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent
            align="start"
            aria-hidden="true"
            className={cn("w-56 space-y-2 p-3")}
          >
            <p className={cn("text-muted-foreground text-xs")}>Last 7 days</p>
            <p className={cn("flex items-baseline gap-2")}>
              <span
                className={cn("text-2xl font-bold tabular-nums", ADDED_TEXT)}
              >
                +{count(week.added)}
              </span>
              <span className={cn("text-muted-foreground text-xs")}>added</span>
            </p>
            <p className={cn("flex justify-between text-xs tabular-nums")}>
              <span className={REMOVED_TEXT}>
                −{count(week.removed)} removed
              </span>
              <span>{signed(week.net)} net</span>
            </p>
            <p className={cn("text-muted-foreground border-t pt-2 text-xs")}>
              Click for the breakdown
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <PopoverContent
        align="start"
        aria-label="Lines of code"
        className={cn("w-[22.5rem] max-w-[calc(100vw-2rem)] space-y-4")}
      >
        <div className={cn("flex items-center justify-between gap-3")}>
          <h2 className={cn("text-sm font-semibold")}>Lines of code</h2>
          <div
            role="group"
            aria-label="Period"
            className={cn("bg-muted flex gap-0.5 rounded-lg p-0.5")}
          >
            {RANGES.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={range === option.key}
                onClick={() => setRange(option.key)}
                className={cn(
                  "focus-visible:ring-ring rounded-md px-2.5 py-1 text-xs font-medium outline-none focus-visible:ring-2 max-sm:min-h-11",
                  range === option.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {option.key}
              </button>
            ))}
          </div>
        </div>

        <div className={cn("flex items-end justify-between gap-3")}>
          <div>
            <p
              className={cn(
                "text-3xl leading-none font-bold tracking-tight tabular-nums",
                ADDED_TEXT
              )}
            >
              +{count(selected.added)}
            </p>
            <p className={cn("text-muted-foreground mt-1 text-xs")}>
              added {RANGE_PHRASE[range]}
            </p>
          </div>
          <div className={cn("text-right tabular-nums")}>
            <p className={cn("text-base font-semibold", REMOVED_TEXT)}>
              −{count(selected.removed)}
            </p>
            <p className={cn("text-muted-foreground text-xs")}>removed</p>
          </div>
        </div>

        <div
          className={cn(
            "text-muted-foreground -mt-2 flex items-center justify-between gap-2 text-xs"
          )}
        >
          {selected.deltaPercent === null ? (
            <span />
          ) : (
            <span className={cn("flex items-center gap-1.5")}>
              {selected.deltaPercent >= 0 ? (
                <TrendingUp aria-hidden="true" className={cn("size-3.5")} />
              ) : (
                <TrendingDown aria-hidden="true" className={cn("size-3.5")} />
              )}
              <span className={cn("sr-only")}>
                {selected.deltaPercent >= 0 ? "Up" : "Down"}{" "}
              </span>
              {Math.abs(selected.deltaPercent)}% vs {PREVIOUS_PHRASE[range]}
            </span>
          )}
          <span className={cn("tabular-nums")}>
            net{" "}
            <span className={cn("text-foreground font-semibold")}>
              {signed(selected.net)}
            </span>
          </span>
        </div>

        <Chart summary={selected} />
        <Repos summary={selected} />

        <div
          className={cn(
            "bg-muted flex items-center justify-between gap-3 rounded-lg px-2.5 py-2"
          )}
        >
          <Label
            htmlFor="loc-ignore-generated"
            className={cn("flex-col items-start gap-0.5 text-sm font-medium")}
          >
            Ignore lockfiles and generated code
            <span className={cn("text-muted-foreground text-xs font-normal")}>
              Lockfiles, generated routes, snapshots
            </span>
          </Label>
          <Switch
            id="loc-ignore-generated"
            checked={!includeGenerated}
            onCheckedChange={(ignore) => setIncludeGenerated(!ignore)}
          />
        </div>

        <div
          className={cn(
            "text-muted-foreground flex items-center justify-between gap-2 text-xs"
          )}
        >
          <span>As of {formatDay(snapshot.through)}</span>
          <span className={cn("flex items-center gap-3")}>
            {snapshot.repos.map((repo) => (
              <a
                key={repo}
                href={`${GITHUB_URL}/${encodeURIComponent(repo)}/graphs/code-frequency`}
                target="_blank"
                rel="noreferrer"
                aria-label={`${repo} on GitHub (opens in a new tab)`}
                className={cn(
                  "hover:text-foreground inline-flex items-center gap-1 underline underline-offset-2 max-sm:min-h-11"
                )}
              >
                {repo}
                <ArrowUpRight aria-hidden="true" className={cn("size-3")} />
              </a>
            ))}
          </span>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Renders nothing when the build carries no snapshot, so a checkout that never
 * ran `pnpm loc:snapshot` has no empty box in its header. The snapshot is a
 * prop, defaulting to this build's, so a test can hand it one.
 */
export const LocIndicator = ({
  snapshot = locSnapshot,
}: {
  snapshot?: LocSnapshot | null
}): JSX.Element | null =>
  snapshot === null ? null : <LocPulse snapshot={snapshot} />
