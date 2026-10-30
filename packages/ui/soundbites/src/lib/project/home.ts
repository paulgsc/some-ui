/**
 * Studio's takes on their way home (STUDIO ST12). Every take whose audio is
 * still on the phone and that home doesn't hold yet goes as a voice note of
 * kind `studio`, its `ref` the take, `<project>:<shot>:<take>` (paulgsc/server
 * `voice_repo`'s `Of::Studio`). Once home says it holds one, the take is
 * marked kept by home and its audio leaves the phone, in one write: the
 * store lets audio go only once a keeper holds a copy (`letGoRefusal`).
 * Sending is the app's home link's (www `lib/home-link/voice-copy`).
 */
import type { Project } from "./model"
import { step } from "./model"
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
        .filter((take) => take.onPhone && !take.keptBy.includes("home"))
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
 * `project` with each take home holds (`held`, by id) marked kept by home
 * and off the phone; null when it changes nothing.
 */
export function heldByHome(
  project: Project,
  held: ReadonlySet<string>
): Project | null {
  let at = project
  for (const take of project.takes) {
    if (!held.has(take.id) || !take.onPhone) continue
    for (const event of [
      { type: "keptBy", take: take.id, keeper: "home" },
      { type: "letGo", take: take.id },
    ] as const) {
      const next = step({ project: at, taking: null, closing: null }, event)
      if (next.refused === null) at = next.state.project
    }
  }
  return at === project ? null : at
}

/**
 * Lets the audio of every take home holds leave the phone, project by
 * project, each in its own write; how many projects changed.
 */
export async function letGoHeldTakes(
  store: ProjectStore,
  held: ReadonlySet<string>
): Promise<number> {
  if (held.size === 0) return 0
  const projects = await store.list()
  let changed = 0
  for (const project of projects) {
    if (heldByHome(project, held) === null) continue
    const written = await store.update(project.id, (now) =>
      now === null ? null : heldByHome(now, held)
    )
    if (written.changed) changed++
  }
  return changed
}
