/**
 * What each package entry reaches at runtime, from its source.
 *
 * The entries split the backends so an app's build carries only the ones it
 * passes to the session. That holds only while no entry imports another's
 * backend: a module reached from two entries is moved into a chunk they
 * share, and from there into every build that imports either, so one stray
 * import (a constant re-exported from an adapter, say) puts that whole
 * adapter back in every build, and no build fails. Type-only imports are
 * erased and do not count.
 */

import { dirname } from "path"
import { reachedFrom as reached } from "@some-ui/vite-config/vitest/source-graph"
import { describe, expect, it } from "vitest"

const SRC = dirname(new URL(import.meta.url).pathname)

/** Every source file `entry` reaches through runtime imports, relative to src. */
function reachedFrom(entry: string): ReadonlySet<string> {
  return reached(
    {
      src: SRC,
      // The package naming itself goes to the entry's source, as the build would.
      aliases: {
        "@some-ui/speech": "index.ts",
        "@some-ui/speech/": "",
        "@speech/": "",
      },
    },
    entry
  ).files
}

/** What belongs to one backend, and to no other entry. */
const BACKEND_MODULES = {
  http: ["lib/adapters/http/", "lib/engine/"],
  "web-speech": ["lib/adapters/web-speech/"],
  native: ["lib/adapters/native/"],
} as const

type Backend = keyof typeof BACKEND_MODULES

function isBackend(name: string): name is Backend {
  return name in BACKEND_MODULES
}

const BACKENDS: ReadonlyArray<Backend> =
  Object.keys(BACKEND_MODULES).filter(isBackend)

function backendOf(module: string): Backend | null {
  return (
    BACKENDS.find((backend) =>
      BACKEND_MODULES[backend].some((prefix) => module.startsWith(prefix))
    ) ?? null
  )
}

describe("package entries", () => {
  it("the main entry reaches no backend", () => {
    const leaks = [...reachedFrom("index.ts")].filter(
      (module) => backendOf(module) !== null
    )
    expect(leaks).toEqual([])
  })

  it.each(BACKENDS)(
    "the %s entry reaches its own backend and no other",
    (backend) => {
      const reached = [...reachedFrom(`${backend}.ts`)]
      const owners = new Set(reached.map(backendOf))

      // Its own adapter, so this cannot pass by reaching nothing at all.
      expect(reached).toContain(`${BACKEND_MODULES[backend][0]}index.ts`)
      expect([...owners].filter((owner) => owner !== null)).toEqual([backend])
    }
  )

  it("classifies everything a backend reaches that the main entry does not", () => {
    // Otherwise a module only one backend uses, outside the prefixes above,
    // is invisible to the tests before it: the main entry could start
    // importing it, moving it into a shared chunk, and nothing would fail.
    const main = reachedFrom("index.ts")
    const unclassified = BACKENDS.flatMap((backend) =>
      [...reachedFrom(`${backend}.ts`)].filter(
        (module) =>
          module !== `${backend}.ts` &&
          !main.has(module) &&
          backendOf(module) === null
      )
    )
    expect(unclassified).toEqual([])
  })
})
