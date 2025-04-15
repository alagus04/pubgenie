import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

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
