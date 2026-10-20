/**
 * The LeetType session a viewer can play on the Pages build (CLAUDE.md, "A
 * viewer tries, and nothing is kept"): Thread 1's first session file, as the
 * owner's phone picks it from Drive, held beside any file the viewer picks
 * themselves, all in memory. A reload starts over. The file is loaded only
 * when the session list is first read.
 */
import type {
  HeldSessionFile,
  KeepOutcome,
  SessionFileStore,
} from "@some-ui/leetype"

import { SAMPLED_AT } from "@/lib/demo"

/** The name the owner's copy has in Drive's LeetType › sessions. */
export const SAMPLE_SESSION_NAME = "t1-01-one-node"

async function sampleBody(): Promise<string> {
  const { default: file } = await import("./leetype-sample.json")
  return JSON.stringify(file)
}

export function viewerSessionFiles(): SessionFileStore {
  const picked = new Map<string, HeldSessionFile & { readonly body: string }>()
  const bodyOf = async (name: string): Promise<string | null> =>
    name === SAMPLE_SESSION_NAME
      ? sampleBody()
      : (picked.get(name)?.body ?? null)
  return {
    list: async (): Promise<ReadonlyArray<HeldSessionFile>> => {
      const { default: file } = await import("./leetype-sample.json")
      return [
        {
          name: SAMPLE_SESSION_NAME,
          title: file.title,
          oneLine: file.oneLine,
          pickedAt: SAMPLED_AT,
        },
        ...[...picked.values()].map(({ body: _body, ...held }) => held),
      ]
    },
    keep: async (file, at): Promise<KeepOutcome> => {
      const held = await bodyOf(file.name)
      if (held !== null)
        return held === file.body ? "already-held" : "name-taken"
      picked.set(file.name, { ...file, pickedAt: at.toISOString() })
      return "kept"
    },
    read: bodyOf,
  }
}
