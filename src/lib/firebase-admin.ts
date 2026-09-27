import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (projectId && clientEmail && privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert({
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

export const dbAdmin = admin.apps.length ? admin.firestore() : null;
