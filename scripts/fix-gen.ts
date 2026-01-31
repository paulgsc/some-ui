import { execSync } from "child_process"
import path from "path"
import fs from "fs-extra"

const FIX_DIR = ".fix"

async function generateFixContext() {
  try {
    const changedFiles = execSync(
      "git diff-tree --no-commit-id --name-only -r HEAD"
    )
      .toString()
      .trim()
      .split("\n")
      .filter((f) => /\.(ts|tsx|js|jsx)$/.test(f))

    if (changedFiles.length === 0) return

    const sha = execSync("git rev-parse --short HEAD").toString().trim()
    const msg = execSync("git log -1 --pretty=%B").toString().trim()

    for (const file of changedFiles) {
      if (!fs.existsSync(file)) continue

      const fileContent = fs.readFileSync(file, "utf8").split("\n")

      let lintResults
      try {
        const output = execSync(`npx eslint ${file} --format json`, {
          stdio: "pipe",
        })
        lintResults = JSON.parse(output.toString())
      } catch (e: any) {
        try {
          lintResults = JSON.parse(e.stdout.toString())
        } catch {
          continue
        }
      }

      const fileResults = lintResults[0]
      if (!fileResults || fileResults.errorCount === 0) continue

      const fileTargetDir = path.join(FIX_DIR, path.dirname(file))
      const fileName = path.basename(file)
      await fs.ensureDir(fileTargetDir)

      // Extract specific snippets for the JSON and MD
      const errorContexts = fileResults.messages.map((m: any) => {
        const lineIdx = m.line - 1
        return {
          line: m.line,
          column: m.column,
          ruleId: m.ruleId,
          message: m.message,
          snippet: fileContent[lineIdx]?.trim() || "",
        }
      })

      // 1. Ground Truth Snapshot
      await fs.copy(file, path.join(fileTargetDir, `${fileName}.snapshot.ts`))

      // 2. Machine Data (Now with Snippets)
      await fs.writeJson(
        path.join(fileTargetDir, `${fileName}.lint.json`),
        {
          sha,
          file,
          errors: errorContexts,
        },
        { spaces: 2 }
      )

      // 3. The Prompt (Hyper-targeted)
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
1. Review the attached \`${fileName}.snapshot.ts\` for full context.
2. Resolve the issues listed above.
3. Provide a **Unified Diff** only. 
4. Do not alter business logic or refactor unrelated code.
      `.trim()

      await fs.writeFile(
        path.join(fileTargetDir, `${fileName}.fix.md`),
        promptContent
      )
    }
  } catch (err) {
    // Fail silently - the invariant remains.
  }
}

generateFixContext()
