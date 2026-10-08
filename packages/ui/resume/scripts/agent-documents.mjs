// The résumé as documents an agent can read without a browser: one Markdown
// and one JSON Resume file per composition, plus an llms.txt index.
//
// Pure functions over the `<resume-export>` data scripts/export-data.mjs reads
// back from the laid-out Typst document, so these files and the PDFs cannot
// describe different résumés. export-data.mjs writes them into documents/
// beside the PDFs, and apps/www/scripts/sync-resume.mjs publishes the lot.
//
// What these add over the PDF is the evidence: every claim carries the
// repository paths it rests on, as links a reader can open to check it.
// Links follow each repository's default branch, so they read the current
// source; a claim the source stops supporting is cut, as for any other claim.

const JSON_RESUME_SCHEMA =
  "https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json"

/** The site the documents are published under, from the profile. */
function siteUrl(profile) {
  return `https://${profile.portfolio.replace(/\/+$/, "")}/`
}

/** A GitHub link for one evidence entry (`tree/` redirects for files too). */
export function evidenceUrl({ repo, path }) {
  return `https://github.com/${repo}/tree/main/${encodeURI(path)}`
}

export function documentName(variant, extension) {
  return `resume-${variant}.${extension}`
}

// "2024 — Present", "2020 — 2023", "2015": JSON Resume wants ISO dates, and a
// range the pattern does not recognise is left out rather than guessed.
function dateRange(dates) {
  const range = /^(\d{4})\s*[—–-]\s*(Present|\d{4})$/.exec(dates.trim())
  if (range) {
    return range[2] === "Present"
      ? { startDate: range[1] }
      : { startDate: range[1], endDate: range[2] }
  }
  return /^\d{4}$/.test(dates.trim()) ? { endDate: dates.trim() } : {}
}

function claimEvidence(claims) {
  return claims.map((claim) => ({
    claim: claim.text,
    sources: claim.evidence.map(evidenceUrl),
  }))
}

function splitList(items) {
  return items
    .split(/[,;]\s*/)
    .map((item) => item.trim())
    .filter(Boolean)
}

// "Berkeley, CA" -> city and region; anything else stays a free-form address.
function location(text) {
  if (!text) return undefined
  const cityRegion = /^([^,]+),\s*([A-Z]{2})$/.exec(text)
  return cityRegion
    ? { city: cityRegion[1], region: cityRegion[2] }
    : { address: text }
}

/**
 * One composition as JSON Resume (v1.0.0). Standard fields carry the claims as
 * plain text; `evidence` beside them (the schema allows extra properties)
 * pairs each claim with its source links.
 */
