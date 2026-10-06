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
 * Build a `ScenePropsMap` with its keys checked against the registry's union,
 * so a misspelled panel is a compile error. The `Record<Exclude<…>, never>`
 * intersection does that: `ScenePropsMap` is a weak type (all optional), and
 * TS only reports a weak-type mismatch when *no* key matches, so
 * `{ hangull: …, leetype: … }` would pass on `leetype` alone.
 */
export function defineSceneProps<T extends ScenePropsMap>(
  map: T & Record<Exclude<keyof T, RegistryKey>, never>
): ScenePropsMap {
  return map
}

/**
 * Merge each panel's runtime props into the lifetimes the orchestrator is
 * about to render, by that panel's own `registry_key`, so no panel receives
 * another's props and the viewport holds no app content concerns.
 *
 * Runtime props win over persisted scene props: a stale saved value should
 * not beat what this render resolved. Untouched subtrees keep their identity,
 * so a render that injects nothing returns the very array it was given.
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
  // identity.
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
 * `registry_key` is a plain `string` (a persisted scene can name a key this
 * build lacks), so the lookup is guarded, with `hasOwn` so `constructor`
 * doesn't resolve off `Object.prototype`.
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
