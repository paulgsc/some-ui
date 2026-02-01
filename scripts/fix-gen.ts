import { execSync } from "node:child_process"
import {
  readdirSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, join } from "node:path"

const FIX_DIR = ".fix"

export interface FixResult {
  file: string
  status: "success" | "skipped" | "failed"
  errors?: string[]
}

export interface GenerateFixContextResult {
  summary: FixResult[]
  hasErrors: boolean
}

export function generateFixContext(): GenerateFixContextResult {
  const summary: FixResult[] = []
  let hasErrors = false

  if (existsSync(FIX_DIR)) {
    try {
      for (const entry of readdirSync(FIX_DIR)) {
        rmSync(join(FIX_DIR, entry), { recursive: true, force: true })
      }
      console.log(`Cleared contents of ${FIX_DIR}.`)
    } catch (err) {
      console.error(`Failed to clear ${FIX_DIR} directory:`, err)
      hasErrors = true
    }
  }

  try {
    // 1. Get changed files
    const rawChangedFiles = execSync(
      "git diff-tree --no-commit-id --name-only -r HEAD",
      { encoding: "utf8" }
    )
      .trim()
      .split("\n")
      .filter(Boolean)

    const changedFiles = rawChangedFiles.filter((f) =>
      /\.(ts|tsx|js|jsx)$/.test(f)
    )

    if (changedFiles.length === 0) {
      console.warn("No changed JS/TS files found in HEAD.")
      return { summary, hasErrors }
    }

    const sha = execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
    }).trim()
    const msg = execSync("git log -1 --pretty=%B", { encoding: "utf8" }).trim()

    for (const file of changedFiles) {
      const fileErrors: string[] = []

      if (!existsSync(file)) {
        const msg = `File missing, skipping: ${file}`
        console.warn(msg)
        summary.push({ file, status: "skipped", errors: [msg] })
        continue
      }

      const fileContent = readFileSync(file, "utf8").split("\n")

      // 2. Run ESLint
      let lintResults: any
      try {
        const output = execSync(`npx eslint ${file} --format json`, {
          stdio: "pipe",
          encoding: "utf8",
        })
        lintResults = JSON.parse(output)
      } catch (e: any) {
        try {
          lintResults = JSON.parse(e.stdout?.toString() || "[]")
        } catch {
          const msg = `Failed to parse ESLint output for file: ${file}`
          console.error(msg)
          fileErrors.push(msg)
          summary.push({ file, status: "failed", errors: fileErrors })
          hasErrors = true
          continue
        }
      }

      const fileResults = lintResults[0]
      if (!fileResults || fileResults.errorCount === 0) {
        summary.push({ file, status: "skipped" })
        continue
      }

      // 3. Setup Dir Structure
      const fileTargetDir = join(FIX_DIR, dirname(file))
      try {
        mkdirSync(fileTargetDir, { recursive: true })
      } catch (err) {
        const msg = `Failed to create directory: ${fileTargetDir}`
        console.error(msg, err)
        fileErrors.push(msg)
        summary.push({ file, status: "failed", errors: fileErrors })
        hasErrors = true
        continue
      }

      const fileName = basename(file)
      const errorContexts = fileResults.messages.map((m: any) => ({
        line: m.line,
        column: m.column,
        ruleId: m.ruleId,
        message: m.message,
        snippet: fileContent[m.line - 1]?.trim() || "",
      }))

      // Snapshot
      try {
        copyFileSync(file, join(fileTargetDir, `${fileName}.snapshot.ts`))
      } catch (err) {
        const msg = `Failed to copy snapshot for: ${file}`
        console.error(msg, err)
        fileErrors.push(msg)
      }

      // Lint JSON
      try {
        writeFileSync(
          join(fileTargetDir, `${fileName}.lint.json`),
          JSON.stringify({ sha, file, errors: errorContexts }, null, 2)
        )
      } catch (err) {
        const msg = `Failed to write lint JSON for: ${file}`
        console.error(msg, err)
        fileErrors.push(msg)
      }

      // Prompt MD
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
2. Provide a **fully rewritten file** that fixes the issues.

## Constraints
- Do NOT change runtime behavior
- Do NOT refactor unrelated code
- Do NOT modify recent business logic
- Fix lint issues only
      `.trim()

      try {
        writeFileSync(join(fileTargetDir, `${fileName}.fix.md`), promptContent)
      } catch (err) {
        const msg = `Failed to write fix markdown for: ${file}`
        console.error(msg, err)
        fileErrors.push(msg)
      }

      if (fileErrors.length > 0) {
        summary.push({ file, status: "failed", errors: fileErrors })
        hasErrors = true
      } else {
        summary.push({ file, status: "success" })
      }
    }
  } catch (err) {
    console.error("Unexpected failure in generateFixContext:", err)
    hasErrors = true
  }

  return { summary, hasErrors }
}

// Usage example
const result = generateFixContext()
console.log(JSON.stringify(result, null, 2))
