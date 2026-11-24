/**
 * A reading line is marked busy, so a screen reader hears its region is
 * still loading and Snips Capture waits for it before a picture (#3491);
 * and every screen's reading line is this one, so none is photographed
 * half-read.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Reading } from "."

/** Every `.tsx` under `dir`, its tests left out. */
function sources(dir: string): Array<string> {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name === "node_modules" || name === "dist") return []
    if (statSync(path).isDirectory()) return sources(path)
    return name.endsWith(".tsx") && !name.includes(".test.") ? [path] : []
  })
}

describe("a reading line (#3491)", () => {
  it("is a status marked busy, in the caller's words", () => {
    render(<Reading>Asking home…</Reading>)
    const line = screen.getByRole("status")
    expect(line.textContent).toBe("Asking home…")
    expect(line.getAttribute("aria-busy")).toBe("true")
  })

  it("is every screen's reading line: none is drawn as a bare paragraph", () => {
    const root = join(import.meta.dirname, "../../../../../../..")
    const bare =
      /<p className="text-muted-foreground text-sm">\s*\{[A-Za-z_.]+\.reading\}\s*<\/p>/
    const found = [
      ...sources(join(root, "apps/www/src")),
      ...sources(join(root, "packages/ui")),
    ].filter((file) => bare.test(readFileSync(file, "utf8")))
    expect(found).toEqual([])
  })
})
