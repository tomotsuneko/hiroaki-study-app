import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';

export async function GET() {
  try {
    if (!dbAdmin) return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    
    const usersSnapshot = await dbAdmin.collection('users').get();
    const users: any[] = [];
    
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.db && data.db.syllabus) {
        users.push({
          id: doc.id,
          name: data.db.profile?.name || doc.id,
          syllabus: data.db.syllabus,
          completedTasks: data.db.profile?.completedTasks || []
        });
      }
    });

    return NextResponse.json({ success: true, users });
  } catch (error: any) {
    console.error('Fetch Users Error:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}
