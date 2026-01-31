import { execSync } from "node:child_process"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, join } from "node:path"

const FIX_DIR = ".fix"

function generateFixContext() {
  try {
    // 1. Get changed files
    const changedFiles = execSync(
      "git diff-tree --no-commit-id --name-only -r HEAD",
      { encoding: "utf8" }
    )
      .trim()
      .split("\n")
      .filter((f) => /\.(ts|tsx|js|jsx)$/.test(f))

    if (changedFiles.length === 0) return

    const sha = execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
    }).trim()
    const msg = execSync("git log -1 --pretty=%B", { encoding: "utf8" }).trim()

    for (const file of changedFiles) {
      if (!existsSync(file)) continue

      const fileContent = readFileSync(file, "utf8").split("\n")

      // 2. Run ESLint (Native call)
      let lintResults
      try {
        const output = execSync(`npx eslint ${file} --format json`, {
          stdio: "pipe",
          encoding: "utf8",
        })
        lintResults = JSON.parse(output)
      } catch (e: any) {
        try {
          lintResults = JSON.parse(e.stdout.toString())
        } catch {
          continue
        }
      }

      const fileResults = lintResults[0]
      if (!fileResults || fileResults.errorCount === 0) continue

      // 3. Setup Dir Structure (Native recursive mkdir)
      const fileTargetDir = join(FIX_DIR, dirname(file))
      mkdirSync(fileTargetDir, { recursive: true })

      const fileName = basename(file)
      const errorContexts = fileResults.messages.map((m: any) => ({
        line: m.line,
        column: m.column,
        ruleId: m.ruleId,
        message: m.message,
        snippet: fileContent[m.line - 1]?.trim() || "",
      }))

      // A. Snapshot
      copyFileSync(file, join(fileTargetDir, `${fileName}.snapshot.ts`))

      // B. Data
      writeFileSync(
        join(fileTargetDir, `${fileName}.lint.json`),
        JSON.stringify({ sha, file, errors: errorContexts }, null, 2)
      )

      // C. Prompt
      const promptContent = `
# Lint Fix Request: ${file}
**Commit:** \`${sha}\` — "${msg}"

## Targeted Issues
${errorContexts
  .map(
    (e: any) => `
### ${e.ruleId} (Line ${e.line})
- **Message:** ${e.message}
- **Code:** \`${e.snippet}\``
  )
  .join("\n")}

---
## Instructions
1. Review the attached \`${fileName}.snapshot.ts\`.
2. Provide a **Unified Diff** only.
      `.trim()

      writeFileSync(join(fileTargetDir, `${fileName}.fix.md`), promptContent)
    }
  } catch (err) {
    // Invariant: Never block the dev.
  }
}

generateFixContext()
