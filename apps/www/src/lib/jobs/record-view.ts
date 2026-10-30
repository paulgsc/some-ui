/**
 * Jobs › Record's applications as a list I can sort, filter and pivot. All of
 * it is a view: nothing here records anything, and every application stays in
 * the record whatever the list shows.
 *
 * Each application stands as one of `STANDS`, read from its course
 * (`courseOf`). The filter's chips, the chart's colours and the pivot's columns
 * all go by that one word, in that order.
 */
import { assertNever, weekOf } from "@some-ui/core-utils"

import type { Application, Course } from "./model"

/** How an application stands, in the order the chart stacks them. */
export const STANDS = [
  "waiting",
  "heard",
  "offer",
  "rejected",
  "silent",
  "applying",
  "unsent",
] as const

export type Stand = (typeof STANDS)[number]

/** An application on the list, with where it stands. */
export type Row = {
  application: Application
  course: Course
  stand: Stand
  /** The day it was sent, or picked when it never was. */
  on: string
}

export function standOf(course: Course): Stand {
  switch (course.kind) {
    case "applying": {
      return "applying"
    }
    case "unsent": {
      return "unsent"
    }
    case "waiting": {
      return course.reached === null || course.reached === "viewed"
        ? "waiting"
        : "heard"
    }
    case "ended": {
      switch (course.by) {
        case "offer": {
          return "offer"
        }
        case "rejected": {
          return "rejected"
        }
        case "no-reply-30d": {
          return "silent"
        }
        default: {
          return assertNever(course.by)
        }
      }
    }
    default: {
      return assertNever(course)
    }
  }
}

export function rowOf(application: Application, course: Course): Row {
  const on =
    course.kind === "waiting" || course.kind === "ended"
      ? course.since
      : application.day
  return { application, course, stand: standOf(course), on }
}

export const SORTS = ["newest", "oldest", "waiting", "company"] as const

export type Sort = (typeof SORTS)[number]

const open = (r: Row): boolean => r.stand === "waiting" || r.stand === "heard"

const newestFirst = (a: Row, b: Row): number =>
  b.on.localeCompare(a.on) || b.application.day.localeCompare(a.application.day)

/**
 * The rows in `sort`'s order: newest or oldest sent; the ones still open,
 * longest waiting first, then the rest newest first; or by company, A to Z.
 */
export function sortRows(
  rows: ReadonlyArray<Row>,
  sort: Sort
): ReadonlyArray<Row> {
  const sorted = [...rows]
  switch (sort) {
    case "newest": {
      return sorted.sort(newestFirst)
    }
    case "oldest": {
      return sorted.sort((a, b) => newestFirst(b, a))
    }
    case "waiting": {
      return sorted.sort(
        (a, b) =>
          Number(open(b)) - Number(open(a)) ||
          (open(a) ? a.on.localeCompare(b.on) : newestFirst(a, b))
      )
    }
    case "company": {
      return sorted.sort(
        (a, b) =>
          a.application.pick.posting.company.localeCompare(
            b.application.pick.posting.company,
            "en",
            { sensitivity: "base" }
          ) || newestFirst(a, b)
      )
    }
    default: {
      return assertNever(sort)
    }
  }
}

/** The rows whose company or title holds `text`, any case; all when blank. */
export function matching(
  rows: ReadonlyArray<Row>,
  text: string
): ReadonlyArray<Row> {
  const needle = text.trim().toLocaleLowerCase()
  if (needle === "") return rows
  return rows.filter(({ application: { pick } }) =>
    `${pick.posting.company} ${pick.posting.title}`
      .toLocaleLowerCase()
      .includes(needle)
  )
}

export function countStands(
  rows: ReadonlyArray<Row>
): Readonly<Record<Stand, number>> {
  const counts: Record<Stand, number> = {
    waiting: 0,
    heard: 0,
    offer: 0,
    rejected: 0,
    silent: 0,
    applying: 0,
    unsent: 0,
  }
  for (const r of rows) counts[r.stand] += 1
  return counts
}

export const PIVOTS = ["week", "month", "company"] as const

export type Pivot = (typeof PIVOTS)[number]

/** The most groups the chart shows; the rest fold into one. */
export const PIVOT_ROWS = 8

/** One group of the pivot: its key, and how its rows stand. */
export type PivotGroup = {
  /** The Monday of a week, a `YYYY-MM` month, or a company; null for the fold. */
  key: string | null
  counts: Readonly<Record<Stand, number>>
  total: number
}

function keyOf(row: Row, pivot: Pivot): string {
  switch (pivot) {
    case "week": {
      return weekOf(row.on)
    }
    case "month": {
      return row.on.slice(0, 7)
    }
    case "company": {
      return row.application.pick.posting.company
    }
    default: {
      return assertNever(pivot)
    }
  }
}

/**
 * The rows grouped by `pivot` and counted by how they stand: weeks and months
 * newest first, companies most applied to first (then A to Z). Past
 * `PIVOT_ROWS` groups, the oldest or smallest fold into one, keyed null.
 */
export function pivotRows(
  rows: ReadonlyArray<Row>,
  pivot: Pivot
): ReadonlyArray<PivotGroup> {
  const byKey = new Map<string, Array<Row>>()
  for (const r of rows) {
    const key = keyOf(r, pivot)
    byKey.set(key, [...(byKey.get(key) ?? []), r])
  }
  const groups = [...byKey].map(([key, members]) => ({
    key,
    members,
  }))
  groups.sort((a, b) =>
    pivot === "company"
      ? b.members.length - a.members.length ||
        a.key.localeCompare(b.key, "en", { sensitivity: "base" })
      : b.key.localeCompare(a.key)
  )
  const shown =
    groups.length > PIVOT_ROWS ? groups.slice(0, PIVOT_ROWS - 1) : groups
  const folded = groups.slice(shown.length).flatMap((g) => g.members)
  const group = (
    key: string | null,
    members: ReadonlyArray<Row>
  ): PivotGroup => ({
    key,
    counts: countStands(members),
    total: members.length,
  })
  return [
    ...shown.map((g) => group(g.key, g.members)),
    ...(folded.length > 0 ? [group(null, folded)] : []),
  ]
}
