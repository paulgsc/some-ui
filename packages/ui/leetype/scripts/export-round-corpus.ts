/**
 * Writes the authored round corpus (`lib/leetype/authored-rounds`) to
 * `corpus/rounds/`, the directory `paulgsc/server`'s
 * `import-leetype-rounds` reads (LTY-SRV2, `paulgsc/server#326`). The
 * rounds are still reviewed here, as TypeScript, on a pull request; this
 * directory is their export, never edited by hand.
 *
 * `--check` writes nothing and fails if the directory differs from what
 * this script would write, including a stale extra file. `lint:corpus`
 * runs it that way, so a round edited without re-exporting fails CI.
 *
 * Usage: pnpm --filter @some-ui/leetype export:rounds [--check]
 */
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { AUTHORED_ROUNDS } from "@leetype/lib/leetype/authored-rounds"
import { roundCorpusFiles } from "@leetype/lib/leetype/round-export"

const CORPUS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "corpus",
  "rounds"
)

function main(): void {
  const check = process.argv.includes("--check")
  const wanted = roundCorpusFiles(AUTHORED_ROUNDS)
  const present = ((): Array<string> => {
    try {
      return readdirSync(CORPUS_DIR)
    } catch {
      return []
    }
  })()

  const stale: Array<string> = []
  for (const [name, text] of wanted) {
    const current = ((): string | null => {
      try {
        return readFileSync(join(CORPUS_DIR, name), "utf8")
      } catch {
        return null
      }
    })()
    if (current !== text) {
      stale.push(name)
    }
  }
  const extra = present.filter((name) => !wanted.has(name))

  if (check) {
    if (stale.length > 0 || extra.length > 0) {
      console.error(
        "Round corpus export is out of date. Run `pnpm --filter @some-ui/leetype export:rounds`."
      )
      for (const name of stale)
        console.error(`  differs: corpus/rounds/${name}`)
      for (const name of extra)
        console.error(`  not exported: corpus/rounds/${name}`)
      process.exitCode = 1
      return
    }
    console.log(
      `Round corpus export is current: ${AUTHORED_ROUNDS.length} round(s).`
    )
    return
  }

  mkdirSync(CORPUS_DIR, { recursive: true })
  for (const name of extra) rmSync(join(CORPUS_DIR, name))
  for (const [name, text] of wanted) writeFileSync(join(CORPUS_DIR, name), text)
  console.log(`Exported ${AUTHORED_ROUNDS.length} round(s) to corpus/rounds/.`)
}

main()
