import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { parseCutList } from "@video-render/cut-list"
import type { CutList } from "@video-render/cut-list"

/** The showcase cut lists, `sample/videos/<video>/cut-list.json`. */
export const VIDEOS = join(import.meta.dirname, "../sample/videos")

/** A showcase's cut list, parsed; it throws on one that doesn't parse. */
export async function showcase(video: string): Promise<CutList> {
  const raw: unknown = JSON.parse(
    await readFile(join(VIDEOS, video, "cut-list.json"), "utf8")
  )
  const parsed = parseCutList(raw)
  if (!parsed.ok) throw new Error(parsed.problems.join("\n"))
  return parsed.value
}
