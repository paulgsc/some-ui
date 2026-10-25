/**
 * Settings' choice to keep voice notes on home (LA13,
 * docs/learner-data-authority.md): voice notes have no wing of their own,
 * so no header mark offers it, and Settings shows it inline, as its ledger
 * shows every lane. Two presses, the second keeping the offer's words with
 * the choice; once kept, how sending is going, as a mark's sheet says it
 * (`laneView`, its run included), and Send now. Stopping is the ledger's
 * (`./device-sharing-ledger`). Its words are `lib/home-link/words`'s alone.
 */
import type { JSX } from "react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@some-ui/shared"

import { useHomeLink } from "@/lib/home-link"
import {
  askLane,
  keepOnHome,
  pairingOf,
  useLaneChoices,
  useLaneRun,
} from "@/lib/home-link/lanes"
import { voiceLane } from "@/lib/home-link/voice"
import { laneView, SHEET, WORDS } from "@/lib/home-link/words"

const words = WORDS.voice

export const VoiceHomeChoice = (): JSX.Element | null => {
  const { shared, stopped } = useLaneChoices(voiceLane)
  const counts = voiceLane.useCounts()
  const run = useLaneRun(voiceLane)
  const pairing = pairingOf(useHomeLink())
  const [asking, setAsking] = useState(false)
  const [refused, setRefused] = useState(false)
  const question = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (asking) question.current?.focus()
  }, [asking])
  if (pairing === null) return null
  const offer = words.offer?.(counts.offered) ?? null
  if (shared.size > 0) {
    const view = laneView(words, {
      ...counts,
      known: true,
      shared,
      stopped,
      run,
      away: null,
    })
    // A run home turned away is worth trying again, even with nothing counted.
    const retryable =
      run.last?.kind === "unreachable" ||
      (run.last?.kind === "failed" && run.last.why === "busy")
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">{words.title}</p>
        <p className="text-muted-foreground text-xs" role="status">
          {view.line}
        </p>
        {[...view.notes, words.footnote].map((note) => (
          <p key={note} className="text-muted-foreground text-xs">
            {note}
          </p>
        ))}
        {(counts.waiting > 0 || retryable) && !run.running ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => askLane(voiceLane)}
          >
            {SHEET.sendNow}
          </Button>
        ) : null}
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{words.title}</p>
      {refused ? (
        <p className="text-destructive text-xs" role="status">
          {SHEET.keepRefused}
        </p>
      ) : null}
      {asking && offer !== null ? (
        <div className="space-y-2 rounded-md border p-3">
          <p ref={question} tabIndex={-1} className="text-sm">
            {offer}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setAsking(false)
                setRefused(!keepOnHome(voiceLane, pairing, offer))
              }}
            >
              {SHEET.keepYes}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAsking(false)}
            >
              {SHEET.keepNo}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-muted-foreground text-xs">{words.phoneOnly}</p>
          <p className="text-muted-foreground text-xs">{words.footnote}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setRefused(false)
              setAsking(true)
            }}
          >
            {SHEET.keep}
          </Button>
        </>
      )}
    </div>
  )
}
