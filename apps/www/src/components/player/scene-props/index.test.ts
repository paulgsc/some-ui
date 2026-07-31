import type { ActiveLifetime } from "@some-ui/types"
import { describe, expect, it } from "vitest"

import type { ScenePropsMap } from "."
import { defineSceneProps, withSceneProps } from "."

/**
 * These pin the property the `extraProps` bag did not have: runtime props
 * reach *only* the panel whose `registry_key` consumes them. Under the old
 * design `words`/`sessionKey`/`suspended`/`challenges` were spread onto every
 * rendered panel, so an unrelated component received all of them as stray
 * props and the layout viewport held content concerns it could not interpret.
 */
type TestPanel = { registry_key: string; props?: Record<string, unknown> }

function lifetime(panels: Record<string, TestPanel>, id = 1): ActiveLifetime {
  return {
    id,
    started_at: 0,
    kind: {
      Scene: {
        scene_id: `scene-${id}`,
        scene_name: `scene-${id}`,
        duration: 0,
        ui: [{ panels }],
      },
    },
  }
}

function panelsOf(
  lifetimes: Array<ActiveLifetime>,
  index = 0
): Record<string, TestPanel> {
  return lifetimes[index].kind.Scene.ui![0].panels!
}

const PROPS: ScenePropsMap = {
  hangul: { words: ["사과"], sessionKey: "s-1", suspended: false },
  leetype: { challenges: ["ex-1"], challengesPending: false },
}

describe("withSceneProps", () => {
  it("injects a panel's props by its own registry key", () => {
    const result = withSceneProps(
      [lifetime({ main: { registry_key: "hangul" } })],
      PROPS
    )

    expect(panelsOf(result).main.props).toEqual({
      words: ["사과"],
      sessionKey: "s-1",
      suspended: false,
    })
  })

  it("leaves an unrelated panel's props untouched", () => {
    const result = withSceneProps(
      [
        lifetime({
          main: { registry_key: "hangul" },
          sidebar: { registry_key: "neon" },
        }),
      ],
      PROPS
    )

    // The whole point: `neon` never sees hangul's words or leetype's corpus.
    expect(panelsOf(result).sidebar.props).toBeUndefined()
  })

  it("gives each keyed panel only its own props, never the other's", () => {
    const result = withSceneProps(
      [
        lifetime({
          main: { registry_key: "hangul" },
          footer: { registry_key: "leetype" },
        }),
      ],
      PROPS
    )

    expect(Object.keys(panelsOf(result).main.props!)).toEqual([
      "words",
      "sessionKey",
      "suspended",
    ])
    expect(Object.keys(panelsOf(result).footer.props!)).toEqual([
      "challenges",
      "challengesPending",
    ])
  })

  it("keeps persisted scene props and lets runtime props win a conflict", () => {
    const result = withSceneProps(
      [
        lifetime({
          main: {
            registry_key: "hangul",
            props: { mode: "vocabulary", words: [] },
          },
        }),
      ],
      PROPS
    )

    expect(panelsOf(result).main.props).toEqual({
      mode: "vocabulary",
      // A stale value baked into a saved scene must not beat what this render
      // actually resolved.
      words: ["사과"],
      sessionKey: "s-1",
      suspended: false,
    })
  })

  it("applies across every active lifetime, not just the first", () => {
    const result = withSceneProps(
      [
        lifetime({ main: { registry_key: "neon" } }, 1),
        lifetime({ main: { registry_key: "leetype" } }, 2),
      ],
      PROPS
    )

    expect(panelsOf(result, 1).main.props).toEqual({
      challenges: ["ex-1"],
      challengesPending: false,
    })
  })

  it("ignores a registry key this build no longer has", () => {
    // Persisted scenes outlive registry renames, and `registry_key` crosses
    // the orchestrator's zod boundary as a plain string.
    const result = withSceneProps(
      [lifetime({ main: { registry_key: "retired-panel" } })],
      PROPS
    )

    expect(panelsOf(result).main.props).toBeUndefined()
  })

  it("does not treat an inherited Object property as a registry key", () => {
    const result = withSceneProps(
      [lifetime({ main: { registry_key: "constructor" } })],
      PROPS
    )

    expect(panelsOf(result).main.props).toBeUndefined()
  })

  it("returns the same array identity when nothing matched", () => {
    // The orchestrator re-renders off this array; a fresh identity per render
    // for a no-op would remount panels needlessly.
    const input = [lifetime({ main: { registry_key: "neon" } })]

    expect(withSceneProps(input, PROPS)).toBe(input)
  })

  it("returns the same array identity for an empty props map", () => {
    const input = [lifetime({ main: { registry_key: "hangul" } })]

    expect(withSceneProps(input, {})).toBe(input)
  })

  it("tolerates a lifetime with no ui at all", () => {
    const bare: ActiveLifetime = {
      id: 9,
      started_at: 0,
      kind: {
        Scene: { scene_id: "bare", scene_name: "bare", duration: 0 },
      },
    }

    expect(withSceneProps([bare], PROPS)).toEqual([bare])
  })
})

describe("defineSceneProps", () => {
  it("passes a valid map through unchanged", () => {
    const map = defineSceneProps({
      hangul: { words: ["사과"] },
      leetype: { challenges: [] },
    })

    expect(map).toEqual({
      hangul: { words: ["사과"] },
      leetype: { challenges: [] },
    })
  })

  it("accepts an empty map", () => {
    expect(defineSceneProps({})).toEqual({})
  })

  // The guard this exists for is a *compile-time* one and cannot be asserted
  // at runtime: a key outside the registry union resolves to `never`, so
  // `defineSceneProps({ hangull: {...} })` fails `tsc`. `@ts-expect-error`
  // below is the assertion - it fails the typecheck if the key ever stops
  // being rejected.
  it("rejects a key outside the registry union at compile time", () => {
    const map = defineSceneProps({
      // @ts-expect-error -- 'hangull' is not a RegistryKey; removing this
      // directive must make `pnpm typecheck` fail, which is the whole point.
      hangull: { words: ["사과"] },
    })

    expect(map).toEqual({ hangull: { words: ["사과"] } })
  })
})
