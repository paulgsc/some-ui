import type { JSX } from "react"
import { useEffect, useState } from "react"
import {
  AngledEnergyBar,
  GlassyHeart,
} from "@stepper/components/debugging-tracker"

export const DebuggingTracker = (): JSX.Element => {
  const [rustHealth, setRustHealth] = useState(92)
  const [tsHealth, setTsHealth] = useState(95)
  const [sessionTime, setSessionTime] = useState({
    hours: 2,
    minutes: 34,
    seconds: 18,
  })
  const [rustCommits] = useState(24)
  const [tsCommits] = useState(29)
  const [rustErrors] = useState(9)
  const [tsErrors] = useState(13)
  const [flicker, setFlicker] = useState(false)
  const [activeLang, setActiveLang] = useState<"rust" | "typescript">("rust")

  // Session timer
  useEffect(() => {
    const interval = setInterval(() => {
      setSessionTime((prev) => {
        let { hours, minutes, seconds } = prev
        seconds++
        if (seconds >= 60) {
          seconds = 0
          minutes++
        }
        if (minutes >= 60) {
          minutes = 0
          hours++
        }
        return { hours, minutes, seconds }
      })
    }, 1000)

    return (): void => clearInterval(interval)
  }, [])

  // Simulate health changes and error flicker
  useEffect(() => {
    const healthInterval = setInterval(() => {
      setRustHealth((prev) =>
        Math.max(20, Math.min(100, prev + (Math.random() - 0.5) * 5))
      )
      setTsHealth((prev) =>
        Math.max(20, Math.min(100, prev + (Math.random() - 0.5) * 5))
      )
    }, 3000)

    return (): void => clearInterval(healthInterval)
  }, [])

  // CRT flicker effect on error events
  useEffect(() => {
    const flickerInterval = setInterval(() => {
      if (Math.random() > 0.9) {
        setFlicker(true)
        setTimeout(() => setFlicker(false), 100)
      }
    }, 5000)

    return (): void => clearInterval(flickerInterval)
  }, [])

  useEffect(() => {
    const langInterval = setInterval(() => {
      setActiveLang((prev) => (prev === "rust" ? "typescript" : "rust"))
    }, 8000)

    return (): void => clearInterval(langInterval)
  }, [])

  const formatTime = (num: number): string => String(num).padStart(2, "0")

  const bgGradient =
    activeLang === "rust"
      ? "bg-gradient-to-br from-[rgb(60,35,25)] via-[rgb(70,40,28)] to-[rgb(80,45,30)]"
      : "bg-gradient-to-br from-[rgb(20,35,55)] via-[rgb(25,42,65)] to-[rgb(30,48,75)]"

  return (
    <div className="relative w-full h-full">
      {/* Atmospheric fog background */}
      <div className="absolute inset-0 overflow-hidden rounded-xl">
        <div
          className="absolute inset-0 opacity-30 transition-all duration-1000"
          style={{
            background: `radial-gradient(ellipse at 20% 50%, rgba(${rustHealth < 50 ? "255, 77, 79" : "220, 85, 60"}, 0.15) 0%, transparent 50%), 
                         radial-gradient(ellipse at 80% 50%, rgba(${tsHealth < 50 ? "45, 106, 240" : "45, 118, 215"}, 0.15) 0%, transparent 50%)`,
          }}
        />
        {/* Noise texture overlay */}
        <div
          className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' /%3E%3C/svg%3E")`,
          }}
        />
      </div>

      {/* Main container */}
      <div
        className={`relative ${bgGradient} rounded-xl shadow-2xl overflow-hidden border border-[rgba(255,133,90,0.2)] transition-all duration-1000 ${
          flicker ? "opacity-90" : "opacity-100"
        } h-full flex flex-col`}
      >
        {/* Header */}
        <div className="relative px-6 py-3 border-b border-[rgba(255,133,90,0.15)]">
          <h1
            className="text-center text-lg font-bold tracking-[0.15em] uppercase"
            style={{
              background: "linear-gradient(to bottom, #fff 0%, #ddd 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              textShadow: "0 1px 2px rgba(0,0,0,0.3)",
              letterSpacing: "1.5px",
            }}
          >
            Debugging Build Issues
          </h1>
        </div>

        {/* Main content */}
        <div className="px-6 py-4 flex-1 flex items-center">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-6 items-center w-full">
            {/* Rust section */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <GlassyHeart health={rustHealth} color="rust" />
                <div>
                  <div className="text-3xl font-bold text-white">
                    {rustCommits}
                  </div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Commits
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs uppercase tracking-wider">
                  <span className="text-[rgb(220,85,60)]">Rust</span>
                  <span className="text-muted-foreground">
                    {rustErrors} errors
                  </span>
                </div>
                <AngledEnergyBar
                  progress={rustHealth}
                  color="rust"
                  isLow={rustHealth < 25}
                />
              </div>
            </div>

            {/* Center timer */}
            <div className="flex flex-col items-center justify-center lg:px-6">
              <div className="text-4xl font-mono font-bold text-white tracking-tight">
                {formatTime(sessionTime.hours)}:
                {formatTime(sessionTime.minutes)}:
                {formatTime(sessionTime.seconds)}
              </div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">
                Session Time
              </div>
            </div>

            {/* TypeScript section */}
            <div className="space-y-2">
              <div className="flex items-center gap-3 lg:flex-row-reverse">
                <GlassyHeart health={tsHealth} color="typescript" />
                <div className="lg:text-right">
                  <div className="text-3xl font-bold text-white">
                    {tsCommits}
                  </div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Commits
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs uppercase tracking-wider">
                  <span className="text-[rgb(45,118,215)]">TypeScript</span>
                  <span className="text-muted-foreground">
                    {tsErrors} errors
                  </span>
                </div>
                <AngledEnergyBar
                  progress={tsHealth}
                  color="typescript"
                  isLow={tsHealth < 25}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-2 border-t border-[rgba(255,133,90,0.15)]">
          <p className="text-center text-xs text-muted-foreground tracking-wide">
            Live Coding Session Tracker
          </p>
        </div>
      </div>
    </div>
  )
}
