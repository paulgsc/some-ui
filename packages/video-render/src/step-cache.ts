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
 * speaker's model; a burn-in by what it draws (`withCachedBurnIns`).
 *
 * What it may hold is policy (`RenderPolicy.cacheBytes`): a step that would
 * take the cache past it runs and is not kept, with a warning, never a
 * failure. Its size is counted before each keep, and a size it cannot count
 * is never room (VC1): only a folder or an entry that is not there counts as
 * nothing held; any other error reading them keeps the step uncached, with a
 * warning, and the render goes on. Entries are written to a temporary name
 * and renamed into place, so a step killed half way leaves nothing that reads
 * as kept. A kept file is
 * copied out, never linked: ffmpeg's `-y` rewrites a file in place, which
 * would change a linked entry. A step answered from the cache is said
 * (`hit`), so a resumed render's log shows each step it did not redo
 * (paulgsc/server#739).
 */

import { createHash } from "node:crypto"
import * as nodeFs from "node:fs/promises"
import { extname, isAbsolute, join, resolve } from "node:path"
import { isRecord } from "@some-ui/core-utils"

import type { RenderPolicy } from "./policy"
import { overBudget } from "./policy"
import type { Compositions, Ports } from "./render"

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
  /**
   * Says that the step named `what` was answered from the cache, by whoever
   * took it whole: a step half answered (a take whose words were not kept)
   * ran, so it is not a hit.
   */
  readonly hit: (what: string) => void
}

/** A key for `parts`: the SHA-256 of their JSON. */
export const keyOf = (parts: unknown): string =>
  createHash("sha256").update(JSON.stringify(parts)).digest("hex")

const TEMPORARY = ".partial"

/** The file operations the cache uses; tests inject their failures. */
export type CacheFs = {
  readonly readdir: (path: string) => Promise<ReadonlyArray<string>>
  readonly stat: (path: string) => Promise<{ readonly size: number }>
  readonly copyFile: (from: string, to: string) => Promise<void>
  readonly mkdir: (path: string) => Promise<unknown>
  readonly rename: (from: string, to: string) => Promise<void>
  readonly rm: (path: string) => Promise<void>
}

export const nodeCacheFs: CacheFs = {
  readdir: (path) => nodeFs.readdir(path),
  stat: (path) => nodeFs.stat(path),
  copyFile: (from, to) => nodeFs.copyFile(from, to),
  mkdir: (path) => nodeFs.mkdir(path, { recursive: true }),
  rename: (from, to) => nodeFs.rename(from, to),
  rm: (path) => nodeFs.rm(path, { force: true }),
}

type Held = { readonly bytes: number } | { readonly unknown: string }

const absent = (error: unknown): boolean =>
  isRecord(error) && error["code"] === "ENOENT"

async function heldBytes(dir: string, fs: CacheFs): Promise<Held> {
  let names: ReadonlyArray<string>
  try {
    names = await fs.readdir(dir)
  } catch (error) {
    if (absent(error)) return { bytes: 0 }
    return { unknown: `its folder could not be listed (${String(error)})` }
  }
  let total = 0
  for (const name of names) {
    try {
      total += (await fs.stat(join(dir, name))).size
    } catch (error) {
      // Gone since it was listed: it holds nothing now.
      if (absent(error)) continue
      return { unknown: `${name} could not be measured (${String(error)})` }
    }
  }
  return { bytes: total }
}

/**
 * A step cache in `dir`, held to `policy.cacheBytes`. It says no hit; a
 * caller that wants them spreads it with its own `hit`.
 */
