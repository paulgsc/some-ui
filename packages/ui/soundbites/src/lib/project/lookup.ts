/**
 * Reading a project without changing it: whether two values say the same,
 * and a scene by id. A leaf that `./model` and `./origin` both import, so
 * neither needs the other at run time.
 */
import { canonicalJson } from "@some-ui/core-utils"
import type { Shot } from "@some-ui/video-render"

import type { CutListShape, Project } from "./model"

/** Whether `a` and `b` say the same, key order aside. */
export function sameJson(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b)
}

/** Scene `shot` of `cutList`, or null. */
export function shotIn(cutList: CutListShape, shot: string): Shot | null {
  return cutList.shots.find((each) => each.id === shot) ?? null
}

/** Scene `shot` of `project`'s latest revision, or null. */
export function latestShot(project: Project, shot: string): Shot | null {
  const last = project.revisions.at(-1)
  return last === undefined ? null : shotIn(last.cutList, shot)
}
