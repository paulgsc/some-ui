/**
 * Jobs › Scout: postings I found myself, for the morning run's second
 * opinion, each card wearing where it is on its way to that run. The run
 * opens only the hosts it reads (`linkReach`), so a link from anywhere else
 * waits for the posting's own text.
 */
import type { JSX } from "react"
import { useState } from "react"
import type { AdjacentFamily, Digest, Track } from "@some-ui/job-desk"
import {
  ADJACENT_FAMILIES,
  linkReach,
  MAX_NOTE,
  MAX_POSTING_TEXT,
  MAX_SCOUT_TITLE,
  MAX_URL,
  TRACKS,
} from "@some-ui/job-desk"
import { Badge, Button, Input, Label, Textarea } from "@some-ui/shared"
import { ExternalLink } from "lucide-react"

import { phoneJobs } from "@/lib/jobs"
import { eventJourney, kindJourney } from "@/lib/jobs/journey"
import { draftVoice, SCOUT_OWNER } from "@/lib/jobs/model"
import {
  cantOpenLink,
  FILE_NAMES,
  postingTextHint,
  postingTextLabel,
} from "@/lib/jobs/words"
import { themeOf } from "@/lib/journey"
import { Gaps, Scores, sectionHeading } from "@/components/job-reading"

import {
  builderHref,
  Chips,
  JourneyCard,
  Problem,
  ShareAction,
  useJobs,
  useJourneyContext,
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
  const context = useJourneyContext()
  const scouts = state.log.flatMap((e, index) =>
    e.type === "scout"
      ? [{ scout: e.scout, journey: eventJourney(context, index) }]
      : []
  )
  const newestFirst = [...scouts].reverse()
  // One file carries every scout waiting, so one card asks to share it.
  const asking = newestFirst.find(({ journey }) => {
    const theme = journey === null ? null : themeOf(journey.id)
    return theme === "waiting" || theme === "stopped"
  })?.scout.id
  const verdicts = new Map(
    state.digests.flatMap((d) => d.scouts.map((s) => [s.scoutId, s] as const))
  )
  const link = httpsLink(url.trim())
  const needsText = linkReach(url) === "cannot-open"
  const ready =
    link !== null &&
    title.trim() !== "" &&
    (!needsText || postingText.trim() !== "")
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
          placeholder="https://jobs.lever.co/…"
          value={url}
          aria-describedby={needsText ? "scout-url-hint" : undefined}
          onChange={(e) => setUrl(e.target.value)}
        />
        {needsText && (
          <p id="scout-url-hint" className="text-muted-foreground text-sm">
            {cantOpenLink}
          </p>
        )}
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
          {postingTextLabel(needsText)}
        </Label>
        <Textarea
          id="scout-text"
          rows={3}
          placeholder={postingTextHint}
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
          <h2 className={sectionHeading}>
            {FILE_NAMES.scouts} · {scouts.length}
          </h2>
          <ul className="flex flex-col gap-2">
            {newestFirst.map(({ scout, journey }) => {
              const verdict = verdicts.get(scout.id)
              return (
                <li key={scout.id}>
                  <JourneyCard
                    title={scout.title}
                    journey={journey}
                    noun="it"
                    heading="h3"
                  >
                    <div className="flex flex-col gap-1 px-3.5 py-3">
                      <span className="text-muted-foreground text-xs">
                        {scout.track}
                        {scout.family ? ` · ${scout.family}` : ""}
                        {scout.why ? ` · ${scout.why}` : ""}
                      </span>
                      {verdict && (
                        <Badge
                          className="self-start"
                          variant={
                            verdict.verdict === "disagree"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {verdict.verdict === "agree"
                            ? "Run agrees"
                            : verdict.verdict === "disagree"
                              ? "Run disagrees"
                              : "Run couldn’t find it"}
                        </Badge>
                      )}
                      {verdict && <p className="text-sm">{verdict.note}</p>}
                      {verdict?.review && (
                        <Review review={verdict.review} scoutId={scout.id} />
                      )}
                    </div>
                    {scout.id === asking && (
                      <ShareAction
                        kind="scouts"
                        journey={journey}
                        label="Share scouts to Drive"
                      />
                    )}
                  </JourneyCard>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      {asking === undefined && (
        // No card asks, yet a share may still wait to be confirmed, or the
        // file can't be shared: say so here.
        <ShareAction
          kind="scouts"
          journey={kindJourney(context, "scouts")}
          label="Share scouts to Drive"
        />
      )}
    </div>
  )
}
