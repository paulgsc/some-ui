/**
 * Studio's takes on their way home (STUDIO ST12). Every take whose audio is
 * still on the phone and that home doesn't hold yet goes as a voice note of
 * kind `studio`, its `ref` the take, `<project>:<shot>:<take>` (paulgsc/server
 * `voice_repo`'s `Of::Studio`). Once home says it holds one, the take is
 * marked kept by home, and its audio leaves the phone in the same write only
 * if the owner's choice allows it (`./let-go`, LG1); otherwise it waits on
 * the phone, marked, for that choice.
 * Sending is the app's home link's (www `lib/home-link/voice-copy`).
 */
import type { LetGoChoice } from "./let-go"
import { mayLeave } from "./let-go"
import type { Project, ProjectEvent } from "./model"
import { homeHolds, step } from "./model"
import type { ProjectStore } from "./store"

/** A take as home is told it. */
export type StudioNote = {
  /** The take's id, which names the note. */
  readonly id: string
  /** `<project>:<shot>:<take>`. */
  readonly ref: string
  /** When it was recorded, ISO 8601. */
  readonly at: string
  readonly contentType: string
  readonly project: string
}

/** Every take still on the phone that home doesn't hold yet, oldest first. */
export function notesForHome(
  projects: ReadonlyArray<Project>
): ReadonlyArray<StudioNote> {
  return projects
    .flatMap((project) =>
      project.takes
        .filter((take) => take.onPhone && !homeHolds(take))
        .map((take) => ({
          id: take.id,
          ref: `${project.id}:${take.shot}:${take.id}`,
          at: take.recordedAt,
          contentType: take.mimeType,
          project: project.id,
        }))
    )
    .sort((a, b) => a.at.localeCompare(b.at))
}

/**
 * `project` with each take home holds (`held`, by id) marked kept by home,
 * and off the phone where `leaves` allows it; null when it changes nothing.
 */
export function heldByHome(
  project: Project,
  held: ReadonlySet<string>,
  leaves: (id: string) => boolean
): Project | null {
  let at = project
  for (const take of project.takes) {
    if (!held.has(take.id) || !take.onPhone) continue
    const events: ReadonlyArray<ProjectEvent> = [
      { type: "keptBy", take: take.id, keeper: "home" },
      ...(leaves(take.id) ? [{ type: "letGo", take: take.id } as const] : []),
    ]
    for (const event of events) {
      const next = step({ project: at, taking: null, closing: null }, event)
      if (next.refused === null) at = next.state.project
    }
  }
  return at === project ? null : at
}

/**
 * Marks every take home holds as kept there and, where the owner's choice
 * allows it (`mayLeave`: only under "let takes go once home has them"), lets
 * its audio leave the phone, project by project, each in its own write; how
 * many projects changed.
 */
export async function letGoHeldTakes(
  store: ProjectStore,
  held: ReadonlySet<string>,
  choice: LetGoChoice
): Promise<number> {
  if (held.size === 0) return 0
  const leaves = (): boolean => mayLeave(choice)
  const projects = await store.list()
  let changed = 0
  for (const project of projects) {
    if (heldByHome(project, held, leaves) === null) continue
    const written = await store.update(project.id, (now) =>
      now === null ? null : heldByHome(now, held, leaves)
    )
    if (written.changed) changed++
  }
  return changed
}
