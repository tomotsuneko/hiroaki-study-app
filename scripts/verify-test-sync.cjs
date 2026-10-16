const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const env = {};
const raw = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').replace(/^\uFEFF/, '');
for (const line of raw.split(/\r?\n/)) {
  const idx = line.indexOf('=');
  if (idx < 0) continue;
  env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^"|"$/g, '');
}

initializeApp({
  credential: cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore();

async function testSync() {
  const testUserId = 'test_student_user';
  const testId = '数Ⅰ-001_L1_基礎';

  console.log('1. Simulating test result saving for user:', testUserId);

  const mockPayload = {
    version: 1,
    answers: {
      '0': { attempts: 1, correct: true, firstCorrect: true },
      '1': { attempts: 1, correct: true, firstCorrect: true },
      '2': { attempts: 2, correct: true, firstCorrect: false },
      '3': { attempts: 1, correct: false, firstCorrect: false }
    },
    updated: new Date().toISOString()
  };

  const record = {
    testId,
    baseCode: '数Ⅰ-001',
    level: 'L1_基礎',
    subject: 'high_school_数学',
    title: testId,
    contentTitle: '数と式',
    key: 'hs-math1-qpack-v2.0-数Ⅰ-001-L1_基礎',
    answeredCount: 4,
    correctCount: 3,
    firstCorrectCount: 2,
    totalQuestions: 30,
    scorePercent: 10,
    isCompleted: false,
    payload: mockPayload,
    updatedAt: new Date().toISOString()
  };

  await db.collection('users').doc(testUserId).collection('test_results').doc(testId).set(record);
  console.log('✅ Successfully saved test result to users/' + testUserId + '/test_results/' + testId);

  const snap = await db.collection('users').doc(testUserId).collection('test_results').doc(testId).get();
  console.log('✅ Retrieved record:', snap.data().testId, 'answered:', snap.data().answeredCount);

  // Clean up test user
  await db.collection('users').doc(testUserId).collection('test_results').doc(testId).delete();
  console.log('✅ Cleaned up test record.');
}

testSync().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
