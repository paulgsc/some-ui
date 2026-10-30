/**
 * The files the phone shares back to Drive, made from the record: what the
 * log holds since the last share of their kind that arrived. `@some-ui/job-desk`
 * owns the shapes, and each file is checked with it before it is offered, so
 * the routine never reads one the phone could not.
 */
import { extensionOf } from "@some-ui/core-utils"
import type { Decisions, Scouts } from "@some-ui/job-desk"
import {
  decisionsFileName,
  DecisionsSchema,
  scoutsFileName,
  ScoutsSchema,
} from "@some-ui/job-desk"

import type { JobEvent, JobsState, ShareKind, VoiceNote } from "./model"
import {
  carriesPickVoice,
  debriefOf,
  decisionOf,
  deliveredThrough,
  fitNotesOf,
  isPickStep,
  sharesOn,
  untouchedReported,
} from "./model"

export type OutgoingFile = {
  kind: ShareKind
  name: string
  json: string
  /** Each voice note to send beside it, by the name the file gives it. */
  voice: ReadonlyArray<{ id: string; name: string }>
  /** Where in the log what it covers begins. */
  since: number
  /** The log's length it covers. */
  through: number
}

/**
 * A file the record holds but job-desk would refuse: never offered, and said
 * instead of the file, so a bad event can't silently stop the share.
 */
type Unshareable = { kind: ShareKind; problem: string }

export type Outgoing = OutgoingFile | Unshareable | null

const pad = (n: number): string => String(n).padStart(2, "0")

