// /components/ProtectedRoute.tsx
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.push('/signin')
    }
  }, [user, loading, router])

  if (loading || !user) {
    return <div className="p-4">Loading...</div> // Optional spinner
  }

  return <>{children}</>
}
