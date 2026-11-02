/**
 * When a take home holds leaves the phone (HF11, #2401; LG1 in www
 * `lib/home-link/voice-copy.ts`): the owner's one choice, kept on the phone
 * (`lib/studio/let-go-store.ts`) and changed whenever they like.
 *
 * - `home`: a take leaves once home holds it.
 * - `drive`: a take home holds stays until Drive has it too: the owner's tap
 *   on that take ("Drive has it"), or home's word that Claude found the
 *   take's recording in Drive (`letGoOnDrive` in `./home`).
 *
 * Until the owner chooses, no take leaves. A take home does not hold never
 * leaves, whatever the choice (`letGoRefusal` in `./model`).
 */
import type { Project, ProjectEvent, ProjectTake } from "./model"
import { homeHolds, step } from "./model"

/** Every choice, in the order Studio offers them. */
export const LET_GO_CHOICES = ["home", "drive"] as const

/** The owner's choice of when a take home holds leaves the phone. */
export type LetGo = (typeof LET_GO_CHOICES)[number]

/** The choice as kept: null until the owner makes it. */
export type LetGoChoice = LetGo | null

/**
 * Whether a take home holds may leave the phone on home's word alone, by the
 * owner's choice: only under `home`. Under `drive` it leaves on the owner's
 * tap on that take ("Drive has it") or on home's word that Drive has it
 * (`letGoOnDrive`), and never before they choose.
 */
export function mayLeave(choice: LetGoChoice): boolean {
  return choice === "home"
}

/** The takes home holds that are still on the phone: they wait on the choice. */
export function waitingTakes(project: Project): ReadonlyArray<ProjectTake> {
  return project.takes.filter((take) => take.onPhone && homeHolds(take))
}

/** How many takes home holds are still on the phone, over `projects`. */
export function waitingCount(projects: ReadonlyArray<Project>): number {
  return projects.reduce(
    (sum, project) => sum + waitingTakes(project).length,
    0
  )
}

/**
 * `project` with take `id` marked kept by Drive and let go, on the owner's
 * "Drive has it" or home's word that Drive has it: null when it is not a take
 * home holds still on the phone, since Drive's word alone keeps a take here,
 * or when the project refuses either.
 */
export function driveHasItIn(project: Project, id: string): Project | null {
  const take = project.takes.find((each) => each.id === id)
  if (take === undefined || !take.onPhone || !homeHolds(take)) return null
  const events: ReadonlyArray<ProjectEvent> = [
    ...(take.keptBy.includes("drive")
      ? []
      : [{ type: "keptBy", take: id, keeper: "drive" } as const]),
    { type: "letGo", take: id },
  ]
  let at = project
  for (const event of events) {
    const next = step({ project: at, taking: null, closing: null }, event)
    if (next.refused !== null) return null
    at = next.state.project
  }
  return at
}
