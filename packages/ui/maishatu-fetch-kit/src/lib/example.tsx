import { useEffect, useRef, useState } from "react"

import { createFetchClient } from "./fetch-client" // Adjust the path if needed

const client = createFetchClient()

const StreamedImage = () => {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  useEffect(() => {
    const streamImage = async () => {
      setLoading(true)
      setError(null)
      let receivedData: Array<Uint8Array> = []

      try {
        await client.stream(new URL("/stream_image", "http://localhost:3000"), {
          // Replace with your actual server URL
          onData: (chunk) => {
            receivedData.push(chunk)
            // Combine all received chunks into a single Blob.
            const combinedBlob = new Blob(receivedData, { type: "image/jpeg" }) // Or the correct MIME type
            // Revoke the old object URL if it exists
            if (objectUrlRef.current) {
              URL.revokeObjectURL(objectUrlRef.current)
            }
            // Create a new object URL.
            const newImageUrl = URL.createObjectURL(combinedBlob)
            objectUrlRef.current = newImageUrl // Store the new URL.
            setImageUrl(newImageUrl)
          },
          //  chunkSchema: z.instanceof(Uint8Array), // Optional: Validate each chunk.  Less useful for images.
        })
      } catch (err: any) {
        setError(err.message || "Failed to stream image")
      } finally {
        setLoading(false)
      }
    }

    streamImage()

    // Cleanup function to revoke the object URL when the component unmounts or
    // a new stream starts.  This prevents memory leaks.
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [])

  if (loading) {
    return <div>Loading image...</div>
  }

  if (error) {
    return <div>Error: {error}</div>
  }

  if (!imageUrl) {
    return <div>No image received.</div>
  }

  return (
    <img
      src={imageUrl}
      alt="Streamed Content"
      style={{ maxWidth: "100%", maxHeight: "400px" }} // Adjust as needed
    />
  )
}

export default StreamedImage
