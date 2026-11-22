/**
 * The public site's front page (PAGES, #3401; C1055): a CV a recruiter reads
 * in one screen, drawn at build time from the résumé's own data and the
 * landing's words (`words.ts`). Pure: data in, HTML out, so a test reads
 * exactly what Pages serves. vite.config.ts writes it into
 * `landing/index.html`, the Pages build's `index.html`.
 *
 * The page carries no script. Its pictures are slots, each named by the
 * build-time asset it will hold (`data-asset`). Until that asset exists, the
 * slot draws a placeholder in CSS: a title card for a clip, a labelled drawing
 * for a gap. The photo slot holds the mochi, drawn from the brand cast
 * (`mochiSvg`), until the owner's photo is bundled.
 */
import type { ResumeData } from "@some-ui/resume"

import { SITE_URL } from "./output.ts"
import type { GapWords, LandingWords, ProjectWords } from "./words.ts"
import { LANDING_WORDS } from "./words.ts"

/** Text into HTML, as text: the five characters that could open markup. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

const e = escapeHtml

/** A link the page offers; every one leaves for GitHub or mail. */
const link = (label: string, href: string): string =>
  `<a href="${e(href)}">${e(label)}</a>`

const projectCard = (p: ProjectWords): string => `
        <article class="card">
          <figure class="clip" data-slot="clip" data-asset="${e(p.clip)}">
            <div class="title-card title-card--${e(p.id)}" aria-hidden="true">${e(p.title)}</div>
          </figure>
          <div class="body">
            <h3>${e(p.title)}</h3>
            <p class="stack">${e(p.stack)}</p>
            <p>${e(p.line)}</p>
            <p class="links">${p.links.map((l) => link(l.label, l.href)).join("")}</p>
          </div>
        </article>`

/** The gap's drawn visual, by gap: what the still will show, drawn. */
const GAP_DRAWING: Readonly<Record<GapWords["id"], string>> = {
  "page-filter": `<div class="drawing drawing--filter" aria-hidden="true"><div class="page light"><span class="part"></span></div><div class="page dark"><span class="part white"></span></div></div>`,
  cores: `<div class="drawing drawing--cores" aria-hidden="true"><svg viewBox="0 0 400 150" preserveAspectRatio="none"><path d="M0 22 H400" class="cores-line"/><path d="M0 110 C40 90 70 50 110 46 S180 30 220 60 S300 28 340 38 S380 30 400 34 V150 H0Z" class="busy"/><path d="M0 146 C50 142 90 128 120 130 S200 112 240 126 S320 108 360 118 S390 112 400 114 V150 H0Z" class="waiting"/></svg></div>`,
}

const gapCard = (g: GapWords): string => `
        <article class="card">
          <figure class="clip" data-slot="still" data-asset="${e(g.visual)}">
            ${GAP_DRAWING[g.id]}
            <figcaption class="note">${e(g.visualNote)}</figcaption>
          </figure>
          <div class="body">
            <h3>${e(g.title)}</h3>
            <p>${e(g.line)}</p>
          </div>
        </article>`

const role = (title: string, when: string, body: string): string => `
          <div class="job">
            <h3>${e(title)}</h3>
            <span class="when">${e(when)}</span>
            ${body}
          </div>`

/** The page's `<head>` words: its title, description and canonical address. */
export function renderLandingHead(words: LandingWords = LANDING_WORDS): string {
  return `<title>${e(words.title)}</title>
    <meta name="description" content="${e(words.description)}" />
    <link rel="canonical" href="${SITE_URL}" />`
}

/**
 * The page's `<body>` content, from one résumé version (its profile, roles,
 * dates and education) and the landing's words.
 */
export function renderLanding(
  resume: ResumeData,
  mochiSvg: string,
  words: LandingWords = LANDING_WORDS
): string {
  const { profile } = resume
  const where = profile.location === null ? "" : ` · ${profile.location}`
  const jobs = [
    role(
      resume.engagement.role,
      resume.engagement.dates,
      `<p>${e(words.independentNote)}</p>`
    ),
    ...resume.additionalExperience.map((r) =>
      role(
        `${r.role}, ${r.org}`,
        r.detail === null ? r.dates : `${r.dates} · ${r.detail}`,
        r.bullets.length === 0
          ? ""
          : r.bullets.length === 1
            ? `<p>${e(r.bullets[0] ?? "")}</p>`
            : `<ul>${r.bullets.map((b) => `<li>${e(b)}</li>`).join("")}</ul>`
      )
    ),
  ].join("")
  const education = resume.education
    .map(
      (ed) => `<p>${e(`${ed.credential}, ${ed.institution}, ${ed.dates}`)}</p>`
    )
    .join("")
  return `
    <header class="top">
      <div class="in">
        <figure class="photo" data-slot="photo" data-asset="photo/portrait.webp" role="img" aria-label="${e(words.photoAlt)}">${mochiSvg}</figure>
        <div class="who">
          <h1>${e(profile.name)}</h1>
          <p class="role">${e(words.role + where)}</p>
          <div class="contact">
            <a class="btn" href="resume.pdf">${e(words.resume)}</a>
            ${link(profile.email, `mailto:${profile.email}`)}
            ${link(profile.github, `https://${profile.github}`)}
          </div>
        </div>
      </div>
    </header>
    <main>
      <p class="lede">${e(words.lede)}</p>
      <h2 class="section-title">${e(words.projectsTitle)}</h2>
      <div class="grid">${words.projects.map(projectCard).join("")}
      </div>
      <h2 class="section-title">${e(words.gapsTitle)}</h2>
      <div class="grid gaps">${words.gaps.map(gapCard).join("")}
      </div>
      <div class="two">
        <section aria-labelledby="h-exp">
          <h2 id="h-exp">${e(words.experienceTitle)}</h2>${jobs}
        </section>
        <section aria-labelledby="h-skills">
          <h2 id="h-skills">${e(words.skillsTitle)}</h2>
          <p>${e(words.skills)}</p>
          <h2>${e(words.educationTitle)}</h2>
          ${education}
        </section>
      </div>
      <footer>${e(words.footerKeeps)} ${link(words.footerSource, words.sourceHref)}</footer>
    </main>`
}
