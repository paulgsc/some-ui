/**
 * The interview is faux: no real employer is named, past or prospective
 * (owner, 2026-11-13, #2931). No check can tell every real name from an
 * invented one, so `finish` holds the week to the employers it can know:
 *
 * - **The owner's own**, past: each `org` on the résumé (`@some-ui/resume`'s
 *   generated data), read from the checkout so the list never drifts from it.
 *   Its line for this repo's own project is not an employer.
 * - **Large employers**, prospective: the closed lists below.
 *
 * The companies whose products this repo runs on (`PLATFORMS`) are refused
 * where they would be the employer: the company, the role and the
 * questions. A card's script may name them, because it presents this repo's
 * own work, which runs on them (C279).
 */

/** The résumé's generated data, from the repo's root. */
export const RESUME_DATA = "packages/ui/resume/src/react/generated/data.ts"

/** Each employer the résumé names: every `"org"` value but this repo's own project. */
export function resumeEmployers(text: string): Array<string> {
  const orgs = [...text.matchAll(/"org":\s*"([^"]+)"/g)].map((m) => m[1] ?? "")
  return [...new Set(orgs)].filter(
    (org) => org.trim() !== "" && !org.includes("paulgsc")
  )
}

/** Large employers no week names anywhere. */
export const EMPLOYERS: ReadonlyArray<string> = [
  "Accenture",
  "Adobe",
  "Airbnb",
  "Amazon",
  "Apple",
  "Atlassian",
  "Cisco",
  "Coinbase",
  "Databricks",
  "Datadog",
  "Deloitte",
  "DoorDash",
  "Dropbox",
  "Facebook",
  "IBM",
  "Instacart",
  "Intel",
  "LinkedIn",
  "Lyft",
  "Meta",
  "Microsoft",
  "Netflix",
  "Nvidia",
  "NVIDIA",
  "OpenAI",
  "Oracle",
  "Palantir",
  "Pinterest",
  "Robinhood",
  "Salesforce",
  "Samsung",
  "Shopify",
  "Snowflake",
  "SpaceX",
  "Spotify",
  "Stripe",
  "Tesla",
  "Twilio",
  "Twitter",
  "Uber",
]

/** Companies whose products this repo runs on: never the employer, but a card may name them. */
export const PLATFORMS: ReadonlyArray<string> = [
  "Alphabet",
  "Anthropic",
  "Cloudflare",
  "GitHub",
  "Google",
  "Mozilla",
  "YouTube",
]

const escaped = (name: string): string =>
  name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * The names of `employers` that `text` says, as written: a proper noun, so
 * "Meta" is an employer and "metadata" or "a meta point" is not.
 */
export function employersIn(
  text: string,
  employers: ReadonlyArray<string>
): Array<string> {
  return employers.filter((name) =>
    new RegExp(
      `(?<![\\p{L}\\p{N}])${escaped(name)}(?![\\p{L}\\p{N}])`,
      "u"
    ).test(text)
  )
}
