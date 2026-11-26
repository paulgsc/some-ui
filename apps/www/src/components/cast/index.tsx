/**
 * The Cast wing's two screens (HOST8, #3532): every look a character can
 * take as a live loop, paged with the phone's one pager (GES5), and one look
 * in each shot and placement over a sample card. Each picture is
 * `HostPreview` (`@some-ui/shared`), the same drawing a scene renders; the
 * words are `lib/cast/words`. Both screens carry the role chips (HOST7): each
 * look in the role chosen.
 */
import type { JSX } from "react"
import {
  CardLink,
  CardLinkBody,
  HostPreview,
  PageControls,
  useLoopTime,
  usePager,
  type PreviewTime,
} from "@some-ui/shared"
import type { HostCharacter, Placement, Shot } from "@some-ui/styles/brand/host"
import { HOST_CHARACTERS, PLACEMENTS, SHOTS } from "@some-ui/styles/brand/host"
import type { Role } from "@some-ui/styles/brand/host-role"
import { Link } from "@tanstack/react-router"

import { hasAudience } from "@/lib/build-profile"
import type { Look } from "@/lib/cast"
import {
  beatOf,
  lookId,
  looksOf,
  pageOfLooks,
  rolesFor,
  seedOf,
} from "@/lib/cast"
import { CAST_WORDS, lookName } from "@/lib/cast/words"
import { Chips } from "@/components/chips"

/** The choice of character: Mochi or Tin Bird. */
const CharacterChips = ({
  who,
  onWho,
}: {
  who: HostCharacter
  onWho: (who: HostCharacter) => void
}): JSX.Element => (
  <Chips
    label={CAST_WORDS.pick}
    options={HOST_CHARACTERS.map(
      (c) => [c, CAST_WORDS.characters[c].name] as const
    )}
    pressed={(c) => c === who}
    onToggle={onWho}
  />
)

/** The choice of role, and what the role chosen looks like. */
const RoleChips = ({
  who,
  playing,
  onPlaying,
}: {
  who: HostCharacter
  playing: Role
  onPlaying: (role: Role) => void
}): JSX.Element => (
  <div className="flex flex-col gap-1">
    <Chips
      label={CAST_WORDS.role}
      labelled
      options={rolesFor(who).map((r) => [r, CAST_WORDS.roles[r]] as const)}
      pressed={(r) => r === playing}
      onToggle={onPlaying}
    />
    <p className="text-muted-foreground text-xs">
      {CAST_WORDS.wears(who, playing)}
    </p>
  </div>
)

/**
 * One look in the grid: its loop, its name, and a way into it. The way in
 * is a link only in a build that carries the wing's pages (A3,
 * packages/some-vite-config/AUDIENCES.md): the phone's.
 */
const LookCard = ({
  look,
  playing,
  page,
  tMs,
}: {
  look: Look
  playing: Role
  page: number
  tMs: PreviewTime
}): JSX.Element => {
  const body = (
    <>
      <HostPreview
        beats={[beatOf(look, "close-up", "center", playing)]}
        seed={seedOf(look)}
        tMs={tMs}
        className="bg-muted/40 w-full rounded-md"
      />
      <CardLinkBody className="items-center">
        <span className="text-sm font-medium">{lookName(look)}</span>
      </CardLinkBody>
    </>
  )
  if (!hasAudience("apk")) {
    return (
      <div className="flex flex-col gap-1 rounded-xl border p-2">{body}</div>
    )
  }
  return (
    <CardLink asChild className="flex-col items-stretch gap-1 p-2">
      <Link
        to="/cast/look"
        search={{
          who: look.character,
          look: lookId(look),
          role: playing,
          shot: "medium",
          placement: "bottom-right",
          page,
        }}
      >
        {body}
      </Link>
    </CardLink>
  )
}

export type CastHomeProps = {
  readonly who: HostCharacter
  /** The role every look is shown in. */
  readonly playing: Role
  /** The grid's page, 0-based; kept in range here. */
  readonly page: number
  readonly onWho: (who: HostCharacter) => void
  readonly onPlaying: (role: Role) => void
  readonly onPage: (page: number) => void
}

