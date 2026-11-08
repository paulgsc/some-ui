/**
 * A template setting sent from Studio (SFEED11 #2707, SFEED14 #2766; ask
 * #2708, option 1): the GitHub page that opens a new issue in this
 * repository, for a session to land the setting in the code as a new pinned
 * version. The owner files it there; nothing is sent until then. Pure.
 */

const NEW_ISSUE = "https://github.com/paulgsc/some-ui/issues/new"

/** The new issue titled `title`, its body `lines`, labelled a story. */
export function templateIssueUrl(
  title: string,
  lines: ReadonlyArray<string>
): string {
  const url = new URL(NEW_ISSUE)
  url.searchParams.set("title", title)
  url.searchParams.set("body", lines.join("\n"))
  url.searchParams.set("labels", "story,kind:story")
  return url.toString()
}
