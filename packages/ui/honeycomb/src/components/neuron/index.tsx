import type { JSX } from "react"
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { assertNever } from "@honeycomb/utils/error"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@some-ui/shared"

export type ProjectState = "active" | "dying" | "dead" | "growing"

export type Project = {
  id: string
  name: string
  state: ProjectState
  lastActivity: string
  commitsPerWeek: number
  issuesOpen: number
}

type Neuron = {
  x: number
  y: number
  radius: number
  activity: number
  targetActivity: number
  project: Project
  pulsePhase: number
  pulseSpeed: number
  color: string
}

type Connection = {
  from: Neuron
  to: Neuron
  flowPhase: number
  flowSpeed: number
  color: string
  particles: Array<{ progress: number; opacity: number }>
}

const NEURON_COLORS: Record<ProjectState, string> = {
  active: "#FFA500",
  growing: "#FFD700",
  dying: "#FF6347",
  dead: "#A9A9A9",
}

const CONNECTION_COLORS: Record<ProjectState, string> = {
  active: "rgba(255, 165, 0, 0.7)",
  growing: "rgba(255, 215, 0, 0.7)",
  dying: "rgba(255, 99, 71, 0.5)",
  dead: "rgba(169, 169, 169, 0.3)",
}

const getTargetActivity = (state: ProjectState): number => {
  switch (state) {
    case "active": {
      return 0.9
    }
    case "growing": {
      return 0.7
    }
    case "dying": {
      return 0.3
    }
    case "dead": {
      return 0.1
    }
    default: {
      state satisfies never
      assertNever(state)
    }
  }
}

const getPulseSpeed = (state: ProjectState): number => {
  switch (state) {
    case "active": {
      return 0.05
    }
    case "growing": {
      return 0.03
    }
    case "dying": {
      return 0.01
    }
    case "dead": {
      return 0
    }
    default: {
      state satisfies never
      assertNever(state)
    }
  }
}

const getFlowSpeed = (state: ProjectState): number => {
  switch (state) {
    case "active": {
      return 0.02
    }
    case "growing": {
      return 0.015
    }
    case "dying": {
      return 0.005
    }
    case "dead": {
      return 0
    }
    default: {
      state satisfies never
      assertNever(state)
    }
  }
}

type NeuralNetworkSVGProps = {
  projects?: Array<Project>
}

export type NeuralNetworkSVGRef = {
  getSVG: () => SVGSVGElement | null
}

const sampleProjects: Array<Project> = [
  {
    id: "1",
    name: "WebGL Game",
    state: "active",
    lastActivity: "2025-07-30",
    commitsPerWeek: 15,
    issuesOpen: 3,
  },
  {
    id: "2",
    name: "ML Dataset",
    state: "growing",
    lastActivity: "2025-07-29",
    commitsPerWeek: 8,
    issuesOpen: 1,
  },
  {
    id: "3",
    name: "Old Blog",
    state: "dying",
    lastActivity: "2025-07-15",
    commitsPerWeek: 1,
    issuesOpen: 5,
  },
  {
    id: "4",
    name: "PHP CMS",
    state: "dead",
    lastActivity: "2025-06-01",
    commitsPerWeek: 0,
    issuesOpen: 12,
  },
  {
    id: "5",
    name: "React App",
    state: "active",
    lastActivity: "2025-07-30",
    commitsPerWeek: 12,
    issuesOpen: 2,
  },
  {
    id: "6",
    name: "Discord Bot",
    state: "growing",
    lastActivity: "2025-07-28",
    commitsPerWeek: 6,
    issuesOpen: 0,
  },
]

export const NeuralNetworkSVG = forwardRef<
  NeuralNetworkSVGRef,
  NeuralNetworkSVGProps