export function toJsonResume(data) {
  const site = siteUrl(data.profile)
  const github = data.profile.github.replace(/^https?:\/\//, "")
  return {
    $schema: JSON_RESUME_SCHEMA,
    basics: {
      name: data.profile.name,
      label: `${data.profile.title} — ${data.label}`,
      email: data.profile.email,
      url: site,
      summary: data.summary,
      location: location(data.profile.location),
      profiles: [
        {
          network: "GitHub",
          username: github.split("/").pop(),
          url: `https://${github}`,
        },
      ],
    },
    work: [
      {
        name: data.engagement.org,
        position: data.engagement.role,
        ...dateRange(data.engagement.dates),
        summary: data.engagement.note,
        highlights: data.platform.map((claim) => claim.text),
        evidence: claimEvidence(data.platform),
      },
      ...data.additionalExperience.map((role) => ({
        name: role.org,
        position: role.role,
        ...(role.detail ? { location: role.detail } : {}),
        ...dateRange(role.dates),
        highlights: role.bullets,
      })),
    ],
    projects: data.projects.map((project) => ({
      name: project.name,
      description: project.premise,
      keywords: splitList(project.kind),
      highlights: project.bullets.map((claim) => claim.text),
      evidence: claimEvidence(project.bullets),
    })),
    skills: data.toolbox.map((group) => ({
      name: group.label,
      keywords: splitList(group.items),
    })),
    education: data.education.map((entry) => ({
      institution: entry.institution,
      studyType: entry.credential,
      ...dateRange(entry.dates),
    })),
    languages: data.languages.map((language) => ({
      language: language.name,
      fluency: language.note,
    })),
    certificates: data.certifications.map((cert) => ({
      name: cert.name,
      issuer: cert.issuer,
      date: cert.year,
    })),
    interests: data.interests.map((interest) => ({
      name: interest.title,
      summary: interest.body,
    })),
    meta: {
      canonical: `${site}${documentName(data.variant, "json")}`,
    },
  }
}

// Markdown control characters that could turn résumé prose into markup.
// Intraword underscores (`file_host`) are left alone: CommonMark never reads
// them as emphasis.
function escapeMarkdown(text) {
  return text
    .replace(/[\\`*[\]<>]/g, "\\$&")
    .replace(/(^|[^A-Za-z0-9])_|_(?=[^A-Za-z0-9]|$)/g, (match) =>
      match.replace("_", "\\_")
    )
}

function evidenceLine({ repo, path }) {
  return `[${repo}: ${path}](${evidenceUrl({ repo, path })})`
}

function claimLines(claims) {
  return claims.flatMap((claim) => [
    `- ${escapeMarkdown(claim.text)}`,
    `  - Evidence: ${claim.evidence.map(evidenceLine).join(", ")}`,
  ])
}

function section(title, lines) {
  return lines.length ? ["", `## ${title}`, "", ...lines] : []
}

/** One composition as Markdown, every claim followed by its evidence. */
export function toMarkdown(data, variants) {
  const site = siteUrl(data.profile)
  const { profile, engagement } = data
  const others = variants.filter((variant) => variant !== data.variant)
  return [
    `# ${profile.name} — ${profile.title}`,
    "",
    `${escapeMarkdown(data.label)} composition. Every claim below is followed ` +
      "by the source it rests on, in the public repositories it was " +
      "distilled from; links follow each repository's default branch.",
    "",
    `- Email: ${profile.email}`,
    `- GitHub: https://${profile.github.replace(/^https?:\/\//, "")}`,
    `- Portfolio: ${site}`,
    ...(profile.location ? [`- Location: ${profile.location}`] : []),
    `- PDF: ${site}${documentName(data.variant, "pdf")}`,
    `- JSON Resume: ${site}${documentName(data.variant, "json")}`,
    ...(others.length
      ? [
          `- Other compositions: ${others
            .map((variant) => `${site}${documentName(variant, "md")}`)
            .join(", ")}`,
        ]
      : []),
    ...section("Summary", [escapeMarkdown(data.summary)]),
    ...section("Skills", [escapeMarkdown(data.skills)]),
    ...section("Experience", [
      `### ${escapeMarkdown(engagement.role)}`,
      "",
      `${escapeMarkdown(engagement.org)} · ${engagement.dates} · ${escapeMarkdown(
        engagement.note
      )}`,
      ...data.projects.flatMap((project) => [
        "",
        `#### ${escapeMarkdown(project.name)}`,
        "",
        `${escapeMarkdown(project.kind)}`,
        "",
        `> ${escapeMarkdown(project.premise)}`,
        "",
        ...claimLines(project.bullets),
      ]),
    ]),
    ...section("Engineering practice", claimLines(data.platform)),
    ...section(
      "Highlights",
      data.highlights.map(
        (item) =>
          `- **${escapeMarkdown(item.title)}**: ${escapeMarkdown(item.body)}`
      )
    ),
    ...section(
      "Toolbox",
      data.toolbox.map(
        (group) =>
          `- **${escapeMarkdown(group.label)}**: ${escapeMarkdown(group.items)}`
      )
    ),
    ...section(
      "Repositories",
      data.repositories.map(
        (repo) =>
          `- [${repo.name}](https://github.com/${repo.name}): ${escapeMarkdown(
            repo.body
          )}`
      )
    ),
    ...section(
      "Additional experience",
      data.additionalExperience.flatMap((role) => [
        `### ${escapeMarkdown(role.role)}, ${escapeMarkdown(role.org)}`,
        "",
        [role.detail, role.dates].filter(Boolean).join(" · "),
        "",
        ...role.bullets.map((bullet) => `- ${escapeMarkdown(bullet)}`),
      ])
    ),
    ...section(
      "Education",
      data.education.map(
        (entry) =>
          `- ${escapeMarkdown(entry.credential)}, ` +
          `${escapeMarkdown(entry.institution)}` +
          `${entry.detail ? ` (${escapeMarkdown(entry.detail)})` : ""}, ${
            entry.dates
          }`
      )
    ),
    ...section(
      "Languages",
      data.languages.map(
        (language) =>
          `- ${escapeMarkdown(language.name)}: ${escapeMarkdown(language.note)}`
      )
    ),
    ...section(
      "Certifications",
      data.certifications.map(
        (cert) =>
          `- ${escapeMarkdown(cert.name)}, ${escapeMarkdown(cert.issuer)}, ${
            cert.year
          }`
      )
    ),
    ...section(
      "Interests",
      data.interests.map(
        (interest) =>
          `- **${escapeMarkdown(interest.title)}**: ${escapeMarkdown(
            interest.body
          )}`
      )
    ),
    "",
  ].join("\n")
}

/**
 * The llms.txt index (https://llmstxt.org): who this is, and where each
 * composition lives in each format. `exported` maps variant to its data, in
 * the order compositions should be listed; the first is the default, which
 * also claims the unsuffixed resume.{pdf,md,json}.
 */
export function toLlmsTxt(exported) {
  const all = Object.values(exported)
  const [first] = all
  const site = siteUrl(first.profile)
  const { profile } = first
  return [
    `# ${profile.name}`,
    "",
    `> ${first.summary}`,
    "",
    `${first.engagement.role} (${first.engagement.dates}): ` +
      `${first.engagement.note}. Each composition below argues for a ` +
      "different role from the same " +
      "evidence. The Markdown and JSON forms pair every claim with links to " +
      "the source it rests on, so a claim can be checked rather than taken " +
      "on trust. The PDFs are the documents for submission.",
    "",
    "## Résumé",
    "",
    ...all.map(
      (data) =>
        `- [${data.label}](${site}${documentName(data.variant, "md")}): ` +
        `${profile.title} — ${data.label}, as Markdown with evidence links`
    ),
    "",
    "## Structured data",
    "",
    ...all.map(
      (data) =>
        `- [${data.label} (JSON Resume)](${site}` +
        `${documentName(data.variant, "json")}): JSON Resume v1.0.0, with ` +
        "an `evidence` list beside each set of claims"
    ),
    "",
    "## Source",
    "",
    ...first.repositories.map(
      (repo) =>
        `- [${repo.name}](https://github.com/${repo.name}): ${repo.body}`
    ),
    "",
    "## Optional",
    "",
    `- [Résumé page](${site}resume/): the same compositions, for reading in a browser`,
    ...all.map(
      (data) =>
        `- [${data.label} (PDF)](${site}${documentName(data.variant, "pdf")}): ` +
        "one page, for submission"
    ),
    "",
  ].join("\n")
}