/** `20261018T145200` in local time: a stamp that sorts and names a file. */
function stampOf(at: Date): string {
  const day = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}`
  return `${day}T${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`
}

/** Names `ids` `<prefix>_voice-<n>.<ext>`, `n` counting from `first`. */
function voiceNames(
  voice: ReadonlyArray<VoiceNote>,
  ids: ReadonlyArray<string>,
  prefix: string,
  first: number
): Array<{ id: string; name: string }> {
  return ids.map((id, i) => {
    const note = voice.find((n) => n.id === id)
    const ext = extensionOf(note?.mimeType ?? "audio/webm")
    return { id, name: `${prefix}_voice-${first + i}.${ext}` }
  })
}

/** A pick's voice notes in log order, numbered across all its events. */
function pickVoice(
  state: JobsState,
  day: string,
  pickId: string
): Array<{ id: string; name: string }> {
  const ids = state.log.flatMap((e) =>
    carriesPickVoice(e) && e.day === day && e.pickId === pickId ? e.voice : []
  )
  return voiceNames(state.voice, ids, `${day}_${pickId}`, 1)
}

/**
 * Whether the phone holds `id`'s audio. A log home restored names notes whose
 * audio stayed on the phone it came from: the file still names them, but none
 * goes out beside it.
 */
function holds(state: JobsState): (id: string) => boolean {
  const kept = new Set(state.voice.map((n) => n.id))
  return (id) => kept.has(id)
}

function since(state: JobsState, kind: ShareKind): ReadonlyArray<JobEvent> {
  return state.log.slice(deliveredThrough(state, kind))
}

/**
 * `decisions-<day>.json`: each pick decided or debriefed since the last
 * decisions share that arrived, as it stands now; the picks of an earlier
 * day's digest nobody touched; disagreements, outcomes and outcomes taken
 * back since. Null when there is nothing new to say.
 */
export function decisionsFile(
  state: JobsState,
  day: string,
  at: string
): Outgoing {
  const fresh = since(state, "decisions")
  const touched = new Map<string, { day: string; pickId: string }>()
  for (const e of fresh) {
    if (isPickStep(e)) touched.set(`${e.day}/${e.pickId}`, e)
  }

  const picks: Decisions["picks"] = []
  const voice: Array<{ id: string; name: string }> = []
  const notes: Record<string, string> = {}
  const heard = holds(state)
  for (const digest of state.digests) {
    const stale = digest.day < day && !untouchedReported(state, digest.day)
    for (const pick of digest.picks) {
      const key = `${digest.day}/${pick.id}`
      const decision = decisionOf(state, digest.day, pick.id)
      if (!touched.has(key) && !(stale && decision === null)) continue
      const events = state.log.filter(
        (e) => "pickId" in e && e.day === digest.day && e.pickId === pick.id
      )
      const passed = events.filter((e) => e.type === "passed").at(-1)
      const decider = events
        .filter(
          (e) =>
            e.type === "passed" || e.type === "taken" || e.type === "archived"
        )
        .at(-1)
      const debrief = debriefOf(state, digest.day, pick.id)
      // Whatever the pick's decision now: a note goes out once, so its
      // audio is never released unsent (`releasedVoice`).
      const fit = fitNotesOf(state, digest.day, pick.id)
      const names = pickVoice(state, digest.day, pick.id)
      const nameOf = (id: string): string => {
        const name = names.find((n) => n.id === id)?.name ?? id
        notes[name] = id
        return name
      }
      const freshVoice = fresh.flatMap((e) =>
        carriesPickVoice(e) && e.day === digest.day && e.pickId === pick.id
          ? e.voice
          : []
      )
      // Attach only notes the pick as written names: a pass changed to taken
      // leaves its note out of the file, so it is not sent either.
      const named = [
        ...(decision === "passed" && passed?.type === "passed"
          ? passed.voice
          : []),
        ...(decision === "taken" && debrief ? debrief.voice : []),
        ...fit.flatMap((e) => e.voice),
      ]
      voice.push(
        ...names.filter(
          (n) =>
            named.includes(n.id) && freshVoice.includes(n.id) && heard(n.id)
        )
      )
      picks.push({
        day: digest.day,
        pickId: pick.id,
        fingerprint: pick.fingerprint,
        id: decider?.id ?? null,
        decision: decision ?? "untouched",
        reasons:
          decision === "passed" && passed?.type === "passed"
            ? [...passed.reasons]
            : [],
        note:
          decision === "passed" && passed?.type === "passed" ? passed.note : "",
        voice:
          decision === "passed" && passed?.type === "passed"
            ? passed.voice.map(nameOf)
            : [],
        debrief:
          decision === "taken" && debrief
            ? {
                id: debrief.id,
                minutes: debrief.minutes,
                friction: debrief.friction,
                frictionChips: [...debrief.chips],
                what: debrief.what,
                voice: debrief.voice.map(nameOf),
                result: debrief.result,
              }
            : null,
        fit: fit.map((e) => ({
          id: e.id,
          note: e.note,
          voice: e.voice.map(nameOf),
        })),
      })
    }
  }
  const disagreements = fresh.flatMap((e) =>
    e.type === "disagree"
      ? [{ id: e.id, fingerprint: e.fingerprint, note: e.note }]
      : []
  )
  const outcomes = fresh.flatMap((e) =>
    e.type === "outcome"
      ? [
          {
            id: e.id,
            fingerprint: e.fingerprint,
            event: e.event,
            on: e.on,
            note: e.note,
          },
        ]
      : []
  )
  const withdrawals = fresh.flatMap((e) =>
    e.type === "outcome-withdrawn" ? [{ id: e.id, outcome: e.outcomeId }] : []
  )
  if (
    picks.length +
      disagreements.length +
      outcomes.length +
      withdrawals.length ===
    0
  )
    return null

  const parsed = DecisionsSchema.safeParse({
    schema: "some-ui.job-decisions/1",
    day,
    digestDay: newestDay(picks) ?? state.digests.at(-1)?.day ?? day,
    sharedAt: at,
    picks,
    notes,
    disagreements,
    outcomes,
    withdrawals,
  })
  if (!parsed.success) return unshareable("decisions", parsed.error.issues)
  const file: Decisions = parsed.data
  return {
    kind: "decisions",
    name: decisionsFileName(day, sharesOn(state, "decisions", day) + 1),
    json: JSON.stringify(file, null, 2),
    voice,
    since: deliveredThrough(state, "decisions"),
    through: state.log.length,
  }
}

/** `scouts-<stamp>.json`: every scout added since the last one that arrived. */
export function scoutsFile(state: JobsState, at: Date): Outgoing {
  const fresh = since(state, "scouts").filter((e) => e.type === "scout")
  if (fresh.length === 0) return null
  const stamp = stampOf(at)
  const voice: Array<{ id: string; name: string }> = []
  const notes: Record<string, string> = {}
  const heard = holds(state)
  const scouts: Scouts["scouts"] = fresh.map((e) => {
    // By the scout, never the share: a retry names the same audio the same.
    const names = voiceNames(state.voice, e.voice, e.scout.id, 1)
    voice.push(...names.filter((n) => heard(n.id)))
    for (const { id, name } of names) notes[name] = id
    return { ...e.scout, voice: names.map((n) => n.name), addedAt: e.at }
  })
  const parsed = ScoutsSchema.safeParse({
    schema: "some-ui.job-scouts/1",
    sharedAt: at.toISOString(),
    scouts,
    notes,
  })
  if (!parsed.success) return unshareable("scouts", parsed.error.issues)
  const file: Scouts = parsed.data
  return {
    kind: "scouts",
    name: scoutsFileName(stamp),
    json: JSON.stringify(file, null, 2),
    voice,
    since: deliveredThrough(state, "scouts"),
    through: state.log.length,
  }
}

/** The newest digest day `picks` answer, if any. */
function newestDay(picks: Decisions["picks"]): string | null {
  return picks.reduce<string | null>(
    (newest, p) => (newest === null || p.day > newest ? p.day : newest),
    null
  )
}

function unshareable(
  kind: ShareKind,
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>
): Unshareable {
  const issue = issues.at(0)
  const where = issue
    ? `${issue.path.map(String).join(".")}: ${issue.message}`
    : ""
  return {
    kind,
    problem: `This phone holds something the morning run can't read, so it isn't sharing ${kind} yet (${where}).`,
  }
}

/** Whether `outgoing` is a file to share. */
export function isFile(outgoing: Outgoing): outgoing is OutgoingFile {
  return outgoing !== null && !("problem" in outgoing)
}
