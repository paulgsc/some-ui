/**
 * A new idea's waiting takes that nothing on this phone names (ST26, #2483):
 * their idea is neither the draft kept nor any idea kept (a draft set aside
 * as unreadable, an idea the kept list couldn't read). A kept idea's own
 * unnamed take is the bundle's to drop (`droppable`), so it isn't counted;
 * while the draft or the ideas can't be read, none is named.
 */
import type { PatternTake } from "@some-ui/voice-capture"

import type { IdeaDraft } from "./draft"
import { ideaAnswered } from "./draft"
import type { Idea } from "./model"

export function unnamedTakes(
  takes: ReadonlyArray<PatternTake>,
  draft: IdeaDraft | null | undefined,
  ideas: ReadonlyArray<Idea> | null
): ReadonlyArray<PatternTake> {
  if (draft === undefined || ideas === null) return []
  const owned = new Set([
    ...(draft === null ? [] : [draft.id]),
    ...ideas.map((idea) => idea.id),
  ])
  return takes.filter((take) => {
    if (take.waits !== true) return false
    const idea = ideaAnswered(take.answers)
    return idea !== null && !owned.has(idea)
  })
}
