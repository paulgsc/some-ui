import { ActionFace } from "@conveyor/components/faces/action"
import { CategoryOverviewFace } from "@conveyor/components/faces/category-overview"
import type { ClockProps } from "@conveyor/components/faces/clock"
import { ClockFace } from "@conveyor/components/faces/clock"
import { LastActivityFace } from "@conveyor/components/faces/last-activity"
import { StreakCountFace } from "@conveyor/components/faces/streak-count"
import { TodayProgressFace } from "@conveyor/components/faces/today-progress"
import {
  categoryProgress,
  completeCategoryCount,
  currentCategory,
  formatRelative,
  loadStreakData,
} from "@conveyor/lib/content/streak-store"
import type { FaceContent } from "@conveyor/types"

/**
 * face-contents — CONTROLLER layer.
 *
 * Owns I/O + lifecycle (storage reads, polling timers) and adapts a pure view
 * from @conveyor/components/faces to the FaceContent contract. No DOM building,
 * no styling — that lives entirely in the view modules, which is exactly why
 * the views are independently storyable.
 */

type PolledFace<P> = {
  id: string
  slowOnHover?: boolean
  intervalMs: number
  load: () => Promise<P | null>
  view: (props: P) => HTMLElement
  placeholder: () => HTMLElement
}

function makePolledFace<P>(spec: PolledFace<P>): FaceContent {
  let timer: ReturnType<typeof setInterval> | null = null
  let host: HTMLElement | null = null

  const refresh = async (): Promise<void> => {
    const props = await spec.load()
    if (!host) return
    host.replaceChildren(props == null ? spec.placeholder() : spec.view(props))
  }

  return {
    id: spec.id,
    slowOnHover: spec.slowOnHover ?? true,
    render(): HTMLElement {
      host = document.createElement("div")
      host.style.width = "100%"
      host.style.height = "100%"
      host.append(spec.placeholder())
      void refresh()
      timer = setInterval(() => void refresh(), spec.intervalMs)
      return host
    },
    onExit(): void {
      if (timer !== null) clearInterval(timer)
      timer = null
      host = null
    },
  }
}

export function makeStreakCountFace(): FaceContent {
  return makePolledFace({
    id: "streak-count",
    intervalMs: 10_000,
    placeholder: () => StreakCountFace({ complete: 0, total: 0 }),
    view: StreakCountFace,
    load: async () => {
      const data = await loadStreakData()
      if (!data) return null
      return {
        complete: completeCategoryCount(data),
        total: data.categories.length,
      }
    },
  })
}

export function makeTodayProgressFace(): FaceContent {
  return makePolledFace({
    id: "today-progress",
    intervalMs: 10_000,
    placeholder: () => TodayProgressFace({ tasks: [] }),
    view: TodayProgressFace,
    load: async () => {
      const data = await loadStreakData()
      const cat = data ? currentCategory(data) : undefined
      if (!cat) return null
      return { tasks: cat.tasks.map((t) => ({ label: t.label, done: t.done })) }
    },
  })
}

export function makeLastActivityFace(): FaceContent {
  return makePolledFace({
    id: "last-activity",
    intervalMs: 15_000,
    placeholder: () =>
      LastActivityFace({
        lastActiveText: "--",
        focusIcon: "",
        focusName: "--",
      }),
    view: LastActivityFace,
    load: async () => {
      const data = await loadStreakData()
      if (!data) return null
      const cat = currentCategory(data)
      return {
        lastActiveText: formatRelative(data.lastActivity),
        focusIcon: cat?.icon ?? "",
        focusName: cat?.name ?? "--",
      }
    },
  })
}

export function makeCategoryOverviewFace(): FaceContent {
  return makePolledFace({
    id: "category-overview",
    intervalMs: 10_000,
    placeholder: () => CategoryOverviewFace({ categories: [] }),
    view: CategoryOverviewFace,
    load: async () => {
      const data = await loadStreakData()
      if (!data) return null
      return {
        categories: data.categories.slice(0, 5).map((c) => ({
          icon: c.icon,
          name: c.name,
          pct: categoryProgress(c),
        })),
      }
    },
  })
}

export function makeClockFace(): FaceContent {
  const read = (): ClockProps => {
    const now = new Date()
    return {
      time: now.toLocaleTimeString("en-US", { hour12: false }),
      date: now.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
    }
  }
  return makePolledFace({
    id: "clock",
    slowOnHover: false,
    intervalMs: 1_000,
    placeholder: () => ClockFace(read()),
    view: ClockFace,
    load: () => Promise.resolve(read()),
  })
}

export function makeActionFace(): FaceContent {
  return { id: "action", slowOnHover: true, render: () => ActionFace({}) }
}

/**
 * Canonical set of 6 face contents. One instance per cube — never shared.
 */
export function makeCubeFaceContents(_cubeId: string): Array<FaceContent> {
  return [
    makeStreakCountFace(),
    makeTodayProgressFace(),
    makeLastActivityFace(),
    makeCategoryOverviewFace(),
    makeClockFace(),
    makeActionFace(),
  ]
}
