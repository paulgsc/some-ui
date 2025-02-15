interface PageFlipProps {
  images: {
    page1: string
    page2: string
    page3: string
  }
}

export const PaperFlip: React.FC<PageFlipProps> = ({ images }) => {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="border border-red-500 size-72 translate-x-[240px] -rotate-[32deg] origin-[45px_500px]" />
    </main>
  )
}
