/**
 * LTY-AUTHOR (#1540): every authored round's `A`, and `A + d` for each of
 * its diffs, must compile. Def. 1.1 calls `A` "a complete, compilable
 * program", and a distractor is "a well-formed rewrite", not junk
 * (Cor. 5.1), so a patched program that fails to compile is an authoring
 * defect in either case.
 *
 * Each program is compiled on its own as a Rust library crate, metadata
 * only, with warnings denied. `rustc` comes from the `.#ci` dev shell that
 * the PR workflow's corpus-lint step already runs under.
 *
 * Usage: pnpm --filter @some-ui/leetype lint:corpus
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AUTHORED_ROUNDS } from "@leetype/lib/leetype/authored-rounds"
import { assembleRound } from "@leetype/lib/leetype/round-assembly"

type Program = { readonly label: string; readonly source: string }

function programsOf(): ReadonlyArray<Program> {
  return AUTHORED_ROUNDS.flatMap((round) => {
    const { patchedSources } = assembleRound(round)
    return [
      { label: `${round.id}: A`, source: round.algorithm.source },
      ...round.diffOptions.map((option, index) => ({
        label: `${round.id}: A + diff option ${index} (${option.member.propositionId})`,
        source: patchedSources[index] ?? "",
      })),
    ]
  })
}

/** `execFileSync`'s error carries the child's stderr; anything else is reported as-is. */
function stderrOf(error: unknown): string {
  if (error instanceof Error && "stderr" in error) {
    return String(error.stderr)
  }
  return String(error)
}

function main(): void {
  const directory = mkdtempSync(join(tmpdir(), "leetype-rounds-"))
  const failures: Array<string> = []
  const programs = programsOf()
  try {
    programs.forEach((program, index) => {
      const file = join(directory, `program_${index}.rs`)
      writeFileSync(file, program.source)
      try {
        execFileSync(
          "rustc",
          [
            "--edition",
            "2021",
            "--crate-type",
            "lib",
            "--emit=metadata",
            "-D",
            "warnings",
            "--out-dir",
            directory,
            file,
          ],
          { stdio: ["ignore", "pipe", "pipe"] }
        )
      } catch (error) {
        failures.push(`${program.label}\n${stderrOf(error)}`)
      }
    })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }

  if (failures.length > 0) {
    console.error(
      `Round programs failed to compile: ${failures.length} of ${programs.length}\n`
    )
    for (const failure of failures) console.error(failure)
    process.exitCode = 1
  } else {
    console.log(
      `Round programs compiled: ${programs.length} program(s) across ${AUTHORED_ROUNDS.length} authored round(s).`
    )
  }
}

main()
