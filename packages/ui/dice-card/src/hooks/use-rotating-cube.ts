import type { FocusEvent } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Range as ValidNumbers } from "@dice-card/types/range"
import { assertNever } from "@dice-card/utils/assert-never"
import { createEventBus } from "some-ui-utils"

type Unsubscribe = () => void
type CubeState = {
  id?: number | string
}
type CubeEventPayloads = {
  "rotate:next": { id?: number }
  "rotate:prev": { id?: number }
  "rotate:pause": { id?: number }
  "rotate:to": { id?: number; face: Face }
}

type Face = ValidNumbers<6>
type RotationAxis = "X-axis" | "Y-axis"
export type AllowedRotationAxis = RotationAxis | "All"
type Rotation = {
  axis: RotationAxis
  face: Face
}
type RotationState = {
  face: Face
  xRotation: number
  yRotation: number
}

export type Mode = "autoplay" | "manual"
type RotateCubeOptions = {
  rotateTo?: Face
  reverse?: boolean
}

type Options = {
  dof?: AllowedRotationAxis
  duration?: number
  mode?: Mode
  cubeId?: number | string
  /**
   * Pause the autoplay interval on hover/focus. Purely a courtesy for
   * `mode: "autoplay"` cubes (WCAG 2.2.2) - a no-op for `mode: "manual"`,
   * since manual cubes never start an interval to pause in the first place.
   */
  pauseOnInteraction?: boolean
}

type InteractionPauseHandlers = {
  onMouseEnter: () => void
  onMouseLeave: () => void
  onFocus: () => void
  onBlur: (event: FocusEvent<HTMLElement>) => void
}

/** Independent reasons autoplay can be suspended for - resuming one must not
 *  restart the interval while another is still in effect. */
type AutoplaySuspendReason = "hover" | "focus" | "hidden" | "explicit"

type ReturnOptions = {
  rotationAxis: RotationAxis
  rotationState: RotationState
  rotateCube: ({ reverse, rotateTo }: RotateCubeOptions) => void
  rotateToFace: (targetFace: Face) => void
  rotateNext: () => void
  rotatePrev: () => void
  onTogglePause: () => void
  bindInteractionPause: InteractionPauseHandlers
}

type NonEmptyArray<T> = [T, ...Array<T>]

const noop = (): void => {}

const ALL_FACES: NonEmptyArray<Face> = [0, 1, 2, 3, 4, 5]

// Define adjacency map for each face with valid rotations
const FACE_GRAPH: Record<Face, Record<RotationAxis, Face>> = {
  0: { "X-axis": 4, "Y-axis": 1 }, // Front -> Top/Right
  1: { "X-axis": 4, "Y-axis": 2 }, // Right -> Top/Back
  2: { "X-axis": 4, "Y-axis": 3 }, // Back -> Top/Left
  3: { "X-axis": 4, "Y-axis": 0 }, // Left -> Top/Front
  4: { "X-axis": 2, "Y-axis": 1 }, // Top -> Back/Right
  5: { "X-axis": 0, "Y-axis": 1 }, // Bottom -> Front/Right
}

// Define cycle sequences for single-axis rotations
const ROTATION_CYCLES: Record<RotationAxis, NonEmptyArray<Face>> = {
  "X-axis": [0, 5, 2, 4], // Front -> Top -> Back -> Bottom
  "Y-axis": [0, 3, 2, 1], // Front -> Right -> Back -> Left
}

// Define reverse cycle sequences for prev operations
const REVERSE_ROTATION_CYCLES: Record<RotationAxis, NonEmptyArray<Face>> = {
  "X-axis": [0, 4, 2, 5], // Front -> Bottom -> Back -> Top
  "Y-axis": [0, 1, 2, 3], // Front -> Left -> Back -> Right
}

/**
 * Each axis's cycle only touches 4 of the cube's 6 faces (Y-axis never
 * touches 4/5, X-axis never touches 1/3) - genuinely partial, not a table
 * worth flattening to a total lookup. `indexOf` over 4 elements is not the
 * cost center here; the BFS below is.
 */
function getNextFaceInCycle(currentFace: Face, axis: RotationAxis): Face {
  const cycle = ROTATION_CYCLES[axis]
  const currentIndex = cycle.indexOf(currentFace)
  if (currentIndex === -1) {
    throw new Error(`Face ${currentFace} not in cycle`)
  }
  const nextFace = cycle[(currentIndex + 1) % cycle.length]
  if (nextFace === undefined) {
    throw new Error(`Unexpected index error for face ${currentFace}`)
  }
  return nextFace
}

