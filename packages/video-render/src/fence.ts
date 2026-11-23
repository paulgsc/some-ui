/**
 * A JSON block in an issue's body, fenced and tagged: ```` ```json ask ````
 * for an ask (`ask.ts`), ```` ```json run ```` for a coordinator's run
 * (`run.ts`). One reader for the family, so a new kind of block is a new
 * tag and schema, never a new parser (C1115). Pure.
 */
import type { z } from "zod"

import { problemsOf } from "./cut-list"
import type { Parsed } from "./cut-list"

/** The tags a fenced block may carry, one per schema that reads one. */
export type FenceTag = "ask" | "run"

/** Every block tagged `tag`, indented or not (under a list item, say). */
const fenceOf = (tag: FenceTag): RegExp =>
  new RegExp(
    `^[ \\t]*\`\`\`json ${tag}[ \\t]*\\r?\\n(?:([\\s\\S]*?)\\r?\\n)?[ \\t]*\`\`\`[ \\t]*$`,
    "gm"
  )

/**
 * The one block tagged `tag` in `body`, read by the schema `schemaOf` picks
 * for its JSON, or every reason it can't be: none, more than one, empty, not
 * JSON, or refused by the schema.
 */
export function parseFenced<T>(
  body: string,
  tag: FenceTag,
  schemaOf: (raw: unknown) => z.ZodType<T>
): Parsed<T> {
  const blocks = [...body.matchAll(fenceOf(tag))].map((m) => m[1] ?? "")
  if (blocks.length !== 1)
    return {
      ok: false,
      problems: [
        blocks.length === 0
          ? `it has no \`\`\`json ${tag} block`
          : `it has more than one \`\`\`json ${tag} block`,
      ],
    }
  const block = blocks[0] ?? ""
  if (block.trim() === "")
    return { ok: false, problems: [`its ${tag} block is empty`] }
  let raw: unknown
  try {
    raw = JSON.parse(block)
  } catch (error) {
    return {
      ok: false,
      problems: [`its ${tag} block isn't JSON: ${String(error)}`],
    }
  }
  const parsed = schemaOf(raw).safeParse(raw)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, problems: problemsOf(parsed.error, tag) }
}
