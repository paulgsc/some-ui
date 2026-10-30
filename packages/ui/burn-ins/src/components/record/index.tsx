import {
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type JSX,
} from "react"
import { BurnInStage } from "@burn-ins/components/stage"
import { FRAME } from "@burn-ins/lib/geometry"
import {
  browserRecordPorts,
  createRecorder,
  RECORDER_GLOBAL,
} from "@burn-ins/runtime/record"

/**
 * The page the recorder captures: one burn-in at a time on a transparent,
 * 1080 px wide stage, nothing else, driven through the page global
 * (`runtime/record`). The page around it must paint no background either.
 */
export const BurnInRecorder = (): JSX.Element => {
  const [recorder] = useState(() => createRecorder(browserRecordPorts))
  const snapshot = useSyncExternalStore(
    recorder.subscribe,
    recorder.getSnapshot
  )
  useLayoutEffect(() => recorder.drew(snapshot.seq), [recorder, snapshot.seq])
  useEffect(() => {
    Reflect.set(window, RECORDER_GLOBAL, recorder)
    return (): void => {
      Reflect.deleteProperty(window, RECORDER_GLOBAL)
    }
  }, [recorder])
  return (
    <div style={{ width: `${FRAME.width}px` }} data-burn-ins-recorder="">
      <BurnInStage
        frames={snapshot.frame === null ? [] : [snapshot.frame]}
        bare
        label=""
      />
    </div>
  )
}
