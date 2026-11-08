import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { placeBrandFiles } from "@video-render/node"
import { series } from "@video-render/testing"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

let base = ""
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "brand-"))
})
afterEach(async () => {
  await rm(base, { recursive: true, force: true })
})

/** Home's brand folder: the bed at its top, the kit under `sounds/`. */
async function brandFolder(files: Record<string, string>): Promise<string> {
  const brand = join(base, "brand")
  for (const [name, body] of Object.entries(files)) {
    await mkdir(join(brand, name, ".."), { recursive: true })
    await writeFile(join(brand, name), body)
  }
  return brand
}

describe("placing a series' brand files in a video's folder (HYPER4)", () => {
  it("copies the bed from the brand folder and each sound from its sounds/", async () => {
    const brand = await brandFolder({
      "bed.wav": "bed",
      "sounds/click.wav": "click",
      "sounds/whoosh.wav": "whoosh",
    })
    const root = join(base, "video")
    const placed = await placeBrandFiles(series(), brand, root)
    expect(placed).toEqual({ ok: true, value: { bed: true, sounds: 2 } })
    expect(await readFile(join(root, "kit/bed.wav"), "utf8")).toBe("bed")
    expect(await readFile(join(root, "kit/click.wav"), "utf8")).toBe("click")
    expect(await readFile(join(root, "kit/whoosh.wav"), "utf8")).toBe("whoosh")
  })

  it("needs no brand folder for a series that names no files", async () => {
    const placed = await placeBrandFiles(
      series({ music: undefined, sounds: {} }),
      undefined,
      join(base, "video")
    )
    expect(placed).toEqual({ ok: true, value: { bed: false, sounds: 0 } })
  })

  it("refuses without a brand folder, naming what the series needs", async () => {
    const placed = await placeBrandFiles(
      series({ music: undefined }),
      undefined,
      join(base, "video")
    )
    expect(placed).toEqual({
      ok: false,
      problems: [
        "The series names the click sound, the whoosh sound, and no brand folder was given to hold them",
      ],
    })
  })

  it("names each file the brand folder lacks", async () => {
    const brand = await brandFolder({
      "bed.wav": "bed",
      "sounds/click.wav": "c",
    })
    const placed = await placeBrandFiles(series(), brand, join(base, "video"))
    expect(placed).toEqual({
      ok: false,
      problems: [
        `the whoosh sound: ${join(brand, "sounds/whoosh.wav")} can't be read`,
      ],
    })
  })
})