>(({ projects = sampleProjects }, ref): JSX.Element => {
  const svgRef = useRef<SVGSVGElement>(null)
  const animationFrameId = useRef<number | null>(null)
  const [neurons, setNeurons] = useState<Array<Neuron>>([])
  const [connections, setConnections] = useState<Array<Connection>>([])
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 })

  const neuronsRef = useRef<Array<Neuron>>([])
  const connectionsRef = useRef<Array<Connection>>([])
  const animationSpeed = 1

  useImperativeHandle(ref, () => ({
    getSVG: (): SVGSVGElement | null => svgRef.current,
  }))

  useEffect(() => {
    neuronsRef.current = neurons
  }, [neurons])

  useEffect(() => {
    connectionsRef.current = connections
  }, [connections])

  const initializeNetwork = useCallback(
    (width: number, height: number, currentProjects: Array<Project>): void => {
      const newNeurons: Array<Neuron> = currentProjects.map((project, i) => {
        const angle = (i / currentProjects.length) * Math.PI * 2
        const radius = Math.min(width, height) * 0.35
        const x = width / 2 + radius * Math.cos(angle)
        const y = height / 2 + radius * Math.sin(angle)

        return {
          x,
          y,
          radius: 8 + Math.random() * 4,
          activity: getTargetActivity(project.state),
          targetActivity: getTargetActivity(project.state),
          project,
          pulsePhase: Math.random() * Math.PI * 2,
          pulseSpeed: getPulseSpeed(project.state),
          color: NEURON_COLORS[project.state],
        }
      })

      const newConnections: Array<Connection> = []

      for (let i = 0; i < newNeurons.length; i++) {
        for (let j = i + 1; j < newNeurons.length; j++) {
          const from = newNeurons[i]
          const to = newNeurons[j]

          // Fix: Ensure neurons exist to satisfy TS strict null checks
          if (!from || !to) continue

          const dist = Math.sqrt(
            Math.pow(from.x - to.x, 2) + Math.pow(from.y - to.y, 2)
          )

          if (dist < Math.min(width, height) * 0.4 || Math.random() < 0.3) {
            newConnections.push({
              from,
              to,
              flowPhase: Math.random() * Math.PI * 2,
              flowSpeed: getFlowSpeed(from.project.state),
              color: CONNECTION_COLORS[from.project.state],
              particles: Array.from({ length: 3 }, (_, k) => ({
                progress: k / 3,
                opacity: 0.8,
              })),
            })
          }
        }
      }

      setNeurons(newNeurons)
      setConnections(newConnections)
    },
    []
  )

  const animate = useCallback((): void => {
    const currentNeurons = neuronsRef.current
    const currentConnections = connectionsRef.current

    currentNeurons.forEach((neuron) => {
      neuron.activity +=
        (neuron.targetActivity - neuron.activity) * 0.05 * animationSpeed
      neuron.pulsePhase += neuron.pulseSpeed * animationSpeed
      if (neuron.pulsePhase > Math.PI * 2) neuron.pulsePhase -= Math.PI * 2
    })

    currentConnections.forEach((conn) => {
      conn.flowPhase += conn.flowSpeed * animationSpeed
      if (conn.flowPhase > Math.PI * 2) conn.flowPhase -= Math.PI * 2

      conn.particles.forEach((particle, i) => {
        particle.progress = (conn.flowPhase / (Math.PI * 2) + i / 3) % 1
        particle.opacity = 0.2 + conn.from.activity * 0.6
      })
    })

    setNeurons([...currentNeurons])
    setConnections([...currentConnections])

    animationFrameId.current = requestAnimationFrame(animate)
  }, [animationSpeed])

  useEffect(() => {
    const updateDimensions = (): void => {
      const container = svgRef.current?.parentElement
      if (container) {
        const { clientWidth, clientHeight } = container
        setDimensions({ width: clientWidth, height: clientHeight })
        initializeNetwork(clientWidth, clientHeight, projects)
      }
    }

    updateDimensions()
    window.addEventListener("resize", updateDimensions)
    animationFrameId.current = requestAnimationFrame(animate)

    return (): void => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current)
      }
      window.removeEventListener("resize", updateDimensions)
    }
  }, [projects, animate, initializeNetwork])

  return (
    <Card className="mx-auto flex h-[600px] w-full max-w-4xl flex-col">
      <CardHeader>
        <CardTitle className="text-3xl font-bold">
          Hobby Projects Neural Network
        </CardTitle>
        <CardDescription>
          A live snapshot of your projects, visualized as a dynamic neural
          network. Regions of heavy activity represent active and growing
          projects.
        </CardDescription>
      </CardHeader>
      <CardContent className="relative flex-1 p-0">
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
          className="size-full rounded-b-lg border-t border-gray-200"
          style={{ background: "#fdfbf6" }}
        >
          {connections.map((conn) => (
            <g
              key={`connection-${conn.from.x}-${conn.from.y}-${conn.to.x}-${conn.to.y}`}
            >
              <line
                x1={conn.from.x}
                y1={conn.from.y}
                x2={conn.to.x}
                y2={conn.to.y}
                stroke={conn.color}
                strokeWidth={1 + conn.from.activity * 2}
                opacity={0.6}
              />
              {conn.particles.map((particle) => {
                const x =
                  conn.from.x + (conn.to.x - conn.from.x) * particle.progress
                const y =
                  conn.from.y + (conn.to.y - conn.from.y) * particle.progress
                return (
                  <circle
                    key={`particle-${conn.from.x}-${conn.to.x}-${particle.opacity}`}
                    cx={x}
                    cy={y}
                    r={2 + conn.from.activity * 2}
                    fill="white"
                    opacity={particle.opacity}
                  />
                )
              })}
            </g>
          ))}

          {neurons.map((neuron) => {
            const pulseEffect = Math.sin(neuron.pulsePhase) * 0.5 + 0.5
            const currentRadius =
              neuron.radius + pulseEffect * 5 * neuron.activity
            const opacity = neuron.activity * 0.8 + 0.2

            // Create a unique key based on the neuron's position
            const neuronId = `${neuron.x}-${neuron.y}`

            return (
              <g key={`neuron-${neuronId}`}>
                <circle
                  cx={neuron.x}
                  cy={neuron.y}
                  r={currentRadius + 8}
                  fill={neuron.color}
                  opacity={opacity * 0.3}
                  filter="blur(4px)"
                />
                <circle
                  cx={neuron.x}
                  cy={neuron.y}
                  r={currentRadius}
                  fill={neuron.color}
                  opacity={opacity}
                  stroke={neuron.color}
                  strokeWidth="2"
                />
                <text
                  x={neuron.x}
                  y={neuron.y + currentRadius + 15}
                  textAnchor="middle"
                  fontSize="10"
                  fill="black"
                  fontFamily="Arial, sans-serif"
                >
                  {neuron.project.name}
                </text>
              </g>
            )
          })}
        </svg>
      </CardContent>
    </Card>
  )
})

NeuralNetworkSVG.displayName = "NeuralNetworkSVG"
