/**
 * What each permission an AI service asks for lets it do, in the words the
 * approval page and Settings show. The words are paulgsc/server's
 * `auth::oauth::Scope`; one this client does not know is shown as itself,
 * so a permission added there is never hidden here.
 */
const SCOPE_TEXT: Readonly<Record<string, string>> = {
  "lessons:read": "Read the lessons everyone here is served",
  "progress:read": "Read how your studying has gone",
  shelf: "Read and keep lessons on your own shelf, which only you see",
}

export function describeScope(scope: string): string {
  return SCOPE_TEXT[scope] ?? scope
}
