// /lib/searchUtils.ts
import { generateGeminiContent } from '@/lib/gemini-rest'

/**
 * Extracts smart PubMed search terms from a prompt, unless the prompt is a follow-up.
 * @param prompt - The current user prompt.
 * @param isFollowUp - Whether this is a follow-up to a previous query (default: false).
 */
export async function extractSmartSearchTerms(prompt: string, isFollowUp: boolean = false): Promise<string> {
  if (isFollowUp) {
    console.log('🔕 Skipping PubMed keyword extraction for follow-up message.')
    return ''
  }

  const extractionPrompt = `You are an expert biomedical search assistant. Given the following user prompt, extract the most effective PubMed-compatible search query using medical keywords, MeSH terms, and synonyms. Return only the optimized query string, no explanations.

Prompt: ${prompt}`

  const searchQuery = await generateGeminiContent([
    {
      role: 'user',
      parts: [{ text: extractionPrompt }]
    }
  ])

  const cleaned = searchQuery.trim().replace(/(^["']+|["']+$)/g, '')

  // fallback if Gemini returned junk or empty string
  if (!cleaned || cleaned.length < 5) {
    const fallback = prompt
      .split(/\s+/)
      .filter(w => w.length > 2)
      .slice(0, 6)
      .join(' ')
    console.warn('🔁 Falling back to simple search terms:', fallback)
    return fallback
  }

  return cleaned
}