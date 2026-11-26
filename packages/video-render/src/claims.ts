/**
 * An essay is an authority (#3036): its listener, months later, can't check
 * it cheaply, so whatever it says is believed. A spoken cards essay's line
 * (an intro's or close's `said`, a scene's `narration`) names the code it
 * describes as `sources`, each a file in a repository the essay's stamp
 * pins, and a line range or a quoted phrase in it. The stamp's commit is the
 * source's: an essay says what its code said at the commits it was checked
 * against, never at a branch that moves.
 *
 * - `sourceProblems` holds an essay's sources to its stamp's commits: each
 *   file is there, its lines are in it, and its quote is said in them. A
 *   source that doesn't hold refuses the essay (C983).
 * - A scene's narration is the claim every scene makes, so one that names
 *   no source is noted, not refused (C982, C983): essays from before this
 *   are kept as first served and never rewritten.
 * - `staleClaims` lists the lines whose source has moved since: the file is
 *   gone at a later commit, or what it cited is no longer in it (C984). A
 *   stale essay is found, not believed.
 *
 * Nothing here reads a repository: the caller hands a reader (`ReadFile`),
 * as `render cards-check` and `render cards-stale` do from clones.
 */

import { assertNever } from "@some-ui/core-utils"
import { z } from "zod"

import type { CutList, Spoken } from "./cut-list"

/** A repository as a stamp names it, without its commit: `owner/repo`. */
export const SOURCE_REPO = /^[\w.-]+\/[\w.-]+$/

/**
 * The fewest characters a quote holds, so that finding it in a file says
 * something: a letter or a bracket is in every file. Policy (C771), moved
 * with the story (C985).
 */
const QUOTE_LEAST = 8

/** A path in a repository: relative, with no `..` and no empty part. */
const SourcePathSchema = z
  .string()
  .min(1)
  .refine(
    (p) =>
      p
        .split("/")
        .every((part) => part !== "" && part !== "." && part !== ".."),
    "it isn't a path inside the repository"
  )

/**
 * Where a line's claim is said in the code: a file in a repository the
 * essay's stamp pins, and the lines (first and last, from 1), a phrase
 * quoted from it, or both, when the phrase is in those lines.
 */
export const ClaimSourceSchema = z
  .strictObject({
    repo: z.string().regex(SOURCE_REPO, "it isn't owner/repo"),
    path: SourcePathSchema,
    lines: z
      .tuple([z.number().int().positive(), z.number().int().positive()])
      .refine(
        ([first, last]) => first <= last,
        "its first line is after its last"
      )
      .optional(),
    quote: z
      .string()
      .trim()
      .min(
        QUOTE_LEAST,
        `a quote of fewer than ${QUOTE_LEAST} characters is found almost anywhere`
      )
      .optional(),
  })
  .refine((s) => s.lines !== undefined || s.quote !== undefined, {
    message:
      "it names neither lines nor a quote, so nothing in the file is cited",
  })

export type ClaimSource = z.infer<typeof ClaimSourceSchema>

/** The sources a line may carry: at least one when it carries any. */
export const ClaimSourcesSchema = z.array(ClaimSourceSchema).min(1)

/** A line that says something an essay's listener believes, by its scene. */
export type Claim = {
  readonly scene: string
  readonly said: string
  readonly sources: ReadonlyArray<ClaimSource>
  /** Whether it must name a source: a scene's narration (C982). */
  readonly owed: boolean
}

/** The line a spoken field says that may carry sources, if it is one. */
function claimOf(spoken: Spoken): Omit<Claim, "scene"> | null {
  switch (spoken.role) {
    // A spoken card's turns are an exchange with the owner, not claims; a walk's lines say
    // what the walkthrough shows on screen and measured, and carry no sources (WALK5).
    case "spoken":
    case "walk": {
      return null
    }
    case "scene": {
      return {
        said: spoken.narration,
        sources: spoken.sources ?? [],
        owed: true,
      }
    }
    case "intro":
    case "close": {
      return { said: spoken.said, sources: spoken.sources ?? [], owed: false }
    }
    default: {
      return assertNever(spoken)
    }
  }
}

/** Every line of `cut` that may carry sources, in order. */
export const claimsOf = (cut: CutList): Array<Claim> =>
  cut.shots.flatMap((shot) => {
    const claim = shot.spoken === undefined ? null : claimOf(shot.spoken)
    return claim === null ? [] : [{ scene: shot.id, ...claim }]
  })

