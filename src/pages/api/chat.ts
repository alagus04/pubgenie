import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '@/lib/supabase'
import { generateGeminiContent } from '@/lib/gemini-rest'
import axios from 'axios'
import xml2js from 'xml2js'
import { extractSmartSearchTerms } from '@/lib/searchUtils'
import { getFirestore } from 'firebase-admin/firestore'
import '@/lib/firebaseAdmin'

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

  console.log('🔁 Trying PubMed query:', query)
  const searchRes = await axios.get(`${EUTILS_SEARCH}?${searchParams}`)
  console.log('✅ PubMed search response received')
  return searchRes.data?.esearchresult?.idlist || []
}

function logQueryDebug(prompt: string, query: string, pmids: string[]) {
  console.log('🔎 Original Prompt:', prompt)
  console.log('📚 Gemini Search Query:', query)
  console.log('🧨 PubMed PMIDs:', pmids)
}

type Message = {
  role: 'user' | 'assistant';
  content: string | { text: string };
};

async function isTopicShift(history: Message[], newPrompt: string): Promise<boolean> {
    // Helper function to safely get content as string
    const getContentText = (msg: Message): string => {
      if (!msg || !msg.content) return '';
      
      if (typeof msg.content === 'string') {
        return msg.content;
      } else if (typeof msg.content === 'object' && msg.content.text) {
        return msg.content.text;
      }
      
      return '';
    };
    
    const prompt = `
  You are an assistant helping to determine whether a user is changing the topic of discussion.
  
  Here is the conversation history:
  ${history.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${getContentText(m)}`).join('\n')}
  
  The user's new message is:
  "${newPrompt}"
  
  Based on the above, is the new message about a **different biomedical topic** than the earlier messages?
  
  Respond with ONLY "yes" or "no".`
  
    console.log('🧠 Checking topic shift with Gemini...')
    const response = await generateGeminiContent([
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ])
  
    console.log('🧠 Gemini topic shift response:', response)
    return response.trim().toLowerCase() === 'yes'
  }

async function classifyPromptIntent(prompt: string): Promise<'vague' | 'general' | 'specific'> {
  const clarificationPrompt = `
A user submitted the following biomedical prompt:

"${prompt}"

Decide which category it belongs to:
1. "vague" — if it's too broad or unclear to query PubMed meaningfully without clarification (e.g., "tell me about health").
2. "general" — if it's not a PubMed-style research question but could be answered with a general explanation or summary.
3. "specific" — if it's specific enough to directly search PubMed for scientific articles.

Respond with just one of these three words: vague, general, or specific.`

  const result = await generateGeminiContent([
    {
      role: 'user',
      parts: [{ text: clarificationPrompt }]
    }
  ])

  return result.trim().toLowerCase() as 'vague' | 'general' | 'specific'
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const { prompt, role, compare, history = [], userId } = req.body
  if (!prompt || !role) return res.status(400).json({ error: 'Missing prompt or role' })

    try {
        console.log('📩 Request received:', { prompt, role, compare, historyLength: history.length, userId })
      
        const isFollowUp = history.length > 0
        const topicShift = isFollowUp ? await isTopicShift(history, prompt) : false
        console.log('🔄 Topic Shift:', topicShift)
      
        let intent: 'vague' | 'general' | 'specific' = 'specific'
        const shouldClassify = !isFollowUp || topicShift
      
        if (shouldClassify) {
          intent = await classifyPromptIntent(prompt)
          console.log('🔍 Prompt intent classification:', intent)
      
          if (intent === 'vague') {
            return res.status(200).json({
              reply: `Hmm, that’s a great starting point! Just to make sure I pull the most relevant research for you — could you let me know what part you’re most curious about?\n\nFor example:\n• A specific disease or treatment?\n• A certain population group?\n• Or something you want to compare?\n\nHappy to dig in with you! 😊`
            })
          }
      
          if (intent === 'general') {
            const generalResponse = await generateGeminiContent([
              {
                role: 'user',
                parts: [{ text: `You’re a friendly and clear biomedical explainer. Break down the following topic as if you're talking to a curious student. Keep it easy to understand but insightful:\n\n"${prompt}"` }]
              }
            ])
            return res.status(200).json({ reply: generalResponse })
          }
        }


    let topicTag = ''
    const allPmids = new Set<string>()

    const isAskForMore = /more (studies|articles|research|examples)/i.test(prompt)
    if (!isFollowUp || topicShift || isAskForMore) {
      console.log('🚀 New search triggered')
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
        console.log('📥 Fetching missing articles from PubMed:', missingPmids)
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

        console.log(`📄 Parsed ${inserts.length} new articles`)

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
    }
    else {
      console.log('🔕 Skipping PubMed keyword extraction for follow-up message.')
    
      // 🧠 Instead of extracting again, try to reuse the previous topic
      for (const msg of history.reverse()) { // reverse so we prioritize the latest message
        if (msg.role === 'assistant' && typeof msg.content === 'object') {
          const previousTopic = msg.content.topic
          if (previousTopic) {
            topicTag = previousTopic
            console.log('🔁 Reusing previous topic from history:', topicTag)
            break
          }
        }
      }
    
      if (!topicTag) {
        console.warn('⚠️ No previous topic found in history. Cannot proceed.')
        return res.status(200).json({ reply: "I couldn't determine the previous topic to answer your follow-up. Please clarify your question!" })
      }
    
      const pmidRegex = /PMID[:\s]*([0-9]+)/g
      for (const msg of history) {
        if (msg.role === 'assistant' && typeof msg.content === 'object') {
          const topic = msg.content.topic
          if (topic?.trim().toLowerCase() === topicTag.trim().toLowerCase()) {
            const text = msg.content.text
            const matches = [...text.matchAll(pmidRegex)]
            for (const match of matches) {
              if (match[1]) allPmids.add(match[1])
            }
          }
        }
      }
    }

    if (!allPmids.size) {
      console.warn('❗ No PMIDs collected at all')
      return res.status(200).json({ reply: "I couldn't find any articles to summarize." })
    }

    const { data: fetchedArticles } = await supabase
      .from('articles')
      .select('*')
      .in('pmid', Array.from(allPmids))

    if (!fetchedArticles || fetchedArticles.length === 0) {
      console.warn('❗ No articles found in Supabase')
      return res.status(200).json({ reply: 'No articles found for summarization.' })
    }

    const combinedAbstracts = fetchedArticles
      .map(a => `Title: ${a.title}\nAuthors: ${a.authors}\nJournal: ${a.journal} (${a.publication_year})\nAbstract: ${a.abstract}\nPMID: ${a.pmid}`)
      .join('\n\n')

    const pmidList = fetchedArticles.map(a => a.pmid).join(', ')

    console.log('📝 Generating summary with Gemini')
    const markdownInstructions = `You MUST respond using GitHub-flavored Markdown. Follow these formatting rules exactly:

- Use "###" for section headers like 'Current Treatment Strategies'
- Use "-" for bullet points
- Use "**bold**" for medical terms or emphasis — never around links
- For citations, include the journal name as a clickable link and **wrap the whole citation in parentheses**, like: ([Journal Name](https://pubmed.ncbi.nlm.nih.gov/PMID))
- NEVER use asterisks for section titles or links
- Ensure proper spacing between words and punctuation
- Do NOT wrap citations in markdown if already linked

Structure:
- Start with a short intro
- Use headers, bullets, and links
- Each bullet should contain ONE key point, properly spaced

This will be parsed by a Markdown interpreter. Be strict about formatting.`;

