import { useEffect, useState } from "react"
import { HexGrid } from "@honeycomb/components/hex-grid"
import { SongHexCell } from "@honeycomb/components/song-hex-grid/song-hex-cell"
import type { HexCellData } from "@honeycomb/types/hex-grid"

// Song-specific implementation
export type Song = {
  id: string
  title: string
  artist: string
  color: string
  releaseYear: number
  playedAt: number
  albumArtUrl?: string
}

type ActiveSongCell = {
  song: Song
  fillLevel: number
  isFading: boolean
  cellId: string
}

const FADE_DURATION = 8000 // 8 seconds
const MAX_ACTIVE_CELLS = 37

export const SongHexGrid = (): React.JSX.Element => {
  const [songs, setSongs] = useState<Array<Song>>([])
  const [activeSongCells, setActiveSongCells] = useState<Array<ActiveSongCell>>(
    []
  )

  // Simulate songs being played
  useEffect(() => {
    const mockSongs = [
      {
        title: "Bohemian Rhapsody",
        artist: "Queen",
        color: "#3b82f6",
        releaseYear: 1975,
        albumArtUrl: "https://picsum.photos/seed/queen/300/300",
      },
      {
        title: "Stairway to Heaven",
        artist: "Led Zeppelin",
        color: "#10b981",
        releaseYear: 1971,
        albumArtUrl: "https://picsum.photos/seed/zeppelin/300/300",
      },
      {
        title: "Hotel California",
        artist: "Eagles",
        color: "#f59e0b",
        releaseYear: 1976,
        albumArtUrl: "https://picsum.photos/seed/eagles/300/300",
      },
      {
        title: "Imagine",
        artist: "John Lennon",
        color: "#ef4444",
        releaseYear: 1971,
        albumArtUrl: "https://picsum.photos/seed/lennon/300/300",
      },
      {
        title: "Smells Like Teen Spirit",
        artist: "Nirvana",
        color: "#8b5cf6",
        releaseYear: 1991,
        albumArtUrl: "https://picsum.photos/seed/nirvana/300/300",
      },
      {
        title: "Sweet Child O' Mine",
        artist: "Guns N' Roses",
        color: "#ec4899",
        releaseYear: 1987,
        albumArtUrl: "https://picsum.photos/seed/gnr/300/300",
      },
      {
        title: "Billie Jean",
        artist: "Michael Jackson",
        color: "#14b8a6",
        releaseYear: 1982,
        albumArtUrl: "https://picsum.photos/seed/mj/300/300",
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

    return (): void => clearInterval(interval)
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
      const availableCells: Array<string> = []

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

    return (): void => clearInterval(interval)
  }, [])

  const cellContent: Array<{
    id: string
    content: HexCellData<Song>
  }> = activeSongCells.map((cell) => ({
    id: cell.cellId,
    content: {
      data: cell.song,
      theme: {
        fill: cell.song.color,
        stroke: cell.song.color,
        strokeWidth: 2.5,
        opacity: cell.isFading ? cell.fillLevel * 0.75 : 0.75,
        filter: "url(#metallic-glow)",
      },
    },
  }))

  return (
    <div className="relative h-screen w-full overflow-hidden">
      {/* Animated gradient overlay */}
      <div
        className="absolute inset-0 bg-gradient-to-tr from-cyan-500/20 via-transparent to-amber-500/20 animate-pulse"
        style={{ animationDuration: "8s" }}
      />
      <HexGrid
        cellCount={67}
        hexSize={70}
        viewBoxFactor={1.2}
        cellContent={cellContent}
        backgroundOpacity={0.12}
        renderCell={(cell, centerX, centerY, cellWidth, hexPath) => {
          const { content } = cell
          if (!content) return null

          const {
            data,
            theme: { opacity },
          } = content
          return (
            <SongHexCell
              song={data}
              centerX={centerX}
              centerY={centerY}
              cellWidth={cellWidth}
              opacity={opacity}
              imageUrl={data.albumArtUrl}
              hexPath={hexPath}
            />
          )
        }}
      />

      {/* Song counter with glass morphism */}
      <div className="absolute bottom-8 left-8 glass-effect rounded-2xl px-6 py-4 text-white shadow-2xl float-animation">
        <div className="text-sm font-medium text-white/80 tracking-wide">
          Songs Played
        </div>
        <div className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-pink-400 bg-clip-text text-transparent">
          {songs.length}
        </div>
      </div>

      {/* Decorative floating particles */}
      <div
        className="absolute top-10 right-20 w-2 h-2 bg-white/40 rounded-full blur-sm animate-pulse"
        style={{ animationDuration: "3s" }}
      />
      <div
        className="absolute top-32 right-40 w-3 h-3 bg-cyan-400/30 rounded-full blur-sm animate-pulse"
        style={{ animationDuration: "4s", animationDelay: "1s" }}
      />
      <div
        className="absolute bottom-24 left-32 w-2 h-2 bg-pink-400/40 rounded-full blur-sm animate-pulse"
        style={{ animationDuration: "5s", animationDelay: "2s" }}
      />
    </div>
  )
}
