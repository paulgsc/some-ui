import type { RegistryKey } from "@some-ui/content-registry"
import type {
  ActiveLifetime,
  PanelIntent,
  UILayoutIntent,
} from "@some-ui/types"

/**
 * Runtime props for the panels that need them, keyed by the registry key that
 * consumes them. Keys absent from the map are panels with nothing to inject.
 */
export type ScenePropsMap = Partial<
  Record<RegistryKey, Record<string, unknown>>
>

/**
 * Build a `ScenePropsMap` with its keys actually checked against the registry's
 * own union, so a renamed or misspelled panel is a compile error here rather
 * than props that silently go nowhere.
 *
 * The `Record<Exclude<keyof T, RegistryKey>, never>` intersection is doing that
 * work, and it is not redundant with the annotation. Annotating the literal
 * `ScenePropsMap` directly does *not* catch a bad key: `ScenePropsMap` is a
 * "weak" type (every property optional), and TypeScript only reports the
 * no-properties-in-common error for those when *nothing* matches - so
 * `{ hangull: …, leetype: … }` type-checks clean on the strength of `leetype`
 * alone, which is exactly the typo worth catching. Forcing any key outside the
 * union to be `never` turns it into a plain assignability error, which TS does
 * report.
 */
export function defineSceneProps<T extends ScenePropsMap>(
  map: T & Record<Exclude<keyof T, RegistryKey>, never>
): ScenePropsMap {
  return map
}

/**
 * Merge each panel's runtime props into the lifetimes the orchestrator is
 * about to render, by that panel's own `registry_key`.
 *
 * This replaces threading one `extraProps` bag through the viewport and
 * spreading it onto *every* panel regardless of key. That was wrong in both
 * directions: `hangul`'s `words`/`sessionKey`/`suspended` and `leetype`'s
 * `challenges` were landing on every unrelated panel as stray props, and the
 * viewport - a generic layout component - was the thing holding a bag of this
 * app's content concerns. Nothing in that bag was ever genuinely
 * cross-cutting; each member targeted exactly one key. So the association is
 * made here, statically, where both sides are known, and the viewport goes
 * back to rendering panels with the props they came with.
 *
 * Persisted scene props stay the base layer and runtime props win on
 * conflict - the same precedence `extraProps` had, since a stale value baked
 * into a saved scene should not beat what this render actually resolved.
 *
 * Untouched subtrees keep their identity all the way up, so a render that
 * injects nothing hands the orchestrator the very array it was given rather
 * than an equal copy.
 */
export function withSceneProps(
  lifetimes: Array<ActiveLifetime>,
  props: ScenePropsMap
): Array<ActiveLifetime> {
  const next = lifetimes.map((lifetime) => mergeLifetime(lifetime, props))
  return unchanged(next, lifetimes) ? lifetimes : next
}

function mergeLifetime(
  lifetime: ActiveLifetime,
  props: ScenePropsMap
): ActiveLifetime {
  const scene = lifetime.kind.Scene
  const ui = scene.ui
  if (!ui) return lifetime

  const merged = ui.map((layout) => mergeLayout(layout, props))
  if (unchanged(merged, ui)) return lifetime

  return { ...lifetime, kind: { Scene: { ...scene, ui: merged } } }
}

function mergeLayout(
  layout: UILayoutIntent,
  props: ScenePropsMap
): UILayoutIntent {
  const panels = layout.panels
  if (!panels) return layout

  const entries = Object.entries(panels)
  // Checked before rebuilding so a layout with nothing to inject keeps its
  // own identity, which is what lets the no-op case short-circuit above.
  const injectsSomething = entries.some(
    ([, panel]) => lookup(props, panel.registry_key) !== undefined
  )
  if (!injectsSomething) return layout

  return {
    ...layout,
    panels: Object.fromEntries(
      entries.map(([region, panel]): [string, PanelIntent] => {
        const injected = lookup(props, panel.registry_key)
        if (!injected) return [region, panel]
        return [region, { ...panel, props: { ...panel.props, ...injected } }]
      })
    ),
  }
}

function unchanged<T>(next: Array<T>, prev: Array<T>): boolean {
  return next.every((item, index) => item === prev[index])
}

/**
 * `registry_key` arrives as a plain `string` (it crosses the orchestrator's
 * zod boundary that way, and a persisted scene can name a key this build no
 * longer has), so the lookup is a guarded read rather than an index - and
 * `hasOwn`, not `in`, so a panel named `constructor` doesn't resolve to
 * something off `Object.prototype`.
 */
function lookup(
  props: ScenePropsMap,
  registryKey: string
): Record<string, unknown> | undefined {
  return Object.hasOwn(props, registryKey)
    ? // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- hasOwn just proved this string is one of the map's keys
      props[registryKey as RegistryKey]
    : undefined
}
