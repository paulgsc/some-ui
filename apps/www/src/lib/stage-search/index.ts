/**
 * The search a recording stage's route takes (`/call`, `/essay`, `/report`):
 * `week` names what it plays, `scene` the scene, and `record` leaves out
 * everything but the frame. An empty or non-text value is left out.
 */
export type StageSearch = { week?: string; scene?: string; record?: boolean }

export function stageSearch(search: Record<string, unknown>): StageSearch {
  const record = search.record === true || search.record === "true"
  return {
    ...(typeof search.week === "string" && search.week !== ""
      ? { week: search.week }
      : {}),
    ...(typeof search.scene === "string" && search.scene !== ""
      ? { scene: search.scene }
      : {}),
    ...(record ? { record } : {}),
  }
}
