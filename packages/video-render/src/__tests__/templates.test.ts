/**
 * The templates Studio lists (SFEED1): one per folder under `templates/`
 * that pins a format, each read as its newest pinned version, so a version
 * pinned and not listed fails here.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { versionOfFile } from "@video-render/series"
import {
  isTemplateId,
  TEMPLATE_IDS,
  templateFormat,
} from "@video-render/templates"
import { describe, expect, it } from "vitest"

const DIR = join(import.meta.dirname, "../templates")

/** The newest version pinned in `id`'s folder, as its file holds it. */
function newestPin(id: string): unknown {
  const newest = readdirSync(join(DIR, id))
    .map((file) => ({ file, version: versionOfFile(file) }))
    .filter((f): f is { file: string; version: number } => f.version !== null)
    .sort((a, b) => a.version - b.version)
    .at(-1)
  if (newest === undefined) return null
  return JSON.parse(readFileSync(join(DIR, id, newest.file), "utf8"))
}

describe("the templates Studio lists", () => {
  it("are every folder that pins a format, A to Z", () => {
    const folders = readdirSync(DIR).filter((id) => newestPin(id) !== null)
    expect([...TEMPLATE_IDS]).toEqual([...folders].sort())
  })

  it.each(TEMPLATE_IDS)("%s is its newest pinned version", (id) => {
    expect(templateFormat(id)).toEqual(newestPin(id))
    expect(templateFormat(id).id).toBe(id)
  })

  it("names only those", () => {
    expect(isTemplateId("conference-call")).toBe(true)
    expect(isTemplateId("promo")).toBe(false)
    expect(isTemplateId(undefined)).toBe(false)
  })
})
