/**
 * The drama as data: one lesson is one scene tree (docs/makjang/README.md,
 * "1. Story: the content model").
 *
 * A choice splits a scene into child scenes, one per option, and each child
 * may split again until `MAX_DEPTH`, where a scene must resolve. Everything
 * here is generic over what a tree contains: no scene, trope, character or
 * item is named, and `text`/`gloss` are "the language being learned" and "the
 * learner's" without saying which. `Check` is the teaching layer's item; this
 * package carries it without reading it, and `feeling` and `art` likewise.
 */

/** Choices between the root and the deepest scene. A scene at it is a leaf. */
export const MAX_DEPTH = 2

export const MIN_BRANCHES = 2

/** About what a phone shows as large thumb targets. */
export const MAX_BRANCHES = 4

export type CharacterId = string

export type Character = {
  id: CharacterId
  name: string
  /** How they stand to the others: described text, never a fixed role. */
  standing: string
  /**
   * The register this character uses to another, keyed by that character's
   * id: described text ("반말 when angry", "full honorifics").
   */
  registers: Record<CharacterId, string>
  /** Medium-free descriptions the media layer may render, or ignore. */
  voice?: string
  look?: string
}

export type Line = {
  id: string
  speaker: CharacterId
  text: string
  gloss: string
  /** How it is said. */
  direction?: string
}

/** A short action or description, so the learner knows where they are. */
export type Narration = {
  id: string
  text: string
  gloss: string
}

export type Beat = Line | Narration

export type Scene<Check> = {
  id: string
  place: string
  /** A key of the renderer's feeling vocabulary; carried unread. */
  feeling: string
  beats: Array<Beat>
  /** Absent on a leaf; always absent at `MAX_DEPTH`. */
  choice?: Choice<Check>
}

export type Choice<Check> = {
  id: string
  /** What the story asks, in the drama's own voice. */
  prompt: string
  /** The teaching layer's item; its candidates are the options' words. */
  check: Check
  /** `MIN_BRANCHES` to `MAX_BRANCHES`. */
  options: Array<Option<Check>>
}

export type Option<Check> = {
  /** A candidate's id in `check`: the option holds no words of its own. */
  id: string
  /** A short art description, rendered when the media layer can. */
  art?: string
  child: Scene<Check>
}

export type Lesson<Check> = {
  id: string
  level: number
  /** The character the learner follows. */
  pov: CharacterId
  cast: Array<Character>
  root: Scene<Check>
}

/** The option ids chosen from the root: it locates a scene. */
export type Route = ReadonlyArray<string>

export const isLine = (beat: Beat): beat is Line => "speaker" in beat

/** A JSON object; for reading untrusted input. Not part of the public API. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * The scene `route` leads to from `root`, or `undefined` when some step names
 * no option of the scene it leaves (or leaves a leaf).
 */
export function sceneAt<Check>(
  root: Scene<Check>,
  route: Route
): Scene<Check> | undefined {
  let scene: Scene<Check> = root
  for (const optionId of route) {
    const next = scene.choice?.options.find(({ id }) => id === optionId)
    if (next === undefined) return undefined
    scene = next.child
  }
  return scene
}

/**
 * Every scene of the tree with the route that reaches it, root first, depth
 * first in option order.
 */
export function scenesOf<Check>(
  root: Scene<Check>
): Array<{ route: Route; scene: Scene<Check> }> {
  const found: Array<{ route: Route; scene: Scene<Check> }> = []
  const visit = (scene: Scene<Check>, route: Route): void => {
    found.push({ route, scene })
    for (const option of scene.choice?.options ?? []) {
      visit(option.child, [...route, option.id])
    }
  }
  visit(root, [])
  return found
}
