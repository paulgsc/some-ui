export const mockUploadAudio = async (blob: Blob): Promise<void> => {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 1500))

  // Simulate occasional failures (10% chance)
  if (Math.random() < 0.1) {
    throw new Error("Network error: Failed to upload recording")
  }

  console.log("Audio uploaded successfully:", {
    size: blob.size,
    type: blob.type,
  })
}
