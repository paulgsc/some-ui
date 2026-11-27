/**
 * The shop (KPLAY's KP4, #2853): say what you want to say in English, see
 * the phrases on the shelf that say it, each with the parts it is built
 * from, and put the ones you want in a basket that lasts until you leave.
 * Opened from "What are you hungry for?" where the host gives a port to
 * home (`shopHome`). The screen reads the shop's runtime
 * (`lib/topik/shop/runtime`) and dispatches; the runtime decides what is
 * stale and what is kept.
 */
import type { JSX, SyntheticEvent } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { assertNever, cn } from "@some-ui/core-utils"
import { Button, Input, Notice } from "@some-ui/shared"
import { TAKE_ENDING_WORDS, takeEndingSaid } from "@some-ui/voice-capture"
import { PHRASES, type PhraseId } from "@topik/lib/topik/phrases/shelf"
import type { ShopState } from "@topik/lib/topik/shop"
import { initialShop, WORDS_MAX } from "@topik/lib/topik/shop"
import type {
  ShopPort,
  ShopRuntime,
  ShopTakes,
} from "@topik/lib/topik/shop/runtime"
import { createShopRuntime } from "@topik/lib/topik/shop/runtime"
import {
  saidHow,
  shownParts,
  SHOP_WORDS as W,
} from "@topik/lib/topik/shop/words"

type Shop = Readonly<{
  runtime: ShopRuntime
  subscribe: (listener: () => void) => () => void
}>

/**
 * One shop per screen, open while the screen is shown: the effect resumes
 * it and its cleanup lets it go, so a screen shown again (StrictMode's
 * second mount, an offscreen re-show) has a live one.
 */
function useShop(port: ShopPort): Readonly<{
  state: ShopState
  runtime: ShopRuntime
}> {
  // A runtime made once per mount, over the port the screen opened with.
  const [shop] = useState((): Shop => {
    const listeners = new Set<() => void>()
    const runtime = createShopRuntime(port, () => {
      for (const listener of listeners) listener()
    })
    return {
      runtime,
      subscribe: (listener): (() => void) => {
        listeners.add(listener)
        return (): void => {
          listeners.delete(listener)
        }
      },
    }
  })
  useEffect(() => {
    shop.runtime.resume()
    return (): void => {
      shop.runtime.dispose()
    }
  }, [shop])
  const state = useSyncExternalStore(
    shop.subscribe,
    shop.runtime.snapshot,
    () => initialShop
  )
  return { state, runtime: shop.runtime }
}

/** The microphone for a spoken hunch, on the port's take pattern. */
const SayIt = ({
  takes,
  onTap,
}: {
  takes: ShopTakes
  onTap: () => void
}): JSX.Element => {
  const pattern = useSyncExternalStore(
    takes.pattern.subscribe,
    takes.pattern.getSnapshot
  )
  const { full } = useSyncExternalStore(takes.subscribe, takes.getSnapshot)
  // The last take's end as the screen opened: one before is another visit's.
  const [since] = useState(() => takes.pattern.getSnapshot().ended?.seq ?? 0)
  const recording = pattern.take.kind === "recording"
  if (full && !recording)
    return <p className="text-muted-foreground mx-1 text-sm">{W.full}</p>
  // Why the last take this visit wasn't the hunch, in the kit's own words;
  // a take kept is the hunch, so it says nothing.
  const { ended } = pattern
  const why =
    ended === null || recording || ended.seq <= since || ended.ending === "kept"
      ? null
      : takeEndingSaid(TAKE_ENDING_WORDS, ended)
  return (
    <div className="flex flex-col gap-1.5">
      <Button
        variant={recording ? "default" : "outline"}
        className="h-12 rounded-xl"
        onClick={onTap}
      >
        {recording ? W.stop : W.say}
      </Button>
      {why !== null && (
        // Keyed by the take it is about, so the next one is said again.
        <Notice key={ended?.seq} dismissible>
          {why}
        </Notice>
      )}
    </div>
  )
}

const Found = ({
  id,
  inBasket,
  onPick,
  onPutBack,
}: {
  id: PhraseId
  inBasket: boolean
  onPick: () => void
  onPutBack: () => void
}): JSX.Element => {
  const phrase = PHRASES[id]
  return (
    <li className="bg-card flex flex-col gap-2 rounded-2xl border p-3.5">
      <p lang="ko" className="text-xl font-bold">
        {phrase.korean}
      </p>
      <p className="text-sm">{phrase.intents[0]}</p>
      <p className="text-muted-foreground text-[13px]">{saidHow(phrase)}</p>
      <h4 className="text-muted-foreground mt-1 text-xs font-medium tracking-wider uppercase">
        {W.builtFrom}
      </h4>
      <ul className="flex flex-col gap-1">
        {shownParts(phrase).map((part) => (
          <li
            // A phrase's parts are its own, in reading order, none twice.
            key={`${part.written}:${part.from ?? ""}`}
            className="flex flex-wrap items-baseline gap-x-2 text-sm"
          >
            <span lang="ko" className="font-semibold">
              {part.written}
            </span>
            {part.from !== null && (
              <span lang="ko" className="text-muted-foreground">
                {part.from}
              </span>
            )}
            <span className="text-muted-foreground">{part.gloss}</span>
          </li>
        ))}
      </ul>
      <Button
        variant={inBasket ? "outline" : "default"}
        className="mt-1 self-start rounded-xl"
        onClick={inBasket ? onPutBack : onPick}
      >
        {inBasket ? W.putBack : W.pick}
      </Button>
    </li>
  )
}

