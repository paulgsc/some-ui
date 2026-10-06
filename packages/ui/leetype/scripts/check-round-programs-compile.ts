/**
 * LTY-AUTHOR: every authored round's `A`, and `A + d` for each of
 * its diffs, must compile. Def. 1.1 calls `A` "a complete, compilable
 * program", and a distractor is "a well-formed rewrite", not junk
 * (Cor. 5.1), so a patched program that fails to compile is an authoring
 * defect in either case.
 *
 * Each program is compiled on its own as a Rust library crate, metadata
 * only, with warnings denied. `rustc` comes from the `.#ci` dev shell that
 * the PR workflow's corpus-lint step already runs under.
 *
 * Every reviewed round also carries a harness,
 * and each program is compiled a second time as a binary with the harness
 * appended, exactly the program the server's runner builds. A round in
 * the reviewed corpus without a harness fails here: the runner would have
 * nothing to run it with, and the static snapshot no transcript to ship.
 *
 * Usage: pnpm --filter @some-ui/leetype lint:corpus
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AUTHORED_ROUNDS } from "@leetype/lib/leetype/authored-rounds"
import { assembleRound } from "@leetype/lib/leetype/round-assembly"

type Program = {
  readonly label: string
  readonly source: string
  readonly crateType: "lib" | "bin"
}

function programsOf(): ReadonlyArray<Program> {
  return AUTHORED_ROUNDS.flatMap((round) => {
    const { patchedSources } = assembleRound(round)
    const variants = [
      { label: `${round.id}: A`, source: round.algorithm.source },
      ...round.diffOptions.map((option, index) => ({
        label: `${round.id}: A + diff option ${index} (${option.member.propositionId})`,
        source: patchedSources[index] ?? "",
      })),
    ]
    const harness = round.harness?.source
    return variants.flatMap(
      (variant): Array<Program> => [
        { ...variant, crateType: "lib" },
        ...(harness === undefined
          ? []
          : [
              {
                label: `${variant.label} with its harness`,
                source: `${variant.source}\n${harness}`,
                crateType: "bin" as const,
              },
            ]),
      ]
    )
  })
}

/** Reviewed rounds without a harness: the runner could not run them. */
function missingHarnesses(): Array<string> {
  return AUTHORED_ROUNDS.filter((round) => round.harness === undefined).map(
    (round) =>
      `${round.id}: no harness; every reviewed round needs one (paulgsc/server#381)`
  )
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
  const failures: Array<string> = missingHarnesses()
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
            program.crateType,
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
