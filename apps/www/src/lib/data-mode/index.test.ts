import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * `DATA_MODE` is a module-level constant folded at build time, so each case
 * re-imports the module with a different env rather than calling a function.
 *
 * Worth pinning despite being a one-line ternary: getting it backwards fails
 * silently and asymmetrically. Flipped one way, GitHub Pages issues fetches
 * for files that were never deployed; flipped the other, `vite dev` and the
 * Docker image stop reading the content a developer just generated and quietly
 * serve demo seeds instead. Neither shows up as an error.
 */
type DataModeModule = {
  DATA_MODE: "static" | "server"
  FETCHES_CONTENT: boolean
}

async function loadDataMode(): Promise<DataModeModule> {
  vi.resetModules()
  return import(".")
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe("DATA_MODE", () => {
  it("is static only when the Pages workflow's flag is set", async () => {
    vi.stubEnv("VITE_STATIC_DATA", "true")

    const { DATA_MODE, FETCHES_CONTENT } = await loadDataMode()

    expect(DATA_MODE).toBe("static")
    expect(FETCHES_CONTENT).toBe(false)
  })

  it("fetches when the flag is unset - vite dev, vite preview, and Docker", async () => {
    vi.stubEnv("VITE_STATIC_DATA", undefined)

    const { DATA_MODE, FETCHES_CONTENT } = await loadDataMode()

    expect(DATA_MODE).toBe("server")
    expect(FETCHES_CONTENT).toBe(true)
  })

  it("fetches when the flag is explicitly false", async () => {
    vi.stubEnv("VITE_STATIC_DATA", "false")

    const { DATA_MODE } = await loadDataMode()

    expect(DATA_MODE).toBe("server")
  })

  it('does not treat any non-"true" string as static', async () => {
    // Vite inlines env vars verbatim as strings, so a truthiness check here
    // would make "false" and "0" both mean static.
    vi.stubEnv("VITE_STATIC_DATA", "0")

    const { DATA_MODE } = await loadDataMode()

    expect(DATA_MODE).toBe("server")
  })
})
