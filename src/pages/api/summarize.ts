import type { NextApiRequest, NextApiResponse } from 'next'
import { gemini } from '@/lib/gemini'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { pmid, title, abstract, role } = req.body

  if (!pmid || !abstract || !role) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const prompt = `Summarize the following biomedical article for a ${role}:\n\nTitle: ${title}\n\nAbstract: ${abstract}\n\nPMID: ${pmid}`

  try {
    const result = await gemini.generateContent([prompt])
    const summary = result.response.text()

    res.status(200).json({ summary })
  } catch (err) {
    console.error('Gemini Summary Error:', err)
    res.status(500).json({ error: 'Failed to summarize using Gemini.' })
  }
}
