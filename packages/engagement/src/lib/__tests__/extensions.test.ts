import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { EXTENSIONS } from "@engagement/lib/extensions"
import { describe, expect, it } from "vitest"

/** The repo's `extensions/`, from this file in `packages/engagement/src/lib/__tests__/`. */
const ROOT = new URL("../../../../../extensions/", import.meta.url).pathname

/** Each folder there that ships an extension: one with a manifest. */
function shipped(): Array<string> {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) =>
      ["manifest.json", "manifest.firefox.json"].some((file) =>
        existsSync(join(ROOT, name, "public", file))
      )
    )
    .sort()
}

describe("the browser extensions", () => {
  it("says of each one whether it has an offer worth measuring", () => {
    const found = shipped()
    // Scanning the wrong folder would pass on nothing.
    expect(found.length).toBeGreaterThan(3)
    expect(EXTENSIONS.map((e) => e.id).sort()).toEqual(found)
    for (const e of EXTENSIONS) expect(e.why.trim()).not.toBe("")
  })
})
