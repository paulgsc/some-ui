/**
 * Jobs › Record's applications: each card wearing its course (`courseOf`),
 * and the list found, filtered, sorted and pivoted (`lib/jobs/record-view`).
 *
 * The filter's chips are the chart's legend, so each colour is named beside
 * a count. The colours are the dataviz reference's categorical slots, in an
 * order checked for colour-blind separation on Mochi's card and on a dark
 * surface; three sit under 3:1 on the light card, so every segment wide
 * enough carries its count and the chart has a table view.
 */
import type { JSX } from "react"
import { useState } from "react"
import { cn } from "@some-ui/core-utils"
import { Badge, Button, Input } from "@some-ui/shared"
import { Link } from "@tanstack/react-router"

import { hasAudience } from "@/lib/build-profile"
import { phoneJobs } from "@/lib/jobs"
import type {
  Pivot,
  PivotGroup,
  Row,
  Sort,
  Stand,
} from "@/lib/jobs/record-view"
import {
  countStands,
  matching,
  pivotRows,
  PIVOTS,
  sortRows,
  SORTS,
  STANDS,
} from "@/lib/jobs/record-view"
import {
  allStands,
  courseBadge,
  courseSays,
  findApplication,
  heardSince,
  noneMatch,
  outcomeLabels,
  pivotHeading,
  pivotKey,
  pivotLabels,
  pivotSays,
  showAs,
  sortHeading,
  sortLabels,
  standFilter,
  standLabels,
  whatHappenedSince,
} from "@/lib/jobs/words"
import { sectionHeading } from "@/components/job-reading"

import { Chips } from "./parts"

/** Each stand's colour: light on the card, stepped for a dark one. */
const SWATCH: Readonly<Record<Stand, string>> = {
  waiting: "bg-[#2a78d6] dark:bg-[#3987e5]",
  heard: "bg-[#eb6834] dark:bg-[#d95926]",
  offer: "bg-[#1baf7a] dark:bg-[#199e70]",
  rejected: "bg-[#eda100] dark:bg-[#c98500]",
  silent: "bg-[#e87ba4] dark:bg-[#d55181]",
  applying: "bg-[#6250d6] dark:bg-[#9085e9]",
  unsent: "bg-muted-foreground/45 dark:bg-muted-foreground/75",
}

/** A segment narrower than this share of the widest bar carries no count. */
const LABEL_SHARE = 0.12

