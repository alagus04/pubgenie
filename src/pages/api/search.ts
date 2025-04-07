import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '@/lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { query } = req.query

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid query' })
  }

  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .ilike('title', `%${query}%`) // case-insensitive search
    .limit(10)

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data)
}
