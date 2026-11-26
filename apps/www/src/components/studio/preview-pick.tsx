/**
 * A preview to approve (HOST16, #3558; the owner's guard on #3521): the
 * agent's two or three variants of one bundle of choices, each an option of
 * the shared `DecisionPick` (C693). Above each option's button, outside it,
 * its clip plays muted and looping with "what's in it" (the clip's own
 * callouts), so watching never picks; only its "Use this" button does. One
 * is recommended, and something else, said in the owner's words, asks the
 * agent for new previews. No toggle and no lever. A pick is kept as the
 * record's `approve` event through `picks`, the screen saying where; using
 * another variant later is a new pick that moves the earlier one (C1581).
 * Phone build only.
 */
import type { JSX } from "react"
import { useReducer, useState } from "react"
import { Button, DecisionPick, Notice, Textarea } from "@some-ui/shared"
import type { DecisionPicked } from "@some-ui/shared"
import type {
  PreviewPick as Pick,
  PreviewOffer,
  PreviewVariant,
} from "@some-ui/video-render"
import { approveEvent, CONVERSATION_POLICY } from "@some-ui/video-render"

import { pickOn, PICK_WORDS as W } from "@/lib/preview-pick"
import type { Keeping, PreviewPicks } from "@/lib/preview-pick"

/** One variant's card: its title, its clip muted and looping, and what's in it. */
const VariantCard = ({
  variant,
  src,
}: {
  variant: PreviewVariant
  src: string | null
}): JSX.Element => (
  <div className="flex flex-col gap-2">
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
    <ul className="flex flex-col gap-0.5 text-xs">
      {variant.callouts.map((c) => (
        <li key={c}>{c}</li>
      ))}
    </ul>
  </div>
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

/** The option id a variant is listed under: A, B, C. */
const idOf = (i: number): string => String.fromCharCode(65 + i)

/** A preview's cards, the one standing shown so, and what keeping a pick came to. */
export const PreviewPick = ({
  offer,
  conversation,
  picks,
  clipSrc,
  now,
}: PreviewPickProps): JSX.Element => {
  // Every read is the store's own: a pick is reread after each keep.
  const [, reread] = useReducer((n: number) => n + 1, 0)
  // Each keep is said afresh, the same words again included.
  const [said, setSaid] = useState<{ n: number; keeping: Keeping } | null>(null)
  const [asking, setAsking] = useState(false)
  const [words, setWords] = useState("")
  const standing = pickOn(picks.list(conversation) ?? [], offer.preview)
  const keep = (pick: Pick): void => {
    const event = approveEvent(
      offer,
      pick,
      now(),
      standing === undefined ? {} : { moves: offer.preview }
    )
    if (event === null) return
    const keeping = picks.keep({ conversation, event })
    setSaid((s) => ({ n: (s?.n ?? 0) + 1, keeping }))
    if (keeping === "kept") {
      setAsking(false)
      setWords("")
    }
    reread()
  }
  const chose = standing?.event.chose
  const picked: DecisionPicked | null = asking
    ? { kind: "own" }
    : chose === undefined
      ? null
      : chose.kind === "variant"
        ? {
            kind: "option",
            option: idOf(
              offer.variants.findIndex((v) => v.variant === chose.variant)
            ),
          }
        : { kind: "own" }
  return (
    <div className="flex flex-col gap-3">
      {picks.where === "sample" && (
        <p className="text-muted-foreground text-sm font-semibold">
          {W.sample}
        </p>
      )}
      <DecisionPick
        options={offer.variants.map((variant, i) => ({
          id: idOf(i),
          decision: W.use,
          shows: <VariantCard variant={variant} src={clipSrc(variant)} />,
          recommended: variant.variant === offer.recommended,
        }))}
        picked={picked}
        onPick={(pick) => {
          if (pick.kind === "own") {
            setAsking(true)
            return
          }
          const variant = offer.variants.at(pick.option.charCodeAt(0) - 65)
          if (variant === undefined) return
          setAsking(false)
          keep({ kind: "variant", variant: variant.variant })
        }}
        words={{
          label: W.label(offer.about),
          recommended: W.recommended,
          own: W.own,
          none: W.none,
        }}
      />
      {asking && (
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
            maxLength={CONVERSATION_POLICY.noteMost}
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
          key={said.n}
          {...(said.keeping === "refused" ? { tone: "danger" as const } : {})}
        >
          {said.keeping === "kept"
            ? W.kept[picks.where]
            : said.keeping === "already"
              ? W.already
              : W.refused}
        </Notice>
      )}
    </div>
  )
}
