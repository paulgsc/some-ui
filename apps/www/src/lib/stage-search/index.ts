/**
 * The search a recording stage's route takes (`/call`, `/essay`, `/report`):
 * `week` names what it plays, `part` which video of a series (the call's,
 * #2918), `scene` the scene, and `record` leaves out everything but the
 * frame. An empty or non-text value is left out, and a part that is no
 * whole number from 1.
 */
export type StageSearch = {
  week?: string
  part?: number
  scene?: string
  record?: boolean
}

/** A part as the search carries it: a number, or its digits. */
const partOf = (value: unknown): number | undefined => {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^[1-9][0-9]*$/.test(value)
        ? Number(value)
        : Number.NaN
  return Number.isInteger(n) && n >= 1 ? n : undefined
}

export function stageSearch(search: Record<string, unknown>): StageSearch {
  const record = search.record === true || search.record === "true"
  const part = partOf(search.part)
  return {
    ...(part === undefined ? {} : { part }),
    ...(typeof search.week === "string" && search.week !== ""
      ? { week: search.week }
      : {}),
    ...(typeof search.scene === "string" && search.scene !== ""
      ? { scene: search.scene }
      : {}),
    ...(record ? { record } : {}),
  }
}
