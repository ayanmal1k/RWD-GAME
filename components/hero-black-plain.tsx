import { Button } from '@/components/ui/button'

export default function HeroBlackPlain() {
  return (
    <section className="w-full bg-black text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-4 py-20 text-center sm:px-6 lg:px-8">
        <h1 className="font-sans text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          Simple, Bold,{' '}
          <span className="text-balance">and Powerful</span>
        </h1>
        
        <p className="mt-6 max-w-2xl text-base font-light leading-relaxed text-gray-300 sm:text-lg">
          Build something amazing with a clean, minimal design. No distractions, just pure focus on what matters.
        </p>
        
        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-center">
          <Button className="bg-white text-black hover:bg-gray-200">
            Get Started
          </Button>
          <Button variant="outline" className="border-white text-white hover:bg-white hover:text-black">
            Learn More
          </Button>
        </div>
      </div>
    </section>
  )
}
