import { NextResponse } from 'next/server';
import { getActiveModelsConfig } from '@/lib/model-manager';

export async function GET() {
  try {
    const config = await getActiveModelsConfig();
    return NextResponse.json({
      success: true,
      config
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch config' }, { status: 500 });
  }
}
