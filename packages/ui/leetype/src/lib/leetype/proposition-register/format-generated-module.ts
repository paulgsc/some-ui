import type { PropositionRegisterEntry } from "./parse-canon"

const HEADER = `// GENERATED FILE — do not hand-edit.
//
// Produced by \`pnpm --filter @some-ui/leetype run generate:proposition-register\`
// by parsing \`docs/canon/complexity-witness-canon.typ\` §7 (the proposition
// register, Def. 1.5, Rem. 7.1) — a second, hand-maintained list of \`CW-P\`
// ids is exactly the drift Rem. 7.2 warns against, so this file exists to
// be the only one. \`scripts/check-proposition-citations.ts\` fails CI if
// this file drifts from what the canon generates today.`

/**
 * Renders the parsed register as the committed `generated.ts` source
 * (LTY-PROBE B1, #1218). A pure string builder — `scripts/generate-
 * proposition-register.ts` is the only caller that touches the filesystem,
 * so this function is exercised directly in tests without stubbing `fs`.
 */
export function formatGeneratedModule(
  entries: ReadonlyArray<PropositionRegisterEntry>
): string {
  const idUnion = entries.map((entry) => `  | "${entry.id}"`).join("\n")
  const registerEntries = entries
    .map(
      (entry) =>
        `  "${entry.id}": { id: "${entry.id}", title: ${JSON.stringify(entry.title)}, statement: ${JSON.stringify(entry.statement)}, status: "${entry.status}" },`
    )
    .join("\n")

  return `${HEADER}

import type { PropositionRegisterEntry } from "./parse-canon"

export type PropositionId =
${idUnion}

export const PROPOSITION_REGISTER: Readonly<
  Record<PropositionId, PropositionRegisterEntry>
> = {
${registerEntries}
}
`
}
