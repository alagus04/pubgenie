import { useState } from 'react'
import { useRouter } from 'next/router'
import { auth } from '@/lib/firebase'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, doc, setDoc } from 'firebase/firestore'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function SignUpPage() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [userType, setUserType] = useState('Student')
  const [institution, setInstitution] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const router = useRouter()
  const db = getFirestore()

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      const user = userCredential.user

      await setDoc(doc(db, 'users', user.uid), {
        firstName,
        lastName,
        email,
        userType,
        institution,
        createdAt: new Date().toISOString()
      })

      router.push('/')
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Sign up failed')
      }
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="max-w-md w-full space-y-6">
        <h1 className="text-2xl font-bold text-center">Create a PubGenie Account</h1>
        <form onSubmit={handleSignUp} className="space-y-4">
          <Input placeholder="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          <Input placeholder="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <select value={userType} onChange={(e) => setUserType(e.target.value)} className="border p-2 rounded-md w-full">
            <option>Student</option>
            <option>Professor</option>
            <option>Researcher</option>
            <option>Industry Professional</option>
            <option>Healthcare Worker (Doctor, Nurse, etc.)</option>
          </select>
          <Input placeholder="Company/Institution" value={institution} onChange={(e) => setInstitution(e.target.value)} required />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing up...' : 'Sign Up'}
          </Button>
        </form>
      </div>
    </div>
  )
}
