import { hasAudience } from "@/lib/build-profile"

/**
 * What a place the web's navigation offers is for: each destination
 * (`lib/site-map`) and each wing's web side (`lib/wings`) names one.
 *
 * - **administration**: how the system is doing: the health of the client,
 *   home and its passes, the accounting of records and storage, the
 *   promises and their evidence.
 * - **presentation**: what the toolkit shows of itself: the mission, the
 *   résumé, the published extensions, a process read on sample data.
 * - **study**: practice and its sessions.
 * - **making**: what gets made to be published: Studio's stage, lessons,
 *   the résumé build.
 */
export type Purpose = "administration" | "presentation" | "study" | "making"

/**
 * The purposes each build's navigation offers (ADM1, #2389):
 * packages/some-vite-config/AUDIENCES.md, "What each build's navigation
 * offers", says why, and that it is navigation only.
 */
const OFFERED: Readonly<
  Record<"home-network" | "elsewhere", ReadonlySet<Purpose>>
> = {
  "home-network": new Set(["administration", "presentation"]),
  elsewhere: new Set(["presentation", "study", "making"]),
}

/** Whether this build's navigation offers a place that is for `purpose`. */
export function offeredHere(purpose: Purpose): boolean {
  return OFFERED[hasAudience("lan") ? "home-network" : "elsewhere"].has(purpose)
}
