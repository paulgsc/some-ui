/**
 * My data (MY-DATA MD2, #2476): what you keep, where, how much and how it
 * grows, read only, as the prototype agreed (boards 2, 3 and 8 of
 * https://claude.ai/artifact/5BvL59CmrjzxQ2JbUj15PN). Three figures, three
 * charts (`./device-my-data-charts`), each kind of recording with how many
 * and since when, a kind's list, newest first, and what is kept for good, with how many home keeps of
 * each and since when (MD2b, #2519).
 *
 * Each row of a kind's list says what it is (MD8): when it was recorded, how
 * long it is and the first words home heard, once home heard it, and
 * plays (`lib/my-data/runtime`). Away from home, home's rows aren't listed
 * (home's line says it couldn't be reached). A Play whose audio didn't come
 * is said in a `Notice` over the list (HS1).
 *
 * Deleting (MD3, #2477) is offered on a kind's list only for a recording
 * home marks deletable (`lib/my-data`'s `offersDelete`): "Delete…" on its
 * row, or Select and "Delete n…", opens the sheet
 * (`./device-my-data-delete`), which asks once. The Deleted page lists the
 * receipts.
 *
 * `MyDataOverview` and `MyDataKind` draw a snapshot; `DeviceMyData` and
 * `DeviceMyDataKind` read it from the runtime (`lib/my-data`), which a drag
 * down reads again (`lib/pull-refresh`'s refreshers, PULL1). Every word is
 * `lib/my-data/words`'s. Phone build only (`device-*`): render each behind
 * an inline `import.meta.env.VITE_DEVICE_BACKEND === "true"`.
 */
import type { JSX } from "react"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { cn, formatSize } from "@some-ui/core-utils"
import { Button, Notice } from "@some-ui/shared"
import { Link } from "@tanstack/react-router"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Lock,
  Pause,
  Play,
} from "lucide-react"

import { hasAudience } from "@/lib/build-profile"
import type {
  DeletableKind,
  DeleteSheet,
  KindItem,
  MyDataState,
  Of,
  Overview,
  ReceiptsState,
} from "@/lib/my-data"
import {
  isDeletableKind,
  isKind,
  kindOf,
  offersDelete,
  overviewOf,
  phoneDeleting,
  phoneMyData,
  phoneReceipts,
} from "@/lib/my-data"
import type {
  KindLine as KindLineOf,
  KindView,
  PhoneRead,
} from "@/lib/my-data/model"
import type { RecordReading } from "@/lib/my-data/record"
import { RECORD_KINDS } from "@/lib/my-data/record"
import {
  CALL_DELETING,
  DELETING,
  heardLine,
  homeLine,
  itemLine,
  itemName,
  itemWhere,
  KEPT_FOR_GOOD,
  keptLine,
  keptNote,
  KIND_NAMES,
  kindLead,
  kindLine,
  MY_DATA,
  receiptKind,
  receiptParts,
  RECEIPTS,
  receiptsLine,
  unreadLine,
} from "@/lib/my-data/words"
import { screenRefreshers } from "@/lib/pull-refresh/refreshers"

import {
  GrowthLine,
  MyDataTables,
  SpaceBars,
  WHERE_FILL,
  WhereBar,
} from "./device-my-data-charts"
import { DeleteSheetView } from "./device-my-data-delete"

/**
 * What the page says of how its reading went (home asked, home silent, a
 * store not opened yet).
 */
const Status = ({ line }: { line: string | null }): JSX.Element | null =>
  line === null ? null : (
    <Notice key={line} dismissible>
      {line}
    </Notice>
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
      <PageRow
        to="/settings/data/calls"
        title={CALL_DELETING.row}
        line={CALL_DELETING.rowLine}
      />
      <PageRow
        to="/settings/data/deleted"
        title={RECEIPTS.row}
        line={RECEIPTS.rowLine}
      />
    </div>
  )
}

