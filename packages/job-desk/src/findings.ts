import type { Digest } from "./digest"
import { fingerprint } from "./fingerprint"
import {
  EXCLUDED_TITLE,
  MAX_POSTING_AGE_DAYS,
  PICKS_PER_DAY,
  TRACKS,
} from "./policy"

/** One way a well-formed digest breaks the routine's rules, by path. */
export type Finding = { path: string; message: string }

const DAY_MS = 24 * 60 * 60 * 1000

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS)
}

/**
 * What the schema cannot say about a digest: the policy's limits, one
 * fingerprint per posting, and no fit that claims what the same pick says
 * not to claim. An empty list is what a run uploads.
 */
export function digestFindings(digest: Digest): ReadonlyArray<Finding> {
  const found: Array<Finding> = []
  const ids = new Set<string>()
  const prints = new Map<string, string>()

  for (const track of TRACKS) {
    const count = digest.picks.filter((p) => p.track === track).length
    if (count > PICKS_PER_DAY[track]) {
      found.push({
        path: "picks",
        message: `${count} ${track} picks; the most is ${PICKS_PER_DAY[track]}`,
      })
    }
  }

  digest.picks.forEach((pick, i) => {
    const at = `picks.${i}`
    if (ids.has(pick.id)) {
      found.push({ path: `${at}.id`, message: `${pick.id} is used twice` })
    }
    ids.add(pick.id)

    const expected = fingerprint(pick.posting)
    if (pick.fingerprint !== expected) {
      found.push({
        path: `${at}.fingerprint`,
        message: `should be "${expected}"`,
      })
    }
    const twin = prints.get(pick.fingerprint)
    if (twin) {
      found.push({
        path: `${at}.fingerprint`,
        message: `same posting as ${twin}`,
      })
    }
    prints.set(pick.fingerprint, at)

    if ((pick.track === "adjacent") !== (pick.family !== null)) {
      found.push({
        path: `${at}.family`,
        message: "an adjacent pick names its family; a software pick has none",
      })
    }
    if (EXCLUDED_TITLE.test(pick.posting.title)) {
      found.push({
        path: `${at}.posting.title`,
        message: "customer-facing or phone roles are never picked",
      })
    }
    const posted = pick.posting.postedOn
    if (posted && daysBetween(posted, digest.day) > MAX_POSTING_AGE_DAYS) {
      found.push({
        path: `${at}.posting.postedOn`,
        message: `older than ${MAX_POSTING_AGE_DAYS} days on ${digest.day}`,
      })
    }
    pick.fits.forEach((fit, j) => {
      const claim = `${fit.title} ${fit.detail}`.toLowerCase()
      const term = pick.dontClaim.find((t) => claim.includes(t.toLowerCase()))
      if (term) {
        found.push({
          path: `${at}.fits.${j}`,
          message: `claims "${term}", which dontClaim rules out`,
        })
      }
    })
  })

  digest.setAside.forEach((aside, i) => {
    const twin = prints.get(aside.fingerprint)
    if (twin) {
      found.push({
        path: `setAside.${i}.fingerprint`,
        message: `also picked as ${twin}`,
      })
    }
  })

  digest.scouts.forEach((scout, i) => {
    if (scout.pickId !== null && !ids.has(scout.pickId)) {
      found.push({
        path: `scouts.${i}.pickId`,
        message: `no pick ${scout.pickId}`,
      })
    }
  })

  return found
}