export const Applications = ({
  rows,
}: {
  rows: ReadonlyArray<Row>
}): JSX.Element => {
  const [find, setFind] = useState("")
  const [stand, setStand] = useState<Stand | null>(null)
  const [sort, setSort] = useState<Sort>("newest")
  const found = matching(rows, find)
  const counts = countStands(found)
  const shown = sortRows(
    stand === null ? found : found.filter((r) => r.stand === stand),
    sort
  )
  return (
    <section className="flex flex-col gap-3">
      <h2 className={sectionHeading}>Applications</h2>
      <Input
        type="search"
        value={find}
        placeholder={findApplication}
        aria-label={findApplication}
        onChange={(e) => setFind(e.target.value)}
      />
      <Chips
        label={standFilter}
        options={[
          ["all", `${allStands} ${found.length}`],
          ...STANDS.map(
            (s) =>
              [
                s,
                <>
                  <span
                    aria-hidden
                    className={cn("size-2.5 rounded-full", SWATCH[s])}
                  />
                  {standLabels[s]} {counts[s]}
                </>,
              ] as const
          ),
        ]}
        pressed={(s) => s === (stand ?? "all")}
        disabled={(s) => s !== "all" && s !== stand && counts[s] === 0}
        onToggle={(s) => setStand(s === "all" || s === stand ? null : s)}
      />
      <PivotChart rows={found} selected={stand} />
      <Chips
        label={sortHeading}
        options={SORTS.map((s) => [s, sortLabels[s]] as const)}
        pressed={(s) => s === sort}
        onToggle={setSort}
      />
      {shown.length === 0 ? (
        <p className="text-muted-foreground text-sm">{noneMatch}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((r) => (
            <ApplicationCard
              key={`${r.application.day}/${r.application.pick.id}`}
              row={r}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

/** The rows pivoted by week, month or company, as stacked bars or a table. */
const PivotChart = ({
  rows,
  selected,
}: {
  rows: ReadonlyArray<Row>
  selected: Stand | null
}): JSX.Element => {
  const [pivot, setPivot] = useState<Pivot>("week")
  const [table, setTable] = useState(false)
  const [tapped, setTapped] = useState<string | null>(null)
  const groups = pivotRows(rows, pivot)
  const widest = Math.max(1, ...groups.map((g) => g.total))
  const named = groups.map((g) => ({ ...g, name: pivotKey(pivot, g.key) }))
  const shownGroup = named.find((g) => g.name === tapped)
  return (
    <div className="bg-card flex flex-col gap-3 rounded-xl border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{pivotHeading}</h3>
        <Button
          type="button"
          size="sm"
          variant="link"
          className="text-muted-foreground px-0"
          onClick={() => setTable((t) => !t)}
        >
          {showAs(table)}
        </Button>
      </div>
      <Chips
        label={pivotHeading}
        options={PIVOTS.map((p) => [p, pivotLabels[p]] as const)}
        pressed={(p) => p === pivot}
        onToggle={(p) => {
          setPivot(p)
          setTapped(null)
        }}
      />
      {table ? (
        <PivotTable pivot={pivot} groups={groups} />
      ) : (
        <ul className="flex flex-col gap-1">
          {named.map((g) => {
            const says = pivotSays(g.name, g.counts)
            return (
              <li key={g.name}>
                <button
                  type="button"
                  aria-label={says}
                  aria-pressed={tapped === g.name}
                  onClick={() => setTapped(tapped === g.name ? null : g.name)}
                  className="hover:bg-muted/60 aria-pressed:bg-muted/60 flex w-full flex-col gap-1 rounded-md p-1 text-left"
                >
                  <span className="flex w-full items-baseline justify-between gap-2 text-xs">
                    <span className="truncate">{g.name}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {g.total}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className="flex h-6 gap-0.5"
                    style={{ width: `${(g.total / widest) * 100}%` }}
                  >
                    {STANDS.filter((s) => g.counts[s] > 0).map((s) => (
                      <span
                        key={s}
                        className={cn(
                          "flex min-w-1 items-center justify-center rounded-[4px] text-[11px] font-semibold text-black tabular-nums",
                          SWATCH[s],
                          selected !== null && selected !== s && "opacity-30"
                        )}
                        style={{ flexGrow: g.counts[s], flexBasis: 0 }}
                      >
                        {g.counts[s] / widest >= LABEL_SHARE
                          ? g.counts[s]
                          : null}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-muted-foreground min-h-4 text-xs" aria-live="polite">
        {shownGroup && !table
          ? pivotSays(shownGroup.name, shownGroup.counts)
          : null}
      </p>
    </div>
  )
}

const PivotTable = ({
  pivot,
  groups,
}: {
  pivot: Pivot
  groups: ReadonlyArray<PivotGroup>
}): JSX.Element => (
  <div className="overflow-x-auto">
    <table className="w-full text-xs tabular-nums">
      <thead>
        <tr className="text-muted-foreground">
          <th scope="col" className="py-1 pr-2 text-left font-normal">
            {pivotLabels[pivot]}
          </th>
          {STANDS.map((s) => (
            <th
              key={s}
              scope="col"
              className="px-1 py-1 text-right font-normal"
            >
              {standLabels[s]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => {
          const name = pivotKey(pivot, g.key)
          return (
            <tr key={name} className="border-t">
              <th scope="row" className="py-1 pr-2 text-left font-normal">
                {name}
              </th>
              {STANDS.map((s) => (
                <td key={s} className="px-1 py-1 text-right">
                  {g.counts[s] || "–"}
                </td>
              ))}
            </tr>
          )
        })}
      </tbody>
    </table>
  </div>
)

const ApplicationCard = ({
  row: { application: a, course },
}: {
  row: Row
}): JSX.Element => {
  const jobs = phoneJobs()
  const [reopened, setReopened] = useState(false)
  const settled = course.kind === "ended" || course.kind === "unsent"
  const offered =
    course.kind === "waiting" || (course.kind === "ended" && reopened)
      ? course.next
      : []
  const says = courseSays(course)
  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-3",
        course.kind === "waiting" && "border-primary/50 bg-card",
        settled && "bg-muted/60 border-dashed"
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        {hasAudience("apk") ? (
          <Link
            to="/jobs/pick/$day/$pickId"
            params={{ day: a.day, pickId: a.pick.id }}
            className={cn(
              "text-sm font-semibold underline-offset-2 hover:underline",
              settled && "text-muted-foreground"
            )}
          >
            {a.pick.posting.title}
          </Link>
        ) : (
          <span
            className={cn(
              "text-sm font-semibold",
              settled && "text-muted-foreground"
            )}
          >
            {a.pick.posting.title}
          </span>
        )}
        <Badge
          variant={
            course.kind === "waiting" ||
            (course.kind === "ended" && course.by === "offer")
              ? "default"
              : settled
                ? "outline"
                : "secondary"
          }
        >
          {courseBadge(course)}
        </Badge>
      </div>
      <span className="text-muted-foreground text-xs">
        {a.pick.posting.company} · {a.day}
      </span>
      {a.outcomes.length > 0 && (
        <span className={cn("text-xs", settled && "text-muted-foreground")}>
          {a.outcomes
            .map((o) => `${outcomeLabels[o.event]} ${o.on}`)
            .join(" · ")}
        </span>
      )}
      {says && <p className="text-muted-foreground text-xs">{says}</p>}
      {offered.length > 0 && (
        <div
          role="group"
          aria-label={whatHappenedSince}
          className="flex flex-wrap gap-1.5"
        >
          {offered.map((event) => (
            <Button
              key={event}
              type="button"
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => {
                if (jobs.addOutcome(a.pick.fingerprint, event))
                  setReopened(false)
              }}
            >
              {outcomeLabels[event]}
            </Button>
          ))}
        </div>
      )}
      {course.kind === "ended" && course.next.length > 0 && (
        <Button
          type="button"
          size="sm"
          variant="link"
          className="text-muted-foreground self-start px-0"
          aria-expanded={reopened}
          onClick={() => setReopened((open) => !open)}
        >
          {heardSince(reopened)}
        </Button>
      )}
    </li>
  )
}
