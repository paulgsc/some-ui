/**
 * Jobs › Scout: postings I found myself, for the morning run's second
 * opinion. Indeed pages refuse agents, so the posting's text can come along.
 */
import type { JSX } from "react"
import { useState } from "react"
import type { AdjacentFamily, Digest, Track } from "@some-ui/job-desk"
import {
  ADJACENT_FAMILIES,
  MAX_NOTE,
  MAX_POSTING_TEXT,
  MAX_SCOUT_TITLE,
  MAX_URL,
  TRACKS,
} from "@some-ui/job-desk"
import { Badge, Button, Input, Label, Textarea } from "@some-ui/shared"
import { ExternalLink } from "lucide-react"

import { phoneJobs } from "@/lib/jobs"
import { draftVoice, SCOUT_OWNER, scoutsOf } from "@/lib/jobs/model"

import {
  builderHref,
  Chips,
  Gaps,
  Problem,
  Scores,
  sectionHeading,
  ShareToDrive,
  useJobs,
  useVoiceBusy,
  VoiceNotes,
} from "./parts"

const TRACK_LABELS: Readonly<Record<Track, string>> = {
  software: "Software",
  adjacent: "Adjacent",
}

const FAMILY_LABELS: Readonly<Record<AdjacentFamily, string>> = {
  data: "Data",
  qa: "QA",
  solutions: "Solutions",
}

/**
 * The link as the URL parser writes it (`https://` in lower case, as home
 * wants), or null when it isn't one home would keep. Parsing can percent-encode
 * and so lengthen it, so the limit is checked here as well as by `maxLength`.
 */
function httpsLink(url: string): string | null {
  try {
    const { protocol, href } = new URL(url)
    return protocol === "https:" && href.length <= MAX_URL ? href : null
  } catch {
    return null
  }
}

type ScoutReview = NonNullable<Digest["scouts"][number]["review"]>

/** How the run scored a scout it didn't pick, and the résumé to send anyway. */
const Review = ({
  review,
  scoutId,
}: {
  review: ScoutReview
  scoutId: string
}): JSX.Element => (
  <div className="flex flex-col gap-2">
    <Scores scores={review.scores} />
    <Gaps gaps={review.gaps} />
    <Button asChild variant="outline" size="sm" className="self-start">
      <a
        href={builderHref(review.sends, scoutId)}
        target="_blank"
        rel="noreferrer"
      >
        Build {review.sends.variant} · {review.sends.template}{" "}
        <ExternalLink aria-hidden />
      </a>
    </Button>
  </div>
)

export const JobsScout = (): JSX.Element => {
  const { state } = useJobs()
  const jobs = phoneJobs()
  const [url, setUrl] = useState("")
  const [track, setTrack] = useState<Track>("software")
  const [family, setFamily] = useState<AdjacentFamily>("data")
  const [title, setTitle] = useState("")
  const [why, setWhy] = useState("")
  const [postingText, setPostingText] = useState("")
  const voice = draftVoice(state, SCOUT_OWNER)
  const scouts = scoutsOf(state)
  const verdicts = new Map(
    state.digests.flatMap((d) => d.scouts.map((s) => [s.scoutId, s] as const))
  )
  const link = httpsLink(url.trim())
  const ready = link !== null && title.trim() !== ""
  const busy = useVoiceBusy(SCOUT_OWNER)

  const add = (): void => {
    if (link === null || !ready || busy) return
    const kept = jobs.addScout(
      {
        url: link,
        ...(track === "adjacent" ? { track, family } : { track, family: null }),
        title: title.trim(),
        why: why.trim(),
        postingText: postingText.trim() === "" ? null : postingText.trim(),
      },
      voice.map((v) => v.id)
    )
    if (!kept) return
    setUrl("")
    setTitle("")
    setWhy("")
    setPostingText("")
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3 rounded-xl border p-3">
        <h2 className="font-semibold">Found one yourself?</h2>
        <Label htmlFor="scout-url" className={sectionHeading}>
          Link
        </Label>
        <Input
          id="scout-url"
          inputMode="url"
          maxLength={MAX_URL}
          placeholder="https://www.indeed.com/viewjob?jk=…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Label htmlFor="scout-title" className={sectionHeading}>
          Title and company
        </Label>
        <Input
          id="scout-title"
          maxLength={MAX_SCOUT_TITLE}
          placeholder="SDET · Second Dinner"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Chips
          label="Track"
          options={TRACKS.map((t) => [t, TRACK_LABELS[t]] as const)}
          pressed={(t) => t === track}
          onToggle={setTrack}
        />
        {track === "adjacent" && (
          <Chips
            label="Family"
            options={ADJACENT_FAMILIES.map(
              (f) => [f, FAMILY_LABELS[f]] as const
            )}
            pressed={(f) => f === family}
            onToggle={setFamily}
          />
        )}
        <Label htmlFor="scout-why" className={sectionHeading}>
          Why this one
        </Label>
        <Input
          id="scout-why"
          maxLength={MAX_NOTE}
          value={why}
          onChange={(e) => setWhy(e.target.value)}
        />
        <Label htmlFor="scout-text" className={sectionHeading}>
          Posting text, optional
        </Label>
        <Textarea
          id="scout-text"
          rows={3}
          placeholder="Paste the description: the run can’t open Indeed links."
          maxLength={MAX_POSTING_TEXT}
          value={postingText}
          onChange={(e) => setPostingText(e.target.value)}
        />
        <VoiceNotes
          owner={SCOUT_OWNER}
          notes={voice}
          hint="Or say why, up to a minute"
        />
        <Button type="button" disabled={!ready || busy} onClick={add}>
          Add to my scouts
        </Button>
        <Problem />
      </section>
      {scouts.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={sectionHeading}>My scouts · {scouts.length}</h2>
          <ul className="flex flex-col gap-2">
            {[...scouts].reverse().map((scout) => {
              const verdict = verdicts.get(scout.id)
              return (
                <li
                  key={scout.id}
                  className="flex flex-col gap-1 rounded-xl border p-3"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold">{scout.title}</span>
                    <Badge
                      variant={
                        verdict?.verdict === "disagree"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {verdict === undefined
                        ? "Waits for a run"
                        : verdict.verdict === "agree"
                          ? "Run agrees"
                          : verdict.verdict === "disagree"
                            ? "Run disagrees"
                            : "Run couldn’t find it"}
                    </Badge>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {scout.track}
                    {scout.family ? ` · ${scout.family}` : ""}
                    {scout.why ? ` · ${scout.why}` : ""}
                  </span>
                  {verdict && <p className="text-sm">{verdict.note}</p>}
                  {verdict?.review && (
                    <Review review={verdict.review} scoutId={scout.id} />
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}
      <ShareToDrive kind="scouts" label="Share scouts to Drive" />
    </div>
  )
}
