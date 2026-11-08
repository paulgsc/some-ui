/**
 * A new idea's takes that nothing on this phone names (ST26, #2483): each
 * waits to be sent, but its idea is neither the draft kept nor any idea kept
 * (a draft set aside as unreadable, an idea the kept list couldn't read, a
 * Delete all cut short). The bundle never guesses at them, so only the
 * owner's word lets one go: kept, to go home as every take does, or deleted
 * for good, since it never left the phone.
 *
 * A take of a kept idea that it doesn't name is the bundle's own to drop
 * (`droppable`), so it is not counted here. When the draft or the ideas
 * can't be read, nothing is named: what can't be read may own them.
 */
import type { PatternTake } from "@some-ui/voice-capture"

import type { IdeaDraft } from "./draft"
import type { Idea } from "./model"

/** The idea a take answers, from its `idea:<idea>:<question>`. */
function ideaOf(answers: string): string | null {
  const parts = answers.split(":")
  return parts.length === 3 && parts[0] === "idea" && parts[1] !== ""
    ? (parts[1] ?? null)
    : null
}

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
    const idea = ideaOf(take.answers)
    return idea !== null && !owned.has(idea)
  })
}
