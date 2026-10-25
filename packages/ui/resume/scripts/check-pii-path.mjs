#!/usr/bin/env node
// RP1, held by a run: PII reaches typst only through `compileWithPii`.
//
// Starts scripts/serve.mjs with `typst` and `pdftotext` replaced by shims
// that record every invocation's argv and environment and then run the real
// binary, so the render is the service's own, end to end. One request goes in
// with scripts/fixtures/faux-pii.json. The check fails when:
//
//   - a faux value is in any recorded argv or environment variable;
//   - typst never compiled from stdin to stdout (`compile … - -`), so the run
//     proved nothing, or the render did not return a PDF;
//   - a file under this package (outside node_modules and turbo's .turbo
//     log) changed during the
//     render, or the render left any file in its own temp directory (the
//     service runs with a fresh TMPDIR, which Node and typst both honour);
//   - the service's own output holds a value (RP2's half that a run can see);
//   - src/main.typ passes anything but `pii: none`.
//
// What it cannot see stays with RP1's falsifier: a hunk that would send PII
// another way only on a path this one request does not take.
//
// Needs the build's typst, fonts and Poppler, so scripts/compile.mjs runs it
// after its own PII pass, wherever it runs the ATS and layout checks.
import { execFileSync, spawn } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { delimiter, join, relative } from "node:path"

import {
  packageDir,
  piiTemplates,
  resolveTypst,
  sourceFile,
  variants,
} from "./typst.mjs"

const pii = JSON.parse(
  readFileSync(join(packageDir, "scripts", "fixtures", "faux-pii.json"), "utf8")
)
// Each value as written, and as the bytes list `compileWithPii`'s program
// carries it in, so an encoded copy is caught too.
const values = Object.values(pii).flatMap((value) => [
  value,
  [...Buffer.from(value, "utf8")].join(","),
])

function fail(message) {
  throw new Error(`[resume] RP1 check failed: ${message}`)
}

function realPdftotext() {
  const named = process.env.PDFTOTEXT_BIN ?? "pdftotext"
  if (named.includes("/")) return named
  return execFileSync("sh", ["-c", 'command -v "$1"', "sh", named], {
    encoding: "utf8",
  }).trim()
}

/** A shim that appends one JSON line per call to `log`, then runs `real`. */
function writeShim(dir, name, real, log) {
  const record =
    "process.stdout.write(JSON.stringify(" +
    `{ tool: ${JSON.stringify(name)}, argv: process.argv.slice(1), env: process.env }` +
    ') + "\\n")'
  const quote = (s) => `'${s.replaceAll("'", `'\\''`)}'`
  const path = join(dir, name)
  writeFileSync(
    path,
    "#!/bin/sh\n" +
      `${quote(process.execPath)} -e ${quote(record)} -- "$@" >> ${quote(log)}\n` +
      `exec ${quote(real)} "$@"\n`
  )
  chmodSync(path, 0o755)
  return path
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once("error", reject)
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

/** Files under `dir` changed at or after `since` (ms), skipping `skip`. */
function changedSince(dir, since, skip) {
  const changed = []
  const walk = (at) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name)
      if (skip.has(entry.name) || skip.has(path)) continue
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile() && statSync(path).mtimeMs >= since)
        changed.push(path)
    }
  }
  walk(dir)
  return changed
}

function holdsValue(text) {
  return values.some((value) => text.includes(value))
}

async function main() {
  const main = readFileSync(sourceFile, "utf8")
  const passed = [...main.matchAll(/\bpii:\s*([^,)\n]+)/g)].map((m) =>
    m[1].trim()
  )
  if (passed.length !== 1 || passed[0] !== "none")
    fail("src/main.typ must pass exactly `pii: none`.")

  const { bin } = await resolveTypst()
  const shimDir = mkdtempSync(join(tmpdir(), "resume-rp1-"))
  const log = join(shimDir, "calls.jsonl")
  const serviceTmp = mkdtempSync(join(tmpdir(), "resume-rp1-tmp-"))
  writeFileSync(log, "")
  writeShim(shimDir, "typst", bin, log)
  const pdftotextShim = writeShim(shimDir, "pdftotext", realPdftotext(), log)

  const port = await freePort()
  const started = Date.now()
  const server = spawn(
    process.execPath,
    [join(packageDir, "scripts", "serve.mjs")],
    {
      cwd: packageDir,
      env: {
        ...process.env,
        PATH: `${shimDir}${delimiter}${process.env.PATH ?? ""}`,
        PDFTOTEXT_BIN: pdftotextShim,
        PORT: String(port),
        TMPDIR: serviceTmp,
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  )
  let output = ""
  server.stdout.on("data", (chunk) => (output += chunk))
  server.stderr.on("data", (chunk) => (output += chunk))
  const exited = new Promise((resolve) => server.once("exit", resolve))

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("the service did not start within 120 s")),
        120_000
      )
      const watch = () => {
        if (output.includes('"listening"')) {
          clearTimeout(timer)
          resolve()
        }
      }
      server.stdout.on("data", watch)
      server.once("exit", () => {
        clearTimeout(timer)
        reject(new Error(`the service exited before listening:\n${output}`))
      })
    })

    const response = await fetch(`http://127.0.0.1:${port}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variant: variants[0],
        template: piiTemplates[0],
        pii,
      }),
    })
    const body = Buffer.from(await response.arrayBuffer())
    if (response.status !== 200 || body.subarray(0, 5).toString() !== "%PDF-")
      fail(
        `the render returned ${response.status}, not a PDF: ${body
          .toString("utf8")
          .slice(0, 200)}`
      )
  } finally {
    server.kill("SIGTERM")
    await exited
  }

  const calls = readFileSync(log, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  for (const { tool, argv, env } of calls) {
    if (argv.some(holdsValue)) fail(`a PII value was in ${tool}'s arguments.`)
    const leaked = Object.entries(env).find(([, value]) => holdsValue(value))
    if (leaked) fail(`a PII value was in ${tool}'s environment (${leaked[0]}).`)
  }
  const fromStdin = calls.some(
    ({ tool, argv }) =>
      tool === "typst" &&
      argv[0] === "compile" &&
      argv.at(-2) === "-" &&
      argv.at(-1) === "-"
  )
  if (!fromStdin) fail("typst never compiled from stdin to stdout.")
  if (!calls.some(({ tool }) => tool === "pdftotext"))
    fail("the render's checks never ran pdftotext.")
  if (holdsValue(output)) fail("the service's output held a PII value.")

  const written = changedSince(
    packageDir,
    started,
    new Set(["node_modules", ".turbo"])
  )
  if (written.length > 0)
    fail(
      `the render wrote under the package: ${written
        .map((path) => relative(packageDir, path))
        .join(", ")}`
    )
  const left = changedSince(serviceTmp, 0, new Set())
  if (left.length > 0)
    fail(
      `the render left a temp file: ${left
        .map((path) => relative(serviceTmp, path))
        .join(", ")}`
    )

  rmSync(shimDir, { recursive: true, force: true })
  rmSync(serviceTmp, { recursive: true, force: true })
  // eslint-disable-next-line no-console
  console.log(
    `[resume] RP1 check passed: ${calls.length} typst and pdftotext calls, ` +
      "no PII in an argument, the environment or a file"
  )
}

if (!existsSync(sourceFile)) fail(`${sourceFile} is missing.`)
await main()
