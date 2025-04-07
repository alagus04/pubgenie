import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '@/lib/supabase'
import { generateGeminiContent } from '@/lib/gemini-rest'
import axios from 'axios'
import xml2js from 'xml2js'

const EUTILS_SEARCH = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi'
const EUTILS_FETCH = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi'
const PUBMED_API_KEY = process.env.PUBMED_API_KEY

async function generateSemanticQuery(userPrompt: string): Promise<string> {
  const prompt = `
You are an expert at constructing search queries for biomedical databases like PubMed.

Your task is to extract a concise, effective PubMed-compatible search query from the following research question.

Prefer **broader** boolean search phrases over exact-match filters. Return only the query, no explanation. 

Prompt: "${userPrompt}"
`

  try {
    const query = await generateGeminiContent(prompt)
    return query?.trim() || userPrompt
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { prompt, role, compare } = req.body
  if (!prompt || !role) return res.status(400).json({ error: 'Missing prompt or role' })

  try {
    const semanticQuery = await generateSemanticQuery(prompt)
    let pmids = await tryQuery(semanticQuery)

    // Retry with raw prompt if semantic query yields nothing
    if (pmids.length === 0) {
      console.warn('⚠️ No PMIDs found from semantic query. Retrying with raw prompt...')
      pmids = await tryQuery(prompt)
    }

    if (!pmids.length) return res.status(200).json({ reply: "I couldn't find any articles related to your query." })

    const { data: existing } = await supabase.from('articles').select('pmid')
    const existingPmids = new Set((existing || []).map(a => a.pmid))
    const missingPmids = pmids.filter(pmid => !existingPmids.has(pmid))

    if (missingPmids.length > 0) {
      const fetchParams = new URLSearchParams({
        db: 'pubmed',
        id: missingPmids.join(','),
        retmode: 'xml',
        api_key: PUBMED_API_KEY || ''
      })

      const fetchRes = await axios.get(`${EUTILS_FETCH}?${fetchParams}`)
      const parsed = await xml2js.parseStringPromise(fetchRes.data, { explicitArray: false })
      const articles = parsed.PubmedArticleSet.PubmedArticle || []

      const inserts = Array.isArray(articles) ? articles : [articles]

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

    const { data: articles } = await supabase
      .from('articles')
      .select('*')
      .in('pmid', pmids)

    if (!articles || articles.length === 0) {
      return res.status(200).json({ reply: 'No articles found for summarization.' })
    }

    if (compare) {
      return res.status(200).json({ articles })
    }

    const combinedAbstracts = articles
      .map(a => `Title: ${a.title}
Authors: ${a.authors}
Journal: ${a.journal} (${a.publication_year})
Abstract: ${a.abstract}
PMID: ${a.pmid}`)
      .join('\n\n')

    const promptText = `You are a biomedical research assistant. Answer the following question using only the provided article content. Highlight key findings and include PMIDs. Tailor the tone for a ${role}.\n\nUser Question: "${prompt}"\n\nArticles:\n${combinedAbstracts}`


    const reply = await generateGeminiContent(promptText)
    return res.status(200).json({ reply })
  } catch (err) {
    console.error('Gemini Chat Error:', err)
    return res.status(500).json({ error: 'Something went wrong while generating the summary.' })
  }
}
