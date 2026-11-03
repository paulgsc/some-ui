/**
 * My data (MY-DATA MD2, #2476): what you keep, where, how much and how it
 * grows, read only, as the prototype agreed (boards 2, 3 and 8 of
 * https://claude.ai/artifact/5BvL59CmrjzxQ2JbUj15PN). Three figures, three
 * charts (`./device-my-data-charts`), each kind of recording with how many
 * and since when, a kind's list, newest first, playable where its audio is
 * on this phone, and what is kept for good, with how many home keeps of
 * each and since when (MD2b, #2519). Nothing here deletes.
 *
 * `MyDataOverview` and `MyDataKind` draw a snapshot; `DeviceMyData` and
 * `DeviceMyDataKind` read it from the runtime (`lib/my-data`), which a drag
 * down reads again (`lib/pull-refresh`'s refreshers, PULL1). Every word is
 * `lib/my-data/words`'s. Phone build only (`device-*`): render each behind
 * an inline `import.meta.env.VITE_DEVICE_BACKEND === "true"`.
 */
import type { JSX } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { formatSize } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"
import { Link } from "@tanstack/react-router"
import { ChevronLeft, ChevronRight, Lock, Pause, Play } from "lucide-react"

import { hasAudience } from "@/lib/build-profile"
import type { KindItem, MyDataState, Of, Overview } from "@/lib/my-data"
import { isKind, kindOf, overviewOf, phoneMyData } from "@/lib/my-data"
import type {
  KindLine as KindLineOf,
  KindView,
  PhoneRead,
} from "@/lib/my-data/model"
import type { RecordReading } from "@/lib/my-data/record"
import { RECORD_KINDS } from "@/lib/my-data/record"
import {
  homeLine,
  itemLine,
  itemName,
  KEPT_FOR_GOOD,
  keptLine,
  keptNote,
  KIND_NAMES,
  kindLead,
  kindLine,
  MY_DATA,
  unreadLine,
  WHERE_WORDS,
} from "@/lib/my-data/words"
import { screenRefreshers } from "@/lib/pull-refresh/refreshers"

import {
  GrowthLine,
  MyDataTables,
  SpaceBars,
  WHERE_FILL,
  WhereBar,
} from "./device-my-data-charts"

const Status = ({ line }: { line: string | null }): JSX.Element | null =>
  line === null ? null : (
    <p className="text-muted-foreground text-sm" role="status">
      {line}
    </p>
  )

const Tile = ({
  value,
  label,
}: {
  value: string
  label: string
}): JSX.Element => (
  <div className="bg-card min-w-0 rounded-xl border p-3">
    <p className="text-lg font-semibold break-words">{value}</p>
    <p className="text-muted-foreground text-xs">{label}</p>
  </div>
)

const Section = ({
  title,
  children,
}: {
  title: string
  children: JSX.Element | ReadonlyArray<JSX.Element | null>
}): JSX.Element => (
  <section className="space-y-2">
    <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
      {title}
    </h2>
    {children}
  </section>
)

const ROW = "flex min-h-12 items-center gap-3 px-4 py-2"

/** One kind's row, opening its list where the build carries My data's pages (A3). */
const KindRow = ({ kind }: { kind: KindLineOf }): JSX.Element => {
  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium break-words">
          {KIND_NAMES[kind.of]}
        </span>
        <span className="text-muted-foreground block text-xs">
          {kindLine(kind.notes, kind.since, kind.phoneOnly)}
        </span>
      </span>
      <span className="text-muted-foreground text-xs tabular-nums">
        {formatSize(kind.bytes)}
      </span>
      <ChevronRight
        className="text-muted-foreground size-4 shrink-0"
        aria-hidden
      />
    </>
  )
  return hasAudience("apk") ? (
    <Link
      to="/settings/data/$kind"
      params={{ kind: kind.of }}
      className={`hover:bg-accent ${ROW}`}
    >
      {content}
    </Link>
  ) : (
    <div className={ROW}>{content}</div>
  )
}