/** What a row offers for deleting: nothing, "Delete…", or a box to select it. */
type RowDelete =
  | { readonly kind: "none" }
  | { readonly kind: "offer"; readonly onAsk: () => void }
  | {
      readonly kind: "select"
      readonly selected: boolean
      readonly onToggle: () => void
    }

const Item = ({
  item,
  playing,
  fetching = false,
  onPlay,
  onStop,
  remove = { kind: "none" },
}: {
  item: KindItem
  playing: boolean
  /** Its audio is being read, here or from home. */
  fetching?: boolean
  onPlay: (id: string) => void
  onStop: () => void
  remove?: RowDelete
}): JSX.Element => {
  const name = itemName(item.at)
  const heard = heardLine(item.heard, item.where)
  const playLabel = (): string => {
    if (!playing) return MY_DATA.kind.play(name)
    return fetching ? MY_DATA.kind.fetching(name) : MY_DATA.kind.stop(name)
  }
  return (
    <li className="flex min-h-12 items-center gap-3 px-3 py-2">
      {remove.kind === "select" ? (
        <Button
          variant="outline"
          size="icon"
          className="size-11 shrink-0 rounded-full"
          role="checkbox"
          aria-checked={remove.selected}
          aria-label={DELETING.selectName(name)}
          onClick={remove.onToggle}
        >
          {remove.selected ? <Check className="size-4" aria-hidden /> : null}
        </Button>
      ) : item.plays === "none" ? (
        <span className="size-11 shrink-0" aria-hidden />
      ) : (
        <Button
          variant="outline"
          size="icon"
          className="size-11 shrink-0 rounded-full"
          aria-label={playLabel()}
          aria-pressed={playing}
          aria-busy={playing && fetching}
          onClick={() => (playing ? onStop() : onPlay(item.id))}
        >
          {!playing ? <Play className="size-4" aria-hidden /> : null}
          {playing && fetching ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
          ) : null}
          {playing && !fetching ? (
            <Pause className="size-4" aria-hidden />
          ) : null}
        </Button>
      )}
      <span className="min-w-0 flex-1">
        {heard === null ? null : (
          <span
            className={cn(
              "line-clamp-2 text-sm break-words",
              item.heard.kind !== "words" && "text-muted-foreground italic"
            )}
          >
            {heard}
          </span>
        )}
        <span
          className={cn(
            "block tabular-nums",
            heard === null ? "text-sm" : "text-muted-foreground text-xs"
          )}
        >
          {itemLine(item.at, item.durationMs)}
        </span>
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <span
            className={`${WHERE_FILL[item.where]} size-2 shrink-0 rounded-full`}
            aria-hidden
          />
          {itemWhere(item.where, item.bytes)}
        </span>
        {item.plays === "none" && remove.kind !== "select" ? (
          <span className="text-muted-foreground block text-xs">
            {MY_DATA.kind.noPlay}
          </span>
        ) : null}
      </span>
      {remove.kind === "offer" ? (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive min-h-11 shrink-0"
          aria-label={DELETING.rowName(name)}
          onClick={remove.onAsk}
        >
          {DELETING.row}
        </Button>
      ) : null}
    </li>
  )
}

