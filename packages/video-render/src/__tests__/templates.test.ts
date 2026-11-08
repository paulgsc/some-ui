/**
 * The templates Studio lists (SFEED1): one per folder under `templates/`
 * that pins a format, each its newest pinned version, so a version pinned
 * and not listed fails here.
 */
import { readdirSync } from "node:fs"
import { join } from "node:path"
import { readFormat, readSeries, TEMPLATES_DIR } from "@video-render/node"
import {
  isTemplateId,
  TEMPLATE_IDS,
  TEMPLATE_SERIES,
  templateCaptions,
  templateFormat,
} from "@video-render/templates"
import { describe, expect, it } from "vitest"

describe("the templates Studio lists", () => {
  it("are every folder that pins a format, each its newest version", async () => {
    const pinned: Array<string> = []
    for (const id of readdirSync(TEMPLATES_DIR).sort()) {
      const newest = await readFormat(join(TEMPLATES_DIR, id))
      if (!newest.ok) continue
      pinned.push(id)
      expect(isTemplateId(id) && templateFormat(id)).toEqual(newest.value)
    }
    expect(pinned).toEqual([...TEMPLATE_IDS])
  })
})

describe("the look each template is captioned in", () => {
  it("is the one its series' newest version names", async () => {
    for (const id of TEMPLATE_IDS) {
      const newest = await readSeries(
        join(import.meta.dirname, "../sample/series", TEMPLATE_SERIES[id])
      )
      expect(newest.ok && templateCaptions(id)).toBe(
        newest.ok && (newest.value.designs.captions ?? null)
      )
    }
    expect(templateCaptions("conference-call")).toBe("broadcast")
  })
})
