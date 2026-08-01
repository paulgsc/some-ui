import type { AudioChannelId } from "../audio-preferences"

/**
 * The friendly, end-user-facing identity for one of the playable applets.
 * This is intentionally decoupled from `registry_key`/`SceneConfig` - it's
 * the vocabulary the dashboard's UI speaks, translated into orchestrator
 * primitives only at the edges (see `toSceneConfig`).
 */
export type ActivityId = "honeycomb" | "topik" | "interview" | "leetype"

/** Which pre-built layout tree (from @some-ui/content-registry) an activity defaults to. */
export type LayoutTreeId = "study" | "topik" | "drama" | "voice"

type SelectField = {
  kind: "select"
  key: string
  label: string
  options: ReadonlyArray<{ value: string; label: string }>
  defaultValue: string
}

type DurationField = {
  kind: "duration"
  key: "durationMinutes"
  label: string
  minMinutes: number
  maxMinutes: number
  stepMinutes: number
  defaultMinutes: number
}

/** A single friendly, point-and-click configurable field for an activity. */
type ActivityField = SelectField | DurationField

/** Icon is a lookup key, not a component - keeps this module React-free. */
export type ActivityIconKey = "hexagon" | "book-open" | "mic" | "keyboard"

export type ActivityConfigValues = Record<string, string | number>

/**
 * How finished an activity is, in a person's terms rather than a
 * developer's.
 *
 * This app ships applets at very different stages, and shipping them is the
 * right call - they get better by being used. What is not right is letting
 * someone walk into a half-built room expecting a finished one. This is the
 * wet-floor sign: enough warning to set expectations, no diagnostics, no
 * internals, no apology.
 *
 * - `"ready"` - works end to end. Says nothing, because there is nothing to
 *   warn about, and a badge on everything is a badge on nothing.
 * - `"preview"` - usable and worth using, with rough edges.
 * - `"early"` - a construction zone. Parts are missing or unfinished, and a
 *   person should expect that before they start rather than discover it.
 */
export type ActivityMaturity = "ready" | "preview" | "early"

/**
 * What an activity does to a person's ears, in their terms.
 *
 * Different modules have genuinely different audio semantics - Korean
 * lessons are pronunciation-led, the typing game only ever plays short
 * feedback sounds - so the disclosure belongs at the activity level rather
 * than as one global banner that has to be vague enough to cover both.
 *
 * `blurb` is written to sit on an activity card next to a speaker glyph:
 * short, concrete, and about the experience rather than the mechanism.
 */
type ActivityAudio = {
  channels: ReadonlyArray<AudioChannelId>
  blurb: string
  /**
   * True when the activity is not usable without sound - a listening
   * exercise with no captions, say. Only such an activity earns a
   * prompt strong enough to interrupt; for everything else audio is an
   * enhancement and a dismissible notice is the right weight.
   */
  required?: boolean
}

export type ActivityDefinition = {
  id: ActivityId
  name: string
  description: string
  icon: ActivityIconKey
  /** Matches a key in @some-ui/content-registry's componentRegistry. */
  registryKey: string
  layoutTree: LayoutTreeId
  fields: ReadonlyArray<ActivityField>
  /** Values matching `fields`, used when the user hasn't customized anything. */
  defaultConfig: ActivityConfigValues
  /** Absent means the activity is silent and needs no disclosure at all. */
  audio?: ActivityAudio
  /** Absent means `"ready"` - the quiet default. */
  maturity?: ActivityMaturity
  /**
   * Maps friendly config values onto the scene `props` payload for this
   * activity's registry component. Some fields (e.g. picking an exact
   * question set or code challenge) are intentionally left as simple
   * identifiers here - resolving them into the full objects those
   * components expect is the live player's job (Epic E), once it's actually
   * mounting and can be checked against the real component in a browser.
   */
  toSceneProps: (config: ActivityConfigValues) => Record<string, unknown>
}
