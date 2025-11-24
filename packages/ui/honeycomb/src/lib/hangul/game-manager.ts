
import type { HangulCharacter, ActiveHangulCell, GameStats, GameSettings } from "@honeycomb/types/hangul-types"
import { getRandomHangul, getHangulColor, isCorrectKey } from "@honeycomb/utils/hangul-keyboard-mapping"

export class HangulGameManager {
  private activeCells: Array<ActiveHangulCell> = []
  private stats: GameStats = {
    totalAttempts: 0,
    correctAttempts: 0,
    missedCharacters: 0,
    currentStreak: 0,
    bestStreak: 0,
    score: 0,
  }
  private settings: GameSettings
  private usedCellIds: Set<string> = new Set()
  private characterIdCounter = 0

  constructor(settings: GameSettings) {
    this.settings = settings
  }

  // Generate available cell IDs based on hex grid structure
  private generateAvailableCells(rings: number): Array<string> {
    const cells: Array<string> = []
    
    // Center cell
    cells.push("hex_0_0_0")
    
    // Ring cells
    for (let ring = 1; ring <= rings; ring++) {
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
          cells.push(`hex_${q}_${r}_${s}`)
        }
      }
    }
    
    return cells
  }

  // Spawn a new character
  spawnCharacter(): ActiveHangulCell | null {
    // Check if we have available cells
    const allCells = this.generateAvailableCells(3)
    const availableCells = allCells.filter(id => !this.usedCellIds.has(id))
    
    if (availableCells.length === 0 && this.activeCells.length >= this.settings.maxActiveCells) {
      // Grid is full, replace oldest character
      const oldestCell = this.activeCells.reduce((oldest, cell) => 
        cell.character.spawnedAt < oldest.character.spawnedAt ? cell : oldest
      )
      this.removeCharacter(oldestCell.character.id)
    }
    
    // Get random available cell
    const availableCellsFiltered = allCells.filter(id => !this.usedCellIds.has(id))
    if (availableCellsFiltered.length === 0) return null
    
    const cellId = availableCellsFiltered[Math.floor(Math.random() * availableCellsFiltered.length)]
    const mapping = getRandomHangul()
    
    const character: HangulCharacter = {
      id: `hangul-${this.characterIdCounter++}`,
      hangul: mapping.hangul,
      qwertyKey: mapping.qwerty,
      romanization: mapping.romanization,
      color: getHangulColor(mapping.hangul),
      spawnedAt: Date.now(),
      timeLimit: this.settings.characterDisplayTime,
    }
    
    const newCell: ActiveHangulCell = {
      character,
      cellId,
      isExpiring: false,
      opacity: 1,
    }
    
    this.activeCells.push(newCell)
    this.usedCellIds.add(cellId)
    
    return newCell
  }

  // Handle key press
  handleKeyPress(key: string): { hit: boolean; characterId?: string; points: number } {
    // Find matching character
    const matchIndex = this.activeCells.findIndex(cell => 
      isCorrectKey(cell.character.hangul, key) && !cell.isExpiring
    )
    
    if (matchIndex !== -1) {
      const cell = this.activeCells[matchIndex]
      this.removeCharacter(cell.character.id)
      
      // Update stats
      this.stats.totalAttempts++
      this.stats.correctAttempts++
      this.stats.currentStreak++
      this.stats.bestStreak = Math.max(this.stats.bestStreak, this.stats.currentStreak)
      this.stats.score += this.settings.pointsPerCorrect + Math.floor(this.stats.currentStreak / 5)
      
      return { 
        hit: true, 
        characterId: cell.character.id,
        points: this.settings.pointsPerCorrect + Math.floor(this.stats.currentStreak / 5)
      }
    }
    
    // Wrong key pressed
    this.stats.totalAttempts++
    this.stats.currentStreak = 0
    
    return { hit: false, points: 0 }
  }

  // Update active cells (check for expired characters)
  update(): Array<string> {
    const now = Date.now()
    const expiredIds: Array<string> = []
    
    this.activeCells = this.activeCells.filter(cell => {
      const age = now - cell.character.spawnedAt
      
      if (age > cell.character.timeLimit) {
        // Character expired
        if (!cell.isExpiring) {
          this.stats.missedCharacters++
          this.stats.currentStreak = 0
          this.stats.score = Math.max(0, this.stats.score + this.settings.pointsPerMiss)
          expiredIds.push(cell.character.id)
        }
        this.usedCellIds.delete(cell.cellId)
        return false
      }
      
      // Update opacity for expiring characters
      const timeRemaining = 1 - (age / cell.character.timeLimit)
      if (timeRemaining < 0.3) {
        cell.isExpiring = true
      }
      cell.opacity = Math.max(0.3, timeRemaining)
      
      return true
    })
    
    return expiredIds
  }

  // Remove character by ID
  removeCharacter(characterId: string): void {
    const index = this.activeCells.findIndex(cell => cell.character.id === characterId)
    if (index !== -1) {
      this.usedCellIds.delete(this.activeCells[index].cellId)
      this.activeCells.splice(index, 1)
    }
  }

  // Get current active cells
  getActiveCells(): Array<ActiveHangulCell> {
    return this.activeCells
  }

  // Get current stats
  getStats(): GameStats {
    return { ...this.stats }
  }

  // Calculate accuracy
  getAccuracy(): number {
    if (this.stats.totalAttempts === 0) return 0
    return (this.stats.correctAttempts / this.stats.totalAttempts) * 100
  }

  // Reset game
  reset(): void {
    this.activeCells = []
    this.usedCellIds.clear()
    this.stats = {
      totalAttempts: 0,
      correctAttempts: 0,
      missedCharacters: 0,
      currentStreak: 0,
      bestStreak: 0,
      score: 0,
    }
  }
}
