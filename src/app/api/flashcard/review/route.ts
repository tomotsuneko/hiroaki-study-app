import { NextResponse } from 'next/server';
import { updateFlashcardReview } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { id, correct } = await req.json();
    if (id) {
      await updateFlashcardReview(id, correct);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
