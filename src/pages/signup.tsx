// /pages/signup.tsx
import { useState } from 'react'
import { useRouter } from 'next/router'
import { auth, db } from '@/lib/firebase'
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function SignUpPage() {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: '',
    institution: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const userCred = await createUserWithEmailAndPassword(auth, form.email, form.password)

      await updateProfile(userCred.user, {
        displayName: `${form.firstName} ${form.lastName}`,
      })

      await setDoc(doc(db, 'users', userCred.user.uid), {
        uid: userCred.user.uid,
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        role: form.role,
        institution: form.institution,
        createdAt: new Date().toISOString()
      })

      router.push('/')
    } catch (err: any) {
      setError(err.message || 'Failed to sign up')
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="max-w-md w-full space-y-6">
        <h1 className="text-2xl font-bold text-center">Create a PubGenie Account</h1>
        <form onSubmit={handleSignUp} className="space-y-4">
          <Input name="firstName" placeholder="First Name" value={form.firstName} onChange={handleChange} required />
          <Input name="lastName" placeholder="Last Name" value={form.lastName} onChange={handleChange} required />
          <Input name="email" type="email" placeholder="Email" value={form.email} onChange={handleChange} required />
          <Input name="password" type="password" placeholder="Password" value={form.password} onChange={handleChange} required />

          <select
            name="role"
            value={form.role}
            onChange={handleChange}
            required
            className="w-full border p-2 rounded-md"
          >
            <option value="">What best describes you?</option>
            <option value="Student">Student</option>
            <option value="Professor">Professor</option>
            <option value="Researcher">Researcher</option>
            <option value="Industry Professional">Industry Professional</option>
            <option value="Healthcare Worker">Healthcare Worker (Doctor, Nurse, etc.)</option>
          </select>

          <Input
            name="institution"
            placeholder="Company or Institution Name"
            value={form.institution}
            onChange={handleChange}
            required
          />

          {error && <p className="text-red-500 text-sm">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating account...' : 'Sign Up'}
          </Button>
        </form>
      </div>
    </div>
  )
}
