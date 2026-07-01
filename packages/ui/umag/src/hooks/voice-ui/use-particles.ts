import { useRef } from "react"

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  pulse: number
}

type UseParticlesReturn = {
  particles: React.RefObject<Array<Particle>>
  initializeParticles: (centerX: number, centerY: number) => void
  updateParticles: (
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    time: number,
    r: number,
    g: number,
    b: number
  ) => void
}

export const useParticles = (): UseParticlesReturn => {
  const particles = useRef<Array<Particle>>([])

  const initializeParticles = (centerX: number, centerY: number): void => {
    for (let i = 0; i < 12; i++) {
      particles.current.push({
        x: centerX + (Math.random() - 0.5) * 320,
        y: centerY + (Math.random() - 0.5) * 320,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        life: Math.random() * 120,
        maxLife: 120 + Math.random() * 60,
        size: 1.5 + Math.random() * 2,
        pulse: Math.random() * Math.PI * 2,
      })
    }
  }

  const updateParticles = (
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    time: number,
    r: number,
    g: number,
    b: number
  ): void => {
    particles.current.forEach((particle, index) => {
      particle.x += particle.vx + Math.sin(time + index) * 0.1
      particle.y += particle.vy + Math.cos(time + index) * 0.1
      particle.life++
      particle.pulse += 0.08

      if (particle.life > particle.maxLife) {
        particle.x = centerX + (Math.random() - 0.5) * 320
        particle.y = centerY + (Math.random() - 0.5) * 320
        particle.vx = (Math.random() - 0.5) * 0.3
        particle.vy = (Math.random() - 0.5) * 0.3
        particle.life = 0
        particle.maxLife = 120 + Math.random() * 60
      }

      const alpha = (1 - particle.life / particle.maxLife) * 0.8
      const pulseSize = particle.size * (1 + Math.sin(particle.pulse) * 0.3)

      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`
      ctx.beginPath()
      ctx.arc(particle.x, particle.y, pulseSize, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  return { particles, initializeParticles, updateParticles }
}