export const MyDataKind = ({
  view,
  playing,
  fetching = false,
  missed = null,
  onPlay,
  onStop,
  unread = [],
  onDelete,
}: {
  view: KindView
  playing: string | null
  /** `playing`'s audio is being read, here or from home. */
  fetching?: boolean
  /** The recording whose Play didn't get its audio, until the next Play. */
  missed?: MyDataState["missed"]
  onPlay: (id: string) => void
  onStop: () => void
  /** This kind's store, when its recordings on this phone aren't counted yet. */
  unread?: PhoneRead["unread"]
  /** Opens the delete sheet on `ids`; without it, nothing offers Delete…. */
  onDelete?: (of: DeletableKind, ids: ReadonlyArray<string>) => void
}): JSX.Element => {
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const { of } = view
  const offered =
    onDelete === undefined || !isDeletableKind(of)
      ? []
      : view.items.filter((item) => offersDelete(of, item, unread))
  const offers = new Set(offered.map((item) => item.id))
  const waits =
    onDelete !== undefined &&
    offered.length === 0 &&
    view.items.some((item) => item.deletable) &&
    unread.some((store) => store === of)
  const chosen = [...selected].filter((id) => offers.has(id))
  const ask = (ids: ReadonlyArray<string>): void => {
    if (onDelete !== undefined && isDeletableKind(of)) onDelete(of, ids)
  }
  const removeOf = (item: KindItem): RowDelete => {
    if (!offers.has(item.id)) return { kind: "none" }
    if (!selecting) return { kind: "offer", onAsk: () => ask([item.id]) }
    return {
      kind: "select",
      selected: selected.has(item.id),
      onToggle: () =>
        setSelected((now) => {
          const next = new Set(now)
          if (next.has(item.id)) next.delete(item.id)
          else next.add(item.id)
          return next
        }),
    }
  }
  return (
    <div className="space-y-4">
      <Status line={homeLine(view.home)} />
      <Status line={unreadLine(unread)} />
      {waits ? <Status line={DELETING.waitsOnStudio} /> : null}
      {missed === null ? null : (
        <Notice key={missed} tone="warning" role="alert" dismissible>
          {MY_DATA.kind.missed}
        </Notice>
      )}
      <p className="text-muted-foreground text-sm">
        {kindLead(view.notes, view.bytes, view.since)}
      </p>
      {offered.length > 1 || selecting ? (
        <div className="flex gap-2.5">
          {selecting ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setSelecting(false)
                  setSelected(new Set())
                }}
              >
                {DELETING.cancel}
              </Button>
              <Button
                variant="outline"
                className="text-destructive"
                disabled={chosen.length === 0}
                onClick={() => ask(chosen)}
              >
                {DELETING.deleteSelected(chosen.length)}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setSelecting(true)}>
              {DELETING.select}
            </Button>
          )}
        </div>
      ) : null}
      {view.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{MY_DATA.kind.empty}</p>
      ) : (
        <ul className="bg-card divide-y rounded-xl border">
          {view.items.map((item) => (
            <Item
              key={item.id}
              item={item}
              playing={playing === item.id}
              fetching={fetching}
              onPlay={onPlay}
              onStop={onStop}
              remove={removeOf(item)}
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
}

/** The runtime's snapshot for the page at `of`, read again on mount and on a drag down. */
function useMyData(of: Of | null, note?: string): MyDataState {
  const data = phoneMyData()
  const state = useSyncExternalStore(data.subscribe, data.getSnapshot)
  useEffect(() => {
    data.open(of, note ?? null)
    const drop = screenRefreshers.register({
      what: MY_DATA.pullWhat,
      checkAgain: data.checkAgain,
    })
    return (): void => {
      drop()
      data.stop()
    }
  }, [data, of, note])
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

/** The overview's way into one of My data's own pages. */
const PageRow = ({
  to,
  title,
  line,
}: {
  to: "/settings/data/calls" | "/settings/data/deleted"
  title: string
  line: string
}): JSX.Element | null =>
  hasAudience("apk") ? (
    <Link
      to={to}
      className={`hover:bg-accent bg-card rounded-xl border ${ROW}`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="text-muted-foreground block text-xs">{line}</span>
      </span>
      <ChevronRight
        className="text-muted-foreground size-4 shrink-0"
        aria-hidden
      />
    </Link>
  ) : null

/** A My data page's heading: its title, and the way back to My data. */
export const MyDataHeading = ({ title }: { title: string }): JSX.Element => (
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
      {title}
    </h1>
  </div>
)

/** The delete sheet's snapshot, and its runtime. */
function useDeleting(): {
  sheet: DeleteSheet
  deleting: ReturnType<typeof phoneDeleting>
} {
  const deleting = phoneDeleting()
  const { sheet } = useSyncExternalStore(
    deleting.subscribe,
    deleting.getSnapshot
  )
  return { sheet, deleting }
}

const KindList = ({
  of,
  note,
}: {
  of: Of
  note: string | undefined
}): JSX.Element => {
  const state = useMyData(of, note)
  const data = phoneMyData()
  const { sheet, deleting } = useDeleting()
  const view = kindOf(
    of,
    state.of,
    state.home,
    state.phone?.notes ?? [],
    new Date()
  )
  const unread = (state.phone?.unread ?? []).filter((store) => store === of)
  // `?note=` opens the sheet on that recording once, when it offers Delete….
  const opened = useRef<string | null>(null)
  const named = view.items.find((item) => item.id === note)
  const offersNamed =
    named !== undefined &&
    isDeletableKind(of) &&
    offersDelete(of, named, unread)
  useEffect(() => {
    if (note === undefined || !offersNamed || !isDeletableKind(of)) return
    if (opened.current === note) return
    opened.current = note
    deleting.ask(of, [note])
  }, [deleting, note, of, offersNamed])
  return (
    <>
      <MyDataKind
        view={view}
        unread={unread}
        playing={state.playing}
        fetching={state.fetching}
        missed={state.missed}
        onPlay={data.play}
        onStop={data.stop}
        onDelete={deleting.ask}
      />
      <DeleteSheetView
        sheet={sheet}
        onConfirm={deleting.confirm}
        onClose={deleting.close}
      />
    </>
  )
}

/**
 * The page of the kind the address names, or says there's no such kind;
 * `note`, from `?note=`, opens the delete sheet on that recording.
 */
export const DeviceMyDataKind = ({
  kind,
  note,
}: {
  kind: string
  note?: string
}): JSX.Element => {
  const of = isKind(kind) ? kind : null
  return (
    <>
      <MyDataHeading
        title={of === null ? MY_DATA.kind.unknown : KIND_NAMES[of]}
      />
      {of === null ? null : <KindList of={of} note={note} />}
    </>
  )
}

/** The Deleted page's list: each receipt, newest first. */
export const MyDataReceipts = ({
  state,
}: {
  state: ReceiptsState
}): JSX.Element => {
  const { reading } = state
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">{RECEIPTS.lead}</p>
      <Status line={receiptsLine(reading.kind)} />
      {reading.kind === "read" && reading.receipts.length === 0 ? (
        <p className="text-muted-foreground text-sm">{RECEIPTS.empty}</p>
      ) : null}
      {reading.kind === "read" && reading.receipts.length > 0 ? (
        <ul className="bg-card divide-y rounded-xl border">
          {reading.receipts.map((receipt) => (
            <li key={receipt.id} className="space-y-0.5 px-4 py-3 text-sm">
              <p className="font-medium">
                {RECEIPTS.line(
                  receiptKind(receipt.of),
                  itemName(receipt.recordedAt)
                )}
              </p>
              <p className="text-muted-foreground text-xs">
                {RECEIPTS.deletedLine(itemName(receipt.deletedAt))}
              </p>
              <p className="text-muted-foreground text-xs">
                {RECEIPTS.wentLine(receiptParts(receipt.went))}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      {reading.kind === "read" && reading.receipts.length < reading.total ? (
        <p className="text-muted-foreground text-xs">
          {MY_DATA.kind.newest(reading.receipts.length, reading.total)}
        </p>
      ) : null}
    </div>
  )
}

/** The Deleted page, read on mount and on a drag down. */
export const DeviceMyDataReceipts = (): JSX.Element => {
  const receipts = phoneReceipts()
  const state = useSyncExternalStore(receipts.subscribe, receipts.getSnapshot)
  useEffect(() => {
    receipts.open()
    return screenRefreshers.register({
      what: RECEIPTS.pullWhat,
      checkAgain: receipts.checkAgain,
    })
  }, [receipts])
  return (
    <>
      <MyDataHeading title={RECEIPTS.title} />
      <MyDataReceipts state={state} />
    </>
  )
}
