/**
 * The résumé's pages and the 404 page (PAGES, #3401; C1055): what the public
 * site serves besides the landing, read from `pages.ts` on the résumé's real
 * data. scripts/check-resume-deploy.mjs reads the same head on the deployed
 * site.
 */
import { SITE_BASE, SITE_URL } from "@/landing/output"
import type { ResumeVersion } from "@/landing/pages"
import { renderNotFound, renderResumePages, RESUME_ID } from "@/landing/pages"
import { escapeHtml } from "@/landing/render"
import { SITE_WORDS } from "@/landing/site-words"
import { resumeData } from "@some-ui/resume"
import { describe, expect, it } from "vitest"

const versions: ReadonlyArray<ResumeVersion> = [
  {
    dir: "resume/",
    pdf: "resume-backend.pdf",
    data: resumeData.backend,
    documentHtml: "<article>backend document</article>",
  },
  {
    dir: "resume/qa/",
    pdf: "resume-qa.pdf",
    data: resumeData.qa,
    documentHtml: "<article>qa document</article>",
  },
]
const pages = renderResumePages(versions)

/** Every `href` a page's head and body carry. */
const hrefs = (html: string): Array<string> =>
  [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])

describe("renderResumePages", () => {
  it("writes one page a version, under its own directory", () => {
    expect(pages.map((p) => [p.file, p.template])).toEqual([
      ["resume/index.html", "page"],
      ["resume/qa/index.html", "page"],
    ])
  })

  it("shows its own version, offers its PDF, and links to the others", () => {
    const [backend, qa] = pages
    expect(backend.body).toContain("<article>backend document</article>")
    expect(backend.body).toContain(escapeHtml(resumeData.backend.label))
    expect(backend.body).toContain(
      `href="${SITE_BASE}resume-backend.pdf" download=`
    )
    expect(backend.body).toContain(`href="${SITE_BASE}resume/qa/"`)
    expect(backend.body).not.toContain(`href="${SITE_BASE}resume/"`)
    expect(qa.body).toContain(`href="${SITE_BASE}resume/"`)
    expect(qa.body).not.toContain("backend document")
  })

  it("carries what the deploy check and a link preview read", () => {
    const head = pages[0].head
    expect(head).toMatch(/<title>[^<]*résumé[^<]*<\/title>/i)
    expect(head).toMatch(/<meta name="description" content="Résumé/)
    expect(head).toContain(`<meta name="resume-id" content="${RESUME_ID}" />`)
    expect(head).toContain(`<link rel="canonical" href="${SITE_URL}resume/" />`)
    expect(pages[1].head).toContain(`href="${SITE_URL}resume/qa/"`)
  })

  it("runs nothing, and links only within the site but for its canonical", () => {
    for (const { head, body } of pages) {
      const scripts = [...(head + body).matchAll(/<script([^>]*)>/g)]
      expect(scripts.map((m) => m[1])).toEqual([' type="application/ld+json"'])
      for (const href of hrefs(head + body)) {
        expect(href.startsWith(SITE_BASE) || href.startsWith(SITE_URL)).toBe(
          true
        )
      }
    }
  })

  it("writes text as text", () => {
    const [page] = renderResumePages([
      {
        ...versions[0],
        data: { ...resumeData.backend, label: "</script><b>x" },
      },
    ])
    expect(page.head).not.toContain("</script><b>")
    expect(page.body).toContain("&lt;/script&gt;&lt;b&gt;x")
  })
})

describe("renderNotFound", () => {
  const page = renderNotFound("resume/")

  it("is the site's 404.html, kept out of search", () => {
    expect(page.file).toBe("404.html")
    expect(page.head).toContain('<meta name="robots" content="noindex" />')
    expect(page.body).toContain(escapeHtml(SITE_WORDS.notFoundHeading))
  })

  it("leads to the front page and the résumé, from any path", () => {
    expect(hrefs(page.body)).toEqual([SITE_BASE, `${SITE_BASE}resume/`])
  })
})