/** The wing's Home: pick a character and a role, then see every way it can feel. */
export const CastHome = ({
  who,
  playing,
  page,
  onWho,
  onPlaying,
  onPage,
}: CastHomeProps): JSX.Element => {
  const tMs = useLoopTime()
  const paged = pageOfLooks(looksOf(who), page)
  const canPrev = paged.page > 0
  const canNext = paged.page < paged.pageCount - 1
  const previous = (): void => onPage(paged.page - 1)
  const next = (): void => onPage(paged.page + 1)
  const { attach } = usePager({
    canPrev,
    canNext,
    onPage: (to) => (to === "next" ? next() : previous()),
  })
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 pb-6">
      <CharacterChips who={who} onWho={onWho} />
      <RoleChips who={who} playing={playing} onPlaying={onPlaying} />
      <section className="flex flex-col gap-3">
        <h1 className="text-xl font-bold tracking-tight">
          {CAST_WORDS.looks(who)}
        </h1>
        <p className="text-muted-foreground text-sm">{CAST_WORDS.looksHint}</p>
        <div
          ref={attach}
          className="grid grid-cols-2 gap-3 landscape:grid-cols-3"
        >
          {paged.looks.map((look) => (
            <LookCard
              key={lookId(look)}
              look={look}
              playing={playing}
              page={paged.page}
              tMs={tMs}
            />
          ))}
        </div>
        <PageControls
          page={paged.page}
          pageCount={paged.pageCount}
          onPrevious={previous}
          onNext={next}
          label={CAST_WORDS.looksLabel}
        />
      </section>
    </div>
  )
}

/** A card from a video, drawn plainly: what a scene's host stands over. */
const SampleCard = (): JSX.Element => (
  <div className="bg-card text-card-foreground absolute inset-0 flex flex-col gap-1 p-[6%]">
    <span className="text-[clamp(0.75rem,4.5cqw,1.1rem)] font-bold">
      {CAST_WORDS.sample.title}
    </span>
    <span className="text-muted-foreground max-w-[60%] text-[clamp(0.625rem,3cqw,0.875rem)]">
      {CAST_WORDS.sample.body}
    </span>
  </div>
)

export type CastLookProps = {
  readonly look: Look
  /** The role the look is shown in. */
  readonly playing: Role
  /** The grid's page the look was opened from, which its back link returns to. */
  readonly page: number
  readonly shot: Shot
  readonly placement: Placement
  readonly onPlaying: (role: Role) => void
  readonly onShot: (shot: Shot) => void
  readonly onPlacement: (placement: Placement) => void
}

/** One look, in the shot and placement chosen, over a sample card. */
export const CastLook = ({
  look,
  playing,
  page,
  shot,
  placement,
  onPlaying,
  onShot,
  onPlacement,
}: CastLookProps): JSX.Element => {
  const tMs = useLoopTime()
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 pb-6">
      {hasAudience("apk") && (
        <Link
          to="/cast"
          search={{ who: look.character, role: playing, page }}
          className="text-muted-foreground text-sm underline-offset-4 hover:underline"
        >
          {CAST_WORDS.back}
        </Link>
      )}
      <h1 className="text-xl font-bold tracking-tight">
        {CAST_WORDS.characters[look.character].name}, {lookName(look)}
      </h1>
      <HostPreview
        beats={[beatOf(look, shot, placement, playing)]}
        seed={seedOf(look)}
        tMs={tMs}
        aspect={16 / 9}
        label={CAST_WORDS.pictured(look, playing, shot, placement)}
        className="w-full rounded-lg border [container-type:inline-size]"
      >
        <SampleCard />
      </HostPreview>
      <RoleChips who={look.character} playing={playing} onPlaying={onPlaying} />
      <Chips
        label={CAST_WORDS.shot}
        labelled
        options={SHOTS.map((s) => [s, CAST_WORDS.shots[s]] as const)}
        pressed={(s) => s === shot}
        onToggle={onShot}
      />
      <Chips
        label={CAST_WORDS.placement}
        labelled
        options={PLACEMENTS.map((p) => [p, CAST_WORDS.placements[p]] as const)}
        pressed={(p) => p === placement}
        onToggle={onPlacement}
      />
    </div>
  )
}
