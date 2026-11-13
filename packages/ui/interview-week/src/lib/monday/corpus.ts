/**
 * The corpus the interview week draws on (IW4, #2935): this repo's own
 * recorded calls, epics, docs and declared invariants. Pure readers over
 * text the routine's script reads from the checkout and from `render
 * call-facts`. Nothing here reads a clock, the network or the disk.
 */
import { z } from "zod"

/** A recorded call (`docs/calls.json`, ST37), as a decision question reads it. */
export type Call = {
  readonly id: string
  readonly made: string
  readonly chose: string
  /** Empty, and `gray` null, on an owner's call whose options the owner hasn't given. */
  readonly options: ReadonlyArray<string>
  readonly gray: string | null
  readonly undo: string
  readonly refs: ReadonlyArray<string>
}

const CallsSchema = z.object({
  schema: z.literal("some-ui.calls/1"),
  calls: z.array(
    z.looseObject({
      id: z.string(),
      made: z.iso.date(),
      chose: z.string(),
      options: z.array(z.string()).optional(),
      gray: z.string().optional(),
      undo: z.string(),
      refs: z.array(z.string()).optional(),
    })
  ),
})

/** Every call in the record, newest first (by when it was made, then by id). */
export function callsOf(text: string): Array<Call> {
  return CallsSchema.parse(JSON.parse(text))
    .calls.map((c) => ({
      id: c.id,
      made: c.made,
      chose: c.chose,
      options: c.options ?? [],
      gray: c.gray ?? null,
      undo: c.undo,
      refs: c.refs ?? [],
    }))
    .sort(
      (a, b) =>
        b.made.localeCompare(a.made) ||
        Number(b.id.slice(1)) - Number(a.id.slice(1))
    )
}

/** A markdown file of the checkout: its path from the repo's root, and its text. */
export type Doc = { readonly path: string; readonly text: string }

/** What one card presents, with the text the script is written from. */
export type Material = {
  /** Its key across weeks: `issue:some-ui#2931`, `doc:docs/x.md`, `invariant:RS1`. */
  readonly key: string
  readonly title: string
  readonly text: string
}

/** The most of a source's text a bundle carries. */
const MATERIAL_MOST = 6000

const cut = (text: string): string =>
  text.length > MATERIAL_MOST ? `${text.slice(0, MATERIAL_MOST)}…` : text

/**
 * A declaration's first line (CLAUDE.md, "Gray-area invariants"): `**<ID>:`,
 * or `**<ID> (not reviewable):`, in a blockquote or not. A retired one is
 * left out: it no longer holds.
 */
const DECLARATION =
  /^(?:>\s*)?\*\*([A-Z][A-Z0-9]*\d+)(?: \(([^)]*)\))?: (.+?)\*\*\s*$/

/** A line that ends a declaration's block: a heading, or the next declaration. */
const ENDS = /^(?:>\s*)?(?:#{1,6} |\*\*[A-Z][A-Z0-9]*\d+(?: \([^)]*\))?: )/

export type Invariant = Material & {
  readonly id: string
  readonly path: string
}

/**
 * Every invariant `docs` declare, by its ID, with the declaration's block as
 * its text. An ID declared twice is the policy check's to refuse, so the
 * first is kept.
 */
export function invariantsOf(docs: ReadonlyArray<Doc>): Array<Invariant> {
  const found = new Map<string, Invariant>()
  for (const doc of docs) {
    const lines = doc.text.split("\n")
    lines.forEach((line, i) => {
      const head = DECLARATION.exec(line)
      if (head === null) return
      const [, id = "", note = "", claim = ""] = head
      if (note === "retired" || found.has(id)) return
      const rest = lines.slice(i + 1)
      const end = rest.findIndex((l) => ENDS.test(l))
      const block = [line, ...(end === -1 ? rest : rest.slice(0, end))]
        .map((l) => l.replace(/^>\s?/, ""))
        .join("\n")
        .trim()
      found.set(id, {
        key: `invariant:${id}`,
        id,
        path: doc.path,
        title: `${id}: ${claim}`,
        text: cut(block),
      })
    })
  }
  return [...found.values()]
}

/** A doc's title: its first `# ` heading, or its path. */
const titleOf = (doc: Doc): string =>
  /^# (.+)$/m.exec(doc.text)?.[1]?.trim() ?? doc.path

/** The docs a card can present: those under `docs/`, by path. */
export function docsOf(
  docs: ReadonlyArray<Doc>
): Array<Material & { readonly path: string }> {
  return docs
    .filter((doc) => doc.path.startsWith("docs/") && doc.path.endsWith(".md"))
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((doc) => ({
      key: `doc:${doc.path}`,
      path: doc.path,
      title: titleOf(doc),
      text: cut(doc.text),
    }))
}

/** An epic as `render call-facts` reads it (`CallFacts["epics"]`). */
export type FactsEpic = {
  readonly repo: "some-ui" | "server"
  readonly number: number
  readonly title: string
  readonly why: string | null
  readonly whereWeAre: string | null
}

export type Epic = Material & {
  readonly repo: "some-ui" | "server"
  readonly number: number
}

/**
 * The epics that moved, newest first, each with its Why and Where we are. A
 * card presents why the work exists, so an epic with no Why is left out.
 */
export function epicsOf(epics: ReadonlyArray<FactsEpic>): Array<Epic> {
  return epics
    .filter((e) => e.why !== null)
    .sort((a, b) => b.number - a.number || a.repo.localeCompare(b.repo))
    .map((e) => ({
      key: `issue:${e.repo}#${e.number}`,
      repo: e.repo,
      number: e.number,
      title: e.title,
      text: cut(
        [
          e.why === null ? null : `Why:\n${e.why}`,
          e.whereWeAre === null ? null : `Where we are:\n${e.whereWeAre}`,
        ]
          .filter((part) => part !== null)
          .join("\n\n")
      ),
    }))
}
