/**
 * The step cache: a step is answered from what it kept when nothing that
 * decides its bytes changed, runs again when anything did, and keeps nothing
 * past its policy's budget, saying so.
 */

import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { nodePorts } from "@video-render/node"
import type { FfmpegCall } from "@video-render/plan"
import { DEFAULT_POLICY } from "@video-render/policy"
import type { RenderPolicy } from "@video-render/policy"
import type { BurnInRequest, Ports } from "@video-render/render"
import type { CacheFs } from "@video-render/step-cache"
import {
  keyOf,
  nodeCacheFs,
  stepCache,
  withCachedBurnIns,
  withCachedFfmpeg,
} from "@video-render/step-cache"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

let root = ""
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "step-cache-"))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const policy = (cacheBytes: number): RenderPolicy => ({
  ...DEFAULT_POLICY,
  cacheBytes,
})

const errno = (code: string): NodeJS.ErrnoException =>
  Object.assign(new Error(`${code}: injected`), { code })

/**
 * `stat` fails only inside the cache's folder, so the file being kept can
 * still be measured.
 */
function failing(
  codes: Partial<Record<"readdir" | "stat" | "mkdir", string>>
): CacheFs {
  return {
    ...nodeCacheFs,
    readdir: async (path): Promise<ReadonlyArray<string>> => {
      if (codes.readdir) throw errno(codes.readdir)
      return nodeCacheFs.readdir(path)
    },
    stat: async (path): Promise<{ readonly size: number }> => {
      if (codes.stat && path.startsWith(join(root, "steps"))) {
        throw errno(codes.stat)
      }
      return nodeCacheFs.stat(path)
    },
    mkdir: async (path): Promise<unknown> => {
      if (codes.mkdir) throw errno(codes.mkdir)
      return nodeCacheFs.mkdir(path)
    },
  }
}

/**
 * Real file ports with an ffmpeg that writes its output from its inputs'
 * bytes, counting each run.
 */
function ports(runs: Array<ReadonlyArray<string>>): Ports {
  const own = nodePorts(root)
  return {
    ...own,
    ffmpeg: async (
      call: FfmpegCall
    ): Promise<{ readonly ok: boolean; readonly stderr: string }> => {
      runs.push(call.args)
      const out = call.args.at(-1) ?? ""
      if (out === "-") return { ok: true, stderr: "measured" }
      const inputs = call.args.flatMap((a, i) =>
        call.args[i - 1] === "-i" ? [a] : []
      )
      const bodies = await Promise.all(
        inputs.map((f) => readFile(join(root, f), "utf8"))
      )
      await writeFile(join(root, out), `made from ${bodies.join("+")}`)
      return { ok: true, stderr: "" }
    },
  }
}

const call = (input: string, out: string): FfmpegCall => ({
  args: ["-i", input, "-c:v", "libx264", out],
})

