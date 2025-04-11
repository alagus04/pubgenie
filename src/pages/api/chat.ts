// /pages/api/chat.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '@/lib/supabase'
import { generateGeminiContent } from '@/lib/gemini-rest'
import axios from 'axios'
import xml2js from 'xml2js'
import { extractSmartSearchTerms } from '@/lib/searchUtils'

const EUTILS_SEARCH = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi'
const EUTILS_FETCH = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi'
const PUBMED_API_KEY = process.env.PUBMED_API_KEY

async function generateSemanticQuery(userPrompt: string): Promise<string> {
  const prompt = `
You are an expert biomedical librarian helping researchers search PubMed. Extract the most effective search query from this prompt:

"${userPrompt}"

Your query should:

- Use clear biomedical keywords and boolean operators (AND, OR)
- Avoid vague terms unless medically relevant
- Include condition, treatment, or population when applicable

Output ONLY the query.
  `

  try {
    const response = await generateGeminiContent([
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ])
    const cleaned = response?.trim().replace(/(^["']+|["']+$)/g, '')
    return cleaned || userPrompt
  } catch (err) {
    console.error('🔍 Semantic query generation failed:', err)
    return userPrompt
  }
}

async function tryQuery(query: string) {
  const searchParams = new URLSearchParams({
    db: 'pubmed',
    term: query,
    retmax: '15',
    sort: 'pub+date',
    retmode: 'json',
    api_key: PUBMED_API_KEY || ''
  })

  const searchRes = await axios.get(`${EUTILS_SEARCH}?${searchParams}`)
  return searchRes.data?.esearchresult?.idlist || []
}

function logQueryDebug(prompt: string, query: string, pmids: string[]) {
  console.log('🔎 Original Prompt:', prompt)
  console.log('📚 Gemini Search Query:', query)
  console.log('🧬 PubMed PMIDs:', pmids)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { prompt, role, compare, history = [] } = req.body
  if (!prompt || !role) return res.status(400).json({ error: 'Missing prompt or role' })

  try {
    const isFollowUp = history.length > 0
    let articles = []

    if (!isFollowUp) {
      const semanticQuery = await extractSmartSearchTerms(prompt, isFollowUp)
      let pmids = await tryQuery(semanticQuery)
      logQueryDebug(prompt, semanticQuery, pmids)

      if (pmids.length === 0) {
        console.warn('⚠️ No PMIDs from semantic query. Trying raw prompt...')
        const fallbackQuery = prompt
          .split(/\s+/)
          .filter((w: string) => w.length > 2)
          .slice(0, 6)
          .join(' ')
        pmids = await tryQuery(fallbackQuery)
        logQueryDebug('Fallback prompt', fallbackQuery, pmids)
      }

      if (!pmids.length) return res.status(200).json({ reply: "I couldn't find any articles related to your query." })

      const { data: existing } = await supabase.from('articles').select('pmid')
      const existingPmids = new Set((existing || []).map(a => a.pmid))
      const missingPmids = pmids.filter((pmid: string) => !existingPmids.has(pmid))

      if (missingPmids.length > 0) {
        const fetchParams = new URLSearchParams({
          db: 'pubmed',
          id: missingPmids.join(','),
          retmode: 'xml',
          api_key: PUBMED_API_KEY || ''
        })

        const fetchRes = await axios.get(`${EUTILS_FETCH}?${fetchParams}`)
        const parsed = await xml2js.parseStringPromise(fetchRes.data, { explicitArray: false })
        const articlesFetched = parsed.PubmedArticleSet.PubmedArticle || []
        const inserts = Array.isArray(articlesFetched) ? articlesFetched : [articlesFetched]

        for (const article of inserts) {
          const pmid = article.MedlineCitation.PMID._ || article.MedlineCitation.PMID
          const articleData = article.MedlineCitation.Article

          const title = articleData.ArticleTitle || 'N/A'
          let abstract = 'N/A'
          const abstractData = articleData.Abstract?.AbstractText
          if (typeof abstractData === 'string') {
            abstract = abstractData
          } else if (Array.isArray(abstractData)) {
            abstract = abstractData.map(part => (typeof part === 'string' ? part : part._ || '')).join(' ')
          } else if (typeof abstractData === 'object' && abstractData._) {
            abstract = abstractData._
          }

          const authorsArr = articleData.AuthorList?.Author || []
          const authors = Array.isArray(authorsArr)
            ? authorsArr.map(a => `${a.ForeName || ''} ${a.LastName || ''}`.trim()).join(', ')
            : ''
          const journal = articleData.Journal?.Title || 'N/A'
          const pubDate = articleData.Journal?.JournalIssue?.PubDate?.Year || 'N/A'

          await supabase.from('articles').upsert({
            pmid,
            title,
            abstract,
            authors,
            journal,
            publication_year: pubDate
          })
        }
      }

      const { data: fetchedArticles } = await supabase
        .from('articles')
        .select('*')
        .in('pmid', pmids)

      if (!fetchedArticles || fetchedArticles.length === 0) {
        return res.status(200).json({ reply: 'No articles found for summarization.' })
      }

      articles = fetchedArticles
    }

    const combinedAbstracts = articles
      .map(a => `Title: ${a.title}
Authors: ${a.authors}
Journal: ${a.journal} (${a.publication_year})
Abstract: ${a.abstract}
PMID: ${a.pmid}`)
      .join('\n\n')

    const messageHistory = history.map((m: any) => ({
      role: m.role,
      parts: [{ text: m.content }]
    }))

    const reply = await generateGeminiContent([
      ...messageHistory,
      {
        role: 'user',
        parts: [{
          text: isFollowUp
            ? `You're a biomedical research assistant. This is a follow-up question.

Use your memory of the prior articles to answer this question if relevant. If this is a new topic, say that you need new articles to answer it.

Follow-up Question: "${prompt}"`
            : compare
            ? `You are a biomedical research assistant. Compare the following articles based on their key findings, methodologies, outcomes, and relevance. DO NOT use a table. Instead, present your findings in a clearly structured list using markdown headings and bullet points. Tailor the tone for a ${role}.

User Prompt: "${prompt}"

Articles:
${combinedAbstracts}`
            : `You are a biomedical research assistant. Answer the following question using only the provided article content. Highlight key findings and include PMIDs. Tailor the tone for a ${role}.

User Question: "${prompt}"

Articles:
${combinedAbstracts}`
        }]
      }
    ])

    return res.status(200).json({ reply })
} catch (err) {
    const error = err as unknown as { response?: { data?: unknown }, message?: string }
    console.error('Gemini Chat Error:', JSON.stringify(error.response?.data || error.message, null, 2))
    return res.status(500).json({ error: 'Something went wrong while generating the summary.' })
  }  
}
