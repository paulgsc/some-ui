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
 * The per-build rule beside the audiences (ADM1, #2389;
 * packages/some-vite-config/AUDIENCES.md, "What each build's navigation
 * offers"). The build that carries the home network's audience is the
 * owner's desktop, and it is administration-first: it offers administration
 * and presentation, and study and making leave its navigation. Every other
 * build offers what viewers try (the public site) and no administration.
 *
 * Navigation only: a route that is not offered still loads by its address,
 * and its workspace is still bundled. Which workspaces a build carries is
 * the audiences' question, never this one.
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
