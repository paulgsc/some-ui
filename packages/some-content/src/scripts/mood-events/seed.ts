import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import fetch from "node-fetch"

type CreateMoodEvent = {
  id: number
  week: number
  label: string
  description: string
  team: string
  category: string
  delta: number
  time?: string
}

type BatchCreateRequest = {
  events: Array<CreateMoodEvent>
}

// Equivalent of __dirname in ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function seedMoodEvents() {
  console.log("🏈 Seeding 49ers mood events for Brock Purdy 2025 season...")

  try {
    // Read the JSON data file
    const dataPath = path.join(__dirname, "seed.json")
    if (!fs.existsSync(dataPath)) {
      throw new Error(`Data file not found: ${dataPath}`)
    }

    const rawData = fs.readFileSync(dataPath, "utf-8")
    const data: BatchCreateRequest = JSON.parse(rawData)

    console.log(`📊 Loaded ${data.events.length} mood events`)

    // API endpoint - adjust as needed
    const API_BASE = process.env.API_BASE_URL || "http://localhost:3000"
    const endpoint = `${API_BASE}/mood_events/batch`

    console.log(`🚀 Posting to ${endpoint}`)

    // Make the batch create request
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Add auth if needed:
        // 'Authorization': `Bearer ${process.env.API_TOKEN}`,
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }

    const result: unknown = await response.json()

    if (!Array.isArray(result)) {
        throw new Error("Unexpected response format")
    }

    console.log("✅ Successfully created mood events!")
    console.log(`📈 Created ${result.length} events`)

    // Log sample events
    console.log("\n🎯 Sample events created:")
    result.slice(0, 3).forEach((event: any) => {
      console.log(
        `  Week ${event.week}: ${event.label} (${event.delta > 0 ? "+" : ""}${event.delta})`
      )
    })

    console.log("\n🏆 Brock Purdy season mood tracker is ready!")
  } catch (error) {
    console.error(
      "❌ Failed to seed mood events:",
      error instanceof Error ? error.message : error
    )
    process.exit(1)
  }
}

// Run only if this file is executed directly (not imported)
if (process.argv[1] === __filename || import.meta.url.startsWith("file:")) {
  seedMoodEvents()
}

export { seedMoodEvents }
