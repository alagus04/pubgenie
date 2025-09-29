import { useState } from 'react'
import { useRouter } from 'next/router'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import ProtectedRoute from '@/components/ProtectedRoute'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'

interface Article {
  pmid: string
  title: string
  authors: string
  journal: string
  year: string
  abstract?: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string | { text: string; articles?: Article[]; topic?: string }
}

function dedupeClosingLines(text: string): string {
  const closers = [
    "Let me know if you want a deeper dive into any of these areas or have other questions!",
    "Let me know if you want to dive deeper into any of these, or if something was unclear!",
    "Let me know if you'd like more information on any of these topics!"
  ]

  for (let i = 0; i < closers.length; i++) {
    for (let j = i + 1; j < closers.length; j++) {
      const combined = `${closers[i]}\n\n${closers[j]}`
      if (text.includes(combined)) {
        return text.replace(combined, closers[i])
      }
    }
  }

  return text
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [role] = useState<'student' | 'researcher' | 'clinician'>('student')
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
    const history = newMessages.slice(0, -1)

    const firebaseUser = auth.currentUser
    if (!firebaseUser) {
      alert("You're not signed in.")
      setLoading(false)
      return
    }

    // ✅ NEW (robust fetch + error handling)
    let data: any
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: input, // keep this if you support file summaries; otherwise use just `input`
          role,
          compare: isCompare,
          history,
          userId: firebaseUser.uid
        })
      })

      if (!res.ok) {
        const errText = await res.text()
        console.error('❌ /api/chat failed:', res.status, errText)
        throw new Error(`Server error ${res.status}`)
      }

      data = await res.json()
    } catch (e) {
      console.error('❌ Chat request error:', e)
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: { text: 'Something went wrong talking to the server. Please try again.' } }
      ])
      setLoading(false)
      return
    }

    if (!data || !data.reply) {
      console.error('❌ No reply in API response:', data)
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: { text: 'I didn’t receive a reply from the server.' } }
      ])
      setLoading(false)
      return
    }

    console.log('REPLY FROM API:', data.reply)

    const assistantContent: Message['content'] = {
      text: typeof data.reply === 'string' ? data.reply : data.reply.text,
      articles: data.reply.articles ?? [],
      topic: data.reply.topic ?? ''
    }

    console.log('🚀 Assistant raw reply (before saving to messages):', assistantContent.text)

    const assistantMessage: Message = {
      role: 'assistant',
      content: assistantContent
    }

    setMessages(prev => [...prev, assistantMessage])
    setLoading(false)
  }

  const handleSignOut = async () => {
    try {
      await signOut(auth)
      console.log('✅ Successfully signed out')
      router.push('/')
    } catch (err) {
      console.error('❌ Sign out error:', err)
    }
  }

  return (
    <ProtectedRoute>
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-gray-100 border-r flex flex-col justify-between px-4 py-6 fixed left-0 top-0 h-screen">
          <div>
            <h2 className="text-2xl font-bold mb-6">🧠 PubGenie</h2>
          </div>
          <div className="space-y-2">
            <Button variant="ghost" className="w-full justify-start">Settings</Button>
            <Button variant="outline" className="w-full justify-start" onClick={handleSignOut}>Sign Out</Button>
          </div>
        </aside>

        {/* Main Content */}
        <div className="ml-64 flex-1 flex flex-col px-6 py-6 overflow-hidden">
          <div className="flex justify-end items-center mb-4">
            <Button variant="outline" onClick={handleSignOut}>Sign Out</Button>
          </div>

          <h1 className="text-3xl font-bold mb-6">🧠 PubGenie</h1>

          <ScrollArea className="flex-1 border rounded-md p-4 mb-4 overflow-y-auto">
            {messages.map((msg, idx) => {
              const isStructured = typeof msg.content === 'object'
              const text = isStructured ? (msg.content as { text: string }).text : msg.content
              const articles = isStructured ? (msg.content as { articles?: Article[] }).articles ?? null : null

              function cleanMarkdown(text: string): string {
                return text
              
                  // 1. Normalize broken link spacing: https: // → https://
                  .replace(/https:\s*\/\//g, 'https://')
              
                  // 2. Fix malformed markdown links: [Label] (https://...) → [Label](https://...)
                  .replace(/\[\s*([^\]]+?)\s*\]\s*\(\s*https:\/\/\s*([^)]+?)\s*\)/g, '[$1](https://$2)')
              
                  // 3. Convert [Label](https://pubmed...) to (Label) with hyperlink
                  .replace(/\(\[([^\]]+?)\]\(https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/(\d{6,})\)\)/gi, (_, label, pmid) => {
                    return `([${label}](https://pubmed.ncbi.nlm.nih.gov/${pmid}))`;
                  })
              
                  // 4. Ensure PubMed links are wrapped in parens if not already
                  .replace(/(?<!\()(\[.*?\]\(https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\))(?!\))/g, '($1)')

                  // Hide PMID lines from rendered output
                  .replace(/^PMID:\s*\d+\s*/gm, '')
              
                  // 5. Fix bold headers: **Label: ** → **Label:** (with proper spacing)
                  .replace(/\*\*\s*(.+?)\s*:\s*\*\*/g, '**$1:**')
              
                  // 6. Fix any bold that’s missing spacing after
                  .replace(/(\*\*[^\*]+?\*\*)(?=\S)/g, '$1 ')
              
                  // 7. Remove extra spaces before commas/periods/etc.
                  .replace(/\s+([,.:;!?])/g, '$1')
              
                  // 8. Fix bullets: * or - with or without space → -
                  .replace(/^\s*[-*]\s+/gm, '- ')
              
                  // 9. Remove newline between bullet and its text
                  .replace(/-\s*\n\s*/g, '- ')
              
                  // 10. Add blank line before headings like ### or ##
                  .replace(/(?<!\n)\s*(#+\s+)/g, '\n\n$1')
              
                  // 11. Normalize extra newlines
                  .replace(/\n{3,}/g, '\n\n')

                  // 🔥 NEW RULE to strip dangling journal list (parentheses only at the end)
                  .replace(/(\(\s*.+?\s*\)\s*)+$/, '')
              }

              const markdownText = typeof text === 'string'
              ? cleanMarkdown(
              dedupeClosingLines(
                  text
                    .replace(/\*\*\s+/gm, '**')
                    .replace(/PMID[:\s]*([0-9]+)/g, (_, id) => {
                      const match = articles?.find((a) => a.pmid === id)
                      const label = match?.journal?.trim() || 'PubMed'
                      return `[**_${label}_** (PMID: ${id})](https://pubmed.ncbi.nlm.nih.gov/${id})`
                    })
                    .replace(/(?<=\n)(\d+\..+?)\n/g, '\n<hr />\n$1\n')
                ))
              : ''

              return (
                <div key={idx} className={`mb-3 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                  <div className={`prose chat-markdown max-w-[80%] inline-block px-4 py-2 rounded-lg whitespace-pre-wrap overflow-x-auto ${msg.role === 'user' ? 'bg-blue-100 text-blue-900' : 'bg-gray-50 text-gray-900'}`}>
                  <div className="prose chat-markdown text-[15px] leading-tight [&_a]:underline [&_a]:font-semibold [&_a]:text-black">
                      <ReactMarkdown rehypePlugins={[rehypeRaw]} remarkPlugins={[remarkGfm]}>
                        {markdownText}
                      </ReactMarkdown>
                    </div>
                    {msg.role === 'assistant' && articles && (
                      <div className="mt-4 space-y-4">
                        {articles.map(article => (
                          <div key={article.pmid} className="border rounded-lg p-4 bg-gray-50 shadow-sm">
                            <div className="font-semibold">{article.title}</div>
                            <div className="text-sm text-gray-600 mb-1">{article.authors}</div>
                            <div className="text-sm italic text-gray-500">
                              {article.journal} ({article.year})
                            </div>
                            {article.abstract && (
                              <div className="mt-2 text-sm text-gray-700 line-clamp-4">
                                {article.abstract.slice(0, 300)}...
                              </div>
                            )}
                            <a
                              href={`https://pubmed.ncbi.nlm.nih.gov/${article.pmid}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 text-sm mt-2 inline-block"
                            >
                              View on PubMed ↗
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            {loading && (
              <div className="text-left mb-3">
                <div className="inline-block px-4 py-2 rounded-lg bg-gray-100">
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                </div>
              </div>
            )}
          </ScrollArea>

          <div className="mt-4 flex gap-2">
            <Input
              placeholder="Ask PubGenie about any medical or research topic..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            <Button onClick={handleSend} disabled={loading}>Send</Button>
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
            </a>{' '}| All Rights Reserved
          </footer>
        </div>
      </div>
    </ProtectedRoute>
  )
}