/** Each repository the stamp pins, and its commit. */
function stampCommits(cut: CutList): ReadonlyMap<string, string> {
  const commits = new Map<string, string>()
  for (const source of cut.stamp?.sources ?? []) {
    const at = source.lastIndexOf("@")
    commits.set(source.slice(0, at), source.slice(at + 1))
  }
  return commits
}

/**
 * Every source of `cut` that names a repository its stamp doesn't pin: its
 * commit would be no one's (`parseCardsEssay` refuses these).
 */
export const unpinnedSources = (cut: CutList): Array<string> => {
  const pinned = stampCommits(cut)
  const claims = claimsOf(cut)
  const repos = (cut.stamp?.sources ?? []).map((s) =>
    s.slice(0, s.lastIndexOf("@"))
  )
  // Sources are read at one commit a repository, so a stamp that cites
  // them pins each repository once. An essay citing none is as served.
  const twice = claims.some((c) => c.sources.length > 0)
    ? [...new Set(repos.filter((r, i) => repos.indexOf(r) !== i))].map(
        (r) =>
          `its stamp pins ${r} twice, so its sources can't say at which commit they are read`
      )
    : []
  return [
    ...twice,
    ...claims.flatMap((claim) =>
      claim.sources
        .filter((s) => !pinned.has(s.repo))
        .map(
          (s) =>
            `${claim.scene}: it cites ${s.repo}, and the stamp pins ${[...pinned.keys()].join(", ") || "no repository"}`
        )
    ),
  ]
}

/** Each repository any line of `cut` cites. */
export const citedRepos = (cut: CutList): Set<string> =>
  new Set(claimsOf(cut).flatMap((c) => c.sources.map((s) => s.repo)))

/**
 * A file in `repo` at `commit`, as a reader finds it: its text, no such file
 * there, no copy of the repository given, or a copy that doesn't hold that
 * commit (a shallow clone), which is the reader's to fix, not the essay's.
 */
type SourceFile =
  | { readonly kind: "file"; readonly text: string }
  | { readonly kind: "absent" }
  | { readonly kind: "no-clone" }
  | { readonly kind: "no-commit" }

export type ReadFile = (
  repo: string,
  commit: string,
  path: string
) => SourceFile

/** Text with every run of whitespace as one space, so a quote can wrap. */
const flat = (text: string): string => text.replace(/\s+/g, " ").trim()

/** `s` as `<repo> <path>[:<first>-<last>]`, for a line of a report. */
export function sourceName(s: ClaimSource): string {
  const lines =
    s.lines === undefined
      ? ""
      : s.lines[0] === s.lines[1]
        ? `:${s.lines[0]}`
        : `:${s.lines[0]}-${s.lines[1]}`
  return `${s.repo} ${s.path}${lines}`
}

/**
 * What `s` cites in `text`, the file at a commit: its lines, or the whole
 * file when it names none; or why it can't, when its lines aren't there or
 * its quote isn't said in them.
 */
function cited(
  s: ClaimSource,
  text: string
): { ok: true; cited: string } | { ok: false; why: string } {
  const lines = text.split(/\r?\n/)
  // A file that ends in a newline has no line after it.
  if (lines.at(-1) === "") lines.pop()
  let span = text
  if (s.lines !== undefined) {
    const [first, last] = s.lines
    if (last > lines.length)
      return {
        ok: false,
        why: `it has ${lines.length} lines, and the source cites up to line ${last}`,
      }
    span = lines.slice(first - 1, last).join("\n")
    // Blank lines say nothing, so citing them alone would always hold.
    if (s.quote === undefined && flat(span) === "")
      return { ok: false, why: "the lines it cites are blank" }
  }
  if (s.quote !== undefined && !flat(span).includes(flat(s.quote)))
    return {
      ok: false,
      why: `"${s.quote}" isn't said ${s.lines === undefined ? "in it" : "in those lines"}`,
    }
  return { ok: true, cited: s.quote ?? span }
}

/** What checking an essay's sources at its stamp found. */
export type SourceCheck = {
  /**
   * Sources that don't hold at the stamp's commits, and, when strict,
   * commits no clone given holds: the essay is refused until each is fixed.
   */
  readonly problems: ReadonlyArray<string>
  /** Narration that names no source, and, unless strict, commits unread. */
  readonly notes: ReadonlyArray<string>
}

/** Why `<repo>@<commit>` couldn't be read, when it couldn't. */
const unreadWhy = (file: SourceFile): string | null =>
  file.kind === "no-clone"
    ? "no clone of it was given, so its sources weren't checked"
    : file.kind === "no-commit"
      ? "the clone given doesn't hold that commit: fetch it, or more of its history, and check again"
      : null

