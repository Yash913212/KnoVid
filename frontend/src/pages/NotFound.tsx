import { Link } from 'react-router-dom'
import { Home, Compass } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { BrandTile } from '../components/ui/BrandTile'
import { Eyebrow } from '../components/ui/Eyebrow'
import SeoHead from '../components/SeoHead'

export default function NotFound() {
  return (
    <>
      <SeoHead
        title="Page not found — KnoVid"
        description="This universe doesn't exist. Head back to the KnoVid workspace."
      />
      <div className="relative mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-5 py-20 text-center sm:px-8">
        <Eyebrow tone="tangerine" className="justify-center">
          <Compass className="h-3.5 w-3.5" />
          404
        </Eyebrow>
        <div className="relative mt-8">
          <BrandTile size="lg" glow>
            <Compass className="h-6 w-6" />
          </BrandTile>
          <div aria-hidden className="absolute -inset-3 -z-10 rounded-full bg-gradient-to-r from-[#2BA6A0]/20 to-[#5D6FE8]/20 blur-2xl" />
        </div>
        <h1 className="font-display mt-8 text-4xl font-bold tracking-tight text-stone-950 sm:text-5xl dark:text-white">
          This universe <span className="font-serif italic font-normal title-gradient">vanished</span>
        </h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-stone-500 sm:text-base dark:text-stone-400">
          The page you're looking for drifted out of the graph — it may have been
          moved, or the address is simply wrong.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link to="/">
            <Button icon={<Home className="h-4 w-4" />}>Back to home</Button>
          </Link>
          <Link to="/app">
            <Button variant="secondary">Return to workspace</Button>
          </Link>
        </div>
      </div>
    </>
  )
}