export function stepCache(
  dir: string,
  policy: RenderPolicy,
  warn: (line: string) => void,
  fs: CacheFs = nodeCacheFs
): StepCache {
  const kept = (key: string, ext: string): string => join(dir, `${key}${ext}`)
  return {
    hit: (): void => undefined,
    get: async (key, ext, to): Promise<boolean> => {
      try {
        await fs.copyFile(kept(key, ext), to)
        return true
      } catch {
        // Ignored: nothing kept under this key, so the step runs.
        return false
      }
    },
    put: async (key, ext, from, what): Promise<boolean> => {
      let bytes: number
      try {
        bytes = (await fs.stat(from)).size
      } catch (error) {
        warn(`not cached: ${what}: it could not be read (${String(error)})`)
        return false
      }
      const held = await heldBytes(dir, fs)
      if ("unknown" in held) {
        warn(
          `not cached: ${what}: the cache's size is unknown, ${held.unknown}`
        )
        return false
      }
      if (held.bytes + bytes > policy.cacheBytes) {
        warn(overBudget(what, bytes, held.bytes, policy))
        return false
      }
      const path = kept(key, ext)
      const partial = `${path}${TEMPORARY}`
      try {
        // The folder too: a disk that is full or a folder that cannot be
        // written is a step not kept, never a render that fails.
        await fs.mkdir(dir)
        await fs.copyFile(from, partial)
        await fs.rename(partial, path)
        return true
      } catch (error) {
        await fs.rm(partial).catch(() => {
          // Ignored: a partial that cannot be removed is never read as kept,
          // since only the renamed name is.
        })
        warn(`not cached: ${what}: it could not be kept (${String(error)})`)
        return false
      }
    },
  }
}

/**
 * One step kept in `cache` (VR2): the file kept under `key` copied to `out`
 * when there is one, without running; otherwise `run` writes it, and what it
 * wrote is kept when it succeeds: each ffmpeg call and each burn-in
 * recorded, so a retry redoes only the steps whose key changed. A step
 * answered from the cache is said as `step.out`.
 */
export async function keptStep<R extends { readonly ok: boolean }>(
  cache: StepCache,
  root: string,
  step: { readonly key: string; readonly out: string; readonly hit: R },
  run: () => Promise<R>
): Promise<R> {
  const ext = extname(step.out)
  const path = isAbsolute(step.out) ? step.out : resolve(root, step.out)
  if (await cache.get(step.key, ext, path)) {
    cache.hit(step.out)
    return step.hit
  }
  const ran = await run()
  if (ran.ok) await cache.put(step.key, ext, path, step.out)
  return ran
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
      return keptStep(
        cache,
        root,
        { key, out, hit: { ok: true, stderr: "" } },
        () => ports.ffmpeg(call)
      )
    },
  }
}

/**
 * `ports` with every burn-in it records kept in `cache`, keyed by what the
 * recording draws: its kind, its design (a design is frozen once a video
 * used it, `@some-ui/burn-ins`), its params (for a scene's captions, its
 * words and their times), how many frames it lasts and the frame it is drawn
 * in. Where it is laid, and the file it is written to, are not in the key,
 * so a scene that moves in the video still finds its recording.
 */
export function withCachedBurnIns(
  ports: Ports,
  root: string,
  cache: StepCache
): Ports {
  const record = ports.recordBurnIn
  if (!record) return ports
  return {
    ...ports,
    recordBurnIn: async (r): Promise<boolean> => {
      const key = keyOf({
        burnIn: 1,
        kind: r.kind,
        design: r.design,
        params: r.params,
        frames: r.frames,
        frame: r.frame,
      })
      const kept = await keptStep(
        cache,
        root,
        { key, out: r.out, hit: { ok: true } },
        async () => ({ ok: await record(r) })
      )
      return kept.ok
    },
  }
}

/**
 * `ports` with every composition clip it draws kept in `cache` (HYPER2),
 * keyed by what decides the clip's bytes: the composition and its pin, its
 * variables, the name and bytes of each file it reads, how many frames it
 * lasts and the frame. The scene's
 * place in the video and the clip's name are not in the key.
 */
export function withCachedCompositions(
  ports: Ports,
  root: string,
  cache: StepCache
): Ports {
  const drawn = ports.compositions
  if (!drawn) return ports
  return {
    ...ports,
    compositions: {
      ...drawn,
      record: async (r): ReturnType<Compositions["record"]> => {
        const key = keyOf({
          composition: 1,
          ref: r.ref,
          pin: await drawn.pin(r.ref),
          variables: r.variables,
          // By name too: the composition reads each as assets/<name>.
          files: await Promise.all(
            r.files.map(async (f) => [f, await ports.sha256(f)])
          ),
          frames: r.frames,
          frame: r.frame,
        })
        return keptStep(
          cache,
          root,
          { key, out: r.out, hit: { ok: true } as const },
          () => drawn.record(r)
        )
      },
    },
  }
}
