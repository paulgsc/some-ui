import { useEffect, useState } from "react"
import { HexGrid, type HexCellData } from "@honeycomb/components/hex-grid"

// Song-specific implementation
export type Song = {
  id: string
  title: string
  artist: string
  color: string
  releaseYear: number
  playedAt: number
}

type ActiveSongCell = {
  song: Song
  fillLevel: number
  isFading: boolean
  cellId: string
}

const FADE_DURATION = 8000 // 8 seconds
const MAX_ACTIVE_CELLS = 37

export function SongHexGrid() {
  const [songs, setSongs] = useState<Song[]>([])
  const [activeSongCells, setActiveSongCells] = useState<ActiveSongCell[]>([])

  // Simulate songs being played
  useEffect(() => {
    const mockSongs = [
      {
        title: "Bohemian Rhapsody",
        artist: "Queen",
        color: "#3b82f6",
        releaseYear: 1975,
      },
      {
        title: "Stairway to Heaven",
        artist: "Led Zeppelin",
        color: "#10b981",
        releaseYear: 1971,
      },
      {
        title: "Hotel California",
        artist: "Eagles",
        color: "#f59e0b",
        releaseYear: 1976,
      },
      {
        title: "Imagine",
        artist: "John Lennon",
        color: "#ef4444",
        releaseYear: 1971,
      },
      {
        title: "Smells Like Teen Spirit",
        artist: "Nirvana",
        color: "#8b5cf6",
        releaseYear: 1991,
      },
      {
        title: "Sweet Child O' Mine",
        artist: "Guns N' Roses",
        color: "#ec4899",
        releaseYear: 1987,
      },
      {
        title: "Billie Jean",
        artist: "Michael Jackson",
        color: "#14b8a6",
        releaseYear: 1982,
      },
    ]

    const interval = setInterval(() => {
      const randomSong = mockSongs[Math.floor(Math.random() * mockSongs.length)]
      setSongs((prev) => [
        ...prev,
        {
          ...randomSong,
          id: `${Date.now()}-${Math.random()}`,
          playedAt: Date.now(),
        },
      ])
    }, 3000)

    return () => clearInterval(interval)
  }, [])

  // Convert songs to active cells
  useEffect(() => {
    if (songs.length === 0) return

    const latestSong = songs[songs.length - 1]

    setActiveSongCells((prev) => {
      // Check if we need to add this song
      const usedCellIds = new Set(prev.map((cell) => cell.cellId))

      // Generate all possible cell IDs matching WASM output format
      // WASM uses format: "hex_q_r_s" (e.g., "hex_-2_0_2")
      const rings = 3
      const availableCells: string[] = []

      for (let ring = 0; ring <= rings; ring++) {
        if (ring === 0) {
          availableCells.push("hex_0_0_0")
        } else {
          for (let i = 0; i < 6; i++) {
            for (let j = 0; j < ring; j++) {
              const angle = (i * 60 - 30) * (Math.PI / 180)
              const q = Math.round(
                ring * Math.cos(angle) - j * Math.cos(angle + Math.PI / 3)
              )
              const r = Math.round(
                ring * Math.sin(angle) - j * Math.sin(angle + Math.PI / 3)
              )
              const s = -q - r
              availableCells.push(`hex_${q}_${r}_${s}`)
            }
          }
        }
      }

      // Sort cells: older songs go to outer rings, newer to inner rings
      const sortedCells = [...availableCells].sort((a, b) => {
        const avgYear = 1985
        return latestSong.releaseYear < avgYear
          ? b.localeCompare(a)
          : a.localeCompare(b)
      })

      let targetCellId = sortedCells.find((id) => !usedCellIds.has(id))

      // If grid is full, replace oldest song
      if (!targetCellId && prev.length >= MAX_ACTIVE_CELLS) {
        const oldestIndex = prev.reduce(
          (oldest, cell, i) =>
            cell.song.playedAt < prev[oldest].song.playedAt ? i : oldest,
          0
        )
        if (oldestIndex !== -1) {
          targetCellId = prev[oldestIndex].cellId
          prev.splice(oldestIndex, 1)
        }
      }

      if (targetCellId) {
        return [
          ...prev,
          {
            song: latestSong,
            fillLevel: 1,
            isFading: false,
            cellId: targetCellId,
          },
        ]
      }

      return prev
    })
  }, [songs])

  // Fade out effect
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSongCells((prev) =>
        prev
          .map((cell) => {
            const age = Date.now() - cell.song.playedAt
            if (age > FADE_DURATION) {
              return {
                ...cell,
                isFading: true,
                fillLevel: Math.max(0, 1 - (age - FADE_DURATION) / 2000),
              }
            }
            return cell
          })
          .filter((cell) => cell.fillLevel > 0)
      )
    }, 100)

    return () => clearInterval(interval)
  }, [])

  // Convert active song cells to HexCellData
  // Use WASM's ID format: "hex_q_r_s" (e.g., "hex_-2_0_2")
  // The HexGrid component will match these IDs with WASM cells
  const hexCells: HexCellData<Song>[] = activeSongCells.map((cell) => ({
    id: cell.cellId, // This ID matches WASM format: "hex_q_r_s"
    data: cell.song,
    theme: {
      fill: cell.song.color,
      stroke: cell.song.color,
      strokeWidth: 2,
      opacity: cell.isFading ? cell.fillLevel * 0.6 : 0.6,
      filter: "url(#glow)",
    },
  }))

  return (
    <div className="relative h-screen w-full bg-gray-950">
      <HexGrid
        cellCount={37}
        hexSize={50}
        viewBoxFactor={1.2}
        cells={hexCells}
        backgroundOpacity={0.15}
        renderCell={(cell, centerX, centerY) => (
          <g opacity={cell.theme?.opacity || 1}>
            {/* Outer glow effect */}
            <circle
              cx={centerX}
              cy={centerY}
              r="40"
              fill={cell.data.color}
              opacity="0.3"
              filter="url(#strong-glow)"
            />

            {/* Song title */}
            <text
              x={centerX}
              y={centerY - 6}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="8"
              fontWeight="600"
              fill="white"
              className="font-sans"
              style={{
                textShadow: `0 0 8px ${cell.data.color}, 0 0 16px ${cell.data.color}`,
              }}
            >
              {cell.data.title.slice(0, 12)}
            </text>

            {/* Artist name */}
            <text
              x={centerX}
              y={centerY + 6}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="6"
              fill="white"
              opacity="0.7"
              className="font-sans"
            >
              {cell.data.artist}
            </text>
          </g>
        )}
      />

      {/* Song counter */}
      <div className="absolute bottom-8 left-8 rounded-lg bg-gray-900/80 px-4 py-2 text-white backdrop-blur-sm">
        <div className="text-sm text-gray-400">Songs Played</div>
        <div className="text-2xl font-bold">{songs.length}</div>
      </div>
    </div>
  )
}
