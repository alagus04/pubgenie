import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore' // 👈 Add this

const raw = process.env.FIREBASE_SERVICE_ACCOUNT!
const parsed = JSON.parse(raw)

const serviceAccount = {
  ...parsed,
  private_key: parsed.private_key.replace(/\\n/g, '\n'),
}

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  })
}

export const adminAuth = getAuth()
export const adminDb = getFirestore() // 👈 Add this