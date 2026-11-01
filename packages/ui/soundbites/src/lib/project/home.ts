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
import { driveHasItIn, mayLeave, waitingTakes } from "./let-go"
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
  return writeEach(store, (project) => heldByHome(project, held, leaves))
}

/**
 * Writes what `change` makes of each project in `store` it changes, each in
 * its own write, `change` run again on the project as that write reads it;
 * how many projects changed.
 */
async function writeEach(
  store: ProjectStore,
  change: (project: Project) => Project | null
): Promise<number> {
  const projects = await store.list()
  let changed = 0
  for (const project of projects) {
    if (change(project) === null) continue
    const written = await store.update(project.id, (now) =>
      now === null ? null : change(now)
    )
    if (written.changed) changed++
  }
  return changed
}

/** The ids of the takes home holds still on the phone, over `projects`: what home is asked about Drive for. */
export function waitingIds(
  projects: ReadonlyArray<Project>
): ReadonlyArray<string> {
  return projects.flatMap((project) =>
    waitingTakes(project).map((take) => take.id)
  )
}

/**
 * `project` with each take home holds and home says Drive has too
 * (`onDrive`, HF11) marked kept by Drive and let go (`driveHasItIn`); null
 * when it changes nothing.
 */
function onDriveByHome(
  project: Project,
  onDrive: ReadonlySet<string>
): Project | null {
  let at = project
  for (const take of waitingTakes(project)) {
    if (onDrive.has(take.id)) at = driveHasItIn(at, take.id) ?? at
  }
  return at === project ? null : at
}

/**
 * Lets the audio of each take home holds and says Drive has too leave the
 * phone, once the owner has chosen (none before they choose), project by
 * project, each in its own write; how many projects changed.
 */
export async function letGoOnDrive(
  store: ProjectStore,
  onDrive: ReadonlySet<string>,
  choice: LetGoChoice
): Promise<number> {
  if (onDrive.size === 0 || choice === null) return 0
  return writeEach(store, (project) => onDriveByHome(project, onDrive))
}
