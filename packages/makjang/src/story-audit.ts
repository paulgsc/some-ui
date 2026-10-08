/**
 * The story audit: whether a value is a scene tree the engine can walk
 * (docs/makjang/README.md, "4. Authoring: two audits, by owner").
 *
 * It checks shape and nothing else. Nothing here knows what the drama is
 * about, which language it is in, or whether a choice is a good item: that is
 * the teaching audit's, in topik. `check`, `feeling` and `art` are carried
 * unread; the audit asks only that a check and a feeling are there.
 *
 * A tree with any finding is rejected whole. A dropped scene or beat would
 * leave a route that resolves to nothing, or a choice whose answer leads
 * nowhere, so unlike a probe there is no smaller piece to withhold.
 *
 * The accepted tree is rebuilt field by field from what was checked, never
 * cast from the input, so a field the schema does not name does not reach
 * the engine.
 *
 * Invariants (full text in docs/makjang/README.md, "Invariants"):
 * - MK2: a tree reaches the engine only through `auditStory`, which holds it
 *   to `MAX_DEPTH` and `MIN_BRANCHES`..`MAX_BRANCHES`.
 */

import type {
  Beat,
  Character,
  Choice,
  Lesson,
  Option,
  Scene,
} from "@makjang/schema"
import {
  isRecord,
  MAX_BRANCHES,
  MAX_DEPTH,
  MIN_BRANCHES,
} from "@makjang/schema"

/** One problem, at a dotted path into the input (`root.choice.options.1`). */
export type StoryFinding = { path: string; message: string }

export type StoryAudit =
  | { ok: true; lesson: Lesson<unknown> }
  | { ok: false; findings: Array<StoryFinding> }

const at = (path: string, key: string | number): string =>
  path === "" ? String(key) : `${path}.${key}`

type Context = {
  findings: Array<StoryFinding>
  /** Scene, beat and choice ids: one namespace across the tree. */
  ids: Set<string>
  cast: Set<string>
}

const report = (context: Context, path: string, message: string): void => {
  context.findings.push({ path, message })
}

/** A non-blank string at `record[key]`, or a finding. */
function text(
  context: Context,
  record: Record<string, unknown>,
  key: string,
  path: string
): string | undefined {
  const value = record[key]
  if (typeof value === "string" && value.trim() !== "") return value
  report(
    context,
    at(path, key),
    value === undefined ? "is missing" : "must be a non-blank string"
  )
  return undefined
}

/** An optional string at `record[key]`: absent, or a string. */
function optionalText(
  context: Context,
  record: Record<string, unknown>,
  key: string,
  path: string
): string | undefined {
  const value = record[key]
  if (value === undefined || typeof value === "string") return value
  report(context, at(path, key), "must be a string when given")
  return undefined
}

function uniqueId(
  context: Context,
  record: Record<string, unknown>,
  path: string
): string | undefined {
  const id = text(context, record, "id", path)
  if (id === undefined) return undefined
  if (context.ids.has(id)) {
    report(
      context,
      at(path, "id"),
      `"${id}" is already the id of another scene, beat or choice`
    )
  }
  context.ids.add(id)
  return id
}

function inCast(context: Context, id: string, path: string): void {
  if (!context.cast.has(id)) {
    report(context, path, `"${id}" is not in the cast`)
  }
}

function auditCharacter(
  context: Context,
  raw: unknown,
  path: string
): Character | undefined {
  if (!isRecord(raw)) {
    report(context, path, "a character must be an object")
    return undefined
  }
  const id = typeof raw.id === "string" ? raw.id : undefined
  const name = text(context, raw, "name", path)
  const standing = text(context, raw, "standing", path)
  const voice = optionalText(context, raw, "voice", path)
  const look = optionalText(context, raw, "look", path)

  const registers: Record<string, string> = {}
  const rawRegisters = raw.registers ?? {}
  if (isRecord(rawRegisters)) {
    for (const [to, register] of Object.entries(rawRegisters)) {
      const where = at(at(path, "registers"), to)
      inCast(context, to, where)
      if (to === id) report(context, where, "a register is toward another")
      if (typeof register === "string" && register.trim() !== "") {
        registers[to] = register
      } else {
        report(context, where, "must be a non-blank string")
      }
    }
  } else {
    report(context, at(path, "registers"), "must be an object")
  }

  if (id === undefined || name === undefined || standing === undefined) {
    return undefined
  }
  return {
    id,
    name,
    standing,
    registers,
    ...(voice === undefined ? {} : { voice }),
    ...(look === undefined ? {} : { look }),
  }
}

function auditBeat(
  context: Context,
  raw: unknown,
  path: string
): Beat | undefined {
  if (!isRecord(raw)) {
    report(context, path, "a beat must be an object")
    return undefined
  }
  const id = uniqueId(context, raw, path)
  const beatText = text(context, raw, "text", path)
  const gloss = text(context, raw, "gloss", path)
  if (!("speaker" in raw)) {
    if (id === undefined || beatText === undefined || gloss === undefined) {
      return undefined
    }
    return { id, text: beatText, gloss }
  }
  const speaker = text(context, raw, "speaker", path)
  if (speaker !== undefined) inCast(context, speaker, at(path, "speaker"))
  const direction = optionalText(context, raw, "direction", path)
  if (
    id === undefined ||
    beatText === undefined ||
    gloss === undefined ||
    speaker === undefined
  ) {
    return undefined
  }
  return {
    id,
    speaker,
    text: beatText,
    gloss,
    ...(direction === undefined ? {} : { direction }),
  }
}

