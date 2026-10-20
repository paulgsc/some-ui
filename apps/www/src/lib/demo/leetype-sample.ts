/**
 * The LeetType session a viewer can play on the Pages build (CLAUDE.md, "A
 * viewer tries, and nothing is kept"): Thread 1's first session, the file
 * the owner's phone picks from Drive, as its text. The store takes no
 * picks (the picker's `samples`), and the session log the viewer writes is
 * the page's in-memory storage. The file is loaded only when the list is
 * first read.
 */
import type { HeldSessionFile, SessionFileStore } from "@some-ui/leetype"
import { z } from "zod"

import { SAMPLED_AT } from "@/lib/demo"

/** The name the owner's copy has in Drive's LeetType › sessions. */
export const SAMPLE_SESSION_NAME = "t1-01-one-node"

async function sampleText(): Promise<string> {
  const { default: text } = await import("./leetype-sample.json?raw")
  return text
}

/** What the list shows of it; the phone's own intake reads the rest. */
const Heading = z.object({ title: z.string(), oneLine: z.string() })

export function viewerSessionFiles(): SessionFileStore {
  return {
    list: async (): Promise<ReadonlyArray<HeldSessionFile>> => {
      const { title, oneLine } = Heading.parse(JSON.parse(await sampleText()))
      return [
        { name: SAMPLE_SESSION_NAME, title, oneLine, pickedAt: SAMPLED_AT },
      ]
    },
    keep: () => Promise.reject(new Error("A viewer's samples take no picks.")),
    read: async (name) => (name === SAMPLE_SESSION_NAME ? sampleText() : null),
  }
}
