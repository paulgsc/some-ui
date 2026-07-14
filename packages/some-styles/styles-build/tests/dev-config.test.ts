import { describe, expect, it } from "vitest"

import { createStylePlugins } from "../dev-config.js"
import type { StyleContext } from "../types.js"

const context: StyleContext = {
  default: { content: ["src/**/*.tsx"] },
}

describe("createStylePlugins", () => {
  it("returns the source-injector BEFORE the Tailwind plugin", () => {
    // Order matters: the injector must transform the Tailwind entry (append
    // @source) before @tailwindcss/vite reads it. A regression here silently
    // drops every out-of-app source from the scan — the app compiles only its
    // own utilities and every package component renders unstyled.
    const names = createStylePlugins(context).map((p) => p.name)
    expect(names[0]).toBe("some-ui-styles:source-injector")
    expect(names).toContain("@tailwindcss/vite:scan")
  })
})
