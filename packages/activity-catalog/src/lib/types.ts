/**
 * The audio channels an activity can declare it uses.
 *
 * Declared here rather than alongside the app's audio *preferences* because
 * this is the producing end: an activity states what it does to a person's
 * ears, and the app's preference store (which channels are allowed, at what
 * volume) is the consumer of that vocabulary. Both ends need the same ids;
 * only one of them can own them, and a closed union owned by the catalogue
 * is what makes `AUDIO_CHANNELS` in the app exhaustive by construction.
 */
export type AudioChannelId = "speech" | "effects"

/**
 * The Korean-proficiency scale a person sets as their target, and the scale
 * the study activities offer levels on.
 *
 * Lives here because it is the vocabulary shared between what an activity
 * offers (`fields`) and what a profile is aiming at - `rankActivities` is
 * the place those two meet, and it is in this package.
 */
export type TopikLevel = "beginner" | "intermediate" | "advanced"

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

/**
 * The input channels an activity can be played through.
 *
 * A closed union owned here for the same reason `AudioChannelId` is: this is
 * the producing end — an activity states what it asks of a person's hands —
 * and the surfaces that disclose it are consumers of the vocabulary.
 */
export type InputModalityId = "keyboard" | "touch"

/**
 * What an activity asks of a person's hands, in their terms.
 *
 * The sibling of `ActivityAudio` above, and it exists for the same reason:
 * a person choosing an activity on their phone deserves to know before the
 * click what it is going to ask them to do, not after.
 *
 * The case that forced it is LeetType. Its large-screen surface is a typing
 * probe — the player produces code under a masking loop — and its
 * small-screen surface is not a narrower version of that but a different
 * exercise: read a change, say what it does (`@some-ui/leetype`'s
 * `LTY-MOBILE`, `docs/leetype/README.md`). A single description written for
 * one of those is false on the other, and "Prove one competency at a time by
 * typing the smallest code that shows it" was false on every phone that read
 * it.
 *
 * Declared per-activity rather than as one global note for the same reason
 * audio is: modules genuinely differ. Honeycomb is a tap game at every width;
 * TOPIK reading is the same on both. Only an activity that actually changes
 * shape needs to say so.
 */
type ActivityInput = {
  /** Every modality this activity can be played through, across all widths. */
  modalities: ReadonlyArray<InputModalityId>
  /**
   * One line for an activity card, about the experience rather than the
   * mechanism — the same register `ActivityAudio.blurb` is written in.
   */
  blurb: string
  /**
   * True when the small-screen interaction is a *different exercise*, not a
   * reflow of the same one. Only such an activity earns the extra sentence;
   * for everything else the blurb alone is the right weight.
   */
  switchesOnSmallScreens?: boolean
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
  /** Absent means the activity asks nothing worth disclosing before the click. */
  input?: ActivityInput
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
