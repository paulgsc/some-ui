import { SOUNDS } from "@some-ui/video-render"
import { checkKit, KIT_SCHEMA, KitSchema } from "@video-motion/kit"
import type { Heard, Kit } from "@video-motion/kit"
import { describe, expect, it } from "vitest"

const SOURCE = "https://kenney.nl/assets/interface-sounds"
const sum = (c: string): string => c.repeat(64)

/** A kit naming every sound, `<sound>.ogg`, CC0, each heard as a short sound. */
function full(): { kit: Kit; heard: Map<string, Heard> } {
  const kit = KitSchema.parse({
    schema: KIT_SCHEMA,
    sounds: Object.fromEntries(
      SOUNDS.map((s) => [
        s,
        { file: `${s}.ogg`, source: SOURCE, licence: "CC0-1.0" },
      ])
    ),
  })
  const heard = new Map<string, Heard>(
    SOUNDS.map((s, i) => [
      `${s}.ogg`,
      { sha256: sum(String(i)), durationMs: 300, picture: false },
    ])
  )
  return { kit, heard }
}

describe("the sound kit (HYPER4)", () => {
  it("pins each of the six by its sum, under kit/, with a line for the issue", () => {
    const { kit, heard } = full()
    const checked = checkKit(kit, heard)
    if (!checked.ok) throw new Error(checked.problems.join("\n"))
    expect(Object.keys(checked.sounds)).toEqual([...SOUNDS])
    expect(checked.sounds.whoosh).toEqual({
      file: "kit/whoosh.ogg",
      sha256: sum("0"),
    })
    expect(checked.record[0]).toBe(
      `whoosh: whoosh.ogg, ${sum("0")}, 300 ms, from ${SOURCE}, CC0-1.0`
    )
  })

  it("refuses a kit missing a sound, or a licence other than CC0", () => {
    const { kit, heard } = full()
    const { ding: _, ...rest } = kit.sounds
    const pop = rest.pop
    if (!pop) throw new Error("the fixture names pop")
    const checked = checkKit(
      { ...kit, sounds: { ...rest, pop: { ...pop, licence: "CC-BY-4.0" } } },
      heard
    )
    expect(checked).toEqual({
      ok: false,
      problems: [
        "pop: pop.ogg is licensed CC-BY-4.0, and the kit takes only CC0-1.0",
        "ding: the kit names no file",
      ],
    })
  })

  it("refuses a file that is missing, unreadable, pictured or too long", () => {
    const { kit, heard } = full()
    heard.delete("click.ogg")
    heard.set("pop.ogg", { sha256: sum("p"), durationMs: null, picture: false })
    heard.set("thud.ogg", { sha256: sum("t"), durationMs: 200, picture: true })
    heard.set("riser.ogg", {
      sha256: sum("r"),
      durationMs: 9000,
      picture: false,
    })
    const checked = checkKit(kit, heard)
    expect(checked.ok ? [] : checked.problems).toEqual([
      "click: click.ogg is not in the kit's folder",
      "pop: pop.ogg is not a sound ffprobe can read",
      "thud: thud.ogg has a picture as well, and the kit takes sound alone",
      "riser: riser.ogg lasts 9000 ms, longer than a cue's 4000",
    ])
  })

  it("takes a file name in the folder, and a source on https", () => {
    const bad = (file: string, source = SOURCE): boolean =>
      !KitSchema.safeParse({
        schema: KIT_SCHEMA,
        sounds: { click: { file, source, licence: "CC0-1.0" } },
      }).success
    expect(bad("click.ogg")).toBe(false)
    expect(bad("../click.ogg")).toBe(true)
    expect(bad("sounds/click.ogg")).toBe(true)
    expect(bad("click.txt")).toBe(true)
    expect(bad("click.ogg", "http://kenney.nl/")).toBe(true)
  })
})