/**
 * Every source of `cut` held to its stamp's commit through `read`: a file
 * that isn't there, lines past its end or blank, or a quote not said in them
 * is a problem; a narration with no source is a note. A commit `read` can't
 * reach (no clone of its repository, or a clone without it) is a problem
 * when `strict` (the essay being published: its author has the clones) and
 * a note otherwise (an older essay, whose commits are another session's).
 */
export function sourceProblems(
  cut: CutList,
  read: ReadFile,
  strict: boolean
): SourceCheck {
  const pinned = stampCommits(cut)
  const problems: Array<string> = []
  const unread = new Map<string, SourceFile>()
  const claims = claimsOf(cut)
  const owed = claims.filter((c) => c.owed)
  const unsourced = owed.filter((c) => c.sources.length === 0)
  for (const claim of claims)
    for (const s of claim.sources) {
      const commit = pinned.get(s.repo)
      // `parseCardsEssay` refuses a source its stamp doesn't pin.
      if (commit === undefined) continue
      const file = read(s.repo, commit, s.path)
      if (file.kind === "no-clone" || file.kind === "no-commit")
        unread.set(`${s.repo}@${commit}`, file)
      else if (file.kind === "absent")
        problems.push(
          `${claim.scene}: ${sourceName(s)}: there is no such file at ${commit}`
        )
      else {
        const found = cited(s, file.text)
        if (!found.ok)
          problems.push(
            `${claim.scene}: ${sourceName(s)} at ${commit}: ${found.why}`
          )
      }
    }
  const unreadLines = (kind: SourceFile["kind"]): Array<string> =>
    [...unread]
      .filter(([, file]) => file.kind === kind)
      .map(([at, file]) => `${at}: ${unreadWhy(file) ?? ""}`)
  return {
    problems: [
      ...problems,
      ...(strict
        ? [...unreadLines("no-commit"), ...unreadLines("no-clone")]
        : []),
    ],
    notes: [
      ...(unsourced.length > 0
        ? [
            `${unsourced.length} of ${owed.length} scenes' narration names no source: ${unsourced.map((c) => c.scene).join(", ")}`,
          ]
        : []),
      ...(strict
        ? []
        : [...unreadLines("no-commit"), ...unreadLines("no-clone")]),
    ],
  }
}

/** A line whose source has moved since its essay's stamp. */
type StaleClaim = {
  readonly scene: string
  readonly said: string
  readonly source: ClaimSource
  readonly why: string
}

/** What following an essay's sources past its stamp found. */
export type Staleness = {
  readonly stale: ReadonlyArray<StaleClaim>
  /** Sources that couldn't be followed, and why: never counted as holding. */
  readonly unfollowed: ReadonlyArray<string>
}

/**
 * Every line of `cut` whose source has moved between its stamp's commit and
 * the commit `now` gives for its repository: the file is gone, or what it
 * cited there (its quote, or its lines' text) is no longer in it, even
 * moved elsewhere in the file. A source that can't be read at either
 * commit, or didn't hold at the stamp, is unfollowed, never fresh.
 */
export function staleClaims(
  cut: CutList,
  read: ReadFile,
  now: (repo: string) => string | undefined
): Staleness {
  const pinned = stampCommits(cut)
  const stale: Array<StaleClaim> = []
  const unfollowed = new Set<string>()
  for (const claim of claimsOf(cut))
    for (const source of claim.sources) {
      const was = pinned.get(source.repo)
      if (was === undefined) continue
      const is = now(source.repo)
      if (is === undefined) {
        unfollowed.add(
          `${source.repo}: no clone of it was given, or it has no such commit to follow to`
        )
        continue
      }
      if (was === is) continue
      const before = read(source.repo, was, source.path)
      const after = read(source.repo, is, source.path)
      const unread = unreadWhy(before) ?? unreadWhy(after)
      if (unread !== null) {
        unfollowed.add(
          `${source.repo}@${unreadWhy(before) === null ? is : was}: ${unread}`
        )
        continue
      }
      const then = before.kind === "file" ? cited(source, before.text) : null
      if (!then?.ok) {
        unfollowed.add(
          `${claim.scene}: ${sourceName(source)}: it didn't hold at ${was}, so cards-check refuses it`
        )
        continue
      }
      const why =
        after.kind !== "file"
          ? `there is no such file at ${is}`
          : flat(after.text).includes(flat(then.cited))
            ? null
            : source.quote === undefined
              ? `its lines read differently at ${is}`
              : `"${source.quote}" isn't said in it at ${is}`
      if (why !== null)
        stale.push({ scene: claim.scene, said: claim.said, source, why })
    }
  return { stale, unfollowed: [...unfollowed] }
}
