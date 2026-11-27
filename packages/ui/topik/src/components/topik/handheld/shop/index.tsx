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
import { Button, Input } from "@some-ui/shared"
import { PHRASES, type PhraseId } from "@topik/lib/topik/phrases/shelf"
import type { ShopState } from "@topik/lib/topik/shop"
import { initialShop } from "@topik/lib/topik/shop"
import type { ShopPort, ShopRuntime } from "@topik/lib/topik/shop/runtime"
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

/** What the shop says of the hunch sent, and the phrases it found. */
const Answer = ({
  state,
  runtime,
}: {
  state: ShopState
  runtime: ShopRuntime
}): JSX.Element | null => {
  const { at, basket } = state
  switch (at.kind) {
    case "asking": {
      return null
    }
    case "hearing":
    case "looking": {
      return <p className="text-muted-foreground mx-1 text-sm">{W.looking}</p>
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
        </div>
      )
    }
    case "kept": {
      return <p className="mx-1 text-sm">{W.kept}</p>
    }
    case "unknown": {
      return <p className="mx-1 text-sm">{W.unknown}</p>
    }
    case "unreached": {
      return (
        <div className="flex flex-col gap-2">
          <p className="mx-1 text-sm">{at.kept ? W.unreached : W.unkept}</p>
          <Button
            variant="outline"
            className="self-start rounded-xl"
            onClick={() => runtime.tap({ kind: "retry" })}
          >
            {W.retry}
          </Button>
        </div>
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
  const { basket, at } = state
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
          maxLength={200}
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
      <Answer state={state} runtime={runtime} />
      {at.kind !== "asking" &&
        at.kind !== "hearing" &&
        at.kind !== "looking" && (
          <Button
            variant="ghost"
            className="self-start"
            onClick={() => {
              setWords("")
              runtime.tap({ kind: "again" })
            }}
          >
            {W.again}
          </Button>
        )}
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
