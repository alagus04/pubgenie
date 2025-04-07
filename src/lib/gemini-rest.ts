import axios from 'axios'

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

export async function generateGeminiContent(prompt: string): Promise<string> {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('Missing Gemini API key.')

    const response = await axios.post(
      `${GEMINI_API_URL}?key=${apiKey}`,
      {
        contents: [
          {
            role: 'user', // ✅ include this for Gemini 2.0+
            parts: [{ text: prompt }]
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )

    const result = response.data?.candidates?.[0]?.content?.parts?.[0]?.text
    return result || 'No response generated.'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.error('🛑 Gemini REST Error:', JSON.stringify(err.response?.data || err.message, null, 2))
    return 'An error occurred while generating content.'
  }
}
