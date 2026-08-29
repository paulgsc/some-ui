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

  // Left empty deliberately, same reasoning as every other field in this
  // file: a real phone number belongs in git history and a public
  // repository's diff even less than it belongs in a rendered PDF. Fill
  // this in locally, on your own machine, only when you're about to
  // generate a specific application's PDF — and don't commit that change.
  //
  // Submission-only once set: rendered by the ATS-submission templates
  // (classic, safe, vanilla, conventional — see their
  // `contact-line(..., phone: ...)` call), never by the portfolio
  // templates (rail, compact) whose PDFs are embedded and linked directly
  // on the public website, and never exposed via the `<resume-export>`
  // metadata block in src/main.typ that feeds the public web viewer.
  phone: none,

  // Not currently used by any template — see below. Kept here so the fact is
  // recorded once rather than re-typed per application.
  linkedin: none,

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
      detail: none,
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
  // Consolidated into one entry rather than one per employer (CABA Design,
  // Natera, WIS, Rite Aid, PayLocity all appear on the candidate's
  // non-engineering résumé): the point here is proving employment
  // continuity and naming transferable, evidence-backed skills, not
  // re-litigating a separate career in detail on an engineering résumé.
  //
  // (role, org, detail, dates, bullets)
  additional-experience: (
    (
      role: "Data Administrator / Operations",
      org: "CABA Design · Natera · WIS",
      detail: none,
      dates: "2017 — Present",
      bullets: (
        "Automated ERP record-keeping and reporting with Python and SQL while maintaining 99.9%+ data accuracy in continuous full-time employment.",
      ),
    ),
  ),
)
