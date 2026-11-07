/**
 * A render's step cache (paulgsc/some-ui#2635): each step's output kept under
 * a key made from everything that decides its bytes, so a retry runs only
 * the steps whose inputs changed, and a step that failed is the one that runs
 * again.
 *
 * Why a key is enough: every ffmpeg call the renderer plans gives the same
 * bytes for the same arguments and input bytes on any machine (VR1 pins its
 * threads, BITEXACT its metadata), so the key is the call's arguments with
 * each input file named by the SHA-256 of its bytes, its output by its place,
 * and ffmpeg's version. A take is keyed by its words, its voice and the
 * speaker's model.
 *
 * What it may hold is policy (`RenderPolicy.cacheBytes`): a step that would
 * take the cache past it runs and is not kept, with a warning, never a
 * failure. Entries are written to a temporary name and renamed into place,
 * so a step killed half way leaves nothing that reads as kept. A kept file is
 * copied out, never linked: ffmpeg's `-y` rewrites a file in place, which
 * would change a linked entry.
 */

import { createHash } from "node:crypto"
import { copyFile, mkdir, readdir, rename, rm, stat } from "node:fs/promises"
import { extname, isAbsolute, join, resolve } from "node:path"

import type { RenderPolicy } from "./policy"
import { overBudget } from "./policy"
import type { Ports } from "./render"

export type StepCache = {
  /** Copies the file kept under `key` to `to`; false when none is kept. */
  readonly get: (key: string, ext: string, to: string) => Promise<boolean>
  /**
   * Keeps a copy of `from` under `key` when the budget allows; false, with
   * a warning naming `what`, when it would pass it.
   */
  readonly put: (
    key: string,
    ext: string,
    from: string,
    what: string
  ) => Promise<boolean>
}

/** A key for `parts`: the SHA-256 of their JSON. */
export const keyOf = (parts: unknown): string =>
  createHash("sha256").update(JSON.stringify(parts)).digest("hex")

const TEMPORARY = ".partial"

async function heldBytes(dir: string): Promise<number> {
  let names: Array<string>
  try {
    names = await readdir(dir)
  } catch {
    // Ignored: no folder yet means nothing is kept, which is zero bytes.
    return 0
  }
  let total = 0
  for (const name of names) {
    try {
      total += (await stat(join(dir, name))).size
    } catch {
      // Ignored: gone since it was listed, so it holds nothing now.
    }
  }
  return total
}

/** A step cache in `dir`, held to `policy.cacheBytes`. */
export function stepCache(
  dir: string,
  policy: RenderPolicy,
  warn: (line: string) => void
): StepCache {
  const kept = (key: string, ext: string): string => join(dir, `${key}${ext}`)
  return {
    get: async (key, ext, to): Promise<boolean> => {
      try {
        await copyFile(kept(key, ext), to)
        return true
      } catch {
        // Ignored: nothing kept under this key, so the step runs.
        return false
      }
    },
    put: async (key, ext, from, what): Promise<boolean> => {
      let bytes: number
      try {
        bytes = (await stat(from)).size
      } catch (error) {
        warn(`not cached: ${what}: it could not be read (${String(error)})`)
        return false
      }
      const held = await heldBytes(dir)
      if (held + bytes > policy.cacheBytes) {
        warn(overBudget(what, bytes, held, policy))
        return false
      }
      await mkdir(dir, { recursive: true })
      const path = kept(key, ext)
      const partial = `${path}${TEMPORARY}`
      try {
        await copyFile(from, partial)
        await rename(partial, path)
        return true
      } catch (error) {
        await rm(partial, { force: true })
        warn(`not cached: ${what}: it could not be kept (${String(error)})`)
        return false
      }
    },
  }
}

/**
 * `ports` with every ffmpeg call that writes a file kept in `cache`: a call
 * whose key is kept is answered from it without running. A call that writes
 * nothing (a measure, to `-`) always runs, since what it says is on stderr.
 */
export function withCachedFfmpeg(
  ports: Ports,
  root: string,
  cache: StepCache,
  version: () => Promise<string>
): Ports {
  return {
    ...ports,
    ffmpeg: async (
      call
    ): Promise<{ readonly ok: boolean; readonly stderr: string }> => {
      const args = call.args
      const out = args.at(-1)
      if (!out || out === "-" || args.includes("null"))
        return ports.ffmpeg(call)
      const named = await Promise.all(
        args.map(async (arg, i): Promise<string> => {
          if (i === args.length - 1) return "<out>"
          if (args[i - 1] !== "-i") return arg
          const sum = await ports.sha256(arg)
          return sum === null ? arg : `sha256:${sum}`
        })
      )
      // The output's extension picks its container, so it is in the key;
      // its name is not, so a renamed scene still finds its step.
      const ext = extname(out)
      const key = keyOf({ step: 1, ffmpeg: await version(), args: named, ext })
      const path = isAbsolute(out) ? out : resolve(root, out)
      if (await cache.get(key, ext, path)) return { ok: true, stderr: "" }
      const ran = await ports.ffmpeg(call)
      if (ran.ok) await cache.put(key, ext, path, out)
      return ran
    },
  }
}