console.log('📝 Generating summary with Gemini')

const rawReply = await generateGeminiContent([
  {
    role: 'user',
    parts: [{
      text: isFollowUp && !topicShift
        ? `${markdownInstructions}You’re a friendly and conversational biomedical research assistant who talks like a helpful collaborator — not too formal, not robotic. You guide the user clearly, ask thoughtful questions when needed, and explain article insights like you're talking to a curious friend or student.\n\n🧠 Topic: ${topicTag}\n\nHere are the PMIDs of the articles we're referring to: ${pmidList}.\n\nUse your memory of the prior articles to answer this question if relevant. If this is a new topic, say that you need new articles to answer it.\n\nFollow-up Question: "${prompt}"\n\nArticles:\n${combinedAbstracts}`
        : compare
          ? `${markdownInstructions}You’re a friendly and conversational biomedical research assistant who talks like a helpful collaborator — not too formal, not robotic. You guide the user clearly, ask thoughtful questions when needed, and explain article insights like you're talking to a curious friend or student.\n\n🧠 Topic: ${topicTag}\n\nCompare the following articles based on their key findings, methodologies, outcomes, and relevance. DO NOT use a table. Instead, present your findings in a clearly structured list using markdown headings and bullet points. Tailor the tone for a ${role}.\n\nUser Prompt: "${prompt}"\n\nArticles:\n${combinedAbstracts}`
          : `${markdownInstructions}You’re a friendly and conversational biomedical research assistant who talks like a helpful collaborator — not too formal, not robotic. You guide the user clearly, ask thoughtful questions when needed, and explain article insights like you're talking to a curious friend or student.\n\n🧠 Topic: ${topicTag}\n\nAnswer the following question using only the provided article content. Highlight key findings and include PMIDs. Tailor the tone for a ${role}.\n\nUser Question: "${prompt}"\n\nArticles:\n${combinedAbstracts}`
    }]
  }
])

console.log('✅ Gemini response generated')

// ✅ Append PMIDs manually to ensure they're always present in history
const pmidFooter = fetchedArticles.map((a) => `PMID: ${a.pmid}`).join('\n')
const rawReplyWithPmids = `${rawReply}\n\n<!-- PMIDs: ${pmidFooter} -->`
const replyWithFollowUp = rawReplyWithPmids + '\n\nLet me know if you want to dive deeper into any of these, or if something was unclear!'

// ✅ Save to Firestore if user ID present
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

// ✅ Send response to frontend
return res.status(200).json({
  reply: {
    text: replyWithFollowUp,
    articles: fetchedArticles.map((a) => ({
      pmid: a.pmid,
      title: a.title,
      authors: a.authors,
      journal: a.journal,
      year: a.publication_year,
      abstract: a.abstract
    })),
    topic: topicTag
  }
})

  } catch (err) {
    const error = err as unknown as { response?: { data?: unknown }, message?: string }
    console.error('❌ Gemini Chat Error:', JSON.stringify(error.response?.data || error.message, null, 2))
    return res.status(500).json({ error: 'Something went wrong while generating the summary.' })
  }
}
