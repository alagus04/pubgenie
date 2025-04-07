import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '@/lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { pmid } = req.query

  if (!pmid || typeof pmid !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid PMID' })
  }

  const { data, error } = await supabase.from('articles').select('*').eq('pmid', pmid).single()

  if (error || !data) {
    return res.status(404).json({ error: 'Article not found' })
  }

  return res.status(200).json({ article: data })
}
