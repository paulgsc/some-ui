import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react"

type RGB = { r: number; g: number; b: number }
type ParticleType = "confetti" | "spark" | "star"

type Options = {
  // visual
  colors?: Array<string>
  particleCount?: number
  gravity?: number
  drag?: number
  spread?: number // degrees
  startVelocity?: number
  // behavior
  autoPlay?: boolean
  // placement
  origin?: { x: number; y: number } | "center"
  // timing
  maxDurationMs?: number
}

type ParticleBase = {
  type: ParticleType
  x: number
  y: number
  vx: number
  vy: number
  life: number // 0..1 where 1 = born, 0 = dead
  decay: number // per second
  alpha: number
  color: RGB
  size: number
  rotation: number
  spin: number
}

type Confetti = ParticleBase & {
  type: "confetti"
  w: number
  h: number
  tilt: number
  tiltVel: number
}

type Spark = ParticleBase & {
  type: "spark"
}

type Star = ParticleBase & {
  type: "star"
  spikes: number
}

type Ray = {
  angle: number
  length: number
  maxLength: number
  alpha: number
  growth: number
}

type Ring = {
  radius: number
  maxRadius: number
  alpha: number
  growth: number
}

function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "")
  const bigint = parseInt(
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean,
    16
  )
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
}

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function drawStarPath(
  ctx: CanvasRenderingContext2D,
  spikes: number,
  outerRadius: number,
  innerRadius: number
): void {
  let rot = (Math.PI / 2) * 3
  const step = Math.PI / spikes

  ctx.beginPath()
  ctx.moveTo(0, -outerRadius)
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(Math.cos(rot) * outerRadius, Math.sin(rot) * outerRadius)
    rot += step

    ctx.lineTo(Math.cos(rot) * innerRadius, Math.sin(rot) * innerRadius)
    rot += step
  }
  ctx.lineTo(0, -outerRadius)
  ctx.closePath()
}

export type SparkleBurstHandle = {
  burst: (x?: number, y?: number) => void
  burstAtClient: (clientX: number, clientY: number) => void
  burstAtElement: (el: HTMLElement) => void
  burstAtPercent: (nx: number, ny: number) => void
}

