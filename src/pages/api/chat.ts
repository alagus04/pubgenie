import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '@/lib/supabase'
import { generateGeminiContent } from '@/lib/gemini-rest'
import axios from 'axios'
import xml2js from 'xml2js'
import { extractSmartSearchTerms } from '@/lib/searchUtils'
import { getFirestore } from 'firebase-admin/firestore'
import '@/lib/firebaseAdmin' // ensure firebase admin is initialized

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('❌ Missing FIREBASE_SERVICE_ACCOUNT in env!')
}

const db = getFirestore()
const EUTILS_SEARCH = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi'
const EUTILS_FETCH = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi'
const PUBMED_API_KEY = process.env.PUBMED_API_KEY

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
  console.log('🧨 PubMed PMIDs:', pmids)
}

async function isTopicShift(history: { role: string; content: string }[], newPrompt: string): Promise<boolean> {
  const prompt = `
You are an assistant helping to determine whether a user is changing the topic of discussion.

Here is the conversation history:
${history.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')}

The user's new message is:
"${newPrompt}"

Based on the above, is the new message about a **different biomedical topic** than the earlier messages?

Respond with ONLY "yes" or "no".`

  const response = await generateGeminiContent([
    {
      role: 'user',
      parts: [{ text: prompt }]
    }
  ])

  return response.trim().toLowerCase() === 'yes'
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const { prompt, role, compare, history = [], userId } = req.body
  if (!prompt || !role) return res.status(400).json({ error: 'Missing prompt or role' })

  try {
    const isFollowUp = history.length > 0
    const topicShift = isFollowUp ? await isTopicShift(history, prompt) : false
    let topicTag = ''
    const allPmids = new Set<string>()

    const isAskForMore = /more (studies|articles|research|examples)/i.test(prompt)
    if (!isFollowUp || topicShift || isAskForMore) {
      topicTag = await extractSmartSearchTerms(prompt, false)
      const semanticQuery = topicTag
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

      pmids.forEach((pmid: string) => allPmids.add(pmid))

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
    } else {
      topicTag = await extractSmartSearchTerms(prompt, true)
      const pmidRegex = /PMID[:\s]*([0-9]+)/g
      for (const msg of history) {
        if (msg.role === 'assistant' && msg.content.includes(`🧠 Topic: ${topicTag}`)) {
          const matches = [...msg.content.matchAll(pmidRegex)]
          for (const match of matches) {
            if (match[1]) allPmids.add(match[1])
          }
        }
      }
    }

    if (!allPmids.size) {
      return res.status(200).json({ reply: "I couldn't find any articles to summarize." })
    }

    const { data: fetchedArticles } = await supabase
      .from('articles')
      .select('*')
      .in('pmid', Array.from(allPmids))

    if (!fetchedArticles || fetchedArticles.length === 0) {
      return res.status(200).json({ reply: 'No articles found for summarization.' })
    }

    const combinedAbstracts = fetchedArticles
      .map(a => `Title: ${a.title}\nAuthors: ${a.authors}\nJournal: ${a.journal} (${a.publication_year})\nAbstract: ${a.abstract}\nPMID: ${a.pmid}`)
      .join('\n\n')

    const pmidList = fetchedArticles.map(a => a.pmid).join(', ')

    const rawReply = await generateGeminiContent([
      {
        role: 'user',
        parts: [{
          text: isFollowUp && !topicShift
            ? `You're a biomedical research assistant.\n\n🧠 Topic: ${topicTag}\n\nHere are the PMIDs of the articles we're referring to: ${pmidList}.\n\nUse your memory of the prior articles to answer this question if relevant. If this is a new topic, say that you need new articles to answer it.\n\nFollow-up Question: "${prompt}"\n\nArticles:\n${combinedAbstracts}`
            : compare
              ? `You are a biomedical research assistant.\n\n🧠 Topic: ${topicTag}\n\nCompare the following articles based on their key findings, methodologies, outcomes, and relevance. DO NOT use a table. Instead, present your findings in a clearly structured list using markdown headings and bullet points. Tailor the tone for a ${role}.\n\nUser Prompt: "${prompt}"\n\nArticles:\n${combinedAbstracts}`
              : `You are a biomedical research assistant.\n\n🧠 Topic: ${topicTag}\n\nAnswer the following question using only the provided article content. Highlight key findings and include PMIDs. Tailor the tone for a ${role}.\n\nUser Question: "${prompt}"\n\nArticles:\n${combinedAbstracts}`
        }]
      }
    ])

    if (userId) {
      await db.collection('users')
        .doc(userId)
        .collection('queries')
        .add({
          prompt,
          response: rawReply,
          timestamp: new Date().toISOString(),
          role,
          topicTag,
          pmids: Array.from(allPmids),
          isFollowUp,
          topicShift
        })
    }

    const hiddenTopic = `<!-- 🧠 Topic: ${topicTag} -->\n\n`
    return res.status(200).json({ reply: hiddenTopic + rawReply })

  } catch (err) {
    const error = err as unknown as { response?: { data?: unknown }, message?: string }
    console.error('Gemini Chat Error:', JSON.stringify(error.response?.data || error.message, null, 2))
    return res.status(500).json({ error: 'Something went wrong while generating the summary.' })
  }
}