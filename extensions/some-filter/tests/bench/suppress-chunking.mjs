/**
 * Measures the cost of splitting one suppress/read/restore transaction into
 * K chunks — the assumption `src/kernel/dispatch.ts` rests on.
 *
 * The kernel closes the vendor-colour suppression transaction before every
 * yield, so the page is never painted unthemed. The obvious objection is
 * that toggling `CSSStyleSheet.disabled` invalidates style document-wide,
 * so K chunks might cost K full style recalculations and turn an O(S) pass
 * into O(S^2/C). This says otherwise.
 *
 * Measured against a 36,186-element dense diff in Chromium 1194:
 *
 *   chunks    1     2     4     8    16    30    60
 *   total ms 68.9  60.9  70.3  64.5  56.1  60.8  57.3
 *
 * Flat, with the trend if anything downward — Chromium's invalidation is
 * lazy and incremental, the elements re-resolved are the ones being read
 * anyway, and the reads dominate. Re-run this if a future engine makes the
 * toggle eager; the e2e canary is the other thing that would catch it.
 *
 *   node tests/bench/suppress-chunking.mjs
 *
 * Not a test: it prints numbers and asserts nothing. The judgement it
 * supports is recorded in dispatch.ts's header, where the design decision
 * that depends on it lives.
 */

/* eslint-disable no-console -- a benchmark's output IS its result; it prints a
   table and asserts nothing, which is why it lives in tests/bench/ and not in
   a spec. See this file's header. */

import { chromium } from "@playwright/test"

// Playwright's own Chromium. The revision suffix changes between
// installs — check $PLAYWRIGHT_BROWSERS_PATH if this path is stale.
const EXE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

const page_html = (files, lines) => `<!doctype html><html><head>
<style id="own-theme">
  .diff-line { background-color: #171c25 !important; color: #c9d1d9 !important; }
  span { color: #c9d1d9 !important; }
</style></head><body><div id="b"></div>
<script>
  const out=[]
  for (let f=0; f<${files}; f++) {
    const rows=[]
    for (let l=0; l<${lines}; l++) {
      const bg = l%7===0 ? '#e6ffec' : (l%11===0 ? '#ffebe9' : '#ffffff')
      rows.push('<div class="diff-line" style="background-color:'+bg+'"><span style="color:#6e7781">'+l+'</span><span style="color:#1f2328">const v'+l+'='+l+';</span></div>')
    }
    out.push('<details open style="background-color:#fff"><summary style="background-color:#f6f8fa">f'+f+'.ts</summary><div>'+rows.join('')+'</div></details>')
  }
  document.getElementById('b').innerHTML = out.join('')
</script></body></html>`

const browser = await chromium.launch({ executablePath: EXE, headless: true })
const page = await browser.newPage()
await page.setContent(page_html(60, 200))
const nodes = await page.evaluate(() => document.querySelectorAll("*").length)

const result = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll("*"))
  const sheet = document.getElementById("own-theme").sheet

  // One suppressed burst over `slice`, restoring at the end.
  function burst(slice) {
    sheet.disabled = true
    let acc = 0
    for (const el of slice) acc += getComputedStyle(el).backgroundColor.length
    sheet.disabled = false
    return acc
  }

  function run(chunks) {
    const size = Math.ceil(els.length / chunks)
    const t0 = performance.now()
    let acc = 0
    for (let i = 0; i < els.length; i += size)
      acc += burst(els.slice(i, i + size))
    return { chunks, ms: Number((performance.now() - t0).toFixed(1)), acc }
  }

  // Warm up so first-run layout isn't attributed to chunk count.
  run(1)
  return [1, 2, 4, 8, 16, 30, 60].map(run)
})

console.log(`nodes=${nodes}`)
console.log("chunks | suppress/restore cycles | total ms")
for (const r of result)
  console.log(
    String(r.chunks).padStart(6),
    "|",
    String(r.chunks).padStart(23),
    "|",
    r.ms
  )
await browser.close()