/** What is kept for good, with home's count of each once home gave it. */
const KeptForGood = ({
  record,
}: {
  record: RecordReading | undefined
}): JSX.Element => (
  <Section title={MY_DATA.keptTitle}>
    <p className="bg-muted flex items-start gap-2 rounded-xl p-3 text-sm">
      <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{MY_DATA.kept}</span>
    </p>
    <ul className="bg-card divide-y rounded-xl border">
      {RECORD_KINDS.map((kind) => (
        <li key={kind} className="px-4 py-2.5">
          <span className="block text-sm break-words">
            {KEPT_FOR_GOOD[kind]}
          </span>
          {record?.kind === "read" ? (
            <span className="text-muted-foreground block text-xs">
              {keptLine(record.held[kind])}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
    <Status line={keptNote(record)} />
  </Section>
)

export const MyDataOverview = ({
  overview,
  record,
  unread = [],
}: {
  overview: Overview
  /** Home's count of the record kept for good, once home answered. */
  record?: RecordReading
  /**
   * The stores whose recordings on this phone aren't counted yet, or null
   * while this phone's recordings are read.
   */
  unread?: PhoneRead["unread"] | null
}): JSX.Element => {
  const [tables, setTables] = useState(false)
  return (
    <div className="space-y-5">
      <Status line={homeLine(overview.home)} />
      <Status
        line={unread === null ? MY_DATA.phoneReading : unreadLine(unread)}
      />
      <div className="grid grid-cols-3 gap-2">
        <Tile
          value={
            overview.homeBytes === null
              ? MY_DATA.unknown
              : formatSize(overview.homeBytes)
          }
          label={MY_DATA.tiles.home}
        />
        <Tile
          value={formatSize(overview.phoneBytes)}
          label={MY_DATA.tiles.phone}
        />
        <Tile
          value={String(overview.recordings)}
          label={MY_DATA.tiles.recordings}
        />
      </div>
      {overview.kinds.length === 0 ? null : (
        <SpaceBars kinds={overview.kinds} />
      )}
      {overview.home === "read" ? (
        <GrowthLine growth={overview.growth} />
      ) : null}
      {overview.recordings === 0 ? null : <WhereBar where={overview.where} />}
      {overview.recordings === 0 ? null : (
        <>
          <Button
            variant="link"
            size="sm"
            className="h-auto px-0"
            onClick={() => setTables((shown) => !shown)}
            aria-expanded={tables}
          >
            {tables ? MY_DATA.table.hide : MY_DATA.table.show}
          </Button>
          {tables ? <MyDataTables overview={overview} /> : null}
        </>
      )}
      <Section title={MY_DATA.recordings}>
        {overview.kinds.length === 0 ? (
          <p className="text-muted-foreground text-sm">{MY_DATA.none}</p>
        ) : (
          <ul className="bg-card divide-y rounded-xl border">
            {overview.kinds.map((kind) => (
              <li key={kind.of}>
                <KindRow kind={kind} />
              </li>
            ))}
          </ul>
        )}
      </Section>
      <KeptForGood record={record} />
    </div>
  )
}

const Item = ({
  item,
  playing,
  onPlay,
  onStop,
}: {
  item: KindItem
  playing: boolean
  onPlay: (id: string) => void
  onStop: () => void
}): JSX.Element => {
  const name = itemName(item.at)
  return (
    <li className="flex min-h-12 items-center gap-3 px-3 py-2">
      {item.playable ? (
        <Button
          variant="outline"
          size="icon"
          className="size-11 shrink-0 rounded-full"
          aria-label={
            playing ? MY_DATA.kind.stop(name) : MY_DATA.kind.play(name)
          }
          aria-pressed={playing}
          onClick={() => (playing ? onStop() : onPlay(item.id))}
        >
          {playing ? (
            <Pause className="size-4" aria-hidden />
          ) : (
            <Play className="size-4" aria-hidden />
          )}
        </Button>
      ) : (
        <span className="size-11 shrink-0" aria-hidden />
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm tabular-nums">
          {itemLine(item.at, item.bytes)}
        </span>
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <span
            className={`${WHERE_FILL[item.where]} size-2 shrink-0 rounded-full`}
            aria-hidden
          />
          {WHERE_WORDS[item.where]}
        </span>
      </span>
    </li>
  )
}

export const MyDataKind = ({
  view,
  playing,
  onPlay,
  onStop,
  unread = [],
}: {
  view: KindView
  playing: string | null
  onPlay: (id: string) => void
  onStop: () => void
  /** This kind's store, when its recordings on this phone aren't counted yet. */
  unread?: PhoneRead["unread"]
}): JSX.Element => (
  <div className="space-y-4">
    <Status line={homeLine(view.home)} />
    <Status line={unreadLine(unread)} />
    <p className="text-muted-foreground text-sm">
      {kindLead(view.notes, view.bytes, view.since)}
    </p>
    {view.items.length === 0 ? (
      <p className="text-muted-foreground text-sm">{MY_DATA.kind.empty}</p>
    ) : (
      <ul className="bg-card divide-y rounded-xl border">
        {view.items.map((item) => (
          <Item
            key={item.id}
            item={item}
            playing={playing === item.id}
            onPlay={onPlay}
            onStop={onStop}
          />
        ))}
      </ul>
    )}
    {view.items.length < view.notes ? (
      <p className="text-muted-foreground text-xs">
        {MY_DATA.kind.newest(view.items.length, view.notes)}
      </p>
    ) : null}
  </div>
)

/** The runtime's snapshot for the page at `of`, read again on mount and on a drag down. */
function useMyData(of: Of | null): MyDataState {
  const data = phoneMyData()
  const state = useSyncExternalStore(data.subscribe, data.getSnapshot)
  useEffect(() => {
    data.open(of)
    const drop = screenRefreshers.register({
      what: MY_DATA.pullWhat,
      checkAgain: data.checkAgain,
    })
    return (): void => {
      drop()
      data.stop()
    }
  }, [data, of])
  return state
}

export const DeviceMyData = (): JSX.Element => {
  const state = useMyData(null)
  return (
    <MyDataOverview
      overview={overviewOf(state.home, state.phone?.notes ?? [], new Date())}
      record={state.home.kind === "read" ? state.home.record : undefined}
      unread={state.phone?.unread ?? null}
    />
  )
}

/** The page's heading for kind `of`: its name, and the way back to My data. */
const KindHeading = ({ of }: { of: Of | null }): JSX.Element => (
  <div className="space-y-1">
    {hasAudience("apk") ? (
      <Link
        to="/settings/data"
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {MY_DATA.kind.back}
      </Link>
    ) : null}
    <h1 className="text-2xl font-semibold tracking-tight break-words">
      {of === null ? MY_DATA.kind.unknown : KIND_NAMES[of]}
    </h1>
  </div>
)

const KindList = ({ of }: { of: Of }): JSX.Element => {
  const state = useMyData(of)
  const data = phoneMyData()
  return (
    <MyDataKind
      view={kindOf(
        of,
        state.of,
        state.home,
        state.phone?.notes ?? [],
        new Date()
      )}
      unread={(state.phone?.unread ?? []).filter((store) => store === of)}
      playing={state.playing}
      onPlay={data.play}
      onStop={data.stop}
    />
  )
}

/** The page of the kind the address names, or says there's no such kind. */
export const DeviceMyDataKind = ({ kind }: { kind: string }): JSX.Element => {
  const of = isKind(kind) ? kind : null
  return (
    <>
      <KindHeading of={of} />
      {of === null ? null : <KindList of={of} />}
    </>
  )
}
