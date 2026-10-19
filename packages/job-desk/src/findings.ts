import { mentionsWord } from "@some-ui/core-utils"

import type { Digest } from "./digest"
import { RESUME_VARIANTS, SOFTWARE_VARIANTS } from "./digest"
import { fingerprint, role as roleOf } from "./fingerprint"
import {
  EXCLUDED_TITLE,
  MAX_OPEN_PICKS,
  MAX_POSTING_AGE_DAYS,
  PATCH_PRS_PER_RUN,
  PICKS_PER_DAY,
  QUEUE_FROM,
  SCOUT_AGREE_FIT,
  TRACKS,
} from "./policy"
import { freeSlots } from "./queue"

/** One way a well-formed digest breaks the routine's rules, by path. */
export type Finding = { path: string; message: string }

const DAY_MS = 24 * 60 * 60 * 1000

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS)
}

/**
 * What the schema cannot say about a digest: the policy's limits, the
 * queue's room, one fingerprint per posting, and no fit that claims what the
 * same pick says not to claim. An empty list is what a run uploads.
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

  if (digest.queue === null && digest.day >= QUEUE_FROM) {
    found.push({
      path: "queue",
      message: `a digest from ${QUEUE_FROM} on records its queue (ROUTINE.md §2)`,
    })
  }
  if (digest.queue !== null) {
    const { open } = digest.queue
    const free = freeSlots(open)
    const queued = new Set<string>()
    open.forEach((held, i) => {
      const key = `${held.day}/${held.pickId}`
      if (held.day >= digest.day) {
        found.push({
          path: `queue.open.${i}.day`,
          message: `an open pick comes from a digest before ${digest.day}`,
        })
      }
      if (queued.has(key)) {
        found.push({
          path: `queue.open.${i}`,
          message: `${key} is listed twice`,
        })
      }
      queued.add(key)
    })
    for (const track of TRACKS) {
      const count = digest.picks.filter((p) => p.track === track).length
      if (count > free[track]) {
        found.push({
          path: "picks",
          message: `${count} ${track} picks, but ${MAX_OPEN_PICKS[track] - free[track]} of ${MAX_OPEN_PICKS[track]} slots are still open; room for ${free[track]}`,
        })
      }
    }
  }

  // Each résumé PR the digest links, and the composition it changes.
  const prs = new Map<number, string>()
  digest.picks.forEach(({ resume }, i) => {
    if (resume.kind !== "patch" || resume.pr === null) return
    const changes = prs.get(resume.pr)
    if (changes !== undefined && changes !== resume.variant) {
      found.push({
        path: `picks.${i}.resume.pr`,
        message: `PR #${resume.pr} changes ${changes}, not ${resume.variant}`,
      })
    }
    prs.set(resume.pr, changes ?? resume.variant)
  })
  if (prs.size > PATCH_PRS_PER_RUN) {
    found.push({
      path: "picks",
      message: `links ${prs.size} résumé PRs; the most is ${PATCH_PRS_PER_RUN}`,
    })
  }

  const listed = digest.picks.length + digest.setAside.length
  if (digest.seen < listed) {
    found.push({
      path: "seen",
      message: `${digest.seen} is fewer than the ${listed} postings picked or set aside`,
    })
  }

  digest.picks.forEach((pick, i) => {
    const at = `picks.${i}`
    const { resume } = pick
    if (resume.kind === "build" && resume.ref !== digest.evidence.someUi) {
      found.push({
        path: `${at}.resume.ref`,
        message: `builds at ${resume.ref}, but the fits were checked at ${digest.evidence.someUi}`,
      })
    }
    if (
      resume.kind === "patch" &&
      pick.family !== null &&
      resume.variant !== pick.family
    ) {
      found.push({
        path: `${at}.resume.variant`,
        message: `a ${pick.family} pick's patch is the ${pick.family} composition`,
      })
    }
    if (
      resume.kind === "patch" &&
      resume.pr !== null &&
      !RESUME_VARIANTS.some((v) => v === resume.variant)
    ) {
      found.push({
        path: `${at}.resume.pr`,
        message: `a run's PR changes an existing composition, not a new ${resume.variant}`,
      })
    }
    const [sends, field] =
      resume.kind === "build"
        ? [resume.variant, "variant"]
        : [resume.fallback, "fallback"]
    const fitsTrack =
      pick.family === null
        ? SOFTWARE_VARIANTS.some((v) => v === sends)
        : sends === pick.family
    if (!fitsTrack) {
      found.push({
        path: `${at}.resume.${field}`,
        message:
          pick.family === null
            ? `a software pick sends one of ${SOFTWARE_VARIANTS.join(", ")}`
            : `a ${pick.family} pick sends the ${pick.family} composition`,
      })
    }
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

    const role = roleOf(pick.posting)
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
      const term = pick.dontClaim.find((t) => mentionsWord(claim, t))
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
    const role = roleOf(aside)
    if (!aside.fingerprint.startsWith(`${role}|`)) {
      found.push({
        path: `${at}.fingerprint`,
        message: `should start "${role}|", from its company and title`,
      })
    }
    const sameRole = roles.get(role)
    if (sameRole && !twin) {
      found.push({
        path: `${at}.fingerprint`,
        message: `same role as ${sameRole}, in another place`,
      })
    }
    prints.set(aside.fingerprint, at)
    roles.set(role, at)
  })

  digest.scouts.forEach((scout, i) => {
    const at = `scouts.${i}`
    const unscored =
      scout.verdict === "not-found"
        ? "a scout the run couldn't find"
        : scout.pickId !== null
          ? "a scout that became a pick"
          : scout.rule !== null
            ? "a scout a set-aside rule decided"
            : null
    if (
      scout.rule !== null &&
      (scout.verdict !== "disagree" || scout.pickId !== null)
    ) {
      found.push({
        path: `${at}.rule`,
        message: "a scout a set-aside rule decided is a disagree and no pick",
      })
    }
    if (unscored !== null && scout.review !== null) {
      found.push({ path: `${at}.review`, message: `${unscored} has no review` })
    }
    if (unscored === null && scout.review === null) {
      found.push({
        path: `${at}.review`,
        message: "a scout the run scored and didn't pick carries its review",
      })
    }
    // `sends` can't be held to the scout's track: its entry here carries none.
    if (unscored === null && scout.review !== null) {
      const agrees = scout.review.scores.fit >= SCOUT_AGREE_FIT
      if (agrees !== (scout.verdict === "agree")) {
        found.push({
          path: `${at}.verdict`,
          message: `fit ${scout.review.scores.fit} is ${agrees ? "an agree" : "a disagree"}; the cutoff is ${SCOUT_AGREE_FIT}`,
        })
      }
    }
    if (scout.pickId === null) return
    if (scout.verdict !== "agree") {
      found.push({
        path: `scouts.${i}.pickId`,
        message: `a scout the run did not agree with became no pick`,
      })
    } else if (!ids.has(scout.pickId)) {
      found.push({
        path: `scouts.${i}.pickId`,
        message: `no pick ${scout.pickId}`,
      })
    }
  })

  return found
}
