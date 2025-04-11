// /pages/landing.tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Globe, Github } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-black flex flex-col">
      <header className="flex justify-between items-center px-6 py-4 shadow-sm">
        <div className="text-xl font-bold flex items-center gap-2">
          <span className="text-black">📊 PubGenie</span>
        </div>
        <nav className="hidden md:flex gap-6 text-sm text-gray-600">
          <Link href="#product">Product</Link>
          <Link href="#docs">Docs</Link>
          <Link href="#community">Community</Link>
          <Link href="#company">Company</Link>
        </nav>
        <div className="flex gap-3 items-center">
          <Globe className="w-4 h-4 text-gray-500" />
          <Link href="/signin" className="text-sm text-gray-700 hover:underline">
            Sign In
          </Link>
          <Link href="/signup">
            <Button>Sign Up</Button>
          </Link>
        </div>
      </header>

      <main className="flex-grow flex flex-col items-center justify-center text-center px-4">
        <a
          href="https://twitter.com/alsellappan"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-white bg-black px-3 py-1 rounded-full mb-4"
        >
          Follow @alsellappan on Twitter
        </a>

        <h1 className="text-4xl md:text-5xl font-extrabold max-w-3xl">
          The perfect <span className="text-purple-500">PubMed Assistant</span> to accelerate your research.
        </h1>

        <p className="mt-4 text-gray-500 max-w-xl">
          An AI-powered research tool to query PubMed smarter, summarize biomedical papers, and generate comparisons using Gemini + Supabase + React.
        </p>

        <div className="mt-8 flex gap-4">
          <Link href="/signin">
            <Button size="lg">Get Started</Button>
          </Link>
          <a
            href="https://github.com/alsellappan/PubGenie"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 border rounded-md text-sm font-medium"
          >
            <Github className="w-4 h-4" /> Star on GitHub
          </a>
        </div>
      </main>
    </div>
  )
}
