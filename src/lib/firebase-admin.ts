import * as admin from 'firebase-admin';

// Check if already initialized to avoid duplicate app errors in dev
if (!admin.apps || !admin.apps.length) {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (projectId && clientEmail && privateKey) {
      // Use require for default export if ES import fails for admin
      const firebaseAdmin = require('firebase-admin');
      firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      console.log('Firebase Admin Initialized Successfully');
    } else {
      console.warn('Firebase Admin initialization skipped: missing environment variables.');
    }
  } catch (error) {
    console.error('Firebase Admin Initialization Error:', error);
  }
}

// In some setups, default import fails, so fallback to require.
const adminDb = require('firebase-admin').firestore;
export const dbAdmin = admin.apps?.length ? adminDb() : null;
