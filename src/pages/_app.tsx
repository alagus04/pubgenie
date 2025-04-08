// /src/pages/_app.tsx
import '@/styles/globals.css' // Tailwind styles or your own
import type { AppProps } from 'next/app'
import { AuthProvider } from '@/lib/AuthContext'


export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <Component {...pageProps} />
    </AuthProvider>
  )
}
