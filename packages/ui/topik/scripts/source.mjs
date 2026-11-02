// Loads one of topik's source modules through topik's own Vite config, which
// needs topik's dependencies built (`ROUTINE.md`, step 2). Resolves the file a
// checker was given against where the command was typed: `pnpm --filter` runs
// it from the package, and INIT_CWD is the caller's directory.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createServer } from "vite"

const topik = resolve(import.meta.dirname, "..")

const readText = (file) =>
  readFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), file), "utf8")

/** The JSON in `file`, resolved against where the command was typed. */
export function readJson(file) {
  return JSON.parse(readText(file))
}

export function readArg(usage) {
  const [file] = process.argv.slice(2)
  if (!file) throw new Error(`usage: ${usage}`)
  return readText(file)
}

export async function withSource(path, use) {
  const vite = await createServer({
    configFile: resolve(topik, "vite.config.ts"),
    root: topik,
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    logLevel: "error",
  })
  try {
    return use(await vite.ssrLoadModule(path))
  } finally {
    await vite.close()
  }
}
