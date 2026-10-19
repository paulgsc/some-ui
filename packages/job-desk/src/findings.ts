import { mentionsWord } from "@some-ui/core-utils"

import type { Digest, Pick } from "./digest"
import { RESUME_VARIANTS, SOFTWARE_VARIANTS } from "./digest"
import { fingerprint, role as roleOf } from "./fingerprint"
import {
  EXCLUDED_TITLE,
  FORBIDDEN_TERMS,
  MAX_ANSWER_WORDS,
  MAX_COVER_LETTER_WORDS,
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
 * A phone number, written the ways a US one is. A bare run of ten digits is
 * not one: a posting's id in a link is as long.
 */
const PHONE =
  /(?<!\d)(?:\+?1[\s.-]?)?(?:\(\d{3}\)[\s.-]?|\d{3}[\s.-])\d{3}[\s.-]\d{4}(?!\d)/

/** A street address: a house number, a name, and a street word. */
const STREET =
  /\b\d{1,6}\s+(?:[A-Z][\w'-]*\s+){1,3}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Way|Dr|Drive|Ln|Lane|Ct|Court|Pl|Place|Ter|Terrace)\b/

/** A detail I type myself, as a form labels the row for it. */
const TYPED_BY_ME =
  /^(?:(?:mobile|cell|home|work|contact|preferred|primary)\s+)?(?:(?:tele)?phone(?:\s+(?:number|no|#))?|number)$|^(?:mobile|cell)$|^(?:(?:street|mailing|home|postal|current|residential)\s+)?address\s*(?:line\s*)?\d?$/

/**
 * Whether a kit row's label asks for a phone number or address. A form
 * dresses a label ("What’s your phone number?", "Phone ✱", "Address
 * (optional)"), so that is taken off before the label is matched whole: a
 * question that only mentions one ("Built mobile apps?") is not a row for it.
 */
function typedByMe(label: string): boolean {
  const bare = label
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[\s*✱:?.]+$/u, "")
    .replace(/^\s*(?:what(?: is|['’]s) )?(?:your\s+)?/u, "")
    .trim()
  return TYPED_BY_ME.test(bare)
}

/** `text` claiming a term the evidence or the pick rules out, if it does. */
function claimFinding(
  path: string,
  text: string,
  dontClaim: ReadonlyArray<string>
): Finding | null {
  const term = [...FORBIDDEN_TERMS, ...dontClaim].find((t) =>
    mentionsWord(text, t)
  )
  if (!term) return null
  const why = FORBIDDEN_TERMS.includes(term)
    ? "the evidence doesn't support"
    : "dontClaim rules out"
  return { path, message: `claims "${term}", which ${why}` }
}

function wordCount(draft: string): number {
  return draft.split(/\s+/).filter(Boolean).length
}

/**
 * A kit's drafts: within their caps, every required question answered, and
 * nothing in them or the kit's rows that I never let a run write: a term the
 * evidence doesn't support, one this pick says not to claim, or a contact
 * detail beyond the email and links (ROUTINE.md §7).
 */
function kitFindings(pick: Pick, at: string): ReadonlyArray<Finding> {
  const found: Array<Finding> = []
  const { kit } = pick
  const drafts: Array<[path: string, draft: string, cap: number]> = []
  if (kit.coverLetter !== null)
    drafts.push(["coverLetter", kit.coverLetter, MAX_COVER_LETTER_WORDS])
  const asked = new Set<string>()
  kit.questions.forEach((question, i) => {
    if (asked.has(question.label))
      found.push({
        path: `${at}.kit.questions.${i}.label`,
        message: `"${question.label}" is asked twice`,
      })
    asked.add(question.label)
    if (question.draft !== null)
      drafts.push([`questions.${i}.draft`, question.draft, MAX_ANSWER_WORDS])
    else if (question.required)
      found.push({
        path: `${at}.kit.questions.${i}.draft`,
        message: "a required question has no draft",
      })
  })
  if (kit.compensation !== null)
    drafts.push(["compensation.why", kit.compensation.why, MAX_ANSWER_WORDS])

  for (const [path, draft, cap] of drafts) {
    const words = wordCount(draft)
    if (words > cap)
      found.push({
        path: `${at}.kit.${path}`,
        message: `${words} words; the most is ${cap}`,
      })
    const claim = claimFinding(`${at}.kit.${path}`, draft, pick.dontClaim)
    if (claim) found.push(claim)
  }

  const rows = { fields: kit.fields, answers: kit.answers }
  const texts: Array<[path: string, text: string]> = drafts.map(
    ([path, draft]) => [path, draft]
  )
  if (kit.compensation !== null)
    texts.push(["compensation.ask", kit.compensation.ask])
  for (const [kind, list] of Object.entries(rows)) {
    list.forEach((row, i) => {
      texts.push([`${kind}.${i}`, row.value])
      if (typedByMe(row.label))
        found.push({
          path: `${at}.kit.${kind}.${i}.label`,
          message: `"${row.label}" is mine to type`,
        })
    })
  }
  for (const [path, value] of texts) {
    if (PHONE.test(value) || STREET.test(value))
      found.push({
        path: `${at}.kit.${path}`,
        message: "a phone number or street address is mine to type",
      })
  }
  return found
}

/**
 * What the schema cannot say about a digest: the policy's limits, the
 * queue's room, one fingerprint per posting, no fit that claims what the
 * evidence or the same pick rules out, and each kit's drafts (`kitFindings`). An
 * empty list is what a run uploads.
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
    found.push(...kitFindings(pick, at))
    pick.fits.forEach((fit, j) => {
      const claim = claimFinding(
        `${at}.fits.${j}`,
        `${fit.title} ${fit.detail}`,
        pick.dontClaim
      )
      if (claim) found.push(claim)
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
