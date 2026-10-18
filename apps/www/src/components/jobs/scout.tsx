/**
 * Jobs › Scout: postings I found myself, for the morning run's second
 * opinion. Indeed pages refuse agents, so the posting's text can come along.
 * Phone-only (`build.paths.ts`).
 */
import type { JSX } from "react"
import { useState } from "react"
import { ADJACENT_FAMILIES } from "@some-ui/job-desk"
import { Badge, Button, Input, Label, Textarea } from "@some-ui/shared"

import { phoneJobs } from "@/lib/jobs"
import type { Scout } from "@/lib/jobs/model"
import { draftVoice, SCOUT_OWNER, scoutsOf } from "@/lib/jobs/model"

import {
  Chips,
  Problem,
  sectionHeading,
  ShareToDrive,
  useJobs,
  VoiceNotes,
} from "./parts"

const FAMILY_LABELS = {
  data: "Data",
  qa: "QA",
  solutions: "Solutions",
} as const

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === "https:"
  } catch {
    return false
  }
}

export const JobsScout = (): JSX.Element => {
  const { state } = useJobs()
  const jobs = phoneJobs()
  const [url, setUrl] = useState("")
  const [track, setTrack] = useState<Scout["track"]>("software")
  const [family, setFamily] = useState<NonNullable<Scout["family"]>>("data")
  const [title, setTitle] = useState("")
  const [why, setWhy] = useState("")
  const [postingText, setPostingText] = useState("")
  const voice = draftVoice(state, SCOUT_OWNER)
  const scouts = scoutsOf(state)
  const verdicts = new Map(
    state.digests.flatMap((d) => d.scouts.map((s) => [s.scoutId, s] as const))
  )
  const ready = isHttps(url.trim()) && title.trim() !== ""

  const add = (): void => {
    if (!ready) return
    const kept = jobs.record({
      type: "scout",
      scout: {
        id: `sc-${crypto.randomUUID().slice(0, 8)}`,
        url: url.trim(),
        track,
        family: track === "adjacent" ? family : null,
        title: title.trim(),
        why: why.trim(),
        postingText: postingText.trim() === "" ? null : postingText.trim(),
      },
      voice: voice.map((v) => v.id),
    })
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
          placeholder="https://www.indeed.com/viewjob?jk=…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Label htmlFor="scout-title" className={sectionHeading}>
          Title and company
        </Label>
        <Input
          id="scout-title"
          placeholder="SDET · Second Dinner"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Chips
          label="Track"
          options={[
            ["software", "Software"],
            ["adjacent", "Adjacent"],
          ]}
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
          value={postingText}
          onChange={(e) => setPostingText(e.target.value)}
        />
        <VoiceNotes
          owner={SCOUT_OWNER}
          notes={voice}
          hint="Or say why, up to a minute"
        />
        <Button type="button" disabled={!ready} onClick={add}>
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
