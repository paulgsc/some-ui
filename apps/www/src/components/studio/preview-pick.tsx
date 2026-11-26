/**
 * A preview to approve (HOST16, #3558; the owner's guard on #3521): the
 * agent's two or three variants of one bundle of choices, each a card in
 * the shared `DecisionPick` (C693) with its clip playing muted and looping,
 * "what's in it" (the clip's own callouts) and "Use this"; one recommended;
 * and something else, said in the owner's words, which asks the agent for
 * new previews. No toggle and no lever: one tap picks, and the pick is kept
 * as the record's `approve` event through `picks`, the screen saying where.
 * Phone build only.
 */
import type { JSX } from "react"
import { useReducer, useState } from "react"
import { Button, DecisionPick, Notice, Textarea } from "@some-ui/shared"
import type { DecisionPicked } from "@some-ui/shared"
import type { PreviewOffer, PreviewVariant } from "@some-ui/video-render"
import { approveEvent } from "@some-ui/video-render"

import { pickOn, PICK_WORDS as W } from "@/lib/preview-pick"
import type { Keeping, PreviewPicks } from "@/lib/preview-pick"

/** One variant's card: its clip, muted and looping, and what's in it. */
const VariantCard = ({
  variant,
  src,
}: {
  variant: PreviewVariant
  src: string | null
}): JSX.Element => (
  <span className="flex flex-col gap-2">
    <span className="font-semibold">{variant.title}</span>
    {src === null ? (
      <span className="bg-muted text-muted-foreground flex aspect-video w-full items-center justify-center rounded-lg px-3 text-center text-xs">
        {W.noClip}
      </span>
    ) : (
      <video
        src={src}
        muted
        loop
        autoPlay
        playsInline
        className="aspect-video w-full rounded-lg object-cover"
      />
    )}
    <span className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
      {W.inIt}
    </span>
    <span className="flex flex-col gap-0.5 text-xs">
      {variant.callouts.map((c) => (
        <span key={`${String(c.atMs)}-${c.says}`}>{c.says}</span>
      ))}
    </span>
    <span className="text-brand self-end text-sm font-bold">{W.use}</span>
  </span>
)

export type PreviewPickProps = {
  readonly offer: PreviewOffer
  /** The conversation the preview was made for. */
  readonly conversation: string
  readonly picks: PreviewPicks
  /** Where each variant's clip plays from, or null while home hasn't made it. */
  readonly clipSrc: (variant: PreviewVariant) => string | null
  /** The time a pick is kept at. */
  readonly now: () => string
}

/** A preview's cards, the one picked shown so, and what keeping it came to. */
export const PreviewPick = ({
  offer,
  conversation,
  picks,
  clipSrc,
  now,
}: PreviewPickProps): JSX.Element => {
  // Every read is the store's own: a pick is reread after each keep.
  const [, reread] = useReducer((n: number) => n + 1, 0)
  const [said, setSaid] = useState<Keeping | null>(null)
  const [asking, setAsking] = useState(false)
  const [words, setWords] = useState("")
  const kept = pickOn(picks.list(conversation) ?? [], offer.id)
  const keep = (pick: Parameters<typeof approveEvent>[1]): void => {
    const event = approveEvent(offer, pick, now())
    if (event === null) return
    setSaid(picks.keep({ conversation, event }))
    setAsking(false)
    reread()
  }
  const picked: DecisionPicked | null =
    kept === undefined
      ? asking
        ? { kind: "own" }
        : null
      : kept.event.chose.kind === "variant"
        ? { kind: "option", option: kept.event.chose.variant }
        : { kind: "own" }
  return (
    <div className="flex flex-col gap-3">
      <DecisionPick
        options={offer.variants.map((variant) => ({
          id: String.fromCharCode(65 + offer.variants.indexOf(variant)),
          decision: <VariantCard variant={variant} src={clipSrc(variant)} />,
          recommended: variant.id === offer.recommended,
        }))}
        picked={
          picked?.kind === "option"
            ? {
                kind: "option",
                option: String.fromCharCode(
                  65 + offer.variants.findIndex((v) => v.id === picked.option)
                ),
              }
            : picked
        }
        onPick={(pick) => {
          if (kept !== undefined) {
            setSaid("already")
            return
          }
          if (pick.kind === "own") {
            setAsking(true)
            return
          }
          const variant = offer.variants.at(pick.option.charCodeAt(0) - 65)
          if (variant !== undefined)
            keep({ kind: "variant", variant: variant.id })
        }}
        words={{
          label: W.label(offer.about),
          recommended: W.recommended,
          own: W.own,
          none: W.none,
        }}
      />
      {asking && kept === undefined && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            keep({ kind: "else", said: words })
          }}
        >
          <label className="text-sm font-semibold" htmlFor="preview-else">
            {W.ownPrompt}
          </label>
          <Textarea
            id="preview-else"
            value={words}
            onChange={(e) => {
              setWords(e.target.value)
            }}
          />
          <Button type="submit" disabled={words.trim() === ""}>
            {W.ownSend}
          </Button>
        </form>
      )}
      {said !== null && (
        <Notice
          key={said}
          {...(said === "refused" ? { tone: "danger" as const } : {})}
        >
          {said === "kept"
            ? W.kept[picks.where]
            : said === "already"
              ? W.already
              : W.refused}
        </Notice>
      )}
    </div>
  )
}
