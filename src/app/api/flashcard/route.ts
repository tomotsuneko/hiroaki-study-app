import { NextResponse } from 'next/server';
import { genAI } from '@/lib/gemini';
import { getFlashcards, saveFlashcards } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { subjects, targetSchools } = await req.json();
    const today = new Date().toISOString().split('T')[0];
    
    const allCards = await getFlashcards();
    let dueCards = allCards.filter(c => c.nextReviewDate <= today);
    
    // If we have enough cards due, just return some of them (mix of subject if possible)
    if (dueCards.length >= 5) {
      return NextResponse.json(dueCards.sort(() => 0.5 - Math.random()).slice(0, 10));
    }

    const systemInstruction = `あなたは優秀なAI家庭教師です。
生徒の目標校（${targetSchools.join(', ')}）に合わせて、以下の科目・分野の暗記用フラッシュカードを生成してください。
科目: ${subjects.join(', ')}

各科目につき2〜3枚程度、合計5〜10枚程度で作成してください。
フォーマットは必ず以下のJSON形式にしてください。

[
  {
    "id": "一意の文字列(例: uuid)",
    "subject": "科目名",
    "front": "表面（問題や用語）",
    "back": "裏面（答えや解説、意味）"
  }
]`;

    const modelsToTry = ["gemini-3.7-flash", "gemini-3.8-flash", "gemini-3.1-pro-preview", "gemini-flash-latest"];
    let text = "";
    let success = false;

    for (const modelName of modelsToTry) {
      if (success) break;
      try {
        const model = genAI.getGenerativeModel({ model: modelName, systemInstruction, generationConfig: { responseMimeType: "application/json" } });
        const result = await model.generateContent(`暗記カードを作成してください。`);
        text = result.response.text();
        success = true;
      } catch (err) {
        console.warn(`Flashcard model ${modelName} failed.`);
      }
    }

    if (!success) throw new Error("All models failed");
    
    const generated = JSON.parse(text).map((c: any) => ({
      ...c,
      id: Date.now().toString() + Math.random().toString(36).substring(7),
      level: 0,
      nextReviewDate: today
    }));
    
    await saveFlashcards(generated);
    
    const combined = [...dueCards, ...generated];
    return NextResponse.json(combined.slice(0, 10));
  } catch (error: any) {
    console.error('Flashcard API Error:', error);
    return NextResponse.json({ error: 'Failed to generate flashcards.' }, { status: 500 });
  }
}
