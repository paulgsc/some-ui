/**
 * The files the phone shares back to Drive, made from the record: what the
 * log holds since the last share of their kind. `@some-ui/job-desk` owns the
 * shapes, and each file is parsed with it before it is offered, so the
 * routine never reads one the phone could not.
 */
import type { Decisions, Scouts } from "@some-ui/job-desk"
import { DecisionsSchema, ScoutsSchema } from "@some-ui/job-desk"

import type { JobEvent, JobsState, ShareKind, VoiceNote } from "./model"
import { decisionOf, lastShare } from "./model"

export type OutgoingFile = {
  kind: ShareKind
  name: string
  json: string
  /** Each voice note to send beside it, by the name the file gives it. */
  voice: ReadonlyArray<{ id: string; name: string }>
  /** The log's length it covers. */
  through: number
}

const EXTENSIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/webm/, "webm"],
  [/ogg/, "ogg"],
  [/mp4|m4a|aac/, "m4a"],
]

function extensionOf(mimeType: string): string {
  return EXTENSIONS.find(([pattern]) => pattern.test(mimeType))?.[1] ?? "webm"
}

/** `20261018T145200`: a stamp that sorts and names a file. */
function stampOf(at: string): string {
  return at.replace(/[-:]/g, "").slice(0, 15)
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
    const ext = extensionOf(note?.mimeType ?? "")
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
    (e.type === "passed" || e.type === "debrief") &&
    e.day === day &&
    e.pickId === pickId
      ? e.voice
      : []
  )
  return voiceNames(state.voice, ids, `${day}_${pickId}`, 1)
}

function since(state: JobsState, kind: ShareKind): ReadonlyArray<JobEvent> {
  return state.log.slice(lastShare(state, kind)?.through ?? 0)
}

function sharedOn(state: JobsState, kind: ShareKind, day: string): number {
  return state.log.filter(
    (e) => e.type === "shared" && e.kind === kind && e.day === day
  ).length
}

/**
 * `decisions-<day>.json`: each pick decided or debriefed since the last
 * decisions share, as it stands now; the picks of an earlier day's digest
 * nobody touched; disagreements and outcomes since. Null when there is
 * nothing new to say.
 */
export function decisionsFile(
  state: JobsState,
  day: string,
  at: string
): OutgoingFile | null {
  const fresh = since(state, "decisions")
  const touched = new Map<string, { day: string; pickId: string }>()
  for (const e of fresh) {
    if ("pickId" in e) touched.set(`${e.day}/${e.pickId}`, e)
  }
  const lastDay = lastShare(state, "decisions")?.day ?? ""

  const picks: Decisions["picks"] = []
  const voice: Array<{ id: string; name: string }> = []
  for (const digest of state.digests) {
    for (const pick of digest.picks) {
      const key = `${digest.day}/${pick.id}`
      const decision = decisionOf(state, digest.day, pick.id)
      const stale = digest.day < day && digest.day >= lastDay
      if (!touched.has(key) && !(decision === null && stale)) continue
      const events = state.log.filter(
        (e) => "pickId" in e && e.day === digest.day && e.pickId === pick.id
      )
      const passed = events.filter((e) => e.type === "passed").at(-1)
      const debrief = events.filter((e) => e.type === "debrief").at(-1)
      const names = pickVoice(state, digest.day, pick.id)
      const nameOf = (id: string): string =>
        names.find((n) => n.id === id)?.name ?? id
      const freshVoice = fresh.flatMap((e) =>
        (e.type === "passed" || e.type === "debrief") &&
        e.day === digest.day &&
        e.pickId === pick.id
          ? e.voice
          : []
      )
      voice.push(...names.filter((n) => freshVoice.includes(n.id)))
      picks.push({
        pickId: pick.id,
        fingerprint: pick.fingerprint,
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
          decision === "taken" && debrief?.type === "debrief"
            ? {
                minutes: debrief.minutes,
                friction: debrief.friction,
                frictionChips: [...debrief.chips],
                what: debrief.what,
                voice: debrief.voice.map(nameOf),
                result: debrief.result,
              }
            : null,
      })
    }
  }
  const disagreements = fresh.flatMap((e) =>
    e.type === "disagree" ? [{ fingerprint: e.fingerprint, note: e.note }] : []
  )
  const outcomes = fresh.flatMap((e) =>
    e.type === "outcome"
      ? [{ fingerprint: e.fingerprint, event: e.event, on: e.on, note: e.note }]
      : []
  )
  if (picks.length + disagreements.length + outcomes.length === 0) return null

  const file: Decisions = DecisionsSchema.parse({
    schema: "some-ui.job-decisions/1",
    day,
    digestDay: state.current ?? day,
    sharedAt: at,
    picks,
    disagreements,
    outcomes,
  })
  const n = sharedOn(state, "decisions", day)
  return {
    kind: "decisions",
    name: n === 0 ? `decisions-${day}.json` : `decisions-${day}-${n + 1}.json`,
    json: JSON.stringify(file, null, 2),
    voice,
    through: state.log.length,
  }
}

/** `scouts-<stamp>.json`: every scout added since the last scouts share. */
export function scoutsFile(state: JobsState, at: string): OutgoingFile | null {
  const fresh = since(state, "scouts").filter((e) => e.type === "scout")
  if (fresh.length === 0) return null
  const stamp = stampOf(at)
  const voice: Array<{ id: string; name: string }> = []
  const scouts: Scouts["scouts"] = fresh.map((e) => {
    const names = voiceNames(state.voice, e.voice, `${stamp}_${e.scout.id}`, 1)
    voice.push(...names)
    return { ...e.scout, voice: names.map((n) => n.name), addedAt: e.at }
  })
  const file: Scouts = ScoutsSchema.parse({
    schema: "some-ui.job-scouts/1",
    sharedAt: at,
    scouts,
  })
  return {
    kind: "scouts",
    name: `scouts-${stamp}.json`,
    json: JSON.stringify(file, null, 2),
    voice,
    through: state.log.length,
  }
}
