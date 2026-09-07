#!/usr/bin/env node
// Deployment regression check for the /resume shell (apps/www/resume/index.html).
//
// GitHub Pages has no server-side rewrite, so before that shell existed, a
// direct request to /some-ui/resume/ fell through to the SPA's 404.html
// fallback: HTTP 404, and the app-shell's generic "Some UI — Focused study
// sessions" title/description until React booted and took over. A browser
// never notices (JS renders the correct route either way), but a crawler,
// link-preview bot, or automated portfolio check reading the raw response
// does — the one URL this app is shared as a résumé link would read as
// missing or unrelated to anyone that doesn't run its JS.
//
// This asserts the published page never regresses back to that: a real
// HTTP 200, résumé-specific <title>/description, the canonical /resume/
// URL, and a stable identifier readable from the initial HTML alone.
//
// Usage: node scripts/check-resume-deploy.mjs [url]
// `url` defaults to the production Pages deployment; pass an explicit one
// (e.g. a workflow's `steps.deployment.outputs.page_url` + "resume/") to
// check a different deploy without editing this file.
const DEFAULT_URL = "https://paulgsc.github.io/some-ui/resume/"
const EXPECTED_CANONICAL = "https://paulgsc.github.io/some-ui/resume/"
const EXPECTED_RESUME_ID = "paul-gathondu-resume"

function fail(message) {
  // eslint-disable-next-line no-console
  console.error(`[check-resume-deploy] FAIL: ${message}`)
  process.exitCode = 1
}

function extractTag(html, regex, label) {
  const match = regex.exec(html)
  if (!match) fail(`could not find ${label} in the response body`)
  return match?.[1] ?? null
}

async function main() {
  const url = process.argv[2] || DEFAULT_URL
  // eslint-disable-next-line no-console
  console.log(`[check-resume-deploy] checking ${url}`)

  const response = await fetch(url, { redirect: "manual" })
  if (response.status !== 200) {
    fail(`expected HTTP 200, got ${response.status} ${response.statusText}`)
    // A non-200 response body isn't worth parsing further - every other
    // assertion below would just compound the same failure.
    return
  }

  const html = await response.text()

  const title = extractTag(html, /<title>([^<]*)<\/title>/i, "<title>")
  if (title !== null && !/résumé|resume/i.test(title)) {
    fail(`<title> is not résumé-specific: ${JSON.stringify(title)}`)
  }

  const description = extractTag(
    html,
    /<meta\s+name="description"\s+content="([^"]*)"/i,
    'meta[name="description"]'
  )
  if (description !== null && !/résumé|resume/i.test(description)) {
    fail(
      `meta description is not résumé-specific: ${JSON.stringify(description)}`
    )
  }

  const canonical = extractTag(
    html,
    /<link\s+rel="canonical"\s+href="([^"]*)"/i,
    'link[rel="canonical"]'
  )
  if (canonical !== null && canonical !== EXPECTED_CANONICAL) {
    fail(
      `canonical URL is ${JSON.stringify(canonical)}, expected ${JSON.stringify(EXPECTED_CANONICAL)}`
    )
  }

  const resumeId = extractTag(
    html,
    /<meta\s+name="resume-id"\s+content="([^"]*)"/i,
    'meta[name="resume-id"]'
  )
  if (resumeId !== null && resumeId !== EXPECTED_RESUME_ID) {
    fail(
      `resume-id is ${JSON.stringify(resumeId)}, expected ${JSON.stringify(EXPECTED_RESUME_ID)}`
    )
  }

  if (process.exitCode) {
    // eslint-disable-next-line no-console
    console.error("[check-resume-deploy] one or more checks failed")
  } else {
    // eslint-disable-next-line no-console
    console.log(
      "[check-resume-deploy] OK: 200, résumé metadata, canonical URL, stable identifier all present"
    )
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error))
})