describe("the step cache", () => {
  it("keeps a file under its key and gives it back, and nothing else", async () => {
    const warned: Array<string> = []
    const cache = stepCache(join(root, "steps"), policy(1_000), (l) =>
      warned.push(l)
    )
    await writeFile(join(root, "a.wav"), "take")
    expect(await cache.put("k1", ".wav", join(root, "a.wav"), "a.wav")).toBe(
      true
    )
    expect(await cache.get("k1", ".wav", join(root, "b.wav"))).toBe(true)
    expect(await readFile(join(root, "b.wav"), "utf8")).toBe("take")
    expect(await cache.get("k2", ".wav", join(root, "c.wav"))).toBe(false)
    expect(warned).toEqual([])
  })

  it("keeps nothing past its budget, says so, and leaves no partial file", async () => {
    const warned: Array<string> = []
    const cache = stepCache(join(root, "steps"), policy(10), (l) =>
      warned.push(l)
    )
    await writeFile(join(root, "big.mkv"), "x".repeat(11))
    expect(await cache.put("k", ".mkv", join(root, "big.mkv"), "big.mkv")).toBe(
      false
    )
    expect(warned).toHaveLength(1)
    expect(warned[0]).toContain("not cached: big.mkv")
    expect(warned[0]).toContain("policy")
    expect(await readdir(join(root, "steps")).catch(() => [])).toEqual([])
  })

  it("warns, never fails, when its folder cannot be made", async () => {
    const warned: Array<string> = []
    const cache = stepCache(
      join(root, "steps"),
      policy(1_000_000),
      (l) => warned.push(l),
      failing({ mkdir: "EACCES" })
    )
    await writeFile(join(root, "a.wav"), "take")
    expect(await cache.put("k", ".wav", join(root, "a.wav"), "a.wav")).toBe(
      false
    )
    expect(warned).toHaveLength(1)
    expect(warned[0]).toContain("not cached: a.wav: it could not be kept")
  })

  describe("VC1: a size it cannot count is never room", () => {
    const keep = async (fs: CacheFs): Promise<ReadonlyArray<string>> => {
      const warned: Array<string> = []
      await mkdir(join(root, "steps"), { recursive: true })
      await writeFile(join(root, "steps", "old.wav"), "kept before")
      await writeFile(join(root, "a.wav"), "take")
      const cache = stepCache(
        join(root, "steps"),
        policy(1_000_000),
        (l) => warned.push(l),
        fs
      )
      expect(await cache.put("k", ".wav", join(root, "a.wav"), "a.wav")).toBe(
        false
      )
      expect(await readdir(join(root, "steps"))).toEqual(["old.wav"])
      return warned
    }

    it("keeps nothing when its folder cannot be listed", async () => {
      const warned = await keep(failing({ readdir: "ENOTDIR" }))
      expect(warned).toHaveLength(1)
      expect(warned[0]).toContain(
        "not cached: a.wav: the cache's size is unknown, its folder could not be listed"
      )
      expect(warned[0]).toContain("ENOTDIR")
    })

    it("keeps nothing when an entry cannot be measured", async () => {
      const warned = await keep(failing({ stat: "EACCES" }))
      expect(warned).toHaveLength(1)
      expect(warned[0]).toContain(
        "not cached: a.wav: the cache's size is unknown, old.wav could not be measured"
      )
      expect(warned[0]).toContain("EACCES")
    })

    it("counts an entry gone since it was listed as nothing held", async () => {
      const warned: Array<string> = []
      await mkdir(join(root, "steps"), { recursive: true })
      await writeFile(join(root, "a.wav"), "take")
      const cache = stepCache(
        join(root, "steps"),
        policy(1_000),
        (l) => warned.push(l),
        {
          ...nodeCacheFs,
          readdir: (): Promise<ReadonlyArray<string>> =>
            Promise.resolve(["gone.wav"]),
        }
      )
      expect(await cache.put("k", ".wav", join(root, "a.wav"), "a.wav")).toBe(
        true
      )
      expect(warned).toEqual([])
    })
  })

  it("keys by what goes in, not by names", () => {
    expect(keyOf({ a: 1 })).toBe(keyOf({ a: 1 }))
    expect(keyOf({ a: 1 })).not.toBe(keyOf({ a: 2 }))
  })
})