function getPrevFaceInCycle(currentFace: Face, axis: RotationAxis): Face {
  const cycle = REVERSE_ROTATION_CYCLES[axis]
  const currentIndex = cycle.indexOf(currentFace)
  if (currentIndex === -1) {
    throw new Error(`Face ${currentFace} not in cycle`)
  }
  const nextFace = cycle[(currentIndex + 1) % cycle.length]
  if (nextFace === undefined) {
    throw new Error(`Unexpected index error for face ${currentFace}`)
  }
  return nextFace
}

function isInCycle(axis: RotationAxis, face: Face): boolean {
  return ROTATION_CYCLES[axis].includes(face)
}

/** Total record over the cube's 6 faces, built from an explicit literal so
 *  every key is genuinely present - no assertion needed to tell TypeScript
 *  what it can already see. */
function mapFaces<T>(fn: (face: Face) => T): Record<Face, T> {
  return {
    0: fn(0),
    1: fn(1),
    2: fn(2),
    3: fn(3),
    4: fn(4),
    5: fn(5),
  }
}

function mapAxes<T>(fn: (axis: RotationAxis) => T): Record<RotationAxis, T> {
  return {
    "X-axis": fn("X-axis"),
    "Y-axis": fn("Y-axis"),
  }
}

/** Shortest-path BFS over the 6-node face graph, preferring `rotationAxis`. */
function computeCrossAxisPath(
  rotationAxis: RotationAxis,
  startFace: Face,
  targetFace: Face
): Array<Rotation> {
  const queue: Array<{ face: Face; path: Array<Rotation> }> = [
    { face: startFace, path: [] },
  ]
  const visited = new Set<Face>([startFace])
  const axes: Array<RotationAxis> = [
    rotationAxis,
    rotationAxis === "X-axis" ? "Y-axis" : "X-axis",
  ]

  while (queue.length > 0) {
    const { face, path } = queue.shift()!

    for (const axis of axes) {
      const nextFace = FACE_GRAPH[face][axis]
      if (!visited.has(nextFace)) {
        const newPath = [...path, { axis, face: nextFace }]
        if (nextFace === targetFace) return newPath
        visited.add(nextFace)
        queue.push({ face: nextFace, path: newPath })
      }
    }
  }

  return [] // Unreachable with a valid cube graph
}

/**
 * A 6-face cube only has 30 ordered (axis, start, target) combinations worth
 * a path at all - small enough to resolve every one of them once, up front,
 * instead of re-running BFS (fresh queue/Set allocations) on every rotate
 * call. `rotateCube` becomes a couple of object lookups.
 */
const CROSS_AXIS_PATHS: Record<
  RotationAxis,
  Record<Face, Record<Face, Array<Rotation>>>
> = mapAxes((axis) =>
  mapFaces((start) =>
    mapFaces((target) => computeCrossAxisPath(axis, start, target))
  )
)

function getRotationPath(
  rotationAxis: RotationAxis,
  startFace: Face,
  targetFace: Face,
  reverse: boolean
): Array<Rotation> {
  if (startFace === targetFace) return []

  // Single-axis rotations follow the predefined cycle in either direction.
  if (
    isInCycle(rotationAxis, startFace) &&
    isInCycle(rotationAxis, targetFace)
  ) {
    const path: Array<Rotation> = []
    let currentFace = startFace
    while (currentFace !== targetFace) {
      const nextFace = reverse
        ? getPrevFaceInCycle(currentFace, rotationAxis)
        : getNextFaceInCycle(currentFace, rotationAxis)
      path.push({ axis: rotationAxis, face: nextFace })
      currentFace = nextFace
    }
    return path
  }

  // Cross-axis jump: precomputed shortest path (BFS ignores `reverse`, same
  // as the original implementation - preserved as-is, not a place to change
  // behavior silently.)
  return CROSS_AXIS_PATHS[rotationAxis][startFace][targetFace]
}

function resolveTargetFace(
  dof: AllowedRotationAxis,
  rotationAxis: RotationAxis,
  currentFace: Face,
  rotateTo: Face | undefined,
  reverse: boolean
): Face {
  if (dof === "All") {
    const randomIndex = Math.floor(Math.random() * ALL_FACES.length)
    // Fallback to current face if index math fails (impossible, but satisfies TS)
    return ALL_FACES[randomIndex] ?? currentFace
  }

  if (rotateTo !== undefined) return rotateTo
  return reverse
    ? getPrevFaceInCycle(currentFace, rotationAxis)
    : getNextFaceInCycle(currentFace, rotationAxis)
}

