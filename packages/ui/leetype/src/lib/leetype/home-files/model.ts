import type { HeldSessionFile } from "@leetype/lib/leetype/session-file-pick"
import { z } from "zod"

/**
 * The session files the paired home holds for LeetType (paulgsc/server
 * `handlers/leetype_files.rs`'s `SessionFiles`; its contract is
 * `packages/contract-harness/contracts/leetype-files.contract.ts`): what the
 * routine left in the mailbox's `leetype` folder, named
 * `t<thread>-<NN>-<slug>.json`. Pure; `./index` runs it.
 */

/** How a look at home's list ended when it brought none. */
export type ListingEnded = "busy" | "unreachable" | "forgotten" | "failed"

/** What the host's look answers: home's list as it came, and how it ended. */
export type HomeListing = {
  readonly files: unknown
  readonly ended: ListingEnded | null
}

/** How the fetch of one of home's files ended. */
export type HomeFileAnswer =
  | { readonly kind: "file"; readonly body: string }
  /** Home no longer holds a file by that name. */
  | { readonly kind: "gone" }
  | { readonly kind: ListingEnded }

/**
 * The paired home's session files, as a host hands them (`apps/www`: the
 * home link, only while paired, keyed by the pairing). Neither call
 * rejects.
 */
export type HomeSessionFiles = {
  /** Which pairing the answers are for: a new one starts the list again. */
  readonly key: string
  readonly list: () => Promise<HomeListing>
  /** One file, by the name home lists it under. */
  readonly fetch: (name: string) => Promise<HomeFileAnswer>
}

const ListedSchema = z.object({
  name: z.string().min(1),
  title: z.string().min(1),
  oneLine: z.string().min(1),
})

const ListingSchema = z.object({ files: z.array(z.unknown()) })

/** One file home holds, as the list names it. */
export type ListedFile = z.infer<typeof ListedSchema>

/**
 * Home's files from its answer, newest first as home sends them; an entry
 * that is not a listed file is left out, and an answer that is not a list
 * holds none.
 */
export function listedOf(files: unknown): ReadonlyArray<ListedFile> {
  const listing = ListingSchema.safeParse(files)
  if (!listing.success) return []
  return listing.data.files.flatMap((entry) => {
    const listed = ListedSchema.safeParse(entry)
    return listed.success ? [listed.data] : []
  })
}

/** A name as the phone holds it and the session log names it: no `.json`. */
function heldNameOf(name: string): string {
  return name.trim().replace(/\.json$/i, "")
}

/** The thread a file's name says it belongs to, or null for none. */
function threadOf(name: string): number | null {
  const match = /^t(\d+)-/.exec(heldNameOf(name))
  return match ? Number(match[1]) : null
}

type HomeFileRow = ListedFile & {
  /** The phone holds a file by this name already. */
  readonly onPhone: boolean
}

/** A thread's files home holds, in the order its names give. */
export type HomeThread = {
  readonly thread: number | null
  readonly files: ReadonlyArray<HomeFileRow>
  /** How many of them the phone does not hold yet. */
  readonly missing: number
  /** The thread of the file the phone kept last. */
  readonly current: boolean
}

/**
 * Home's files by thread. The current thread, the one of the file the
 * phone kept last, comes first; then the newest threads. A file whose name
 * names no thread goes in a group of its own, last.
 */
export function threadsOf(
  listed: ReadonlyArray<ListedFile>,
  held: ReadonlyArray<HeldSessionFile>
): ReadonlyArray<HomeThread> {
  const heldNames = new Set(held.map((file) => file.name))
  const groups = new Map<number | null, Array<HomeFileRow>>()
  for (const file of listed) {
    const thread = threadOf(file.name)
    const row = { ...file, onPhone: heldNames.has(heldNameOf(file.name)) }
    const group = groups.get(thread)
    if (group === undefined) groups.set(thread, [row])
    else group.push(row)
  }
  const newestHeld = [...held].sort((a, b) =>
    b.pickedAt.localeCompare(a.pickedAt)
  )[0]
  const current = newestHeld === undefined ? null : threadOf(newestHeld.name)
  const rank = (thread: number | null): number => {
    if (thread === null) return Number.NEGATIVE_INFINITY
    return thread === current ? Number.POSITIVE_INFINITY : thread
  }
  return [...groups.entries()]
    .sort(([a], [b]) => rank(b) - rank(a))
    .map(([thread, files]) => {
      const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name))
      return {
        thread,
        files: sorted,
        missing: sorted.filter((file) => !file.onPhone).length,
        current: thread !== null && thread === current,
      }
    })
}
