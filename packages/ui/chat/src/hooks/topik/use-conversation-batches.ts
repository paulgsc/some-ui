import { useEffect, useState } from "react"
import type { ConversationBatch } from "@chat/types/topik"

export function useConversationBatches({ path }: { path: string }) {
  const [batches, setBatches] = useState<Array<ConversationBatch> | null>(null)

  useEffect(() => {
    fetch(path)
      .then((res) => res.json())
      .then(setBatches)
      .catch(console.error)
  }, [])

  return batches
}
