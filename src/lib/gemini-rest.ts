// /lib/gemini-rest.ts
import axios from 'axios'

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

interface Part {
  text: string
}

interface Content {
  role: 'user' | 'model'
  parts: Part[]
}

export async function generateGeminiContent(contents: Content[]): Promise<string> {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('Missing Gemini API key.')

    const response = await axios.post(
      `${GEMINI_API_URL}?key=${apiKey}`,
      { contents },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )

    const result = response.data?.candidates?.[0]?.content?.parts?.[0]?.text
    return result || 'No response generated.'
  } catch (err) {
    const error = err as unknown as { response?: { data?: unknown }, message?: string }
    console.error('🛑 Gemini REST Error:', JSON.stringify(error.response?.data || error.message, null, 2))
    return 'An error occurred while generating content.'
  }
}
