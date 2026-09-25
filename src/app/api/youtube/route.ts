import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      console.warn("YOUTUBE_API_KEY is not set.");
      return NextResponse.json({ items: [] });
    }

    // 高校生向けの学習動画を優先的に検索
    const searchQuery = `${query} 高校 授業 解説`;
    
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=3&q=${encodeURIComponent(searchQuery)}&type=video&key=${apiKey}`
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("YouTube API Error:", errorData);
      throw new Error('Failed to fetch from YouTube');
    }

    const data = await response.json();
    return NextResponse.json({ items: data.items });
  } catch (error) {
    console.error('YouTube API Route Error:', error);
    return NextResponse.json(
      { error: 'Failed to search YouTube videos.' },
      { status: 500 }
    );
  }
}
