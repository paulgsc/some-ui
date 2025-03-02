import { useEffect, useState } from "react"
import {
  getTicks,
  tickIncrement,
  tickStep,
} from "@portfolio-chart/d3-fork/ticks"

export const TickShowcase = (): React.JSX.Element => {
  const [start, setStart] = useState(0)
  const [stop, setStop] = useState(100)
  const [count, setCount] = useState(10)
  const [ticks, setTicks] = useState<Array<number>>([])
  const [increment, setIncrement] = useState<number | null>(null)
  const [step, setStep] = useState<number | null>(null)

  useEffect(() => {
    async function updateTicks() {
      const tickValues = await getTicks(start, stop, count)
      const tickInc = await tickIncrement(start, stop, count)
      const tickStp = await tickStep(start, stop, count)

      setTicks(tickValues)
      setIncrement(tickInc)
      setStep(tickStp)
    }
    updateTicks()
  }, [start, stop, count])

  return (
    <div className="rounded-lg bg-gray-100 p-4 shadow-md">
      <h2 className="text-lg font-semibold">WASM Tick Showcase</h2>

      <div className="mt-4 flex gap-4">
        <label>
          Start:
          <input
            type="number"
            value={start}
            onChange={(e) => setStart(Number(e.target.value))}
            className="ml-2 rounded border p-1"
          />
        </label>

        <label>
          Stop:
          <input
            type="number"
            value={stop}
            onChange={(e) => setStop(Number(e.target.value))}
            className="ml-2 rounded border p-1"
          />
        </label>

        <label>
          Count:
          <input
            type="number"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="ml-2 rounded border p-1"
          />
        </label>
      </div>

      <div className="mt-4">
        <h3 className="text-md font-medium">Generated Ticks:</h3>
        <p className="text-gray-700">{ticks.join(", ")}</p>
      </div>

      <div className="mt-2">
        <h3 className="text-md font-medium">Tick Increment:</h3>
        <p className="text-gray-700">
          {increment !== null ? increment : "Loading..."}
        </p>
      </div>

      <div className="mt-2">
        <h3 className="text-md font-medium">Tick Step:</h3>
        <p className="text-gray-700">{step !== null ? step : "Loading..."}</p>
      </div>
    </div>
  )
}
