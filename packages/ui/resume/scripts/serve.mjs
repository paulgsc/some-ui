#!/usr/bin/env node
// The LAN résumé render service: compiles one ATS document with contact
// details (PII) supplied per request, and returns the PDF.
//
// The PII never reaches git, the public site or the static build. It arrives
// in the request body, goes to typst as the `pii` input (src/lib/pii.typ,
// which checks it against src/pii/envelope.json), and the PDF is written to a
// temporary directory that is removed before the response finishes. Nothing
// here logs a request body, a typst diagnostic or a check's detail, any of
// which can carry a value.
//
// It runs the same pinned typst, the same SHA-pinned fonts and the same
// Poppler checks as `pnpm build`, so what it returns is held to exactly the
// rules the published documents are: one page, the ATS text check (with every
// supplied field on the page) and the line-collision check. The build already
// proves the widest PII layout (scripts/fixtures/faux-pii.json); these are run
// again here on the real one.
//
// Reachable only on the home network: infra/compose/resume.yml publishes no
// port, and apps/www's nginx proxies /api/resume/ to it (nginx.resume-proxy.conf)
// for the LAN build's /resume-build page.
//
//   POST /render  {"variant","template","pii":{...}}  -> application/pdf
//   GET  /health                                       -> 200
import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { assertAtsText } from "./check-ats.mjs"
import { checkDocument } from "./check-layout.mjs"
import {
  baseArgs,
  inputArgs,
  piiTemplates,
  presentation,
  resolveTypst,
  sourceFile,
  variants,
} from "./typst.mjs"

const PORT = Number(process.env.PORT ?? 3100)
// A request is a few short strings; anything larger is not one.
const MAX_BODY_BYTES = 8 * 1024
const COMPILE_TIMEOUT_MS = 60_000

/** A failure whose message is safe to show the person: it carries no value. */
class Refusal extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function log(fields) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ at: new Date().toISOString(), ...fields }))
}

async function readBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Refusal(413, "Request too large.")
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString("utf8")
}

// Shape only. What each field may hold is src/lib/pii.typ's to decide, so
// there is one validator, and a local CLI build is held to it too.
function parseRequest(text) {
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Refusal(400, "Expected a JSON body.")
  }
  const { variant, template, pii = {} } = body ?? {}
  if (!variants.includes(variant)) {
    throw new Refusal(422, `Unknown variant: expected ${variants.join(", ")}.`)
  }
  if (!piiTemplates.includes(template)) {
    throw new Refusal(
      422,
      `Unknown template: expected ${piiTemplates.join(", ")}.`
    )
  }
  if (typeof pii !== "object" || pii === null || Array.isArray(pii)) {
    throw new Refusal(422, "pii: expected an object of contact fields.")
  }
  for (const [field, value] of Object.entries(pii)) {
    if (typeof value !== "string") {
      throw new Refusal(422, `pii.${field}: expected text.`)
    }
  }
  return { variant, template, pii }
}

function compile(typst, args) {
  return new Promise((resolve) => {
    execFile(
      typst.bin,
      args,
      { timeout: COMPILE_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      (error, _stdout, stderr) => resolve({ error, stderr: String(stderr) })
    )
  })
}

// typst prints `error: assertion failed: <message>` for a failed `assert`.
// Only the two kinds whose messages are known to carry no value are passed
// on: src/lib/pii.typ's field checks, and src/lib/fit.typ's one-page check.
function refusalFromTypst(stderr) {
  const failed = /^error: assertion failed: (.*)$/m.exec(stderr)?.[1] ?? ""
  if (failed.startsWith("pii")) return new Refusal(422, `${failed}.`)
  if (failed.includes("exceeds one page")) {
    return new Refusal(
      422,
      "These contact details push the résumé onto a second page. Shorten " +
        "or leave out the longest field."
    )
  }
  return new Refusal(500, "The résumé failed to compile.")
}

async function render(typst, { variant, template, pii }) {
  // Under a tmpfs in the container (infra/compose/resume.yml), so the PDF
  // with PII is never written to a disk.
  const dir = await mkdtemp(join(tmpdir(), "resume-render-"))
  try {
    const pdf = join(dir, "resume.pdf")
    const { error, stderr } = await compile(typst, [
      "compile",
      sourceFile,
      pdf,
      ...baseArgs(typst.fontPath),
      ...inputArgs({ variant, template, ...presentation[template], pii }),
    ])
    if (error) throw refusalFromTypst(stderr)
    // The values the ATS check expects, as src/lib/pii.typ normalises them.
    const supplied = Object.fromEntries(
      Object.entries(pii)
        .map(([field, value]) => [field, value.trim()])
        .filter(([, value]) => value !== "")
    )
    try {
      // Its messages name a missing PII field, never the value.
      assertAtsText(pdf, {
        variant,
        template,
        pii: supplied,
        transcriptDir: null,
      })
    } catch (failure) {
      throw new Refusal(500, `ATS check failed: ${failure.message}`)
    }
    try {
      checkDocument(pdf, `${variant} / ${template}`)
    } catch {
      // Its message quotes the colliding lines, which may be the contact line.
      throw new Refusal(500, "Layout check failed: two lines collide.")
    }
    return await readFile(pdf)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function main() {
  const typst = await resolveTypst()
  // One compile at a time: it is one person's résumé, and a queue keeps a
  // burst of clicks from running several typst processes at once.
  let queue = Promise.resolve()

  const server = createServer((request, response) => {
    const started = Date.now()
    // The path alone: a query string is never logged.
    const path = new URL(request.url ?? "/", "http://localhost").pathname
    const finish = (status, headers, body, extra = {}) => {
      response.writeHead(status, { "Cache-Control": "no-store", ...headers })
      response.end(body)
      log({
        method: request.method,
        path,
        status,
        ms: Date.now() - started,
        ...extra,
      })
    }
    const refuse = (failure, extra) =>
      finish(
        failure.status,
        { "Content-Type": "application/json" },
        JSON.stringify({ error: failure.message }),
        extra
      )

    if (request.method === "GET" && path === "/health") {
      finish(200, { "Content-Type": "text/plain" }, "ok")
      return
    }
    if (request.method !== "POST" || path !== "/render") {
      refuse(new Refusal(404, "Not found."))
      return
    }

    queue = queue.then(async () => {
      let job
      try {
        job = parseRequest(await readBody(request))
        const pdf = await render(typst, job)
        finish(
          200,
          {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="resume-${job.variant}-${job.template}.pdf"`,
          },
          pdf,
          { variant: job.variant, template: job.template }
        )
      } catch (failure) {
        const shown =
          failure instanceof Refusal
            ? failure
            : new Refusal(500, "The résumé failed to render.")
        refuse(shown, {
          variant: job?.variant,
          template: job?.template,
        })
      }
    })
  })

  server.listen(PORT, () => log({ listening: PORT }))
  // Closing the server is the last handle, so Node then exits on its own.
  const stop = () => server.close()
  process.on("SIGTERM", stop)
  process.on("SIGINT", stop)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`[resume] ${err.message}`)
  process.exitCode = 1
})
