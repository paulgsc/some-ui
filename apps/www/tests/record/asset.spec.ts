/**
 * An episode's asset made alone (ASSETS-R, C1300), where things go wrong
 * (`./asset-make`): a thumbnail made from an episode's folder is written only
 * to the work folder, whole, the same bytes each time; one already there is
 * never overwritten; a folder it can't read leaves nothing; and each genre's
 * folder, named by the key home puts it in place under, reads as its facts.
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
  symlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import type { Browser } from "@playwright/test"
import { expect, test } from "@playwright/test"

import { madePath, makeAsset } from "./asset-make"
import { launchChromium } from "./command"
import {
  callPartOf,
  FACTS_FROM_FOLDER,
  playoffDeltaKeyOf,
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

test("refuses a work folder that is the episode's folder, or inside it", async () => {
  const before = await snapshot(root)
  for (const out of [root, join(root, "work")]) {
    await mkdir(out, { recursive: true })
    const made = await makeAsset(browser, "thumbnail", "cards-essay", root, out)
    expect(made.ok).toBe(false)
  }
  await rm(join(root, "work"), { recursive: true })
  const linked = join(base, "linked-root")
  await symlink(root, linked)
  expect(
    (await makeAsset(browser, "thumbnail", "cards-essay", root, linked)).ok
  ).toBe(false)
  expect(await snapshot(root)).toEqual(before)
})

test("writes through no partial already in the work folder, a link included", async () => {
  const out = await workDir("planted")
  const target = join(base, "not-ours.txt")
  await writeFile(target, "keep me")
  await symlink(target, join(out, ".thumbnail.png.partial"))
  const made = await makeAsset(browser, "thumbnail", "cards-essay", root, out)
  expect(made.ok).toBe(true)
  expect(await readFile(target, "utf8")).toBe("keep me")
  expect((await readdir(out)).sort()).toEqual([
    ".thumbnail.png.partial",
    "thumbnail.png",
  ])
})

test("two makes into one work folder leave one whole thumbnail", async () => {
  const out = await workDir("raced")
  const [a, b] = await Promise.all([
    makeAsset(browser, "thumbnail", "cards-essay", root, out),
    makeAsset(browser, "thumbnail", "cards-essay", root, out),
  ])
  expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1)
  expect(await readdir(out)).toEqual(["thumbnail.png"])
  const alone = await workDir("alone")
  await makeAsset(browser, "thumbnail", "cards-essay", root, alone)
  expect(sha(await readFile(madePath(out, "thumbnail")))).toBe(
    sha(await readFile(madePath(alone, "thumbnail")))
  )
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
  const gone = await makeAsset(
    browser,
    "thumbnail",
    "cards-essay",
    join(base, "renders", "never-there-2026-11-14"),
    out
  )
  expect(gone.ok).toBe(false)
  if (!gone.ok) expect(gone.problems.join(" ")).toContain("can't be reached")
  const wrong = await makeAsset(browser, "thumbnail", "report", root, out)
  expect(wrong.ok).toBe(false)
  expect(await readdir(out)).toEqual([])
})

test("reads each genre's folder, under the key home puts it in place by, as its facts", async () => {
  const pd = join(base, "renders", "2025-SF-07")
  const legend = join(base, "renders", "2025-SF-00")
  expect(await FACTS_FROM_FOLDER["playoff-delta"](pd)).toEqual({
    ok: true,
    value: { genre: "playoff-delta", season: "2025", week: 7 },
  })
  expect(await FACTS_FROM_FOLDER["playoff-delta"](legend)).toEqual({
    ok: true,
    value: { genre: "playoff-delta", season: "2025", week: "legend" },
  })
  expect(playoffDeltaKeyOf("2025-SF-7")).toBeNull()
  expect(playoffDeltaKeyOf("SF-07")).toBeNull()
  expect(callPartOf("2026-11-06")).toBe(1)
  expect(callPartOf("2026-11-06-p2")).toBe(2)
  expect(callPartOf("part-2")).toBeNull()
  expect(await FACTS_FROM_FOLDER["cards-essay"](root)).toEqual({
    ok: true,
    value: {
      genre: "cards-essay",
      title: "NixOS: how this machine upgrades itself",
    },
  })
})
