// /lib/firebaseAdmin.ts
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import serviceAccount from '../../serviceAccountKey.json' // Adjust path if needed

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount as any),
  })
}

export const adminAuth = getAuth()
