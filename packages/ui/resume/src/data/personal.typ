// ═══════════════════════════════════════════════════════════════════════════
//  Personal facts that are NOT derivable from the source repositories.
//
//  Everything in src/data/resume.typ is distilled from paulgsc/some-ui and
//  paulgsc/server — each claim traces to code, and src/canon/resume.meta.typ
//  records the trace. The fields below cannot be derived that way: degrees,
//  spoken languages, certifications, and non-engineering employment exist
//  outside both repositories.
//
//  They are therefore left EMPTY rather than filled with plausible-looking
//  values. A résumé is used to make hiring claims about a real person, so an
//  invented certification or degree is not a placeholder — it is a false
//  statement waiting to be sent to an employer. Fill these in from your own
//  records.
//
//  Every template renders a section only when its list is non-empty, so an
//  unfilled field costs nothing but the space it would have taken — the
//  fitting pass in src/lib/fit.typ redistributes it automatically, and the
//  page stays full.
// ═══════════════════════════════════════════════════════════════════════════

#let personal = (
  // Shown under the header when set, e.g. "Indianapolis, Indiana".
  location: "Berkeley, CA",

  // No phone number, LinkedIn URL or street address here, ever: this file
  // is committed and public. Those are supplied per build, and only through
  // the LAN render service (scripts/serve.mjs; src/lib/pii.typ says how).

  // Real and true (per the candidate's own non-engineering résumé), but not
  // wired into any template's render() yet: whether it is worth a line
  // depends on the specific posting, which a static build can't know. Set it
  // true in a one-off application copy rather than rendering it everywhere.
  work-authorization: "Authorized to work in the US for any employer",

  // (institution, credential, detail, dates)
  education: (
    (
      institution: "University of California, Merced",
      credential: "B.S. Mechanical Engineering",
      detail: "Merced, CA",
      dates: "2011 — 2015",
    ),
  ),

  // (name, note, level) — level is 1–5, rendered as the reference's dots.
  languages: (),
  //   (name: "English", note: "Native", level: 5),

  // (name, issuer, year)
  certifications: (),
  //   (name: "…", issuer: "…", year: "2024"),

  // (title, body) — short, and only if they support the application.
  interests: (),

  // Non-engineering roles. Keep the same shape as an engineering entry so the
  // templates can render them without a special case: the résumé is stronger
  // for showing continuous employment, and transferable evidence (ownership,
  // throughput, customer contact) belongs on the page when it is real.
  //
  // One specific past non-engineering employer (CABA Design, 2020 — 2023)
  // rather than a consolidated, date-spanning entry across every employer on
  // the candidate's non-engineering résumé — Natera, WIS, and PayLocity also
  // appear there, on their own separate dates (see
  // src/canon/resume.meta.typ's "Non-engineering employment history" for
  // all four, sourced from that résumé): the point here is naming
  // transferable, evidence-backed skills from one real job, not
  // re-litigating a separate career in detail — or implying tenure this
  // entry alone doesn't cover — on an engineering résumé.
  //
  // (role, org, detail, dates, bullets)
  additional-experience: (
    (
      role: "Data Administrator",
      org: "CABA Design",
      detail: "Rancho Cordova, CA",
      dates: "2020 — 2023",
      bullets: (
        "Built interactive Tableau dashboards on PostgreSQL for daily operational visibility.",
        "Automated executive reporting through Google Workspace API integration, saving 10+ hours weekly.",
        "Automated record creation and resolved data issues with Python scripts against Odoo's XML-RPC API, eliminating manual intervention.",
      ),
    ),
  ),
)
