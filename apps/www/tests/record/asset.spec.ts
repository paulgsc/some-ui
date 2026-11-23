/**
 * An episode's asset made alone (ASSETS-R, C1300), where things go wrong
 * (`./asset-make`): a thumbnail made from an episode's folder is written only
 * to the work folder, whole, the same bytes each time; one already there is
 * never overwritten; a folder it can't read leaves nothing; and each genre's
 * folder name its recorder writes reads back as the same facts.
 *
 * Needs only the browser. The episode is the sample cards essay
 * (`nixos-upgrade`), as a cards essay's folder on home keeps it: its cut list
 * as `essay.json` and `cut-list.json`, in a folder named by its key.
 */

import { createHash } from "node:crypto"
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import type { Browser } from "@playwright/test"
import { expect, test } from "@playwright/test"

import { madePath, makeAsset } from "./asset-make"
import { launchChromium } from "./command"
import {
  callPartFolder,
  FACTS_FROM_FOLDER,
  playoffDeltaFolder,
} from "./thumbnail-facts"

const SAMPLE = resolve(
  import.meta.dirname,
  "../../../../packages/video-render/src/sample/videos/nixos-upgrade/cut-list.json"
)
const KEY = "nixos-upgrade-2026-11-14"

const sha = (bytes: Buffer): string =>
  createHash("sha256").update(bytes).digest("hex")

/** Every file under `dir`, with its bytes' hash. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const name of await readdir(dir, { recursive: true })) {
    const bytes = await readFile(join(dir, name)).catch(() => null)
    if (bytes !== null) out[name] = sha(bytes)
  }
  return out
}

let browser: Browser
let base: string
let root: string

test.beforeAll(async () => {
  browser = await launchChromium()
  base = await mkdtemp(join(tmpdir(), "asset-make-"))
  root = join(base, "renders", KEY)
  await mkdir(root, { recursive: true })
  await cp(SAMPLE, join(root, "essay.json"))
  await cp(SAMPLE, join(root, "cut-list.json"))
})

test.afterAll(async () => {
  await browser.close()
  await rm(base, { recursive: true, force: true })
})

const workDir = async (name: string): Promise<string> => {
  const dir = join(base, name)
  await mkdir(dir, { recursive: true })
  return dir
}

test("makes a thumbnail into the work folder alone, whole, and leaves the episode's folder as it was", async () => {
  const before = await snapshot(root)
  const out = await workDir("first")
  const made = await makeAsset(browser, "thumbnail", "cards-essay", root, out)
  expect(made).toEqual({ ok: true, value: madePath(out, "thumbnail") })
  expect(await readdir(out)).toEqual(["thumbnail.png"])
  expect(await snapshot(root)).toEqual(before)
  const png = await readFile(madePath(out, "thumbnail"))
  expect(png.subarray(1, 4).toString("ascii")).toBe("PNG")
})

test("makes the same bytes from the same folder", async () => {
  const one = await workDir("one")
  const two = await workDir("two")
  await makeAsset(browser, "thumbnail", "cards-essay", root, one)
  await makeAsset(browser, "thumbnail", "cards-essay", root, two)
  expect(sha(await readFile(madePath(one, "thumbnail")))).toBe(
    sha(await readFile(madePath(two, "thumbnail")))
  )
})

test("never overwrites a thumbnail already in the work folder", async () => {
  const out = await workDir("kept")
  await writeFile(madePath(out, "thumbnail"), "the owner's")
  const made = await makeAsset(browser, "thumbnail", "cards-essay", root, out)
  expect(made.ok).toBe(false)
  expect(await readFile(madePath(out, "thumbnail"), "utf8")).toBe("the owner's")
  expect(await readdir(out)).toEqual(["thumbnail.png"])
})

test("makes nothing from a folder it can't read, and says why", async () => {
  const bare = join(base, "renders", "bare-2026-11-14")
  await mkdir(bare, { recursive: true })
  await cp(SAMPLE, join(bare, "essay.json"))
  const out = await workDir("bare-out")
  const made = await makeAsset(browser, "thumbnail", "cards-essay", bare, out)
  expect(made.ok).toBe(false)
  if (!made.ok) expect(made.problems.join(" ")).toContain("cut-list.json")
  expect(await readdir(out)).toEqual([])
  const wrong = await makeAsset(browser, "thumbnail", "report", root, out)
  expect(wrong.ok).toBe(false)
  expect(await readdir(out)).toEqual([])
})

test("reads each genre's folder name, as its recorder writes it, back as its facts", async () => {
  const pd = join(base, "renders", playoffDeltaFolder("2025", 7))
  const legend = join(base, "renders", playoffDeltaFolder("2025", 0))
  expect(await FACTS_FROM_FOLDER["playoff-delta"](pd)).toEqual({
    ok: true,
    value: { genre: "playoff-delta", season: "2025", week: 7 },
  })
  expect(await FACTS_FROM_FOLDER["playoff-delta"](legend)).toEqual({
    ok: true,
    value: { genre: "playoff-delta", season: "2025", week: "legend" },
  })
  expect(callPartFolder(2)).toBe("part-2")
  expect(await FACTS_FROM_FOLDER["cards-essay"](root)).toEqual({
    ok: true,
    value: {
      genre: "cards-essay",
      title: "NixOS: how this machine upgrades itself",
    },
  })
})
