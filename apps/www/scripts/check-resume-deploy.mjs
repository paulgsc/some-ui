#!/usr/bin/env node
// Deployment regression check for the /resume shell (apps/www/resume/index.html).
//
// Pages has no server-side rewrite, so without that shell /some-ui/resume/
// would be the SPA's 404.html: HTTP 404 with the generic title, which a
// crawler or link-preview bot reads as missing. This asserts a real 200,
// résumé-specific <title>/description, the canonical /resume/ URL, and a
// stable identifier in the initial HTML.
//
// Usage: node scripts/check-resume-deploy.mjs [url]
// `url` defaults to the production Pages deployment.
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
    // Every other assertion would compound a non-200.
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