/**
 * The phrases found, in the screen: what the owner asked for. What the shop
 * says of a hunch sent (looking, a miss kept, home out of reach) is said over
 * the screen instead, with what to do about it (HS1).
 */
const Answer = ({
  state,
  runtime,
  onAgain,
}: {
  state: ShopState
  runtime: ShopRuntime
  onAgain: () => void
}): JSX.Element | null => {
  const { at, basket } = state
  const again = { label: W.again, onClick: onAgain }
  const retry = {
    label: W.retry,
    onClick: (): void => {
      runtime.tap({ kind: "retry" })
    },
  }
  switch (at.kind) {
    case "asking": {
      return null
    }
    case "hearing":
    case "looking": {
      return <Notice>{W.looking}</Notice>
    }
    case "found": {
      return (
        <div className="flex flex-col gap-2.5">
          <p className="mx-1 text-sm font-medium">{W.found}</p>
          <ul className="flex flex-col gap-2.5">
            {at.phrases.map((id) => (
              <Found
                key={id}
                id={id}
                inBasket={basket.includes(id)}
                onPick={() => runtime.tap({ kind: "pick", phrase: id })}
                onPutBack={() => runtime.tap({ kind: "put-back", phrase: id })}
              />
            ))}
          </ul>
          <Button variant="ghost" className="self-start" onClick={onAgain}>
            {W.again}
          </Button>
        </div>
      )
    }
    case "kept": {
      return <Notice action={again}>{W.kept}</Notice>
    }
    case "unknown": {
      return <Notice action={again}>{W.unknown}</Notice>
    }
    case "unheard": {
      return (
        <Notice tone="warning" action={retry} onDismiss={onAgain}>
          {at.going ? W.going : W.unheard}
        </Notice>
      )
    }
    case "unreached": {
      return (
        <Notice
          tone="warning"
          action={retry}
          // Words this phone couldn't keep are only in the field: closing
          // this leaves them there to send again.
          onDismiss={
            at.hunch.kind === "typed" && !at.kept
              ? (): void => {
                  runtime.tap({ kind: "again" })
                }
              : onAgain
          }
        >
          {at.hunch.kind === "spoken"
            ? W.unreachedSaid
            : at.kept
              ? W.unreached
              : W.unkept}
        </Notice>
      )
    }
    default: {
      return assertNever(at)
    }
  }
}

export const ShopScreen = ({
  port,
  onBack,
  short = false,
}: {
  port: ShopPort
  onBack: () => void
  /** Landscape phone: compact chrome. */
  short?: boolean
}): JSX.Element => {
  const { state, runtime } = useShop(port)
  const [words, setWords] = useState("")
  const send = (event: SyntheticEvent): void => {
    event.preventDefault()
    runtime.type(words)
  }
  const { basket } = state
  const again = (): void => {
    setWords("")
    runtime.tap({ kind: "again" })
  }
  return (
    <div
      className={cn(
        // scroll-intent: long-form — the phrases found and their parts run
        // past the screen, and a thumb scrolls them as the menu's do.
        "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]",
        short ? "gap-2" : "gap-3.5"
      )}
    >
      <h2
        className={cn(
          "mx-1 leading-snug font-bold",
          short ? "text-xl" : "text-2xl"
        )}
      >
        {W.title}
      </h2>
      <p className="text-muted-foreground mx-1 text-[15px] leading-normal">
        {W.lead}
      </p>
      <form className="flex gap-2" onSubmit={send}>
        <Input
          aria-label={W.field}
          placeholder={W.example}
          value={words}
          maxLength={WORDS_MAX}
          onChange={(event) => setWords(event.target.value)}
          className="h-12 min-w-0 flex-1 rounded-xl text-base"
        />
        <Button
          type="submit"
          className="h-12 rounded-xl"
          disabled={words.trim() === ""}
        >
          {W.find}
        </Button>
      </form>
      {port.takes && (
        <SayIt takes={port.takes} onTap={() => runtime.record()} />
      )}
      <Answer state={state} runtime={runtime} onAgain={again} />
      {basket.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-muted-foreground mx-1 text-xs font-medium tracking-wider uppercase">
            {W.basket}
          </h3>
          <ul className="flex flex-col gap-1">
            {basket.map((id) => (
              <li key={id} lang="ko" className="mx-1 text-base">
                {PHRASES[id].korean}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground mx-1 text-[13px]">
            {W.basketLasts}
          </p>
        </section>
      )}
      <span className="min-h-0 flex-1" />
      <Button variant="outline" className="h-12 rounded-2xl" onClick={onBack}>
        {W.back}
      </Button>
    </div>
  )
}
