/**
 * LeetType's look at the session files the paired home holds for it
 * (`GET /leetype/session-files`, paulgsc/server `handlers/leetype_files.rs`,
 * its `docs/identity.md` invariant 27: what the routine left in the
 * mailbox's `leetype` folder), and the fetch of one of them when its person
 * keeps it on the phone (`GET /leetype/session-files/:name`), on a paired
 * phone (LA8, LA15, docs/learner-data-authority.md).
 *
 * The look is a member of `./listing`, so it goes as Korean's does: only
 * paired, in front and under the pairing held, one at a time, never
 * rejected or retried, and nothing outliving its pairing. A fetch goes only
 * from a tap, through the link's `keep`, and never rejects either: each way
 * it ends is one of `@some-ui/leetype`'s `HomeFileAnswer` kinds, which the
 * picker says in words. A fetch sends no `If-None-Match`: the picker fetches
 * only a name the phone does not hold, since a held name never takes other
 * bytes (`SessionFileStore`'s `"name-taken"`).
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import type { HomeFileAnswer, HomeListing } from "@some-ui/leetype"

import { homeLink } from "./index"
import type { ListingPorts, ListingReads } from "./listing"
import { createListingReads, reportListingFault } from "./listing"
import { blockedOf, unanswered } from "./settle"

const PATH = "/leetype/session-files"
const PORT = "home server (LeetType files)"

export type LeetypeFilePorts = ListingPorts & {
  /** The link's `keep` for a fetch its person tapped for (`keep` is the look's, asked on its own). */
  keepTapped: ListingPorts["keep"]
}

export type LeetypeFileReads = {
  /** Home's list, and how the look ended when it brought none; never rejects. */
  list: () => Promise<HomeListing>
  /** One session file home holds, by its listed name; never rejects. */
  fetch: (name: string) => Promise<HomeFileAnswer>
}

/** How a look that brought nothing new ended, if it did. */
function endedOf(
  look: ListingReads,
  before: ReturnType<ListingReads["getSnapshot"]>["last"]
): HomeListing["ended"] {
  const { last } = look.getSnapshot()
  if (last === null || last === before || last.kind === "read") return null
  return last.kind
}

function fileOf(answer: HomeAnswer): HomeFileAnswer {
  if (answer.status === 200) return { kind: "file", body: answer.body }
  if (answer.status === 404) return { kind: "gone" }
  if (answer.status === 401) return { kind: "forgotten" }
  if (answer.status === 429) return { kind: "busy" }
  return { kind: "failed" }
}

export function createLeetypeFileReads(
  ports: LeetypeFilePorts
): LeetypeFileReads {
  const look = createListingReads({ path: PATH, port: PORT }, ports)
  return {
    async list(): Promise<HomeListing> {
      const before = look.getSnapshot().last
      const files = await look.list()
      return { files, ended: endedOf(look, before) }
    },
    async fetch(name): Promise<HomeFileAnswer> {
      if (ports.pairing() === null || !ports.visible()) {
        return { kind: "unreachable" }
      }
      try {
        const outcome = await ports.keepTapped((send) =>
          send("GET", `${PATH}/${encodeURIComponent(name)}`)
        )
        if (outcome.kind === "refused") return { kind: "busy" }
        if (outcome.kind === "stopped") return { kind: "unreachable" }
        return fileOf(outcome.value)
      } catch (error) {
        if (unanswered(error) || blockedOf(error) !== null) {
          return { kind: "unreachable" }
        }
        reportListingFault(PORT, error)
        return { kind: "failed" }
      }
    },
  }
}

let reads: LeetypeFileReads | null = null

/** One runtime per page load, over the link; reads only this phone's pairing. */
export function leetypeFileReads(): LeetypeFileReads {
  reads ??= createLeetypeFileReads({
    // The look is asked as the picker opens, not by a tap: held away from
    // home (AW1). A fetch is a tap.
    keep: (run) => homeLink().keep(run, { onItsOwn: true }),
    keepTapped: (run) => homeLink().keep(run),
    pairing: () => {
      const { link } = homeLink().getSnapshot()
      return link.kind === "paired" ? link.id : null
    },
    visible: () => document.visibilityState === "visible",
    now: Date.now,
    onLink: (listener) => homeLink().subscribe(listener),
  })
  return reads
}
