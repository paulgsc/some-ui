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

/**
 * A posting's company and title: the same role searched from another place
 * is one posting (ROUTINE.md, "Search").
 */
function roleOf(print: string): string {
  return print.slice(0, print.lastIndexOf("|"))
}

/** Whether `text` names `term` as a whole word or phrase, ignoring case. */
function mentions(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
    "iu"
  ).test(text)
}

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
  const roles = new Map<string, string>()

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

    const role = roleOf(pick.fingerprint)
    const sameRole = roles.get(role)
    if (sameRole && !twin) {
      found.push({
        path: `${at}.fingerprint`,
        message: `same role as ${sameRole}, in another place`,
      })
    }
    roles.set(role, at)
    if (EXCLUDED_TITLE.test(pick.posting.title)) {
      found.push({
        path: `${at}.posting.title`,
        message: "customer-facing or phone roles are never picked",
      })
    }
    const posted = pick.posting.postedOn
    const age = posted ? daysBetween(posted, digest.day) : 0
    if (age > MAX_POSTING_AGE_DAYS || age < 0) {
      found.push({
        path: `${at}.posting.postedOn`,
        message:
          age < 0
            ? `after the digest's day, ${digest.day}`
            : `older than ${MAX_POSTING_AGE_DAYS} days on ${digest.day}`,
      })
    }
    pick.fits.forEach((fit, j) => {
      const claim = `${fit.title} ${fit.detail}`
      const term = pick.dontClaim.find((t) => mentions(claim, t))
      if (term) {
        found.push({
          path: `${at}.fits.${j}`,
          message: `claims "${term}", which dontClaim rules out`,
        })
      }
    })
  })

  digest.setAside.forEach((aside, i) => {
    const at = `setAside.${i}`
    const twin = prints.get(aside.fingerprint)
    if (twin) {
      found.push({
        path: `${at}.fingerprint`,
        message: twin.startsWith("picks.")
          ? `also picked as ${twin}`
          : `same posting as ${twin}`,
      })
    }
    prints.set(aside.fingerprint, at)
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