function computeRotationAxis(dof: AllowedRotationAxis): RotationAxis {
  switch (dof) {
    case "Y-axis":
    case "X-axis": {
      return dof
    }
    case "All": {
      return Math.random() < 0.5 ? "X-axis" : "Y-axis"
    }
    default: {
      return assertNever(dof)
    }
  }
}

export const useRotatingCube = ({
  cubeId,
  dof = "Y-axis",
  duration = 10000,
  mode = "autoplay",
  pauseOnInteraction = true,
}: Options): ReturnOptions => {
  const [rotationState, setRotationState] = useState<RotationState>({
    face: 0,
    xRotation: 0,
    yRotation: 0,
  })

  // `rotationAxis` is derived from `dof`, re-rolled (for "All") only when
  // `dof` itself changes - not an effect's job (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes):
  // computing it during render avoids both the extra commit an effect would
  // cost and the one-tick window where a fresh mount briefly renders with
  // the wrong axis before self-correcting.
  const [rotationAxis, setRotationAxis] = useState<RotationAxis>(() =>
    computeRotationAxis(dof)
  )
  const [prevDof, setPrevDof] = useState(dof)
  if (dof !== prevDof) {
    setPrevDof(dof)
    setRotationAxis(computeRotationAxis(dof))
  }

  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  )

  // Mirrors `rotationState.face` for use inside event-driven callbacks
  // without pulling `rotationState` into their dependency arrays - that
  // would recreate `rotateCube` (and everything downstream of it: the
  // autoplay interval included) on every single hop.
  const faceRef = useRef<Face>(0)
  useEffect(() => {
    faceRef.current = rotationState.face
  }, [rotationState.face])

  // Multi-hop rotations (a BFS/cycle path longer than one step) used to
  // schedule their remaining hops with bare `setTimeout` calls made from
  // inside the `setRotationState` updater itself - a side effect inside what
  // must stay a pure function, and one with no way to cancel a sequence that
  // a later call superseded. A second `rotateCube` call while one was still
  // mid-flight raced its timers against the new ones. Tracking the pending
  // timeout ids lets a new call cancel whatever the previous one queued.
  const pendingHopsRef = useRef<Array<ReturnType<typeof setTimeout>>>([])

  const clearPendingHops = useCallback((): void => {
    pendingHopsRef.current.forEach(clearTimeout)
    pendingHopsRef.current = []
  }, [])

  useEffect(() => clearPendingHops, [clearPendingHops])

  const applyRotationHop = useCallback((hop: Rotation, sign: 1 | -1): void => {
    faceRef.current = hop.face
    setRotationState((current) => ({
      face: hop.face,
      xRotation:
        (current.xRotation + (hop.axis === "X-axis" ? 90 : 0) * sign) % 360,
      yRotation:
        (current.yRotation + (hop.axis === "Y-axis" ? 90 : 0) * sign) % 360,
    }))
  }, [])

  const rotateCube = useCallback(
    ({ reverse, rotateTo }: RotateCubeOptions) => {
      clearPendingHops()

      const currentFace = faceRef.current
      const targetFace = resolveTargetFace(
        dof,
        rotationAxis,
        currentFace,
        rotateTo,
        reverse ?? false
      )
      const rotations = getRotationPath(
        rotationAxis,
        currentFace,
        targetFace,
        reverse ?? false
      )

      const [firstHop, ...remainingHops] = rotations
      if (!firstHop) return

      const sign: 1 | -1 = reverse ? -1 : 1
      applyRotationHop(firstHop, sign)

      let delay = 500
      for (const hop of remainingHops) {
        const timeoutId = setTimeout(() => {
          applyRotationHop(hop, sign)
        }, delay)
        pendingHopsRef.current.push(timeoutId)
        delay += 500
      }
    },
    [dof, rotationAxis, applyRotationHop, clearPendingHops]
  )

  const rotateNext = useCallback(() => {
    rotateCube({})
  }, [rotateCube])

  const rotatePrev = useCallback(() => {
    rotateCube({ reverse: true })
  }, [rotateCube])

  const startAutoplay = useCallback(() => {
    if (mode !== "autoplay") return
    if (typeof document !== "undefined" && document.hidden) return
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      rotateCube({})
    }, duration)
  }, [rotateCube, duration, mode])

  const stopAutoplay = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = undefined
    }
  }, [])

  const rotateToFace = useCallback(
    (face: Face) => {
      stopAutoplay()
      rotateCube({ rotateTo: face })
      startAutoplay()
    },
    [rotateCube, stopAutoplay, startAutoplay]
  )

  // Hover, focus, tab-visibility, and an explicit `rotate:pause` can each
  // independently want autoplay suspended - naively calling stopAutoplay/
  // startAutoplay from each of them treats "resume" as "nothing else still
  // wants this paused," which isn't true: leaving with the mouse while a
  // descendant still has keyboard focus, or the tab regaining visibility
  // after an explicit pause, would each incorrectly restart it. Tracking
  // *why* it's suspended means a resume only re-starts the interval once
  // every reason that suspended it has cleared.
  const suspendReasonsRef = useRef<Set<AutoplaySuspendReason>>(new Set())

  const suspendAutoplay = useCallback(
    (reason: AutoplaySuspendReason): void => {
      suspendReasonsRef.current.add(reason)
      stopAutoplay()
    },
    [stopAutoplay]
  )

  const resumeAutoplay = useCallback(
    (reason: AutoplaySuspendReason): void => {
      suspendReasonsRef.current.delete(reason)
      if (suspendReasonsRef.current.size === 0) startAutoplay()
    },
    [startAutoplay]
  )

  const onTogglePause = useCallback(() => {
    suspendAutoplay("explicit")
  }, [suspendAutoplay])

  const bindInteractionPause = useMemo<InteractionPauseHandlers>(() => {
    if (!pauseOnInteraction) {
      return {
        onMouseEnter: noop,
        onMouseLeave: noop,
        onFocus: noop,
        onBlur: noop,
      }
    }
    return {
      onMouseEnter: (): void => suspendAutoplay("hover"),
      onMouseLeave: (): void => resumeAutoplay("hover"),
      onFocus: (): void => suspendAutoplay("focus"),
      onBlur: (event: FocusEvent<HTMLElement>): void => {
        const next = event.relatedTarget
        // Focus moving between two elements inside the same card isn't a
        // real blur - don't resume mid-tab-through.
        if (next instanceof Node && event.currentTarget.contains(next)) return
        resumeAutoplay("focus")
      },
    }
  }, [pauseOnInteraction, suspendAutoplay, resumeAutoplay])

  useEffect(() => {
    if (mode === "autoplay") {
      startAutoplay()
    }
    return (): void => stopAutoplay()
  }, [mode, startAutoplay, stopAutoplay])

  // Autoplay costs real CPU/battery for a cube nobody is looking at because
  // its tab is in the background - suspend the interval while hidden and
  // pick it back up when the tab is foregrounded again (unless something
  // else - hover, focus, an explicit rotate:pause - is still holding it
  // suspended too).
  useEffect(() => {
    if (mode !== "autoplay" || typeof document === "undefined") return undefined

    const handleVisibilityChange = (): void => {
      if (document.hidden) {
        suspendAutoplay("hidden")
      } else {
        resumeAutoplay("hidden")
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return (): void =>
      document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [mode, suspendAutoplay, resumeAutoplay])

  // Handle cube events
  useEffect(() => {
    const unsubscribers: Array<Unsubscribe> = [
      cubeEvents.on("rotate:next", ({ id }) => {
        if (id === undefined || cubeId === id) rotateNext()
      }),

      cubeEvents.on("rotate:prev", ({ id }) => {
        if (id === undefined || cubeId === id) rotatePrev()
      }),

      cubeEvents.on("rotate:pause", ({ id }) => {
        if (id === undefined || cubeId === id) onTogglePause()
      }),

      cubeEvents.on("rotate:to", ({ face, id }) => {
        if (id === undefined || cubeId === id) rotateToFace(face)
      }),
    ]

    return (): void => {
      unsubscribers.forEach((unsub) => unsub())
    }
  }, [cubeId, rotateNext, rotatePrev, onTogglePause, rotateToFace])

  return {
    rotationAxis,
    rotationState,
    rotateCube,
    rotateToFace,
    rotateNext,
    rotatePrev,
    onTogglePause,
    bindInteractionPause,
  }
}

export const cubeEvents = createEventBus<CubeEventPayloads, CubeState>({})
