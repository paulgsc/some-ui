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
import type { Project, ProjectTake } from "./model"
import { homeHolds } from "./model"

/** Every choice, in the order Studio offers them. */
export const LET_GO_CHOICES = ["home", "drive"] as const

/** The owner's choice of when a take home holds leaves the phone. */
export type LetGo = (typeof LET_GO_CHOICES)[number]

/** The choice as kept: null until the owner makes it. */
export type LetGoChoice = LetGo | null

/**
 * Whether a take home holds may leave the phone on home's word alone, by the
 * owner's choice: only under `home`. Under `drive` it leaves on the owner's
 * tap on that take ("Drive has it"), and never before they choose.
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