function auditChoice(
  context: Context,
  raw: unknown,
  path: string,
  depth: number
): Choice<unknown> | undefined {
  if (!isRecord(raw)) {
    report(context, path, "a choice must be an object")
    return undefined
  }
  const id = uniqueId(context, raw, path)
  const prompt = text(context, raw, "prompt", path)
  if (raw.check === undefined) report(context, at(path, "check"), "is missing")

  const rawOptions = raw.options
  const optionsPath = at(path, "options")
  if (!Array.isArray(rawOptions)) {
    report(context, optionsPath, "must be an array")
    return undefined
  }
  if (rawOptions.length < MIN_BRANCHES || rawOptions.length > MAX_BRANCHES) {
    report(
      context,
      optionsPath,
      `has ${rawOptions.length} options; a choice has ${MIN_BRANCHES} to ${MAX_BRANCHES}`
    )
  }
  const optionIds = new Set<string>()
  const options: Array<Option<unknown>> = []
  // Past the bound nothing is walked: the finding above already rejects the
  // tree, and an unbounded input must not drive the recursion.
  rawOptions.slice(0, MAX_BRANCHES).forEach((option: unknown, index) => {
    const where = at(optionsPath, index)
    if (!isRecord(option)) {
      report(context, where, "an option must be an object")
      return
    }
    const optionId = text(context, option, "id", where)
    if (optionId !== undefined) {
      if (optionIds.has(optionId)) {
        report(
          context,
          at(where, "id"),
          `"${optionId}" is already an option of this choice`
        )
      }
      optionIds.add(optionId)
    }
    const art = optionalText(context, option, "art", where)
    const childPath = at(where, "child")
    if (option.child === undefined) {
      report(context, childPath, "is missing: every option leads to a scene")
    }
    const child =
      option.child === undefined
        ? undefined
        : auditScene(context, option.child, childPath, depth + 1)
    if (optionId !== undefined && child !== undefined) {
      options.push({
        id: optionId,
        ...(art === undefined ? {} : { art }),
        child,
      })
    }
  })

  if (id === undefined || prompt === undefined || raw.check === undefined) {
    return undefined
  }
  return { id, prompt, check: raw.check, options }
}

function auditScene(
  context: Context,
  raw: unknown,
  path: string,
  depth: number
): Scene<unknown> | undefined {
  if (!isRecord(raw)) {
    report(context, path, "a scene must be an object")
    return undefined
  }
  const id = uniqueId(context, raw, path)
  const place = text(context, raw, "place", path)
  const feeling = text(context, raw, "feeling", path)

  const beats: Array<Beat> = []
  const beatsPath = at(path, "beats")
  if (!Array.isArray(raw.beats)) {
    report(context, beatsPath, "must be an array")
  } else if (raw.beats.length === 0) {
    report(context, beatsPath, "is empty: a scene has at least one beat")
  } else {
    raw.beats.forEach((beat: unknown, index) => {
      const checked = auditBeat(context, beat, at(beatsPath, index))
      if (checked !== undefined) beats.push(checked)
    })
  }

  let choice: Choice<unknown> | undefined
  if (raw.choice !== undefined) {
    if (depth >= MAX_DEPTH) {
      report(
        context,
        at(path, "choice"),
        `a scene at depth ${MAX_DEPTH} has no choice: the story resolves there`
      )
    } else {
      choice = auditChoice(context, raw.choice, at(path, "choice"), depth)
    }
  }

  if (id === undefined || place === undefined || feeling === undefined) {
    return undefined
  }
  return {
    id,
    place,
    feeling,
    beats,
    ...(choice === undefined ? {} : { choice }),
  }
}

/** Holds `raw` (parsed JSON) to the scene-tree schema. Never throws. */
export function auditStory(raw: unknown): StoryAudit {
  if (!isRecord(raw)) {
    return {
      ok: false,
      findings: [{ path: "", message: "a lesson must be an object" }],
    }
  }
  const context: Context = { findings: [], ids: new Set(), cast: new Set() }

  const id = text(context, raw, "id", "")
  const level = raw.level
  if (typeof level !== "number" || !Number.isInteger(level) || level < 1) {
    report(context, "level", "must be a whole number, 1 or more")
  }

  const cast: Array<Character> = []
  if (!Array.isArray(raw.cast) || raw.cast.length === 0) {
    report(context, "cast", "must be a non-empty array of characters")
  } else {
    // Ids first, so a register may name a character listed after it.
    raw.cast.forEach((character: unknown, index) => {
      const where = at("cast", index)
      if (!isRecord(character)) return
      const characterId = text(context, character, "id", where)
      if (characterId === undefined) return
      if (context.cast.has(characterId)) {
        report(
          context,
          at(where, "id"),
          `"${characterId}" is already in the cast`
        )
      }
      context.cast.add(characterId)
    })
    raw.cast.forEach((character: unknown, index) => {
      const checked = auditCharacter(context, character, at("cast", index))
      if (checked !== undefined) cast.push(checked)
    })
  }

  const pov = text(context, raw, "pov", "")
  if (pov !== undefined) inCast(context, pov, "pov")

  if (raw.root === undefined) report(context, "root", "is missing")
  const root =
    raw.root === undefined
      ? undefined
      : auditScene(context, raw.root, "root", 0)

  if (
    context.findings.length > 0 ||
    id === undefined ||
    typeof level !== "number" ||
    pov === undefined ||
    root === undefined
  ) {
    return { ok: false, findings: context.findings }
  }
  return { ok: true, lesson: { id, level, pov, cast, root } }
}
