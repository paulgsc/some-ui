import type { JSX } from "react"
import { useEffect, useMemo, useState } from "react"
import { HexGrid } from "@honeycomb/components/hex-grid"
import { SongHexCell } from "@honeycomb/components/song-hex-grid/song-hex-cell"
import type { HexCellData } from "@honeycomb/types/hex-grid"

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

const FADE_DURATION = 8000
const MAX_ACTIVE_CELLS = 37

// Strictly typed mock data to prevent "string | undefined" errors
const MOCK_SONGS: Array<Omit<Song, "id" | "playedAt">> = [
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

export const SongHexGrid = (): JSX.Element => {
  const [songs, setSongs] = useState<Array<Song>>([])
  const [activeSongCells, setActiveSongCells] = useState<Array<ActiveSongCell>>(
    []
  )

  // 1. Simulate songs being played and map them to grid coordinates simultaneously
  useEffect(() => {
    const interval = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * MOCK_SONGS.length)
      const baseSong = MOCK_SONGS[randomIndex]

      if (!baseSong) return

      const newSong: Song = {
        ...baseSong,
        id: `${Date.now()}-${Math.random()}`,
        playedAt: Date.now(),
      }

      // Update basic song history
      setSongs((prev) => [...prev, newSong])

      // Compute grid mapping here to eliminate the cascading rendering effect
      setActiveSongCells((prev) => {
        const usedCellIds = new Set(prev.map((cell) => cell.cellId))
        const availableCells: Array<string> = []
        const rings = 3

        // Coordinate generation logic
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
                availableCells.push(`hex_${q}_${r}_${-q - r}`)
              }
            }
          }
        }

        const sortedCells = [...availableCells].sort((a, b) =>
          newSong.releaseYear < 1985 ? b.localeCompare(a) : a.localeCompare(b)
        )

        let targetCellId = sortedCells.find((id) => !usedCellIds.has(id))
        const nextActiveCells = [...prev]

        // Replacement logic if grid is full
        if (!targetCellId && nextActiveCells.length >= MAX_ACTIVE_CELLS) {
          let oldestIndex = 0
          for (let i = 1; i < nextActiveCells.length; i++) {
            const current = nextActiveCells[i]
            const oldest = nextActiveCells[oldestIndex]
            if (
              current &&
              oldest &&
              current.song.playedAt < oldest.song.playedAt
            ) {
              oldestIndex = i
            }
          }

          const replacedCell = nextActiveCells[oldestIndex]
          if (replacedCell) {
            targetCellId = replacedCell.cellId
            nextActiveCells.splice(oldestIndex, 1)
          }
        }

        if (targetCellId) {
          return [
            ...nextActiveCells,
            {
              song: newSong,
              fillLevel: 1,
              isFading: false,
              cellId: targetCellId,
            },
          ]
        }

        return prev
      })
    }, 3000)

    return (): void => clearInterval(interval)
  }, [])

  // 2. Animation and Fade logic
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

  // 4. Memoize the content to pass to HexGrid
  const cellContent = useMemo(
    (): Array<{ id: string; content: HexCellData<Song> }> =>
      activeSongCells.map((cell) => ({
        id: cell.cellId,
        content: {
          data: cell.song,
          theme: {
            fill: cell.song.color,
            stroke: cell.song.color,
            strokeWidth: 2.5,
            opacity: cell.isFading ? cell.fillLevel * 0.75 : 0.75,
            filter: "url(#glow)",
          },
        },
      })),
    [activeSongCells]
  )

  return (
    <div className="relative h-screen w-full overflow-hidden bg-background">
      <div
        className="absolute inset-0 bg-gradient-to-tr from-cyan-500/10 via-transparent to-pink-500/10 animate-pulse"
        style={{ animationDuration: "8s" }}
      />

      <HexGrid<Song>
        cellCount={67}
        hexSize={70}
        viewBoxFactor={1.2}
        cellContent={cellContent}
        backgroundOpacity={0.08}
        renderCell={(cell, centerX, centerY, cellWidth, hexPath) => {
          if (!cell.content) return null
          return (
            <SongHexCell
              song={cell.content.data}
              centerX={centerX}
              centerY={centerY}
              cellWidth={cellWidth}
              opacity={cell.content.theme.opacity ?? 1}
              imageUrl={cell.content.data.albumArtUrl}
              hexPath={hexPath}
            />
          )
        }}
      />

      <div className="absolute bottom-8 left-8 rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-white shadow-2xl backdrop-blur-md">
        <div className="text-xs font-semibold uppercase tracking-widest text-white/40">
          History Depth
        </div>
        <div className="text-4xl font-black tabular-nums bg-gradient-to-r from-cyan-400 to-pink-400 bg-clip-text text-transparent">
          {songs.length}
        </div>
      </div>
    </div>
  )
}
