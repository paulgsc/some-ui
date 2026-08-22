import type { JSX } from "react"

import type {
  ResumeData,
  ResumeHighlight,
  ResumeProject,
  ResumeRepository,
  ResumeToolboxGroup,
} from "./types"

// The web reading view of a résumé composition.
//
// This is deliberately NOT a reproduction of the Typst templates. A PDF does
// not render inline on any mobile browser, and Typst's SVG export carries no
// text at all — only glyph outlines — so the page previously showed an image
// with a hand-copied `sr-only` transcript beside it. That transcript was a
// second copy of the résumé, and it had already drifted from the source.
//
// So this renders the same content as ordinary semantic HTML: selectable,
// searchable, crawlable, screen-reader navigable, themed by the host app's own
// tokens (no filter tricks for dark mode), and a few KB instead of 1.1 MB.
//
// It does not mirror the rail, the avatar, or the two-column grid, and it
// should not start to. Those are print decisions; two-column layouts read
// badly on a phone, and every template or theme change would otherwise have to
// be made twice with nothing able to assert the two agree. The PDF remains the
// canonical artefact — this is how you read it without downloading it.

type ResumeDocumentProps = {
  data: ResumeData
  className?: string
}

const Section = ({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}): JSX.Element => (
  <section className="mt-6 first:mt-0">
    <h2 className="border-border text-foreground border-b pb-1 text-sm font-bold tracking-wide uppercase">
      {title}
    </h2>
    <div className="mt-2">{children}</div>
  </section>
)

const Bullets = ({ items }: { items: ReadonlyArray<string> }): JSX.Element => (
  <ul className="text-foreground mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
    {items.map((item) => (
      <li key={item}>{item}</li>
    ))}
  </ul>
)

// Title over supporting line, the shape the rail entries use in print.
const Pair = ({
  term,
  detail,
}: {
  term: string
  detail: string
}): JSX.Element => (
  <div className="mt-3 first:mt-0">
    <dt className="text-foreground text-sm font-semibold">{term}</dt>
    <dd className="text-muted-foreground mt-1 text-sm leading-relaxed">
      {detail}
    </dd>
  </div>
)

const Project = ({ project }: { project: ResumeProject }): JSX.Element => (
  <article className="mt-5 first:mt-0">
    <h3 className="text-foreground text-sm font-semibold">{project.name}</h3>
    <p className="text-muted-foreground mt-1 text-xs">{project.kind}</p>
    <p className="text-primary mt-1.5 text-sm italic">{project.premise}</p>
    <Bullets items={project.bullets} />
  </article>
)

export const ResumeDocument = ({
  data,
  className,
}: ResumeDocumentProps): JSX.Element => {
  const { profile, engagement } = data

  return (
    <article
      className={`text-foreground mx-auto max-w-2xl px-4 py-6 ${className ?? ""}`}
    >
      <header>
        <h1 className="text-2xl font-black tracking-tight">{profile.name}</h1>
        <p className="text-primary mt-1 text-sm">
          {profile.title}
          <span aria-hidden="true"> | </span>
          {data.label}
        </p>
        {/* A real <address> so the contact block is announced as one, and the
            links are tappable rather than text a reader has to transcribe. */}
        <address className="text-muted-foreground mt-2 space-y-0.5 text-sm not-italic">
          <a className="block underline" href={`mailto:${profile.email}`}>
            {profile.email}
          </a>
          <a className="block underline" href={`https://${profile.github}`}>
            {profile.github}
          </a>
          <a className="block underline" href={`https://${profile.portfolio}`}>
            {profile.portfolio}
          </a>
          {profile.location !== null && <span>{profile.location}</span>}
        </address>
      </header>

      <Section title="Summary">
        <p className="text-sm leading-relaxed">{data.summary}</p>
      </Section>

      <Section title="Skills">
        <p className="text-sm leading-relaxed">{data.skills}</p>
      </Section>

      <Section title="Experience">
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h3 className="text-foreground text-sm font-bold">
              {engagement.role}
            </h3>
            <span className="text-muted-foreground text-xs">
              {engagement.dates}
            </span>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="text-primary text-sm font-semibold">
              {engagement.org}
            </p>
            <span className="text-muted-foreground text-xs">
              {engagement.note}
            </span>
          </div>
        </div>
        {data.projects.map((project: ResumeProject) => (
          <Project key={project.name} project={project} />
        ))}
      </Section>

      <Section title="Key achievements">
        <dl>
          {data.highlights.map((item: ResumeHighlight) => (
            <Pair key={item.title} term={item.title} detail={item.body} />
          ))}
        </dl>
      </Section>

      <Section title="Technical toolbox">
        <dl>
          {data.toolbox.map((group: ResumeToolboxGroup) => (
            <Pair key={group.label} term={group.label} detail={group.items} />
          ))}
        </dl>
      </Section>

      <Section title="Engineering practice">
        <Bullets items={data.platform} />
      </Section>

      <Section title="Repositories">
        <dl>
          {data.repositories.map((repo: ResumeRepository) => (
            <Pair key={repo.name} term={repo.name} detail={repo.body} />
          ))}
        </dl>
      </Section>

      {/* Sections below come from src/data/personal.typ, which ships empty
          rather than filled with plausible-looking values. They render only
          once they carry real data — same rule the print templates follow. */}
      {data.additionalExperience.length > 0 && (
        <Section title="Additional experience">
          {data.additionalExperience.map((role) => (
            <article
              key={`${role.org}-${role.role}`}
              className="mt-4 first:mt-0"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <h3 className="text-foreground text-sm font-semibold">
                  {role.role}
                </h3>
                <span className="text-muted-foreground text-xs">
                  {role.dates}
                </span>
              </div>
              <p className="text-primary text-sm font-semibold">{role.org}</p>
              {role.detail !== null && (
                <p className="text-muted-foreground mt-1 text-xs">
                  {role.detail}
                </p>
              )}
              <Bullets items={role.bullets} />
            </article>
          ))}
        </Section>
      )}

      {data.education.length > 0 && (
        <Section title="Education">
          {data.education.map((entry) => (
            <div key={entry.institution} className="mt-3 first:mt-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <h3 className="text-foreground text-sm font-semibold">
                  {entry.credential}
                </h3>
                <span className="text-muted-foreground text-xs">
                  {entry.dates}
                </span>
              </div>
              <p className="text-primary text-sm font-semibold">
                {entry.institution}
              </p>
              {entry.detail !== null && (
                <p className="text-muted-foreground mt-1 text-xs">
                  {entry.detail}
                </p>
              )}
            </div>
          ))}
        </Section>
      )}

      {data.certifications.length > 0 && (
        <Section title="Training / courses">
          <dl>
            {data.certifications.map((cert) => (
              <Pair
                key={cert.name}
                term={cert.name}
                detail={`${cert.issuer}, ${cert.year}`}
              />
            ))}
          </dl>
        </Section>
      )}

      {data.languages.length > 0 && (
        <Section title="Languages">
          <ul className="text-sm">
            {data.languages.map((language) => (
              <li key={language.name}>
                {language.name}
                <span className="text-muted-foreground">
                  {" "}
                  — {language.note}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.interests.length > 0 && (
        <Section title="Interests">
          <dl>
            {data.interests.map((topic) => (
              <Pair key={topic.title} term={topic.title} detail={topic.body} />
            ))}
          </dl>
        </Section>
      )}
    </article>
  )
}