export const SparkleBurst = forwardRef<SparkleBurstHandle, Options>(
  (props: Options = {}, ref) => {
    const {
      colors = [
        "#FDE68A",
        "#FBCFE8",
        "#FCA5A5",
        "#A7F3D0",
        "#C7D2FE",
        "#A5F3FC",
        "#FCD34D",
      ],
      particleCount = 140,
      gravity = 0.22,
      drag = 0.985,
      spread = 90, // degrees
      startVelocity = 6.5,
      autoPlay = true,
      origin = "center",
      maxDurationMs = 1600,
    } = props

    const containerRef = useRef<HTMLDivElement | null>(null)
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const rafRef = useRef<number | null>(null)
    const particlesRef = useRef<Array<Confetti | Spark | Star>>([])
    const raysRef = useRef<Array<Ray>>([])
    const ringsRef = useRef<Array<Ring>>([])
    const startedAtRef = useRef<number>(0)
    const dprRef = useRef<number>(1)
    const aliveRef = useRef<boolean>(false)
    const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null)

    const resize = useCallback(() => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return

      const rect = container.getBoundingClientRect()
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2))
      dprRef.current = dpr

      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
    }, [])

    useEffect(() => {
      resize()
      const ro = new ResizeObserver(() => resize())
      if (containerRef.current) ro.observe(containerRef.current)
      return (): void => {
        ro.disconnect()
      }
    }, [resize])

    const spawn = useCallback(
      (cx: number, cy: number) => {
        const all: Array<Confetti | Spark | Star> = []
        const colorRGB = colors.map(hexToRgb)

        // distribution
        const confettiNum = Math.floor(particleCount * 0.55)
        const sparkNum = Math.floor(particleCount * 0.3)
        const starNum = Math.max(8, Math.floor(particleCount * 0.15))

        // angle spread centered upwards (-90deg)
        const baseAngle = -90
        const half = spread / 2

        // Confetti (rectangles)
        for (let i = 0; i < confettiNum; i++) {
          const angle = toRad(baseAngle + rand(-half, half))
          const speed = startVelocity * rand(0.7, 1.2)
          const color = colorRGB.at(
            Math.floor(Math.random() * colorRGB.length)
          ) ?? { r: 0, g: 0, b: 0 }
          const w = rand(6, 12)
          const h = rand(3, 7)

          const p: Confetti = {
            type: "confetti",
            x: cx,
            y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1,
            decay: rand(0.55, 0.8),
            alpha: 1,
            color,
            size: Math.max(w, h),
            rotation: rand(0, Math.PI * 2),
            spin: rand(-0.2, 0.2),
            w,
            h,
            tilt: rand(-0.2, 0.2),
            tiltVel: rand(-0.02, 0.02),
          }
          all.push(p)
        }

        // Sparks (glittering dots)
        for (let i = 0; i < sparkNum; i++) {
          const angle = toRad(baseAngle + rand(-half, half))
          const speed = startVelocity * rand(0.9, 1.6)
          const color = colorRGB.at(
            Math.floor(Math.random() * colorRGB.length)
          ) ?? { r: 0, g: 0, b: 0 }
          const size = rand(1.2, 2.6)
          const p: Spark = {
            type: "spark",
            x: cx,
            y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1,
            decay: rand(0.65, 0.95),
            alpha: 1,
            color,
            size,
            rotation: 0,
            spin: 0,
          }
          all.push(p)
        }

        // Stars
        for (let i = 0; i < starNum; i++) {
          const angle = toRad(baseAngle + rand(-half - 20, half + 20))
          const speed = startVelocity * rand(0.8, 1.4)
          const color = colorRGB.at(
            Math.floor(Math.random() * colorRGB.length)
          ) ?? { r: 0, g: 0, b: 0 }
          const size = rand(4, 7)
          const p: Star = {
            type: "star",
            x: cx,
            y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1,
            decay: rand(0.55, 0.85),
            alpha: 1,
            color,
            size,
            rotation: rand(0, Math.PI * 2),
            spin: rand(-0.15, 0.15),
            spikes: Math.random() < 0.5 ? 5 : 6,
          }
          all.push(p)
        }

        // Rays
        const rayCount = 14
        const base = rand(0, Math.PI * 2)
        raysRef.current = Array.from({ length: rayCount }, (_, i) => {
          const a = base + (i / rayCount) * Math.PI * 2
          return {
            angle: a,
            length: rand(12, 24),
            maxLength: rand(46, 68),
            alpha: 1,
            growth: rand(0.9, 1.6),
          }
        })

        // Rings
        ringsRef.current = [
          {
            radius: 0,
            maxRadius: rand(60, 100),
            alpha: 1,
            growth: rand(2.0, 3.2),
          },
          {
            radius: 0,
            maxRadius: rand(26, 44),
            alpha: 0.9,
            growth: rand(2.6, 4.0),
          },
        ]

        particlesRef.current = all
      },
      [colors, particleCount, spread, startVelocity]
    )

    const step = useCallback(
      (_t: number) => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext("2d")
        if (!ctx) return

        const width = canvas.width
        const height = canvas.height
        const dpr = dprRef.current

        ctx.clearRect(0, 0, width, height)

        // draw rays and rings from current origin (we derive it from the first particle)
        const originX = particlesRef.current[0]?.x ?? width / 2
        const originY = particlesRef.current[0]?.y ?? height / 2

        // Rays
        if (raysRef.current.length) {
          ctx.save()
          ctx.translate(originX, originY)
          for (const ray of raysRef.current) {
            const x2 = Math.cos(ray.angle) * ray.length * dpr
            const y2 = Math.sin(ray.angle) * ray.length * dpr
            const grad = ctx.createLinearGradient(0, 0, x2, y2)
            grad.addColorStop(0, `rgba(255,255,255,${0.7 * ray.alpha})`)
            grad.addColorStop(1, `rgba(255,255,255,0)`)
            ctx.strokeStyle = grad
            ctx.lineWidth = 2 * dpr
            ctx.beginPath()
            ctx.moveTo(0, 0)
            ctx.lineTo(x2, y2)
            ctx.stroke()

            // update
            ray.length = Math.min(ray.maxLength, ray.length + ray.growth * dpr)
            ray.alpha *= 0.96
          }
          ctx.restore()
          raysRef.current = raysRef.current.filter((r) => r.alpha > 0.06)
        }

        // Rings
        if (ringsRef.current.length) {
          ctx.save()
          ctx.translate(originX, originY)
          for (const ring of ringsRef.current) {
            ctx.beginPath()
            ctx.arc(0, 0, Math.max(0.001, ring.radius) * dpr, 0, Math.PI * 2)
            ctx.strokeStyle = `rgba(255,255,255,${0.55 * ring.alpha})`
            ctx.lineWidth = Math.max(1, 2 * dpr)
            ctx.stroke()

            ring.radius += ring.growth
            ring.alpha *= 0.96
            if (ring.radius > ring.maxRadius) ring.alpha = 0
          }
          ctx.restore()
          ringsRef.current = ringsRef.current.filter((r) => r.alpha > 0.05)
        }

        // Particles
        const g = gravity
        const dragF = drag

        for (const p of particlesRef.current) {
          // physics
          p.vx *= dragF
          p.vy = p.vy * dragF + g
          p.x += p.vx * dpr
          p.y += p.vy * dpr

          // life
          p.life -= p.decay * 0.016 // approx per frame at 60fps
          p.alpha = Math.max(0, Math.min(1, p.life))

          // per-type draw
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate(p.rotation)
          const { r, g: gg, b } = p.color

          if (p.type === "confetti") {
            const c = p
            p.rotation += p.spin
            c.tilt += c.tiltVel

            ctx.rotate(c.tilt)
            ctx.fillStyle = `rgba(${r},${gg},${b},${0.9 * p.alpha})`
            ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h)

            // back face flicker
            if (Math.random() < 0.15) {
              ctx.fillStyle = `rgba(255,255,255,${0.2 * p.alpha})`
              ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h)
            }
          } else if (p.type === "spark") {
            const s = p
            // shimmer
            const flicker =
              0.85 + Math.sin((1 - p.life) * 30 + p.x * 0.02) * 0.15
            ctx.fillStyle = `rgba(${r},${gg},${b},${p.alpha * flicker})`
            ctx.beginPath()
            ctx.arc(0, 0, s.size, 0, Math.PI * 2)
            ctx.fill()

            // tiny cross-glint
            ctx.strokeStyle = `rgba(255,255,255,${0.5 * p.alpha})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(-s.size * 1.2, 0)
            ctx.lineTo(s.size * 1.2, 0)
            ctx.moveTo(0, -s.size * 1.2)
            ctx.lineTo(0, s.size * 1.2)
            ctx.stroke()
          } else {
            const st = p
            p.rotation += p.spin
            ctx.fillStyle = `rgba(${r},${gg},${b},${0.9 * p.alpha})`
            drawStarPath(ctx, st.spikes, st.size, st.size * 0.5)
            ctx.fill()

            // inner glow
            ctx.strokeStyle = `rgba(255,255,255,${0.35 * p.alpha})`
            ctx.lineWidth = 1.25
            ctx.stroke()
          }

          ctx.restore()
        }

        // Cull dead particles or out of bounds
        const w = width
        const h = height
        particlesRef.current = particlesRef.current.filter((p) => {
          if (p.alpha <= 0) return false
          if (p.x < -50 || p.x > w + 50 || p.y > h + 50) return false
          return true
        })

        const elapsed = performance.now() - startedAtRef.current
        const timeUp = elapsed > maxDurationMs

        if (
          particlesRef.current.length === 0 &&
          raysRef.current.length === 0 &&
          ringsRef.current.length === 0
        ) {
          aliveRef.current = false
        }

        if (timeUp && particlesRef.current.length > 0) {
          // accelerate fade once maxDuration reached
          for (const p of particlesRef.current) {
            p.life *= 0.92
          }
        }

        if (aliveRef.current) {
          rafRef.current = requestAnimationFrame(step)
        }
      },
      [drag, gravity, maxDurationMs]
    )

    const burst = useCallback(
      (x?: number, y?: number) => {
        const canvas = canvasRef.current
        if (!canvas) return
        const w = canvas.width
        const h = canvas.height

        const cx =
          typeof x === "number" ? x : origin === "center" ? w / 2 : w / 2
        const cy =
          typeof y === "number" ? y : origin === "center" ? h / 2 : h / 2

        spawn(cx, cy)
        startedAtRef.current = performance.now()
        aliveRef.current = true

        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        rafRef.current = requestAnimationFrame(step)
      },
      [origin, spawn, step]
    )

    const burstAtClient = useCallback(
      (clientX: number, clientY: number) => {
        const canvas = canvasRef.current
        if (!canvas) return
        const rect = canvas.getBoundingClientRect()
        const dpr = dprRef.current
        const x = (clientX - rect.left) * dpr
        const y = (clientY - rect.top) * dpr
        burst(x, y)
      },
      [burst]
    )

    const burstAtElement = useCallback(
      (el: HTMLElement) => {
        const rect = el.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        burstAtClient(cx, cy)
      },
      [burstAtClient]
    )

    const burstAtPercent = useCallback(
      (nx: number, ny: number) => {
        const canvas = canvasRef.current
        if (!canvas) return
        const x = Math.max(0, Math.min(1, nx)) * canvas.width
        const y = Math.max(0, Math.min(1, ny)) * canvas.height
        burst(x, y)
      },
      [burst]
    )

    useImperativeHandle(
      ref,
      () => ({
        burst,
        burstAtClient,
        burstAtElement,
        burstAtPercent,
      }),
      [burst, burstAtClient, burstAtElement, burstAtPercent]
    )

    useEffect(() => {
      if (autoPlay) {
        // slight delay to ensure layout is measured
        timeoutRef.current = setTimeout(() => {
          burst()
        }, 80)
      }

      return (): void => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
      }
    }, [autoPlay, burst])

    useEffect(() => {
      return (): void => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
      }
    }, [])

    const onClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        const canvas = canvasRef.current
        if (!canvas) return
        const rect = canvas.getBoundingClientRect()
        const dpr = dprRef.current
        const x = (e.clientX - rect.left) * dpr
        const y = (e.clientY - rect.top) * dpr
        burst(x, y)
      },
      [burst]
    )

    return (
      <div
        ref={containerRef}
        className="relative size-full select-none overflow-hidden rounded-xl bg-none"
        role="button"
        tabIndex={0}
        aria-label="Celebration burst animation. Activate to replay."
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            burst()
          }
        }}
      >
        {/* Canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 block"
          aria-hidden="true"
        />
      </div>
    )
  }
)

SparkleBurst.displayName = "SparkleBurst"
