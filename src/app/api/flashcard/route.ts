import { getActiveModels } from '@/lib/model-manager';
import { NextResponse } from 'next/server';
import { genAI } from '@/lib/gemini';
import { getFlashcards, saveFlashcards } from '@/lib/db';
import { dbAdmin } from '@/lib/firebase-admin';

function stripHtmlForContext(html: string): string {
  if (!html) return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 3000);
}

export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const allCards = await getFlashcards();
    const dueCards = allCards.filter((c: any) => !c.nextReviewDate || c.nextReviewDate <= today);
    return NextResponse.json({
      success: true,
      cards: allCards,
      dueCards,
    });
  } catch (error) {
    console.error('Get Flashcards Error:', error);
    return NextResponse.json({ error: 'Failed to load flashcards' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const today = new Date().toISOString().split('T')[0];

    // 1. ドリルの誤答や手動作成から直接カードを追加するモード
    if (body.action === 'add_cards' && Array.isArray(body.cards)) {
      const toSave = body.cards.map((c: any) => ({
        id: c.id || Date.now().toString() + Math.random().toString(36).substring(5),
        subject: c.subject || '数学',
        topic: c.topic || '',
        unitCode: c.unitCode || '',
        front: c.front,
        back: c.back,
        level: 0,
        nextReviewDate: today,
        createdAt: new Date().toISOString(),
      }));
      await saveFlashcards(toSave);
      return NextResponse.json({ success: true, added: toSave });
    }

    const {
      subjects = ['数学'],
      topic = '',
      unitCode = '',
      cardFocus = '公式・定義・重要解法', // '公式・定義・重要解法' | '一問一答・用語暗記' | '模試頻出の急所・ひっかけ対策'
      count = 8,
      targetSchools = [],
      forceGenerate = false,
    } = body;

    const allCards = await getFlashcards();
    const dueCards = allCards.filter((c: any) => !c.nextReviewDate || c.nextReviewDate <= today);

    // 特定の単元(topic/unitCode)が指定されておらず、forceGenerateでもない場合のみ、該当科目の期限到来カードを返す
    if (!topic && !unitCode && !forceGenerate) {
      const matchingDue = dueCards.filter((c: any) =>
        subjects.some(
          (s: string) =>
            (c.subject && c.subject.includes(s)) ||
            (s && c.subject && s.includes(c.subject))
        )
      );
      if (matchingDue.length >= 6) {
        return NextResponse.json(matchingDue.slice(0, 10));
      }
    }

    // 公式学習テキスト（learning_materials）が存在する場合はその本文から重要事項を抽出
    let materialContext = '';
    if (dbAdmin && (unitCode || topic)) {
      try {
        if (unitCode) {
          const doc = await dbAdmin.collection('learning_materials').doc(unitCode).get();
          if (doc.exists) {
            materialContext = stripHtmlForContext(doc.data()?.content || '');
          }
        }
        if (!materialContext && topic) {
          const snap = await dbAdmin
            .collection('learning_materials')
            .where('contentTitle', '==', topic)
            .limit(1)
            .get();
          if (!snap.empty) {
            materialContext = stripHtmlForContext(snap.docs[0].data()?.content || '');
          }
        }
      } catch (e) {
        console.warn('Optional flashcard material fetch skipped:', e);
      }
    }

    const schoolStr =
      Array.isArray(targetSchools) && targetSchools.length > 0
        ? targetSchools.join('、')
        : '大学入試標準〜難関レベル';
    const cardCount = Math.min(Math.max(Number(count) || 8, 4), 12);

    const systemInstruction = `あなたは超一流の受験指導プロフェッショナルです。
生徒の目標校（${schoolStr}）に向けて、スキマ時間で確実に得点力を引き上げる実践的な「暗記カード（フラッシュカード）」を ${cardCount} 枚作成してください。

【対象範囲】
・科目: ${subjects.join('、')}
${topic ? `・単元・テーマ: ${topic}` : ''}
${unitCode ? `・単元コード: ${unitCode}` : ''}
・カードの重点タイプ: ${cardFocus}

${
  materialContext
    ? `【公式学習テキスト（教材DB）からの抽出指示】
以下の公式教材テキストに含まれる重要な定義、公式、定理、解法パターン、重要語句を最優先で抽出し、教材と完全にリンクした暗記カードを作成してください：
"""
${materialContext}
"""`
    : ''
}

【作成ルール（厳守）】
1. 数学や理科の式・記号は必ず LaTeX 記法（インラインは $...$、ブロックは $$...$$）で記述してください。
2. 表面（front）は「〜の公式は？」「〜の定義・条件は？」「【例題急所】〜のときどう置く？」など、テストで瞬時に思い出すべき実践的な問いかけにしてください。
3. 裏面（back）は、単なる一言だけでなく「結論（公式・答え）＋ なぜそうなるか／試験での使い方のワンポイント」を簡潔にまとめてください。
4. 必ず以下のJSON配列形式のみを出力してください。

[
  {
    "subject": "${subjects[0] || '数学'}${topic ? ` (${topic})` : ''}",
    "topic": "${topic || subjects[0] || ''}",
    "front": "表面（問い・用語・公式名）",
    "back": "裏面（答え・公式・使い方の急所）"
  }
]`;

    const modelsToTry = await getActiveModels('chat');
    let text = '';
    let success = false;

    for (const modelName of modelsToTry) {
      if (success) break;
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction,
          generationConfig: { responseMimeType: 'application/json' },
        });
        const result = await model.generateContent(
          `${subjects.join('・')}${topic ? `の単元「${topic}」` : ''}に関する「${cardFocus}」の暗記カードを${cardCount}枚作成してください。`
        );
        text = result.response.text();
        success = true;
      } catch (err) {
        console.warn(`Flashcard model ${modelName} failed.`);
      }
    }

    if (!success) throw new Error('All models failed');

    const generated = JSON.parse(text).map((c: any) => ({
      ...c,
      id: Date.now().toString() + Math.random().toString(36).substring(6),
      topic: c.topic || topic || '',
      unitCode: unitCode || '',
      level: 0,
      nextReviewDate: today,
      createdAt: new Date().toISOString(),
    }));

    await saveFlashcards(generated);

    return NextResponse.json(generated);
  } catch (error: any) {
    console.error('Flashcard API Error:', error);
    return NextResponse.json({ error: 'Failed to generate flashcards.' }, { status: 500 });
  }
}
