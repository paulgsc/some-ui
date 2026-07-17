import type {
  ApiAdapter,
  RefreshCallbacks, // Import the missing callback type
  SatelliteDataItem,
} from "@nfl/types/hopium/hopium-tracker"

type MockSatelliteData = {
  dataType: string
  orbitAltitude: number
  signalStrength: number
  batteryLevel: number
  nextPass: number
}

export class MockSatelliteAdapter implements ApiAdapter<MockSatelliteData> {
  private generateMockItem = (
    id?: string
  ): SatelliteDataItem<MockSatelliteData> => {
    const dataTypes = [
      "Telemetry",
      "Imaging",
      "Navigation",
      "Weather",
      "Communications",
      "Radar",
      "GPS",
      "Thermal",
    ]

    const priorities: Array<"low" | "medium" | "high" | "critical"> = [
      "low",
      "medium",
      "high",
      "critical",
    ]

    const itemId = id ?? `sat-${Math.floor(Math.random() * 1000)}`

    const idSuffix = itemId.split("-")[1] ?? "0"
    const nameChar = String.fromCharCode(
      65 + (Number.parseInt(idSuffix, 10) % 26)
    )

    const priority =
      priorities[Math.floor(Math.random() * priorities.length)] ?? "medium"
    const dataType =
      dataTypes[Math.floor(Math.random() * dataTypes.length)] ?? "Telemetry"

    return {
      id: itemId,
      name: `Satellite ${nameChar}`,
      freshness: Math.floor(Math.random() * 100),
      lastUpdated: new Date(),
      priority: priority,
      data: {
        dataType: dataType,
        orbitAltitude: Math.floor(Math.random() * 500 + 400),
        signalStrength: Math.floor(Math.random() * 40 + 60),
        batteryLevel: Math.floor(Math.random() * 30 + 70),
        nextPass: Math.floor(Math.random() * 120 + 30),
      },
    }
  }

  async refreshItem(
    id: string,
    callbacks?: RefreshCallbacks // Added to match the interface
  ): Promise<SatelliteDataItem<MockSatelliteData>> {
    callbacks?.onStart?.(id)
    await new Promise((resolve) => setTimeout(resolve, 500))

    if (Math.random() < 0.1) {
      const error = new Error(`Failed to refresh satellite ${id}`)
      callbacks?.onFailure?.(error, id)
      throw error
    }

    const item = this.generateMockItem(id)
    item.freshness = 100
    callbacks?.onSuccess?.(item)
    return item
  }

  async refreshAll(
    callbacks?: RefreshCallbacks // Added to match the interface
  ): Promise<Array<SatelliteDataItem<MockSatelliteData>>> {
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const items = Array.from({ length: 50 }, (_, i) =>
      this.generateMockItem(`sat-${i + 1}`)
    )

    // Optional: notify success callbacks for each generated item
    if (callbacks?.onSuccess) {
      items.forEach((item) => callbacks.onSuccess?.(item))
    }

    return items
  }
}
