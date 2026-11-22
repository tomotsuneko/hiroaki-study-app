import { NextResponse } from 'next/server';
import { getActiveModelsConfig } from '@/lib/model-manager';
import { requireAdminSession } from '@/lib/session';

export async function GET() {
  try {
    const adminSession = await requireAdminSession();
    if (!adminSession) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const config = await getActiveModelsConfig();
    return NextResponse.json({
      success: true,
      config
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch config' }, { status: 500 });
  }
}
