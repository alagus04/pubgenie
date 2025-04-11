// /pages/signup.tsx
import { useState } from 'react'
import { useRouter } from 'next/router'
import { auth } from '@/lib/firebase'
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth'
import { getFirestore, doc, setDoc } from 'firebase/firestore'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { FcGoogle } from 'react-icons/fc'

export default function SignUpPage() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [userType, setUserType] = useState('')
  const [institution, setInstitution] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const router = useRouter()
  const db = getFirestore()

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!userType) {
      setError('Please select a user type.')
      setLoading(false)
      return
    }

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

      router.push('/app')
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Sign up failed')
      }
      setLoading(false)
    }
  }

  const handleGoogleSignUp = async () => {
    const provider = new GoogleAuthProvider()
    try {
      const result = await signInWithPopup(auth, provider)
      const user = result.user

      await setDoc(doc(db, 'users', user.uid), {
        firstName: '',
        lastName: '',
        email: user.email,
        userType: '',
        institution: '',
        createdAt: new Date().toISOString()
      })

      router.push('/app')
    } catch (err) {
      setError('Google sign-up failed.')
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="max-w-md w-full border border-gray-200 p-6 rounded-2xl shadow-xl space-y-6">
        <h1 className="text-xl font-semibold text-center">Create your PubGenie account</h1>
        <p className="text-center text-gray-500">Sign up to start exploring research intelligently.</p>

        <button
          onClick={handleGoogleSignUp}
          className="w-full border px-4 py-2 rounded-md flex items-center justify-center gap-2 text-gray-600 hover:bg-gray-50 transition"
        >
          <FcGoogle className="text-xl" /> Sign up with Google
        </button>

        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-sm text-gray-400">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <form onSubmit={handleSignUp} className="space-y-4">
          <Input placeholder="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          <Input placeholder="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <select
            value={userType}
            onChange={(e) => setUserType(e.target.value)}
            className="border p-2 rounded-md w-full text-sm text-gray-700"
            required
          >
            <option value="" disabled>Select one</option>
            <option>Student</option>
            <option>Professor</option>
            <option>Researcher</option>
            <option>Industry Professional</option>
            <option>Healthcare Worker (Doctor, Nurse, etc.)</option>
          </select>
          <Input
            placeholder="Company / Institution"
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            required
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing up...' : 'Sign Up'}
          </Button>
        </form>

        <p className="text-sm text-center text-muted-foreground">
          Already have an account?{' '}
          <Link href="/signin" className="text-blue-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
