import { useEffect, useRef, useState } from "react"
import { Button } from "@shared/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@shared/components/ui/card"
import type { SparkleBurstHandle } from "@shared/components/ui/sparkle-burst"
import { SparkleBurst } from "@shared/components/ui/sparkle-burst"

type Status = "idle" | "loading" | "success" | "error"

const successColors = ["#FDE68A", "#A7F3D0", "#C7D2FE", "#A5F3FC", "#FCD34D"]
const errorColors = ["#FCA5A5", "#F87171", "#FECACA", "#FDE68A"]

export const SparkleShowcase = () => {
  const burstRef = useRef<SparkleBurstHandle>(null)

  const [status, setStatus] = useState<Status>("idle")
  const [score, setScore] = useState<number>(0)
  const [sequenceRunning, setSequenceRunning] = useState<boolean>(false)
  const [colors, setColors] = useState<Array<string>>(successColors)

  // Trigger bursts on status side-effects
  useEffect(() => {
    if (status === "success") {
      setColors(successColors)
      burstRef.current?.burst() // center
    } else if (status === "error") {
      setColors(errorColors)
      // left third
      burstRef.current?.burstAtPercent(0.33, 0.45)
    }
  }, [status])

  // Trigger bursts on score milestones
  useEffect(() => {
    if (score > 0 && score % 5 === 0) {
      // random location
      const nx = 0.15 + Math.random() * 0.7
      const ny = 0.25 + Math.random() * 0.5
      burstRef.current?.burstAtPercent(nx, ny)
    }
  }, [score])

  async function runSequence() {
    if (sequenceRunning) return
    setSequenceRunning(true)
    setStatus("idle")
    setColors(successColors)

    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

    // 4-corner sweep + center finale
    burstRef.current?.burstAtPercent(0.15, 0.25)
    await wait(250)
    burstRef.current?.burstAtPercent(0.85, 0.25)
    await wait(250)
    burstRef.current?.burstAtPercent(0.2, 0.75)
    await wait(250)
    burstRef.current?.burstAtPercent(0.8, 0.75)
    await wait(300)
    burstRef.current?.burstAtPercent(0.5, 0.5)
    setSequenceRunning(false)
  }

  function simulateSuccess() {
    setStatus("loading")
    setTimeout(() => setStatus("success"), 700)
  }

  function simulateError() {
    setStatus("loading")
    setTimeout(() => setStatus("error"), 700)
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle>Sparkle Burst Showcase</CardTitle>
        <CardDescription>
          Side-effect driven celebrations using useState and useEffect.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Celebration Canvas */}
        <div className="relative">
          <SparkleBurst
            ref={burstRef}
            autoPlay={false}
            particleCount={160}
            spread={110}
            gravity={0.22}
            drag={0.985}
            startVelocity={7.2}
            colors={colors}
            origin="center"
            maxDurationMs={1700}
            showControls={false}
          />
          {/* Overlay status and score readout */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm">
              <span>Status:</span>
              <span
                className={
                  status === "success"
                    ? "text-emerald-600"
                    : status === "error"
                      ? "text-rose-600"
                      : status === "loading"
                        ? "text-amber-600"
                        : "text-zinc-500"
                }
              >
                {status}
              </span>
            </div>
            <div className="pointer-events-auto rounded-full bg-white/70 px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm">
              Score: {score}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            variant="default"
            onClick={simulateSuccess}
            disabled={status === "loading"}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            Simulate Success
          </Button>
          <Button
            variant="destructive"
            onClick={simulateError}
            disabled={status === "loading"}
          >
            Simulate Error
          </Button>
          <Button variant="secondary" onClick={() => setScore((s) => s + 1)}>
            Increment Score
          </Button>
          <Button
            variant="outline"
            onClick={runSequence}
            disabled={sequenceRunning}
          >
            Run Sequence Demo
          </Button>
        </div>

        {/* Manual trigger row */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => burstRef.current?.burst()}
            className="bg-amber-500 text-white hover:bg-amber-600"
          >
            Burst Center
          </Button>
          <Button onClick={() => burstRef.current?.burstAtPercent(0.2, 0.4)}>
            Burst Left
          </Button>
          <Button onClick={() => burstRef.current?.burstAtPercent(0.8, 0.4)}>
            Burst Right
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
