import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Github } from 'lucide-react'
import { motion } from 'framer-motion'

export default function LandingPage() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      className="min-h-screen bg-white text-center flex flex-col"
    >
      {/* Top navbar */}
      <header className="w-full px-6 py-4 flex items-center justify-between">
        <div className="text-lg font-semibold text-gray-900" />
        <div className="flex items-center gap-4">
          <Link href="/signin">
            <Button variant="ghost" size="sm">Sign In</Button>
          </Link>
          <Link href="/signup">
            <Button size="sm">Sign Up</Button>
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="flex flex-col items-center justify-center flex-grow px-6 py-20 space-y-6">
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 100 }}
        >
          <motion.a
            href="https://x.com/alagus22"
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ x: 8 }}
            className="flex items-center gap-2 bg-[#0F172A] text-white px-4 py-2 rounded-full text-sm font-medium hover:opacity-90 transition"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 512 512"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path d="M 461.460938 0 L 308.199219 193.613281 L 497.300781 512 L 347.300781 512 L 234.679688 330.574219 L 101.089844 512 L 0 512 L 165.179688 307.542969 L 24.359375 0 L 174.199219 0 L 273.5 177.210938 L 397.5 0 Z" />
            </svg>
            Follow @alagus22 on X
          </motion.a>
        </motion.div>

        <motion.h1
          className="text-4xl md:text-5xl font-bold text-gray-900 max-w-4xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          The perfect{' '}
          <span className="bg-gradient-to-r from-purple-500 to-pink-500 text-transparent bg-clip-text">
            AI assistant
          </span>{' '}
          built for research.
        </motion.h1>

        <motion.p
          className="mt-2 text-lg text-gray-500 max-w-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          From literature reviews to clinical insights, PubGenie helps you search
          smarter, compare faster, and summarize research in just seconds.
        </motion.p>

        <motion.div
          className="mt-8 flex flex-col sm:flex-row gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Link href="/signin">
            <Button size="lg">Get Started</Button>
          </Link>

          <Button size="lg" variant="outline" asChild>
            <a
              href="https://github.com/your-repo"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2"
            >
              <Github className="w-4 h-4" />
              Star on GitHub
            </a>
          </Button>
        </motion.div>
      </main>

      <motion.footer
        className="w-full text-center text-sm text-gray-400 pb-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        © 2025 Alagappan Sellappan. All rights reserved.
      </motion.footer>
    </motion.div>
  )
}
