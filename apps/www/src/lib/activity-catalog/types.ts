/**
 * The friendly, end-user-facing identity for one of the playable applets.
 * This is intentionally decoupled from `registry_key`/`SceneConfig` - it's
 * the vocabulary the dashboard's UI speaks, translated into orchestrator
 * primitives only at the edges (see `toSceneConfig`).
 */
export type ActivityId = "honeycomb" | "topik" | "interview" | "leetype"

/** Which pre-built layout tree (from @some-ui/content) an activity defaults to. */
export type LayoutTreeId = "study" | "topik" | "drama" | "voice"

export type SelectField = {
  kind: "select"
  key: string
  label: string
  options: ReadonlyArray<{ value: string; label: string }>
  defaultValue: string
}

export type DurationField = {
  kind: "duration"
  key: "durationMinutes"
  label: string
  minMinutes: number
  maxMinutes: number
  stepMinutes: number
  defaultMinutes: number
}

/** A single friendly, point-and-click configurable field for an activity. */
export type ActivityField = SelectField | DurationField

/** Icon is a lookup key, not a component - keeps this module React-free. */
export type ActivityIconKey = "hexagon" | "book-open" | "mic" | "keyboard"

export type ActivityConfigValues = Record<string, string | number>

export type ActivityDefinition = {
  id: ActivityId
  name: string
  description: string
  icon: ActivityIconKey
  /** Matches a key in @some-ui/content's componentRegistry. */
  registryKey: string
  layoutTree: LayoutTreeId
  fields: ReadonlyArray<ActivityField>
  /** Values matching `fields`, used when the user hasn't customized anything. */
  defaultConfig: ActivityConfigValues
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