describe("ffmpeg through the step cache", () => {
  const version = (): Promise<string> => Promise.resolve("ffmpeg version 6.1.1")

  it("runs a step once for the same inputs, again when an input's bytes change", async () => {
    const runs: Array<ReadonlyArray<string>> = []
    const warned: Array<string> = []
    const cached = withCachedFfmpeg(
      ports(runs),
      root,
      stepCache(join(root, "steps"), policy(1_000_000), (l) => warned.push(l)),
      version
    )
    await writeFile(join(root, "in.png"), "still")
    await cached.ffmpeg(call("in.png", "s1.mkv"))
    await rm(join(root, "s1.mkv"))
    await cached.ffmpeg(call("in.png", "s1.mkv"))
    expect(runs).toHaveLength(1)
    expect(await readFile(join(root, "s1.mkv"), "utf8")).toBe("made from still")
    // A scene renamed: same inputs and arguments, another output name.
    await cached.ffmpeg(call("in.png", "renamed.mkv"))
    expect(runs).toHaveLength(1)
    // An input's bytes changed: the step runs again.
    await writeFile(join(root, "in.png"), "edited")
    await cached.ffmpeg(call("in.png", "s1.mkv"))
    expect(runs).toHaveLength(2)
    expect(await readFile(join(root, "s1.mkv"), "utf8")).toBe(
      "made from edited"
    )
    expect(warned).toEqual([])
  })

  it("always runs a step that writes nothing, since what it says is on stderr", async () => {
    const runs: Array<ReadonlyArray<string>> = []
    const cached = withCachedFfmpeg(
      ports(runs),
      root,
      stepCache(join(root, "steps"), policy(1_000_000), () => undefined),
      version
    )
    await writeFile(join(root, "voice.wav"), "voice")
    const measure: FfmpegCall = {
      args: ["-i", "voice.wav", "-af", "loudnorm", "-f", "null", "-"],
    }
    expect((await cached.ffmpeg(measure)).stderr).toBe("measured")
    expect((await cached.ffmpeg(measure)).stderr).toBe("measured")
    expect(runs).toHaveLength(2)
  })

  it("over its budget, runs every step uncached and warns each time", async () => {
    const runs: Array<ReadonlyArray<string>> = []
    const warned: Array<string> = []
    const cached = withCachedFfmpeg(
      ports(runs),
      root,
      stepCache(join(root, "steps"), policy(5), (l) => warned.push(l)),
      version
    )
    await writeFile(join(root, "in.png"), "still")
    await cached.ffmpeg(call("in.png", "s1.mkv"))
    await cached.ffmpeg(call("in.png", "s1.mkv"))
    expect(runs).toHaveLength(2)
    expect(warned).toHaveLength(2)
  })
})

describe("burn-ins through the step cache", () => {
  const caption = (over: Partial<BurnInRequest> = {}): BurnInRequest => ({
    kind: "captions",
    design: "broadcast",
    params: { lines: [{ words: [{ text: "Hi.", startMs: 300, endMs: 600 }] }] },
    startFrame: 0,
    frames: 45,
    frame: { width: 1920, height: 1080, fps: 30 },
    out: "burn-in-open-captions.mov",
    ...over,
  })

  it("records a scene's captions once for its words, again when they change", async () => {
    const drawn: Array<string> = []
    const cached = withCachedBurnIns(
      {
        ...nodePorts(root),
        recordBurnIn: async (r): Promise<boolean> => {
          drawn.push(r.out)
          await writeFile(join(root, r.out), JSON.stringify(r.params))
          return true
        },
      },
      root,
      stepCache(join(root, "steps"), policy(1_000_000), () => undefined)
    )
    expect(await cached.recordBurnIn?.(caption())).toBe(true)
    // The same scene later in the video, under another name: kept.
    expect(
      await cached.recordBurnIn?.(
        caption({ startFrame: 90, out: "burn-in-moved-captions.mov" })
      )
    ).toBe(true)
    expect(drawn).toEqual(["burn-in-open-captions.mov"])
    expect(
      await readFile(join(root, "burn-in-moved-captions.mov"), "utf8")
    ).toBe(JSON.stringify(caption().params))
    // Each of what it draws, changed, records again.
    for (const over of [
      {
        params: {
          lines: [{ words: [{ text: "Hi.", startMs: 310, endMs: 600 }] }],
        },
      },
      { design: "gridiron" },
      { frames: 46 },
      { frame: { width: 1080, height: 1920, fps: 30 } },
    ])
      await cached.recordBurnIn?.(caption(over))
    expect(drawn).toHaveLength(5)
  })

  it("keeps nothing that did not record", async () => {
    let runs = 0
    const cached = withCachedBurnIns(
      {
        ...nodePorts(root),
        recordBurnIn: (): Promise<boolean> => {
          runs++
          return Promise.resolve(false)
        },
      },
      root,
      stepCache(join(root, "steps"), policy(1_000_000), () => undefined)
    )
    expect(await cached.recordBurnIn?.(caption())).toBe(false)
    expect(await cached.recordBurnIn?.(caption())).toBe(false)
    expect(runs).toBe(2)
  })
})
