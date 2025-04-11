import { useState } from 'react'
import { useRouter } from 'next/router'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import ProtectedRoute from '@/components/ProtectedRoute'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [role, setRole] = useState<'student' | 'researcher' | 'clinician'>('student')
  const [loading, setLoading] = useState(false)

  const router = useRouter()

  const isComparePrompt = (text: string) => {
    const keywords = ['compare', 'difference', 'vs', 'versus']
    return keywords.some(k => text.toLowerCase().includes(k))
  }

  const handleSend = async () => {
    if (!input.trim()) return

    const userMessage: Message = { role: 'user', content: input }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    const isCompare = isComparePrompt(input)

    const history = newMessages.slice(0, -1) // exclude current user message

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: input, role, compare: isCompare, history })
    })
    const data = await res.json()
    console.log('REPLY FROM API:', data.reply)

    const assistantMessage: Message = { role: 'assistant', content: data.reply }
    setMessages(prev => [...prev, assistantMessage])

    setLoading(false)
  }

  const handleSignOut = async () => {
    try {
      await signOut(auth)
      console.log('✅ Successfully signed out')
      router.push('/') // Make sure this is the correct path to your landing page
    } catch (err) {
      console.error('❌ Sign out error:', err)
    }
  }
  

  return (
    <ProtectedRoute>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="w-full flex justify-end items-center mb-4">
          <Button variant="outline" onClick={handleSignOut}>Sign Out</Button>
        </div>

        <h1 className="text-3xl font-bold mb-6">🧠 PubGenie</h1>

        <div className="mb-4 flex gap-2 items-center">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'student' | 'researcher' | 'clinician')}
            className="border p-2 rounded-md"
          >
            <option value="student">Student</option>
            <option value="researcher">Researcher</option>
            <option value="clinician">Clinician</option>
          </select>
          <span className="text-muted-foreground text-sm">Tailors responses by role</span>
        </div>

        <ScrollArea className="h-[400px] border rounded-md p-4 mb-4">
          {messages.map((msg, idx) => (
            <div key={idx} className={`mb-3 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
              <div
                className={`prose max-w-[80%] inline-block px-4 py-2 rounded-lg whitespace-pre-wrap overflow-x-auto ${
                  msg.role === 'user' ? 'bg-blue-100 text-blue-900' : 'bg-gray-100 text-gray-900'
                }`}
              >
                <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                  {msg.content.replace(
                    /PMID[:\s]*([0-9]+)/g,
                    (_, id) => `[PMID: ${id}](https://pubmed.ncbi.nlm.nih.gov/${id})`
                  )}
                </ReactMarkdown>
              </div>
            </div>
          ))}
          {loading && (
            <div className="text-left mb-3">
              <div className="inline-block px-4 py-2 rounded-lg bg-gray-100 text-gray-600 animate-pulse">
                Thinking...
              </div>
            </div>
          )}
        </ScrollArea>

        <div className="flex gap-2">
          <Input
            placeholder="Ask PubGenie about any medical or research topic..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <Button onClick={handleSend} disabled={loading}>Send</Button>
        </div>
      </div>

      <footer className="mt-8 text-center text-sm text-gray-500">
        Copyright ©2025{' '}
        <a
          href="https://www.linkedin.com/in/alsellappan/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          Alagappan Sellappan
        </a>{' '}
        | All Rights Reserved
      </footer>
    </ProtectedRoute>
  )
}
